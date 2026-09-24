import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, rhythmNorms, sleeps } from '@/db/schema';
import { IconBottle, IconSettings, IconToy } from '@/components/Icons';
import { SexPrompt } from '@/components/SexPrompt';
import { defaultConsultant } from '@/lib/default-consultant';
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

  // Мамы, заведённые до того, как доступ стал оформляться при регистрации:
  // один раз предлагаем открыть дневник консультанту. Если мама уже решала —
  // открывала или закрывала доступ, — больше не спрашиваем.
  const consultant = await defaultConsultant();
  const [everGranted] = consultant
    ? await db
        .select({ id: accessGrants.id })
        .from(accessGrants)
        .where(and(eq(accessGrants.childId, child.id), eq(accessGrants.consultantId, consultant.id)))
        .limit(1)
    : [null];
  const askConsultant = consultant && !everGranted ? consultant : null;

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

      {askConsultant && (
        <Link href={`/connect?c=${encodeURIComponent(askConsultant.slug)}`} className={styles.invite}>
          <span className={styles.inviteTitle}>{askConsultant.name} пока не видит ваш дневник</span>
          <span className={styles.inviteText}>Открыть доступ, чтобы консультант видел сны малыша</span>
        </Link>
      )}

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

      {/* Забыла нажать вовремя или вносит вчерашний день — отдельная заметная кнопка. */}
      <Link href="/day?add=1" className={styles.manual}>
        <span className={styles.manualPlus} aria-hidden="true">+</span>
        <span className={styles.manualText}>
          <span className={styles.manualTitle}>Внести сон вручную</span>
          <span className={styles.manualSub}>забыли отметить — сегодня, вчера или раньше</span>
        </span>
      </Link>

      <Link href="/day" className={styles.totals} aria-label="Открыть дневник за сегодня">
        {todayRows.length > 0 ? (
          <>
            <div className={styles.totalsRow}>
              <div className={styles.total}>
                <span className={styles.totalValue}>{formatDuration(totals.daySleep)}</span>
                <span className={styles.totalLabel}>
                  <i className={`${styles.dot} ${styles.dotDay}`} aria-hidden="true" />
                  дневной
                </span>
              </div>
              <div className={styles.divider} aria-hidden="true" />
              <div className={styles.total}>
                <span className={styles.totalValue}>{formatDuration(totals.nightSleep)}</span>
                <span className={styles.totalLabel}>
                  <i className={`${styles.dot} ${styles.dotNight}`} aria-hidden="true" />
                  ночной
                </span>
              </div>
              <div className={styles.divider} aria-hidden="true" />
              <div className={styles.total}>
                <span className={styles.totalValue}>{formatDuration(totals.totalSleep)}</span>
                <span className={styles.totalLabel}>за сутки</span>
              </div>
            </div>
            {/* Из чего сложились сутки — одной полоской, теми же цветами, что на кольце. */}
            {totals.totalSleep > 0 && (
              <div className={styles.split} aria-hidden="true">
                {totals.daySleep > 0 && <i className={styles.splitDay} style={{ flexGrow: totals.daySleep }} />}
                {totals.nightSleep > 0 && <i className={styles.splitNight} style={{ flexGrow: totals.nightSleep }} />}
              </div>
            )}
          </>
        ) : (
          <span className={styles.empty}>Записей пока нет — открыть дневник</span>
        )}
      </Link>

      <nav className={styles.tiles} aria-label="Разделы">
        {child.feedingType !== 'breast' && (
          <Link href="/feeding" className={`${styles.tile} ${styles.tileFeeding}`}>
            <span className={styles.tileIcon} aria-hidden="true">
              <IconBottle />
            </span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>Кормления</span>
              <span className={styles.tileSub}>объём и время</span>
            </span>
          </Link>
        )}
        <Link href="/activities" className={`${styles.tile} ${styles.tileActivities}`}>
          <span className={styles.tileIcon} aria-hidden="true">
            <IconToy />
          </span>
          <span className={styles.tileText}>
            <span className={styles.tileTitle}>Чем заняться</span>
            <span className={styles.tileSub}>игры по возрасту</span>
          </span>
        </Link>
      </nav>
    </main>
  );
}
