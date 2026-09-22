import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { rhythmNorms, sleeps } from '@/db/schema';
import { SleepToggle } from '@/components/SleepToggle';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { ageInMonths, rhythmHint } from '@/lib/rhythm';
import {
  daySegments,
  dayStartInstant,
  formatDuration,
  shiftDate,
  sleepDayOf,
  sleepKindOf,
  summarizeDay,
  type DayWindow,
} from '@/lib/sleep-day';
import styles from './page.module.css';

/** 85 → «1 ч 25 мин». */
function human(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

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
  const weekAgo = shiftDate(today, -6);

  const [weekRows, openRows, endedRows, norms] = await Promise.all([
    db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.childId, child.id), gte(sleeps.sleepDay, weekAgo)))
      .orderBy(asc(sleeps.startedAt)),
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
    child.showRhythmHint ? db.select().from(rhythmNorms) : Promise.resolve([]),
  ]);

  const todayRows = weekRows.filter((row) => row.sleepDay === today);
  const records = todayRows.map((row) => ({ startedAt: row.startedAt, endedAt: row.endedAt }));
  const totals = summarizeDay(today, records, window, now);
  const segments = daySegments(today, records, window, now);

  // Ориентир: сперва ритм самого ребёнка, и только пока его нет — её таблица.
  const weekDays = Array.from({ length: 7 }, (_, offset) => {
    const sleepDay = shiftDate(today, -offset);
    return summarizeDay(
      sleepDay,
      weekRows
        .filter((row) => row.sleepDay === sleepDay)
        .map((row) => ({ startedAt: row.startedAt, endedAt: row.endedAt })),
      window,
      now,
    );
  });

  const hint = child.showRhythmHint
    ? rhythmHint(weekDays, norms, ageInMonths(child.birthDate, child.dueDate, now))
    : null;

  const hintText = hint
    ? hint.source === 'own'
      ? `Обычно бодрствует около ${human(hint.min)}`
      : `В этом возрасте бодрствуют ${human(hint.min)} – ${human(hint.max)}. Это ориентир, а не мерка`
    : null;

  const elapsedToday = Math.round((now.getTime() - dayStartInstant(today, window).getTime()) / 60000);
  const nowMinutes = elapsedToday >= 0 && elapsedToday <= 1440 ? elapsedToday : null;

  const open = openRows[0] ?? null;
  const lastEnded = endedRows[0] ?? null;

  // Сон длиннее двадцати часов означает не рекорд, а забытую отметку.
  const STALE_AFTER_MINUTES = 20 * 60;
  const stale =
    open !== null && (now.getTime() - open.startedAt.getTime()) / 60000 > STALE_AFTER_MINUTES;

  /*
   * Строка поддержки — из просьбы Виктории: «может быть какие-то даже
   * поддерживающие слова в пользу мамы». Держим её осмысленной, а не
   * умилительной: ночью она повторяет её же метод — не брать телефон,
   * отметить утром.
   */
  const isNight = nowMinutes !== null && sleepKindOf(now, window) === 'night';
  const support = stale
    ? null
    : open
      ? isNight
        ? 'Ночь. Отложите телефон — отметите утром.'
        : 'Спит. Это время можно потратить на себя.'
      : todayRows.length === 0
        ? 'Отметьте первый сон, когда малыш уснёт.'
        : null;

  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: parent.timeZone,
  }).format(now);

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <div>
          <p className={styles.name}>{child.name}</p>
          <span className={styles.date}>{dateLabel}</span>
        </div>
        <Link href="/settings" className={styles.gear} aria-label="Настройки">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </header>

      {support && <p className={styles.support}>{support}</p>}

      <div className={styles.stage}>
        <SleepToggle
          sleepingSince={open ? open.startedAt.toISOString() : null}
          awakeSince={lastEnded?.endedAt ? lastEnded.endedAt.toISOString() : null}
          segments={segments}
          dayBoundary={child.dayBoundaryMinutes}
          nowMinutes={nowMinutes}
          hint={hintText}
          stale={stale}
        />
      </div>

      <Link href="/day" className={styles.totals} aria-label="Открыть дневник за сегодня">
        {todayRows.length > 0 ? (
          <>
            <div className={styles.total}>
              <span className={styles.totalValue}>{formatDuration(totals.daySleep)}</span>
              <span className={styles.totalLabel}>дневной</span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.total}>
              <span className={styles.totalValue}>{formatDuration(totals.nightSleep)}</span>
              <span className={styles.totalLabel}>ночной</span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.total}>
              <span className={styles.totalValue}>{formatDuration(totals.totalSleep)}</span>
              <span className={styles.totalLabel}>за сутки</span>
            </div>
          </>
        ) : (
          <span className={styles.empty}>Записей пока нет — открыть дневник</span>
        )}
      </Link>
    </main>
  );
}
