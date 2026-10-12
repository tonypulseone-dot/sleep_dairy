/**
 * Статистика по дням: четыре цифры суток — бодрствование, дневной, ночной и
 * суточный сон — день за днём, чтобы мама и Виктория одним взглядом видели
 * динамику («дневной сон за пять дней уменьшился»).
 *
 * Сутки — как в остальном дневнике (см. sleep-day.ts): ночь, которой они
 * начинаются, дневные сны и бодрствование до ухода в следующую ночь.
 * Сегодняшние сутки ещё идут: их цифры показываем, но в среднее, минимум,
 * максимум и сравнение с соседним днём они не идут — иначе любой вечер
 * выглядел бы провалом.
 */
import {
  durationMinutes,
  openingNight,
  summarizeDay,
  type DayWindow,
  type SleepRecord,
} from '@/lib/sleep-day';

export type MetricKey = 'wake' | 'day' | 'night' | 'total';

export const METRIC_KEYS: MetricKey[] = ['wake', 'day', 'night', 'total'];

export interface StatDay {
  sleepDay: string;
  isToday: boolean;
  /** Записей за сутки нет — цифр нет, это пропуск, а не ноль. */
  empty: boolean;
  /** Минуты. */
  values: Record<MetricKey, number>;
}

export interface StatRecord extends SleepRecord {
  sleepDay: string;
}

/** Больше 16 часов «бодрствует сейчас» — это пропуск в записях (как на экране дня). */
const MAX_CURRENT_WAKE = 16 * 60;

export function dailyStats(input: {
  /** Сутки периода по порядку, от старых к новым. */
  days: string[];
  records: StatRecord[];
  window: DayWindow;
  today: string;
  now: Date;
}): StatDay[] {
  const byDay = new Map<string, StatRecord[]>();
  for (const record of input.records) {
    const list = byDay.get(record.sleepDay) ?? [];
    list.push(record);
    byDay.set(record.sleepDay, list);
  }

  return input.days.map((sleepDay) => {
    const rows = [...(byDay.get(sleepDay) ?? [])].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const isToday = sleepDay === input.today;
    if (rows.length === 0) {
      return { sleepDay, isToday, empty: true, values: { wake: 0, day: 0, night: 0, total: 0 } };
    }
    const nextNight = openingNight(byDay.get(nextDate(sleepDay)) ?? [], input.window);
    const totals = summarizeDay(sleepDay, rows, input.window, input.now, nextNight);

    // Сегодня, пока малыш не уснул, идёт и текущее бодрствование — как на экране дня.
    let current = 0;
    const last = rows.at(-1);
    if (isToday && !nextNight && last?.endedAt) {
      const minutes = durationMinutes(last.endedAt, null, input.now);
      if (minutes < MAX_CURRENT_WAKE) current = minutes;
    }

    return {
      sleepDay,
      isToday,
      empty: false,
      values: {
        wake: totals.totalWake + current,
        day: totals.daySleep,
        night: totals.nightSleep,
        total: totals.totalSleep,
      },
    };
  });
}

export interface MetricSummary {
  /** По завершённым суткам с записями; null — таких нет. */
  average: number | null;
  min: number | null;
  max: number | null;
  /** Разница с предыдущими сутками (по индексу дня); null — сравнивать не с чем. */
  deltas: (number | null)[];
}

/** Сутки, которые идут в среднее и сравнение: закончились и записаны. */
export function isComplete(day: StatDay): boolean {
  return !day.isToday && !day.empty;
}

export function summarizeMetric(days: StatDay[], key: MetricKey): MetricSummary {
  const values = days.filter(isComplete).map((day) => day.values[key]);
  const deltas = days.map((day, index) => {
    const previous = days[index - 1];
    return previous && isComplete(day) && isComplete(previous) ? day.values[key] - previous.values[key] : null;
  });
  if (values.length === 0) return { average: null, min: null, max: null, deltas };
  return {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    deltas,
  };
}

/** Сутки периода: `count` дней, заканчивая `last`, от старых к новым. */
export function periodDays(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shift(last, index - (count - 1)));
}

function nextDate(date: string): string {
  return shift(date, 1);
}

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
