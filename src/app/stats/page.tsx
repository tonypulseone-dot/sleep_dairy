import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BackButton } from '@/components/BackButton';
import { DailyStats, type StatDayView } from '@/components/DailyStats';
import { IconBack, IconForward } from '@/components/Icons';
import { TelegramBoot } from '@/components/TelegramBoot';
import { METRIC_KEYS, periodDays, type MetricKey } from '@/lib/daily-stats';
import { loadStatDays } from '@/lib/daily-stats-data';
import { currentChild, currentParent } from '@/lib/session';
import { shiftDate, type DayWindow } from '@/lib/sleep-day';
import { todayOf } from '@/lib/today';
import { shortDate, withDayLabels } from '@/lib/stat-labels';
import styles from './stats.module.css';

const PERIODS = [5, 7, 14] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const TABS: { key: MetricKey | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'wake', label: 'Бодрствование' },
  { key: 'day', label: 'Дневной сон' },
  { key: 'night', label: 'Ночной сон' },
  { key: 'total', label: 'Суточный сон' },
];

/**
 * Статистика по дням у мамы: четыре цифры суток день за днём. Сюда ведёт
 * значок графика на главном экране.
 */
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; to?: string; m?: string }>;
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
  const asked = Number(query.p);
  const period = (PERIODS as readonly number[]).includes(asked) ? asked : 5;
  const last = query.to && DATE.test(query.to) && query.to < today ? query.to : today;
  const tab = TABS.some((item) => item.key === query.m) ? (query.m as MetricKey | 'all') : 'all';

  const days = periodDays(last, period);
  const stats = await loadStatDays({ childId: child.id, window, days, today, now });
  const view: StatDayView[] = stats.map(withDayLabels);

  const href = (patch: { p?: number; to?: string; m?: string }) => {
    const params = new URLSearchParams();
    const p = patch.p ?? period;
    const to = patch.to ?? last;
    const m = patch.m ?? tab;
    if (p !== 5) params.set('p', String(p));
    if (to !== today) params.set('to', to);
    if (m !== 'all') params.set('m', m);
    const search = params.toString();
    return search ? `/stats?${search}` : '/stats';
  };
  const earlier = shiftDate(last, -period);
  const later = shiftDate(last, period) < today ? shiftDate(last, period) : today;

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <BackButton href="/" className={styles.back} label="К снам" />
        <h1>Статистика</h1>
        <span className={styles.name}>{child.name}</span>
      </header>

      {/* Период — первым, как в любой статистике: он задаёт всё, что ниже. */}
      <div className={styles.filters}>
        <div className={styles.periods} role="group" aria-label="Период">
          {PERIODS.map((value) => (
            <Link
              key={value}
              href={href({ p: value })}
              aria-current={value === period ? 'true' : undefined}
              className={`${styles.chip} ${value === period ? styles.chipOn : ''}`}
            >
              {value} дней
            </Link>
          ))}
        </div>
        <div className={styles.range}>
          <Link href={href({ to: earlier })} className={styles.step} aria-label="Раньше">
            <IconBack size={20} />
          </Link>
          <span className={styles.rangeLabel}>
            {shortDate(days[0])} – {last === today ? 'сегодня' : shortDate(last)}
          </span>
          {last === today ? (
            <span className={`${styles.step} ${styles.stepOff}`} aria-hidden="true">
              <IconForward size={20} />
            </span>
          ) : (
            <Link href={href({ to: later })} className={styles.step} aria-label="Позже">
              <IconForward size={20} />
            </Link>
          )}
        </div>
      </div>

      <nav className={styles.tabs} aria-label="Что показать">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={href({ m: item.key })}
            aria-current={item.key === tab ? 'page' : undefined}
            className={`${styles.tab} ${item.key === tab ? styles.tabOn : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <DailyStats days={view} metrics={tab === 'all' ? METRIC_KEYS : [tab]} linkDays />

      <p className={styles.hint}>
        Стрелка под цифрой — разница с предыдущим днём. Сегодняшние сутки ещё идут, поэтому в среднее
        не входят. Нажмите на день, чтобы открыть его в дневнике.
      </p>
    </main>
  );
}
