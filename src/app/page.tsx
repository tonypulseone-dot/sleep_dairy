import { redirect } from 'next/navigation';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { SleepToggle } from '@/components/SleepToggle';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { formatDuration, sleepDayOf, summarizeDay, type DayWindow } from '@/lib/sleep-day';
import styles from './page.module.css';

export default async function Home() {
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

  const [todayRows, openRows, endedRows] = await Promise.all([
    db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), eq(sleeps.sleepDay, today))),
    db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), isNull(sleeps.endedAt)))
      .orderBy(desc(sleeps.startedAt))
      .limit(1),
    db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), isNotNull(sleeps.endedAt)))
      .orderBy(desc(sleeps.endedAt))
      .limit(1),
  ]);

  const totals = summarizeDay(
    today,
    todayRows.map((row) => ({ startedAt: row.startedAt, endedAt: row.endedAt })),
    window,
    now,
  );

  const open = openRows[0] ?? null;
  const lastEnded = endedRows[0] ?? null;

  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: parent.timeZone,
  }).format(now);

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <p className={styles.name}>{child.name}</p>
        <span className={styles.date}>{dateLabel}</span>
      </header>

      <div className={styles.center}>
        <SleepToggle
          sleepingSince={open ? open.startedAt.toISOString() : null}
          awakeSince={lastEnded?.endedAt ? lastEnded.endedAt.toISOString() : null}
        />
      </div>

      {todayRows.length > 0 ? (
        <section className={styles.totals} aria-label="Итоги за сегодня">
          <div className={styles.total}>
            <span className={styles.totalValue}>{formatDuration(totals.daySleep)}</span>
            <span className={styles.totalLabel}>дневной</span>
          </div>
          <div className={styles.total}>
            <span className={styles.totalValue}>{formatDuration(totals.nightSleep)}</span>
            <span className={styles.totalLabel}>ночной</span>
          </div>
          <div className={styles.total}>
            <span className={styles.totalValue}>{totals.napCount}</span>
            <span className={styles.totalLabel}>
              {totals.napCount === 1 ? 'сон днём' : 'снов днём'}
            </span>
          </div>
        </section>
      ) : (
        <p className={styles.empty}>Сегодня записей пока нет</p>
      )}
    </main>
  );
}
