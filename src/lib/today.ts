import { and, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { currentSleepDay, type DayWindow } from '@/lib/sleep-day';

/**
 * Сегодняшние сутки ребёнка. Обычно — по утренней границе, но если ночь уже
 * закончилась раньше неё (проснулся в 05:10 и начал день), сутки этой ночи
 * уже начались — их и показываем.
 */
export async function todayOf(childId: string, window: DayWindow, now: Date = new Date()): Promise<string> {
  const [night] = await db
    .select({ sleepDay: sleeps.sleepDay })
    .from(sleeps)
    .where(
      and(
        eq(sleeps.childId, childId),
        eq(sleeps.kind, 'night'),
        isNotNull(sleeps.endedAt),
        lte(sleeps.endedAt, now),
      ),
    )
    .orderBy(desc(sleeps.endedAt))
    .limit(1);
  return currentSleepDay(now, window, night?.sleepDay ?? null);
}
