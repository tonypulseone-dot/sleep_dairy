import Link from 'next/link';
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
        <div className={styles.headRight}>
          <span className={styles.date}>{dateLabel}</span>
          <Link href="/settings" className={styles.gear} aria-label="Настройки">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M12 3.6v2M12 18.4v2M3.6 12h2M18.4 12h2M6.1 6.1l1.4 1.4M16.5 16.5l1.4 1.4M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>
      </header>

      <div className={styles.center}>
        <SleepToggle
          sleepingSince={open ? open.startedAt.toISOString() : null}
          awakeSince={lastEnded?.endedAt ? lastEnded.endedAt.toISOString() : null}
        />
      </div>

      {todayRows.length > 0 ? (
        <Link href="/day" className={styles.totals} aria-label="Открыть дневник за сегодня">
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
        </Link>
      ) : (
        <Link href="/day" className={styles.empty}>
          Записей пока нет — добавить вручную
        </Link>
      )}
    </main>
  );
}
