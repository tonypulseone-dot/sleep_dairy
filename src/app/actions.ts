'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { children, sleeps } from '@/db/schema';
import { currentChild, currentParent } from '@/lib/session';
import { sleepDayOf, sleepKindOf, type DayWindow } from '@/lib/sleep-day';

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
