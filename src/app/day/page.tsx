import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { DayView, type DayRow, type WakeView } from '@/components/DayView';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import {
  formatDuration,
  dayStartInstant,
  durationMinutes,
  shiftDate,
  sleepDayOf,
  summarizeDay,
  type DayWindow,
} from '@/lib/sleep-day';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; add?: string; asleep?: string }>;
}) {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };

  const now = new Date();
  const today = sleepDayOf(now, window);
  const query = await searchParams;
  const requested = query.d;
  const sleepDay = requested && DATE.test(requested) ? requested : today;

  const rows = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.childId, child.id), eq(sleeps.sleepDay, sleepDay)))
    .orderBy(asc(sleeps.startedAt));

  const totals = summarizeDay(
    sleepDay,
    rows.map((row) => ({ startedAt: row.startedAt, endedAt: row.endedAt })),
    window,
    now,
  );

  // Время форматируем на сервере, в зоне ребёнка: браузер мамы может быть
  // в другом поясе, и тогда дневник показал бы чужие часы.
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: parent.timeZone,
  });

  /*
   * Бодрствования между снами — то, что мама и Виктория смотрят рядом со
   * снами. Первое — от пробуждения после ночи (ночь записана во вчерашних
   * сутках) до первого сна; последнее у сегодняшнего дня — «бодрствует
   * сейчас», пока малыш не уснул.
   */
  const dayStart = dayStartInstant(sleepDay, window);
  const anchor = rows[0]?.startedAt ?? (sleepDay === today ? now : null);
  const [before] = anchor
    ? await db
        .select({ endedAt: sleeps.endedAt })
        .from(sleeps)
        .where(
          and(
            eq(sleeps.childId, child.id),
            isNotNull(sleeps.endedAt),
            lte(sleeps.endedAt, anchor),
            // Не дальше полусуток до начала дня: иначе «бодрствование» растянется на пропуск в записях.
            gte(sleeps.endedAt, new Date(dayStart.getTime() - 12 * 3_600_000)),
          ),
        )
        .orderBy(desc(sleeps.endedAt))
        .limit(1)
    : [];

  const wake = (from: Date, to: Date | null, after: number): WakeView | null => {
    const minutes = durationMinutes(from, to ?? now, now);
    if (minutes < 1) return null;
    return { after, from: time.format(from), to: to ? time.format(to) : null, duration: formatDuration(minutes) };
  };
  const wakes: WakeView[] = [];
  if (before?.endedAt && rows[0]) {
    const first = wake(before.endedAt, rows[0].startedAt, -1);
    if (first) wakes.push(first);
  }
  rows.forEach((row, index) => {
    const next = rows[index + 1];
    if (next && row.endedAt) {
      const between = wake(row.endedAt, next.startedAt, index);
      if (between) wakes.push(between);
    }
  });
  if (sleepDay === today) {
    const last = rows.at(-1);
    const since = last ? last.endedAt : (before?.endedAt ?? null);
    // Больше 16 часов «бодрствования» — это пропуск в записях, а не бодрствование.
    if (since && (!last || last.endedAt) && now.getTime() - since.getTime() < 16 * 3_600_000) {
      const current = wake(since, null, rows.length - 1);
      if (current) wakes.push(current);
    }
  }

  const view: DayRow[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    start: time.format(row.startedAt),
    end: row.endedAt ? time.format(row.endedAt) : null,
    duration: formatDuration(durationMinutes(row.startedAt, row.endedAt, now)),
  }));

  const title = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: parent.timeZone,
  }).format(new Date(`${sleepDay}T12:00:00Z`));

  return (
    <DayView
      sleepDay={sleepDay}
      today={today}
      dayBoundary={child.dayBoundaryMinutes}
      nightFrom={child.nightFromMinutes}
      startAdding={query.add === '1' || query.asleep === '1'}
      asleep={query.asleep === '1'}
      nowClock={time.format(now)}
      title={title}
      prevDay={shiftDate(sleepDay, -1)}
      nextDay={sleepDay < today ? shiftDate(sleepDay, 1) : null}
      rows={view}
      wakes={wakes}
      totals={{
        daySleep: formatDuration(totals.daySleep),
        nightSleep: formatDuration(totals.nightSleep),
        totalSleep: formatDuration(totals.totalSleep),
        totalWake: formatDuration(totals.totalWake),
        napCount: totals.napCount,
      }}
      sex={child.sex}
    />
  );
}
