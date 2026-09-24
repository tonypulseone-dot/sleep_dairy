import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { rhythmNorms, sleeps } from '@/db/schema';
import { IconSettings } from '@/components/Icons';
import { SexPrompt } from '@/components/SexPrompt';
import { SleepToggle } from '@/components/SleepToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { ageInMonths, ownNapLength, ownNightLength, rhythmHint } from '@/lib/rhythm';
import { resolveTheme } from '@/lib/theme';
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

  const open = openRows[0] ?? null;
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

  const wakeHintText = hint
    ? hint.source === 'own'
      ? `Обычно бодрствует около ${human(hint.min)}`
      : `В этом возрасте бодрствуют ${human(hint.min)} – ${human(hint.max)}. Это ориентир, а не мерка`
    : null;

  // Пока малыш спит, маме важно, сколько обычно длится сон, а не бодрствование.
  // Только по его собственным дням: сегодняшний не берём — он ещё идёт.
  const pastDays = weekDays.slice(1);
  const sleepLength = open && child.showRhythmHint
    ? open.kind === 'night'
      ? ownNightLength(pastDays)
      : ownNapLength(pastDays)
    : null;
  const sleepHintText = sleepLength === null
    ? null
    : open?.kind === 'night'
      ? `Ночью обычно спит около ${human(sleepLength)}`
      : `Дневной сон обычно длится около ${human(sleepLength)}`;

  const hintText = open ? sleepHintText : wakeHintText;

  const elapsedToday = Math.round((now.getTime() - dayStartInstant(today, window).getTime()) / 60000);
  const nowMinutes = elapsedToday >= 0 && elapsedToday <= 1440 ? elapsedToday : null;

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
        <div className={styles.tools}>
          <ThemeToggle theme={resolveTheme(parent.themePref, window, now)} className={styles.tool} />
          <Link href="/settings" className={styles.tool} aria-label="Настройки">
            <IconSettings />
          </Link>
        </div>
      </header>

      {child.sex === null && <SexPrompt name={child.name} />}

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
          sex={child.sex}
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

      <div className={styles.links}>
        {child.feedingType !== 'breast' && (
          <Link href="/feeding" className={styles.secondary}>
            Кормления
          </Link>
        )}
        <Link href="/activities" className={styles.secondary}>
          Чем заняться
        </Link>
      </div>
    </main>
  );
}
