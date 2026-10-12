import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { dailyStats, type StatDay } from '@/lib/daily-stats';
import { shiftDate, type DayWindow } from '@/lib/sleep-day';

/**
 * Статистика по дням для экрана мамы и карточки у Виктории — одна выборка
 * на оба места, чтобы цифры совпадали. Берём и следующие за периодом
 * сутки: их ночь закрывает бодрствование последнего дня.
 */
export async function loadStatDays(input: {
  childId: string;
  window: DayWindow;
  days: string[];
  today: string;
  now: Date;
}): Promise<StatDay[]> {
  const first = input.days[0];
  const last = input.days.at(-1);
  if (!first || !last) return [];
  const records = await db
    .select({ sleepDay: sleeps.sleepDay, startedAt: sleeps.startedAt, endedAt: sleeps.endedAt })
    .from(sleeps)
    .where(and(eq(sleeps.childId, input.childId), gte(sleeps.sleepDay, first), lte(sleeps.sleepDay, shiftDate(last, 1))))
    .orderBy(asc(sleeps.startedAt));
  return dailyStats({ days: input.days, records, window: input.window, today: input.today, now: input.now });
}
