import type { DayTotals } from './sleep-day';

/**
 * Ориентир по режиму.
 *
 * Виктория против норм и объяснила почему: мамы начинают тревожиться, что
 * ребёнок «не досыпает». Но окно бодрствования — то, ради чего трекеры вообще
 * открывают. Разводим это так:
 *
 *   — как только у ребёнка набралось хотя бы три дня своих данных, показываем
 *     ЕГО ритм, а не норму: с фактом про собственного ребёнка не поспоришь;
 *   — пока данных мало, показываем её таблицу, но диапазоном и с её же
 *     оговоркой, а не одной цифрой, под которую надо подогнать день.
 */

export interface NormRow {
  ageMonthsFrom: number;
  ageMonthsTo: number;
  napsCount: number | null;
  wakeWindows: { min: number; max: number }[] | null;
  totalWakeMin: number | null;
  totalWakeMax: number | null;
  daySleepMin: number | null;
  daySleepMax: number | null;
  totalSleepMin: number | null;
  totalSleepMax: number | null;
  note: string | null;
}

/**
 * Возраст в месяцах. Для недоношенных считаем скорректированный —
 * режим у них идёт от предполагаемой даты родов, а не от фактической.
 */
export function ageInMonths(birthDate: string, dueDate: string | null, now: Date): number {
  const from = new Date(`${dueDate ?? birthDate}T00:00:00Z`);
  let months =
    (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + (now.getUTCMonth() - from.getUTCMonth());
  if (now.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Подбирает строку режима под возраст и число снов.
 * Из подходящих берём самый узкий диапазон возраста: у неё есть и «6 месяцев»,
 * и переходный «6,5–7», и точная строка должна побеждать широкую.
 */
export function pickNorm(rows: NormRow[], ageMonths: number, napsCount: number | null): NormRow | null {
  const byAge = rows.filter((row) => ageMonths >= row.ageMonthsFrom && ageMonths <= row.ageMonthsTo);
  if (byAge.length === 0) return null;

  const narrowest = (list: NormRow[]) =>
    [...list].sort(
      (a, b) => a.ageMonthsTo - a.ageMonthsFrom - (b.ageMonthsTo - b.ageMonthsFrom),
    )[0];

  if (napsCount !== null) {
    const byNaps = byAge.filter((row) => row.napsCount === napsCount);
    if (byNaps.length > 0) return narrowest(byNaps);
  }
  return narrowest(byAge);
}

/** Сколько дневных снов у ребёнка обычно — по завершённым дням. */
export function typicalNapCount(days: DayTotals[]): number | null {
  const counts = days.filter((day) => day.napCount > 0).map((day) => day.napCount);
  if (counts.length === 0) return null;
  counts.sort((a, b) => a - b);
  return counts[Math.floor(counts.length / 2)];
}

/** Среднее окно бодрствования ребёнка. Последнее за день не берём — это отбой. */
export function ownWakeWindow(days: DayTotals[]): number | null {
  const windows = days.flatMap((day) => day.wakeWindows.slice(0, -1));
  if (windows.length < 3) return null;
  return Math.round(windows.reduce((sum, value) => sum + value, 0) / windows.length);
}

export type HintSource = 'own' | 'norm';

export interface RhythmHint {
  source: HintSource;
  /** Минуты. Для собственного ритма min и max совпадают. */
  min: number;
  max: number;
  note: string | null;
}

/**
 * Что показать маме под кнопкой. `null` — показывать нечего,
 * и это нормально: лучше пусто, чем выдуманная цифра.
 */
export function rhythmHint(
  days: DayTotals[],
  norms: NormRow[],
  ageMonths: number,
): RhythmHint | null {
  const own = ownWakeWindow(days);
  if (own !== null) {
    return { source: 'own', min: own, max: own, note: null };
  }

  const norm = pickNorm(norms, ageMonths, typicalNapCount(days));
  const windows = norm?.wakeWindows;
  if (!norm || !windows || windows.length === 0) return null;

  // Пока своих данных нет, берём самое короткое и самое длинное окно дня:
  // показать одно число значило бы соврать, что день ровный.
  const min = Math.min(...windows.map((window) => window.min));
  const max = Math.max(...windows.map((window) => window.max));
  return { source: 'norm', min, max, note: norm.note };
}
