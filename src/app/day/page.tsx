import { redirect } from 'next/navigation';
import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { DayView, type DayRow, type WakeKind, type WakeView } from '@/components/DayView';
import { todayOf } from '@/lib/today';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import {
  formatDuration,
  durationMinutes,
  openingNight,
  shiftDate,
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
  const today = await todayOf(child.id, window, now);
  const query = await searchParams;
  const requested = query.d;
  const sleepDay = requested && DATE.test(requested) ? requested : today;

  // Сутки дня и первый сон следующих: если он ночной, это «уход в ночь» —
  // им заканчивается бодрствование этого дня.
  const [rows, nextRows] = await Promise.all([
    db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), eq(sleeps.sleepDay, sleepDay)))
      .orderBy(asc(sleeps.startedAt)),
    db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), eq(sleeps.sleepDay, shiftDate(sleepDay, 1))))
      .orderBy(asc(sleeps.startedAt))
      .limit(1),
  ]);
  const nextNight = openingNight(nextRows, window);
  const nextNightOpen = nextNight !== null && nextRows[0]?.endedAt === null;

  // Время форматируем на сервере, в зоне ребёнка: браузер мамы может быть
  // в другом поясе, и тогда дневник показал бы чужие часы.
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: parent.timeZone,
  });

  const totals = summarizeDay(
    sleepDay,
    rows.map((row) => ({ startedAt: row.startedAt, endedAt: row.endedAt })),
    window,
    now,
    nextNight,
  );

  /*
   * Бодрствования — то, что мама и Виктория смотрят рядом со снами: с утра
   * (после ночи этих же суток), между снами и перед следующей ночью. У
   * сегодняшнего дня последнее — «бодрствует сейчас», пока малыш не уснул.
   */
  const wake = (from: Date, to: Date | null, after: number, kind: WakeKind): WakeView | null => {
    const minutes = durationMinutes(from, to ?? now, now);
    if (minutes < 1) return null;
    return { after, kind, from: time.format(from), to: to ? time.format(to) : null, duration: formatDuration(minutes) };
  };
  const wakes: WakeView[] = [];
  rows.forEach((row, index) => {
    const next = rows[index + 1];
    if (!next || !row.endedAt) return;
    const kind: WakeKind =
      row.kind === 'night' && next.kind === 'night' ? 'night' : row.kind === 'night' ? 'morning' : 'between';
    const between = wake(row.endedAt, next.startedAt, index, kind);
    if (between) wakes.push(between);
  });
  const last = rows.at(-1);
  let currentWake = 0;
  if (last?.endedAt && totals.eveningWake !== null && nextNight) {
    const evening = wake(last.endedAt, nextNight, rows.length - 1, 'evening');
    if (evening) wakes.push(evening);
  } else if (sleepDay === today && !nextNight && (!last || last.endedAt)) {
    // Ещё не уснул на ночь: бодрствование идёт. Если записей за сутки нет —
    // от последнего записанного сна, но не дальше 16 часов: иначе это пропуск.
    const [before] = last
      ? []
      : await db
          .select({ endedAt: sleeps.endedAt })
          .from(sleeps)
          .where(and(eq(sleeps.childId, child.id), isNotNull(sleeps.endedAt), lte(sleeps.endedAt, now)))
          .orderBy(desc(sleeps.endedAt))
          .limit(1);
    const since = last ? last.endedAt : (before?.endedAt ?? null);
    if (since && now.getTime() - since.getTime() < 16 * 3_600_000) {
      const current = wake(since, null, rows.length - 1, last?.kind === 'night' ? 'morning' : 'between');
      if (current) {
        wakes.push(current);
        // «Бодрствует сейчас» тоже идёт в итог — он совпадает с суммой строк.
        currentWake = durationMinutes(since, null, now);
      }
    }
  }

  const view: DayRow[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    start: time.format(row.startedAt),
    end: row.endedAt ? time.format(row.endedAt) : null,
    duration: formatDuration(durationMinutes(row.startedAt, row.endedAt, now)),
  }));

  // Короткий заголовок для узких экранов: «чт, 24 сентября» на 320 точках не влезает в строку.
  const titleShort = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: parent.timeZone,
  }).format(new Date(`${sleepDay}T12:00:00Z`));

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
      titleShort={titleShort}
      prevDay={shiftDate(sleepDay, -1)}
      nextDay={sleepDay < today ? shiftDate(sleepDay, 1) : null}
      rows={view}
      wakes={wakes}
      nextNight={nextNight ? { at: time.format(nextNight), ongoing: nextNightOpen } : null}
      totals={{
        daySleep: formatDuration(totals.daySleep),
        nightSleep: formatDuration(totals.nightSleep),
        totalSleep: formatDuration(totals.totalSleep),
        totalWake: formatDuration(totals.totalWake + currentWake),
        napCount: totals.napCount,
      }}
      sex={child.sex}
    />
  );
}
