'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  accessGrants,
  children,
  consultants,
  feedings,
  parents,
  sleeps,
} from '@/db/schema';
import { CONSENT_VERSION } from '@/lib/consent';
import { clearSessionCookie, currentChild, currentParent } from '@/lib/session';
import {
  composeSleep,
  parseTimeOfDay,
  sleepDayOf,
  sleepKindOf,
  type DayWindow,
} from '@/lib/sleep-day';

/** Насколько назад разрешено сдвинуть отметку: «заметила не сразу». */
const MAX_OFFSET_MINUTES = 60;

async function requireContext() {
  const parent = await currentParent();
  if (!parent) throw new Error('Сессия не найдена');
  const child = await currentChild(parent.id);
  if (!child) throw new Error('Ребёнок не заведён');
  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };
  return { parent, child, window };
}

function shiftBack(now: Date, minutesAgo: number): Date {
  const safe = Math.min(Math.max(Math.round(minutesAgo), 0), MAX_OFFSET_MINUTES);
  return new Date(now.getTime() - safe * 60_000);
}

async function openSleepOf(childId: string) {
  const [open] = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.childId, childId), isNull(sleeps.endedAt)))
    .orderBy(desc(sleeps.startedAt))
    .limit(1);
  return open ?? null;
}

/** Ребёнок уснул. `minutesAgo` — на сколько минут назад, если мама заметила позже. */
export async function startSleep(minutesAgo = 0) {
  const { child, window } = await requireContext();

  // Двойное нажатие не должно плодить параллельные сны.
  if (await openSleepOf(child.id)) return;

  const startedAt = shiftBack(new Date(), minutesAgo);
  await db.insert(sleeps).values({
    childId: child.id,
    startedAt,
    sleepDay: sleepDayOf(startedAt, window),
    kind: sleepKindOf(startedAt, window),
    source: 'timer',
  });
  revalidatePath('/');
}

/** Ребёнок проснулся. `minutesAgo` — если проснулся раньше, чем мама отметила. */
export async function stopSleep(minutesAgo = 0) {
  const { child } = await requireContext();

  const open = await openSleepOf(child.id);
  if (!open) return;

  const now = new Date();
  let endedAt = shiftBack(now, minutesAgo);
  // Сон не может закончиться раньше, чем начался: округляем до минуты сна.
  if (endedAt.getTime() < open.startedAt.getTime()) {
    endedAt = new Date(open.startedAt.getTime() + 60_000);
  }

  await db
    .update(sleeps)
    .set({ endedAt, updatedAt: now })
    .where(eq(sleeps.id, open.id));
  revalidatePath('/');
}

export interface OnboardingInput {
  name: string;
  birthDate: string;
  dueDate?: string | null;
  isPreterm: boolean;
  healthNotes?: string | null;
  temperament: string[];
  feedingType: 'breast' | 'formula' | 'mixed';
}

/** Анкета при первом запуске. Шесть вопросов, больше Виктория не просила. */
export async function createChild(input: OnboardingInput) {
  const parent = await currentParent();
  if (!parent) throw new Error('Сессия не найдена');

  const name = input.name.trim();
  if (!name) throw new Error('Не заполнено имя');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new Error('Не заполнена дата рождения');

  const [created] = await db
    .insert(children)
    .values({
      parentId: parent.id,
      name,
      birthDate: input.birthDate,
      dueDate: input.isPreterm ? (input.dueDate || null) : null,
      isPreterm: input.isPreterm,
      healthNotes: input.healthNotes?.trim() || null,
      temperament: input.temperament,
      feedingType: input.feedingType,
    })
    .returning();

  revalidatePath('/');
  return created.id;
}

/* ------------------------------------------------------------------ *
 * Ручной ввод и правка. Виктория: мама часто не успевает засечь время,
 * а иногда приходит с дневником за неделю назад.
 * ------------------------------------------------------------------ */

async function ownedSleep(sleepId: string, childId: string) {
  const [row] = await db.select().from(sleeps).where(eq(sleeps.id, sleepId)).limit(1);
  // Чужую запись правит только тот, у кого есть id: проверяем принадлежность.
  if (!row || row.childId !== childId) throw new Error('Запись не найдена');
  return row;
}

export interface SleepInput {
  /** Сонные сутки, к которым мама относит сон. */
  sleepDay: string;
  /** Время в формате 14:00. */
  start: string;
  end: string;
}

function build(input: SleepInput, window: DayWindow) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sleepDay)) throw new Error('Не выбрана дата');
  const startMinutes = parseTimeOfDay(input.start);
  const endMinutes = parseTimeOfDay(input.end);
  const { startedAt, endedAt } = composeSleep(input.sleepDay, startMinutes, endMinutes, window);

  const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000;
  if (minutes < 1) throw new Error('Сон короче минуты');
  if (minutes > 20 * 60) throw new Error('Сон длиннее двадцати часов — проверьте время');

  return {
    startedAt,
    endedAt,
    sleepDay: sleepDayOf(startedAt, window),
    kind: sleepKindOf(startedAt, window),
  };
}

export async function addSleepManual(input: SleepInput) {
  const { child, window } = await requireContext();
  await db.insert(sleeps).values({ childId: child.id, source: 'manual', ...build(input, window) });
  revalidatePath('/');
  revalidatePath('/day');
}

export async function updateSleep(sleepId: string, input: SleepInput) {
  const { child, window } = await requireContext();
  await ownedSleep(sleepId, child.id);
  await db
    .update(sleeps)
    .set({ ...build(input, window), updatedAt: new Date() })
    .where(eq(sleeps.id, sleepId));
  revalidatePath('/');
  revalidatePath('/day');
}

export async function deleteSleep(sleepId: string) {
  const { child } = await requireContext();
  await ownedSleep(sleepId, child.id);
  await db.delete(sleeps).where(eq(sleeps.id, sleepId));
  revalidatePath('/');
  revalidatePath('/day');
}

/* ------------------------------------------------------------------ *
 * Настройки суток
 * ------------------------------------------------------------------ */

export async function updateDayWindow(input: {
  dayBoundary: string;
  nightFrom: string;
  timeZone: string;
}) {
  const { parent, child } = await requireContext();

  const dayBoundary = parseTimeOfDay(input.dayBoundary);
  const nightFrom = parseTimeOfDay(input.nightFrom);
  if (nightFrom <= dayBoundary) {
    throw new Error('Ночь должна начинаться позже, чем утро');
  }
  // Проверяем, что зона вообще существует: иначе весь расчёт суток развалится.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone });
  } catch {
    throw new Error('Неизвестный часовой пояс');
  }

  await db
    .update(children)
    .set({ dayBoundaryMinutes: dayBoundary, nightFromMinutes: nightFrom })
    .where(eq(children.id, child.id));

  if (input.timeZone !== parent.timeZone) {
    await db.update(parents).set({ timeZone: input.timeZone }).where(eq(parents.id, parent.id));
  }

  // Границы поменялись — прежние sleep_day и kind могли устареть.
  await recomputeSleepDays(child.id, {
    dayBoundary,
    nightFrom,
    timeZone: input.timeZone,
  });

  revalidatePath('/', 'layout');
}

/**
 * Пересчитывает принадлежность снов к суткам после смены границ.
 * Без этого таблица консультанта показывала бы старую разбивку.
 */
async function recomputeSleepDays(childId: string, window: DayWindow) {
  const rows = await db.select().from(sleeps).where(eq(sleeps.childId, childId));
  for (const row of rows) {
    const sleepDay = sleepDayOf(row.startedAt, window);
    const kind = sleepKindOf(row.startedAt, window);
    if (sleepDay !== row.sleepDay || kind !== row.kind) {
      await db.update(sleeps).set({ sleepDay, kind }).where(eq(sleeps.id, row.id));
    }
  }
}

export async function setThemePref(pref: 'auto' | 'light' | 'dark') {
  const { parent } = await requireContext();
  await db.update(parents).set({ themePref: pref }).where(eq(parents.id, parent.id));
  revalidatePath('/', 'layout');
}

/* ------------------------------------------------------------------ *
 * Доступ консультанта
 *
 * Виктория: «когда сотрудничество заканчивается, я не могу видеть уже
 * её дневник». Поэтому доступ мама даёт явно и отзывает в один тап,
 * а дневник остаётся у неё навсегда.
 * ------------------------------------------------------------------ */

export async function grantAccess(slug: string) {
  const { child } = await requireContext();

  const [consultant] = await db
    .select()
    .from(consultants)
    .where(eq(consultants.slug, slug))
    .limit(1);
  if (!consultant) throw new Error('Консультант не найден');

  const [existing] = await db
    .select()
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.childId, child.id),
        eq(accessGrants.consultantId, consultant.id),
        isNull(accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (existing) return;

  await db.insert(accessGrants).values({
    childId: child.id,
    consultantId: consultant.id,
    consentVersion: CONSENT_VERSION,
  });
  revalidatePath('/consultant');
}

export async function revokeAccess(grantId: string) {
  const { child } = await requireContext();

  const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.id, grantId)).limit(1);
  if (!grant || grant.childId !== child.id) throw new Error('Доступ не найден');

  await db
    .update(accessGrants)
    .set({ revokedAt: new Date() })
    .where(eq(accessGrants.id, grantId));
  revalidatePath('/consultant');
}

/* ------------------------------------------------------------------ *
 * Кормление
 *
 * Виктория: «максимум это сон и кормление, если мама на искусственном.
 * Когда кормят грудью — там на каждую секунду титечку даёшь, отмечать
 * это не надо». Поэтому дневник кормления существует только для
 * искусственного и смешанного, у остальных его нет вовсе.
 * ------------------------------------------------------------------ */

export async function addFeeding(amountMl: number | null, minutesAgo = 0) {
  const { child, window } = await requireContext();
  if (child.feedingType === 'breast') {
    throw new Error('Дневник кормления нужен только на искусственном вскармливании');
  }

  const at = shiftBack(new Date(), minutesAgo);
  const amount = amountMl === null ? null : Math.min(Math.max(Math.round(amountMl), 0), 500);

  await db.insert(feedings).values({
    childId: child.id,
    at,
    sleepDay: sleepDayOf(at, window),
    amountMl: amount,
    source: 'manual',
  });
  revalidatePath('/feeding');
}

export async function deleteFeeding(feedingId: string) {
  const { child } = await requireContext();
  const [row] = await db.select().from(feedings).where(eq(feedings.id, feedingId)).limit(1);
  if (!row || row.childId !== child.id) throw new Error('Запись не найдена');

  await db.delete(feedings).where(eq(feedings.id, feedingId));
  revalidatePath('/feeding');
}

/**
 * Удалить дневник целиком — по требованию мамы.
 *
 * По 152-ФЗ это её право, и делать это должна она сама, а не переписка
 * с поддержкой. Всё висит на строке родителя каскадом: ребёнок, сны,
 * кормления, выданные консультанту доступы, его заметки и следы загрузок
 * уходят вместе с ней — осиротевших записей не остаётся.
 *
 * Сессию гасим здесь же: иначе подписанная кука продолжит указывать
 * на удалённого родителя, и приложение будет выглядеть сломанным.
 */
export async function deleteEverything() {
  const parent = await currentParent();
  if (!parent) throw new Error('Сессия не найдена');

  await db.delete(parents).where(eq(parents.id, parent.id));
  await clearSessionCookie();
  revalidatePath('/', 'layout');
}
