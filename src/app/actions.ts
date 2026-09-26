'use server';

import { UserError, guard } from '@/lib/action-result';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '@/db';
import {
  accessGrants,
  children,
  consultants,
  feedings,
  parents,
  photoImports,
  sleeps,
} from '@/db/schema';
import { CONSENT_VERSION } from '@/lib/consent';
import { MAX_AGE_DAYS } from '@/lib/import-parse';
import { defaultConsultant } from '@/lib/default-consultant';
import { childWords, type ChildSex } from '@/lib/words';
import { clearSessionCookie, currentChild, currentParent } from '@/lib/session';
import {
  composeSleep,
  localDate,
  shiftDate,
  zonedTimeToUtc,
  parseTimeOfDay,
  sleepDayOf,
  sleepKindOf,
  type DayWindow,
} from '@/lib/sleep-day';

/** Насколько назад разрешено сдвинуть отметку: «заметила не сразу». */
const MAX_OFFSET_MINUTES = 60;

async function requireContext() {
  const parent = await currentParent();
  if (!parent) throw new UserError('Сессия не найдена');
  const child = await currentChild(parent.id);
  if (!child) throw new UserError('Ребёнок не заведён');
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
  return guard(async () => {
    const { child, window } = await requireContext();

    // Двойное нажатие не должно плодить параллельные сны.
    if (await openSleepOf(child.id)) return;

    let startedAt = shiftBack(new Date(), minutesAgo);
    // «Уснула 15 мин назад» сразу после записанного сна не должно залезать
    // внутрь него: начинаем не раньше, чем закончился предыдущий.
    const [overlap] = await db
      .select({ endedAt: sleeps.endedAt })
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), gt(sleeps.endedAt, startedAt)))
      .orderBy(desc(sleeps.endedAt))
      .limit(1);
    if (overlap?.endedAt) startedAt = overlap.endedAt;

    await db.insert(sleeps).values({
      childId: child.id,
      startedAt,
      sleepDay: sleepDayOf(startedAt, window),
      kind: sleepKindOf(startedAt, window),
      source: 'timer',
    });
    revalidatePath('/');
  });
}

/**
 * Сон, который ещё идёт, но начался давно: мама вспомнила через час.
 * Кнопки «5/10/15 мин назад» так далеко не достают — время указывают руками,
 * а конец отметят кнопкой «Проснулась», как обычно.
 */
export async function startSleepAt(input: { sleepDay: string; start: string }) {
  return guard(async () => {
    const { child, window } = await requireContext();
    const words = childWords(child.sex);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sleepDay)) throw new UserError('Не выбран день');
    if (!/^\d{1,2}:\d{2}$/.test(input.start)) throw new UserError(`Укажите, когда ${words.fellAsleep.toLowerCase()}`);
    if (await openSleepOf(child.id)) {
      throw new UserError(`Сон уже идёт — сначала отметьте «${words.wokeUp}» на главном экране`);
    }

    const minutes = parseTimeOfDay(input.start);
    const startDate = minutes < window.dayBoundary ? shiftDate(input.sleepDay, 1) : input.sleepDay;
    const startedAt = zonedTimeToUtc(startDate, minutes, window.timeZone);
    const now = Date.now();
    if (startedAt.getTime() > now + 60_000) throw new UserError('Это время ещё не наступило — проверьте время или день');
    if (now - startedAt.getTime() > 20 * 3_600_000) throw new UserError('Сон идёт больше двадцати часов — проверьте время или день');

    const [clash] = await db
      .select({ startedAt: sleeps.startedAt, endedAt: sleeps.endedAt })
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), gt(sleeps.endedAt, startedAt)))
      .limit(1);
    if (clash?.endedAt) {
      const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: window.timeZone });
      throw new UserError(`Пересекается с уже записанным сном ${time.format(clash.startedAt)}–${time.format(clash.endedAt)} — проверьте время`);
    }

    await db.insert(sleeps).values({
      childId: child.id,
      startedAt,
      sleepDay: sleepDayOf(startedAt, window),
      kind: sleepKindOf(startedAt, window),
      source: 'manual',
    });
    revalidatePath('/');
    revalidatePath('/day');
  });
}

/** Ребёнок проснулся. `minutesAgo` — если проснулся раньше, чем мама отметила. */
export async function stopSleep(minutesAgo = 0) {
  return guard(async () => {
    const { child, window } = await requireContext();

    const open = await openSleepOf(child.id);
    if (!open) return;

    const now = new Date();
    const endedAt = shiftBack(now, minutesAgo);
    const lasted = endedAt.getTime() - open.startedAt.getTime();

    if (lasted < 60_000) {
      if (minutesAgo > 0) {
        // «Проснулась 15 мин назад», а уснула 5 минут назад — так не бывает.
        const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: window.timeZone });
        throw new UserError(`Сон начался в ${time.format(open.startedAt)} — проснуться раньше не получится. Выберите «сейчас».`);
      }
      // Меньше минуты между «Уснула» и «Проснулась» — нажали случайно:
      // такой сон не записываем, а отменяем.
      await db.delete(sleeps).where(eq(sleeps.id, open.id));
      revalidatePath('/');
      revalidatePath('/day');
      return;
    }

    await db
      .update(sleeps)
      // Тип уточняем по концу: уложили до «ночи», а проспал до утра — это ночь.
      .set({ endedAt, kind: sleepKindOf(open.startedAt, window, endedAt), updatedAt: now })
      .where(eq(sleeps.id, open.id));
    revalidatePath('/');
  });
}

export interface OnboardingInput {
  name: string;
  sex: ChildSex;
  /** Согласие открыть дневник консультанту по умолчанию (см. defaultConsultant). */
  consent: boolean;
  birthDate: string;
  dueDate?: string | null;
  isPreterm: boolean;
  healthNotes?: string | null;
  temperament: string[];
  feedingType: 'breast' | 'formula' | 'mixed';
}

/** Анкета при первом запуске. Шесть вопросов, больше Виктория не просила. */
export async function createChild(input: OnboardingInput) {
  return guard(async () => {
    const parent = await currentParent();
    if (!parent) throw new UserError('Сессия не найдена');

    const name = input.name.trim();
    if (!name) throw new UserError('Не заполнено имя');
    if (input.sex !== 'boy' && input.sex !== 'girl') throw new UserError('Выберите, мальчик или девочка');

    // Приложение — для клиенток консультанта: без согласия дневник ему не откроется,
    // а по 152-ФЗ передавать данные о здоровье ребёнка без согласия нельзя.
    const consultant = await defaultConsultant();
    if (consultant && !input.consent) {
      throw new UserError(`Отметьте согласие — без него ${consultant.name} не увидит дневник`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new UserError('Не заполнена дата рождения');

    const [created] = await db
      .insert(children)
      .values({
        parentId: parent.id,
        name,
        sex: input.sex,
        birthDate: input.birthDate,
        dueDate: input.isPreterm ? (input.dueDate || null) : null,
        isPreterm: input.isPreterm,
        healthNotes: input.healthNotes?.trim() || null,
        temperament: input.temperament,
        feedingType: input.feedingType,
        feedingLog: input.feedingType !== 'breast',
      })
      .returning();

    if (consultant) {
      await db.insert(accessGrants).values({
        childId: created.id,
        consultantId: consultant.id,
        consentVersion: CONSENT_VERSION,
      });
    }

    revalidatePath('/');
    return created.id;
  });
}

/* ------------------------------------------------------------------ *
 * Ручной ввод и правка. Виктория: мама часто не успевает засечь время,
 * а иногда приходит с дневником за неделю назад.
 * ------------------------------------------------------------------ */

async function ownedSleep(sleepId: string, childId: string) {
  const [row] = await db.select().from(sleeps).where(eq(sleeps.id, sleepId)).limit(1);
  // Чужую запись правит только тот, у кого есть id: проверяем принадлежность.
  if (!row || row.childId !== childId) throw new UserError('Запись не найдена');
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sleepDay)) throw new UserError('Не выбрана дата');
  // Пустое поле времени (мама стёрла значение) — понятной фразой, а не «Некорректное время: ».
  if (!/^\d{1,2}:\d{2}$/.test(input.start) || !/^\d{1,2}:\d{2}$/.test(input.end)) {
    throw new UserError('Укажите время начала и конца сна');
  }
  const startMinutes = parseTimeOfDay(input.start);
  const endMinutes = parseTimeOfDay(input.end);
  const { startedAt, endedAt } = composeSleep(input.sleepDay, startMinutes, endMinutes, window);

  const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000;
  if (minutes < 1) throw new UserError('Сон короче минуты');
  if (minutes > 20 * 60) throw new UserError('Сон длиннее двадцати часов — проверьте время');

  return {
    startedAt,
    endedAt,
    sleepDay: sleepDayOf(startedAt, window),
    kind: sleepKindOf(startedAt, window, endedAt),
  };
}

/**
 * Сон, внесённый задним числом, не должен лечь поверх уже записанного —
 * иначе сутки посчитаются дважды. Называем, с чем пересеклось, чтобы маме
 * было понятно, что поправить.
 */
async function assertNoOverlap(
  childId: string,
  startedAt: Date,
  endedAt: Date,
  timeZone: string,
  exceptId?: string,
) {
  const [clash] = await db
    .select({ startedAt: sleeps.startedAt, endedAt: sleeps.endedAt })
    .from(sleeps)
    .where(
      and(
        eq(sleeps.childId, childId),
        lt(sleeps.startedAt, endedAt),
        or(isNull(sleeps.endedAt), gt(sleeps.endedAt, startedAt)),
        exceptId ? ne(sleeps.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (!clash) return;
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
  const span = `${time.format(clash.startedAt)}–${clash.endedAt ? time.format(clash.endedAt) : 'сейчас'}`;
  throw new UserError(`Пересекается с уже записанным сном ${span} — проверьте время`);
}

export async function addSleepManual(input: SleepInput) {
  return guard(async () => {
    const { child, window } = await requireContext();
    const values = build(input, window);
    if (values.endedAt.getTime() > Date.now() + 60_000) throw new UserError('Этот сон ещё не закончился — время в будущем');
    await assertNoOverlap(child.id, values.startedAt, values.endedAt, window.timeZone);
    await db.insert(sleeps).values({ childId: child.id, source: 'manual', ...values });
    revalidatePath('/');
    revalidatePath('/day');
  });
}

export async function updateSleep(sleepId: string, input: SleepInput) {
  return guard(async () => {
    const { child, window } = await requireContext();
    await ownedSleep(sleepId, child.id);
    const values = build(input, window);
    await assertNoOverlap(child.id, values.startedAt, values.endedAt, window.timeZone, sleepId);
    await db
      .update(sleeps)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(sleeps.id, sleepId));
    revalidatePath('/');
    revalidatePath('/day');
  });
}

export async function deleteSleep(sleepId: string) {
  return guard(async () => {
    const { child } = await requireContext();
    await ownedSleep(sleepId, child.id);
    await db.delete(sleeps).where(eq(sleeps.id, sleepId));
    revalidatePath('/');
    revalidatePath('/day');
  });
}

/* ------------------------------------------------------------------ *
 * Настройки суток
 * ------------------------------------------------------------------ */

export async function updateDayWindow(input: {
  dayBoundary: string;
  nightFrom: string;
  timeZone: string;
}) {
  return guard(async () => {
    const { parent, child } = await requireContext();

    if (!/^\d{1,2}:\d{2}$/.test(input.dayBoundary) || !/^\d{1,2}:\d{2}$/.test(input.nightFrom)) {
      throw new UserError('Укажите время начала дня и ночи');
    }
    const dayBoundary = parseTimeOfDay(input.dayBoundary);
    const nightFrom = parseTimeOfDay(input.nightFrom);
    if (nightFrom <= dayBoundary) {
      throw new UserError('Ночь должна начинаться позже, чем утро');
    }
    // Проверяем, что зона вообще существует: иначе весь расчёт суток развалится.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone });
    } catch {
      throw new UserError('Неизвестный часовой пояс');
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
  });
}

/**
 * Пересчитывает принадлежность снов к суткам после смены границ.
 * Без этого таблица консультанта показывала бы старую разбивку.
 */
async function recomputeSleepDays(childId: string, window: DayWindow) {
  const rows = await db.select().from(sleeps).where(eq(sleeps.childId, childId));
  for (const row of rows) {
    const sleepDay = sleepDayOf(row.startedAt, window);
    const kind = sleepKindOf(row.startedAt, window, row.endedAt);
    if (sleepDay !== row.sleepDay || kind !== row.kind) {
      await db.update(sleeps).set({ sleepDay, kind }).where(eq(sleeps.id, row.id));
    }
  }
}

/** Мальчик или девочка — для детей, заведённых до появления этого вопроса. */
export async function setChildSex(sex: ChildSex) {
  return guard(async () => {
    if (sex !== 'boy' && sex !== 'girl') throw new UserError('Выберите, мальчик или девочка');
    const { child } = await requireContext();
    await db.update(children).set({ sex }).where(eq(children.id, child.id));
    revalidatePath('/', 'layout');
  });
}

export async function setThemePref(pref: 'auto' | 'light' | 'dark') {
  return guard(async () => {
    const { parent } = await requireContext();
    await db.update(parents).set({ themePref: pref }).where(eq(parents.id, parent.id));
    revalidatePath('/', 'layout');
  });
}

/* ------------------------------------------------------------------ *
 * Доступ консультанта
 *
 * Виктория: «когда сотрудничество заканчивается, я не могу видеть уже
 * её дневник». Поэтому доступ мама даёт явно и отзывает в один тап,
 * а дневник остаётся у неё навсегда.
 * ------------------------------------------------------------------ */

export async function grantAccess(slug: string) {
  return guard(async () => {
    const { child } = await requireContext();

    const [consultant] = await db
      .select()
      .from(consultants)
      .where(eq(consultants.slug, slug))
      .limit(1);
    if (!consultant) throw new UserError('Консультант не найден');

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
  });
}

export async function revokeAccess(grantId: string) {
  return guard(async () => {
    const { child } = await requireContext();

    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.id, grantId)).limit(1);
    if (!grant || grant.childId !== child.id) throw new UserError('Доступ не найден');

    await db
      .update(accessGrants)
      .set({ revokedAt: new Date() })
      .where(eq(accessGrants.id, grantId));
    revalidatePath('/consultant');
  });
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
  return guard(async () => {
    const { child, window } = await requireContext();
    if (!child.feedingLog) {
      throw new UserError('Сначала включите дневник кормлений в настройках');
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
  });
}

export async function deleteFeeding(feedingId: string) {
  return guard(async () => {
    const { child } = await requireContext();
    const [row] = await db.select().from(feedings).where(eq(feedings.id, feedingId)).limit(1);
    if (!row || row.childId !== child.id) throw new UserError('Запись не найдена');

    await db.delete(feedings).where(eq(feedings.id, feedingId));
    revalidatePath('/feeding');
  });
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
  return guard(async () => {
    const parent = await currentParent();
    if (!parent) throw new UserError('Сессия не найдена');

    await db.delete(parents).where(eq(parents.id, parent.id));
    await clearSessionCookie();
    revalidatePath('/', 'layout');
  });
}

/* ------------------------------------------------------------------ *
 * Перенос снов из других приложений (скриншоты и заметки)
 * ------------------------------------------------------------------ */

/** Мама согласилась, что скриншоты уходят на распознавание в GigaChat. */
export async function acceptImportConsent() {
  return guard(async () => {
    const { parent } = await requireContext();
    await db.update(parents).set({ importConsentAt: new Date() }).where(eq(parents.id, parent.id));
    revalidatePath('/import');
  });
}

export interface ImportRow {
  /** Дата начала сна по календарю, «2026-09-23». */
  date: string;
  start: string;
  end: string;
}

export interface ImportResult {
  added: number;
  /** Сутки последнего добавленного сна — туда и откроем дневник. */
  lastDay: string | null;
  skipped: { index: number; reason: string }[];
}

/**
 * Записывает проверенные мамой сны. Каждую строку проверяем так же, как
 * ручной ввод: длительность, будущее, наложение на уже записанное (и на
 * соседние строки этого же переноса). Негодные строки не валят весь
 * перенос — их возвращаем с причиной, остальное записываем.
 */
export async function commitImport(input: {
  rows: ImportRow[];
  screenshots: number;
  recognized: number;
  edited: number;
}) {
  return guard(async (): Promise<ImportResult> => {
    const { child, window } = await requireContext();
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new UserError('Нечего добавлять — отметьте хотя бы один сон');
    if (input.rows.length > 300) throw new UserError('Слишком много снов за раз — перенесите частями');

    const now = new Date();
    const today = localDate(now, window.timeZone);
    const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: window.timeZone });
    const skipped: ImportResult['skipped'] = [];
    let added = 0;
    let lastDay: string | null = null;

    await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(photoImports)
        .values({
          childId: child.id,
          status: 'confirmed',
          fileCount: Math.min(Math.max(Math.round(input.screenshots) || 0, 0), 100),
          recordsParsed: Math.min(Math.max(Math.round(input.recognized) || 0, 0), 1000),
          recordsEdited: Math.min(Math.max(Math.round(input.edited) || 0, 0), 1000),
          confirmedAt: now,
        })
        .returning({ id: photoImports.id });

      for (const [index, row] of input.rows.entries()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date > today || row.date < shiftDate(today, -MAX_AGE_DAYS)) {
          skipped.push({ index, reason: 'дата не распознана' });
          continue;
        }
        if (!/^\d{1,2}:\d{2}$/.test(row.start) || !/^\d{1,2}:\d{2}$/.test(row.end)) {
          skipped.push({ index, reason: 'не указано время' });
          continue;
        }
        const startMinutes = parseTimeOfDay(row.start);
        const endMinutes = parseTimeOfDay(row.end);
        const startedAt = zonedTimeToUtc(row.date, startMinutes, window.timeZone);
        const endedAt = zonedTimeToUtc(endMinutes <= startMinutes ? shiftDate(row.date, 1) : row.date, endMinutes, window.timeZone);
        const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000;
        if (minutes < 1 || minutes > 20 * 60) {
          skipped.push({ index, reason: 'странная длительность' });
          continue;
        }
        if (endedAt.getTime() > now.getTime() + 60_000) {
          skipped.push({ index, reason: 'время ещё не наступило' });
          continue;
        }
        const [clash] = await tx
          .select({ startedAt: sleeps.startedAt, endedAt: sleeps.endedAt })
          .from(sleeps)
          .where(
            and(
              eq(sleeps.childId, child.id),
              lt(sleeps.startedAt, endedAt),
              or(isNull(sleeps.endedAt), gt(sleeps.endedAt, startedAt)),
            ),
          )
          .limit(1);
        if (clash) {
          skipped.push({
            index,
            reason: `пересекается со сном ${time.format(clash.startedAt)}–${clash.endedAt ? time.format(clash.endedAt) : 'сейчас'}`,
          });
          continue;
        }
        const sleepDay = sleepDayOf(startedAt, window);
        await tx.insert(sleeps).values({
          childId: child.id,
          startedAt,
          endedAt,
          sleepDay,
          kind: sleepKindOf(startedAt, window, endedAt),
          source: 'photo',
          importId: batch.id,
        });
        added += 1;
        if (!lastDay || sleepDay > lastDay) lastDay = sleepDay;
      }
    });

    revalidatePath('/');
    revalidatePath('/day');
    return { added, lastDay, skipped };
  });
}

/**
 * Кормление в настройках: тип вскармливания меняется со временем (с грудного
 * на смесь), а дневник кормлений нужен не только на смеси. Переход на смесь
 * или смешанное включает дневник сам — выключить его можно отдельно.
 */
export async function setFeeding(input: { type?: 'breast' | 'formula' | 'mixed'; log?: boolean }) {
  return guard(async () => {
    const { child } = await requireContext();
    const patch: { feedingType?: 'breast' | 'formula' | 'mixed'; feedingLog?: boolean } = {};
    if (input.type) {
      if (!['breast', 'formula', 'mixed'].includes(input.type)) throw new UserError('Неизвестный тип вскармливания');
      patch.feedingType = input.type;
      if (input.type !== 'breast' && child.feedingType === 'breast' && input.log === undefined) patch.feedingLog = true;
    }
    if (typeof input.log === 'boolean') patch.feedingLog = input.log;
    if (Object.keys(patch).length === 0) return;
    await db.update(children).set(patch).where(eq(children.id, child.id));
    revalidatePath('/');
    revalidatePath('/settings');
    revalidatePath('/feeding');
  });
}
