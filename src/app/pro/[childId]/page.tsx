import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, children, parents, sleeps } from '@/db/schema';
import { SleepChart, type ChartDay } from '@/components/SleepChart';
import { SleepTimeline, type TimelineDay } from '@/components/SleepTimeline';
import { currentConsultant } from '@/lib/pro-session';
import {
  averageTotalSleep,
  dayStartInstant,
  durationMinutes,
  formatDuration,
  formatTimeOfDay,
  localMinutes,
  shiftDate,
  sleepDayOf,
  summarizeDay,
  type DayTotals,
  type DayWindow,
} from '@/lib/sleep-day';
import { childWords } from '@/lib/words';
import styles from '@/components/Pro.module.css';

const PERIODS = [5, 7, 10, 14] as const;

export default async function ClientCard({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const consultant = await currentConsultant();
  if (!consultant) redirect('/pro/login');

  const { childId } = await params;

  // Доступ действует, пока мама его не отозвала: проверяем на каждый заход,
  // а не один раз при входе в кабинет.
  const [access] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.childId, childId),
        eq(accessGrants.consultantId, consultant.id),
        isNull(accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (!access) notFound();

  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) notFound();
  const [parent] = await db.select().from(parents).where(eq(parents.id, child.parentId)).limit(1);

  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };

  const requested = Number((await searchParams).p);
  const period = PERIODS.includes(requested as (typeof PERIODS)[number]) ? requested : 7;

  const now = new Date();
  const today = sleepDayOf(now, window);
  const from = shiftDate(today, -(period - 1));

  const rows = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.childId, childId), gte(sleeps.sleepDay, from)))
    .orderBy(asc(sleeps.startedAt));

  const byDay = new Map<string, { startedAt: Date; endedAt: Date | null }[]>();
  for (const row of rows) {
    const list = byDay.get(row.sleepDay) ?? [];
    list.push({ startedAt: row.startedAt, endedAt: row.endedAt });
    byDay.set(row.sleepDay, list);
  }

  const days: DayTotals[] = [];
  for (let offset = 0; offset < period; offset += 1) {
    const sleepDay = shiftDate(today, -offset);
    days.push(summarizeDay(sleepDay, byDay.get(sleepDay) ?? [], window, now));
  }

  // Сегодняшний день ещё не закончился: включать его в среднее — занижать цифру.
  const completed = days.filter((day) => day.sleepDay !== today && day.totalSleep > 0);
  const average = averageTotalSleep(completed);

  // Шкала по дням: сны отрезками от утренней границы, свежий день сверху.
  const byDayRows = new Map<string, typeof rows>();
  for (const row of rows) byDayRows.set(row.sleepDay, [...(byDayRows.get(row.sleepDay) ?? []), row]);
  const clock = (at: Date) => formatTimeOfDay(localMinutes(at, window.timeZone));
  const timelineLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const timeline: TimelineDay[] = days.map((day) => {
    const start = dayStartInstant(day.sleepDay, window).getTime();
    const minutesFrom = (at: Date) => (at.getTime() - start) / 60000;
    const segments = (byDayRows.get(day.sleepDay) ?? []).map((row) => {
      const end = row.endedAt ?? now;
      const from = Math.max(0, Math.min(1440, minutesFrom(row.startedAt)));
      return {
        from,
        to: Math.max(from, Math.min(1440, minutesFrom(end))),
        kind: row.kind,
        ongoing: row.endedAt === null,
        start: clock(row.startedAt),
        end: row.endedAt ? clock(row.endedAt) : null,
        duration: formatDuration(durationMinutes(row.startedAt, end)),
      };
    });
    const complete = day.sleepDay !== today && day.totalSleep > 0;
    const diff = average === null || !complete ? 0 : day.totalSleep - average;
    const nowAt = day.sleepDay === today ? Math.round(minutesFrom(now)) : null;
    return {
      sleepDay: day.sleepDay,
      label: timelineLabel.format(new Date(`${day.sleepDay}T12:00:00Z`)),
      isToday: day.sleepDay === today,
      segments,
      wakeWindows: day.wakeWindows.map(formatDuration),
      total: formatDuration(day.totalSleep),
      day: formatDuration(day.daySleep),
      night: formatDuration(day.nightSleep),
      napCount: day.napCount,
      // Отклонение от среднего — только заметное: мелочь в полчаса глаз не должна цеплять.
      delta: Math.abs(diff) >= 30 ? { text: `${diff > 0 ? '+' : '−'}${formatDuration(Math.abs(diff))}`, up: diff > 0 } : null,
      nowAt: nowAt !== null && nowAt >= 0 && nowAt <= 1440 ? nowAt : null,
    };
  });

  // График читается слева направо от старых дней к свежим, как и любая динамика.
  const chartDays: ChartDay[] = [...days].reverse().map((day) => ({
    label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${day.sleepDay}T12:00:00Z`)),
    title: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${day.sleepDay}T12:00:00Z`)),
    daySleep: day.daySleep,
    nightSleep: day.nightSleep,
  }));

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.card}>
          <span className={styles.cardName}>{child.name}</span>
          <span className={styles.cardMeta}>
            {child.isPreterm ? childWords(child.sex).preterm : childWords(child.sex).fullTerm}
            {child.feedingType === 'formula'
              ? ' · искусственное вскармливание'
              : child.feedingType === 'mixed'
                ? ' · смешанное вскармливание'
                : ' · грудное вскармливание'}
          </span>
        </div>
        <Link href="/pro" className={styles.linkish}>
          Ко всем клиенткам
        </Link>
      </div>

      {(child.temperament?.length || child.healthNotes) && (
        <div>
          {child.temperament && child.temperament.length > 0 && (
            <div className={styles.tags}>
              {child.temperament.map((item) => (
                <span key={item} className={styles.tag}>
                  {item}
                </span>
              ))}
            </div>
          )}
          {child.healthNotes && <div className={styles.health}>{child.healthNotes}</div>}
        </div>
      )}

      <div className={styles.periods}>
        <span className={styles.periodLabel}>Период</span>
        {PERIODS.map((value) => (
          <Link
            key={value}
            href={`/pro/${childId}?p=${value}`}
            className={`${styles.period} ${value === period ? styles.periodOn : ''}`}
          >
            {value} дней
          </Link>
        ))}
        {/* Та же выборка таблицей — для Excel и переписки с мамой. */}
        <a href={`/pro/${childId}/export?days=${period}`} className={styles.download} download>
          Скачать таблицу
        </a>
      </div>

      <SleepChart days={chartDays} />

      <SleepTimeline days={timeline} dayBoundary={child.dayBoundaryMinutes} />

      <div className={styles.average}>
        <span className={styles.averageLabel}>Средне-суточный сон</span>
        <span className={styles.averageValue}>{average === null ? '—' : formatDuration(average)}</span>
        <span className={styles.averageNote}>
          {completed.length === 0
            ? 'нужен хотя бы один завершённый день'
            : `по ${completed.length} завершённым дням, сегодняшний не считаем`}
        </span>
      </div>
    </main>
  );
}
