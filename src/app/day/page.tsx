import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { DayView, type DayRow } from '@/components/DayView';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import {
  formatDuration,
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
  searchParams: Promise<{ d?: string }>;
}) {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };

  const now = new Date();
  const today = sleepDayOf(now, window);
  const requested = (await searchParams).d;
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
      title={title}
      prevDay={shiftDate(sleepDay, -1)}
      nextDay={sleepDay < today ? shiftDate(sleepDay, 1) : null}
      rows={view}
      totals={{
        daySleep: formatDuration(totals.daySleep),
        nightSleep: formatDuration(totals.nightSleep),
        totalSleep: formatDuration(totals.totalSleep),
        totalWake: formatDuration(totals.totalWake),
        napCount: totals.napCount,
      }}
    />
  );
}
