/**
 * Показатели кабинета консультанта: кто из клиенток ведёт дневник, кто
 * затих и кому пора написать, как меняется сон. Чистые функции над уже
 * выбранными из базы данными — страница только рисует.
 *
 * Дни считаем календарём консультанта (Москва): «не отмечала три дня» —
 * это про её неделю, а не про пояса мам.
 */

export const QUIET_AFTER_DAYS = 3;
const DAY = 86_400_000;

export type ClientStatus = 'active' | 'slowing' | 'quiet' | 'new';

export interface ClientInput {
  childId: string;
  grantedAt: Date;
  /** Последний раз, когда мама что-то записала или поправила. */
  lastEntryAt: Date | null;
  /** Сегодняшние сонные сутки малыша — незавершённые, в итоги не идут. */
  today: string;
  /** Сны за последние недели: сутки и длительность в минутах. */
  sleeps: { sleepDay: string; minutes: number }[];
}

export interface ClientStats {
  childId: string;
  status: ClientStatus;
  /** Сколько календарных дней без записей; null — записей не было. */
  silentDays: number | null;
  /** Дней с подключения. */
  withUsDays: number;
  /** Доля последних 7 суток (или меньше, если подключилась недавно), где есть хоть одна запись. */
  regularity: number | null;
  /** Средний суточный сон за последние 7 завершённых суток. */
  avgSleep: number | null;
  /** Разница со средним за 7 суток до этого, в минутах; null — мало данных для сравнения. */
  trend: number | null;
}

/** Дата в календаре консультанта: «2026-09-24». */
export function localDate(at: Date, timeZone = 'Europe/Moscow'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function shiftIso(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clientStats(input: ClientInput, now: Date): ClientStats {
  const todayHere = localDate(now);
  const withUsDays = Math.max(0, daysBetween(localDate(input.grantedAt), todayHere));
  const silentDays = input.lastEntryAt ? Math.max(0, daysBetween(localDate(input.lastEntryAt), todayHere)) : null;

  let status: ClientStatus;
  if (silentDays === null) status = withUsDays < 2 ? 'new' : 'quiet';
  else if (silentDays <= 1) status = 'active';
  else if (silentDays < QUIET_AFTER_DAYS) status = 'slowing';
  else status = 'quiet';

  // Сутки малыша → сумма сна. Сегодняшние не берём: день не закончен.
  const totals = new Map<string, number>();
  for (const sleep of input.sleeps) {
    if (sleep.sleepDay >= input.today) continue;
    totals.set(sleep.sleepDay, (totals.get(sleep.sleepDay) ?? 0) + sleep.minutes);
  }
  const window = (fromBack: number, length: number) => {
    const days: number[] = [];
    for (let offset = fromBack; offset < fromBack + length; offset += 1) {
      const value = totals.get(shiftIso(input.today, -offset));
      if (value !== undefined) days.push(value);
    }
    return days;
  };
  const recent = window(1, 7);
  const before = window(8, 7);
  const avgSleep = average(recent);
  const prev = average(before);
  const trend = avgSleep !== null && prev !== null && recent.length >= 3 && before.length >= 3 ? avgSleep - prev : null;

  // Регулярность — только по суткам, прошедшим с подключения: новенькую не
  // штрафуем за неделю, когда её ещё не было.
  const span = Math.min(7, withUsDays);
  let regularity: number | null = null;
  if (span > 0 && status !== 'new') {
    let marked = 0;
    for (let offset = 1; offset <= span; offset += 1) {
      if (totals.has(shiftIso(input.today, -offset))) marked += 1;
    }
    regularity = marked / span;
  }

  return {
    childId: input.childId,
    status,
    silentDays,
    withUsDays,
    regularity,
    avgSleep: avgSleep === null ? null : Math.round(avgSleep),
    trend: trend === null ? null : Math.round(trend),
  };
}

/** Заметным считаем сдвиг от четверти часа: меньше — обычный шум между неделями. */
export const TREND_STEP = 15;

export interface Summary {
  total: number;
  active: number;
  slowing: number;
  quiet: number;
  fresh: number;
  newThisWeek: number;
  leftThisMonth: number;
  regularity: number | null;
  avgWithUsDays: number | null;
  better: number;
  worse: number;
  steady: number;
}

export function summarize(
  clients: (ClientStats & { grantedAt: Date })[],
  revokedAt: Date[],
  now: Date,
): Summary {
  const weekAgo = now.getTime() - 7 * DAY;
  const monthAgo = now.getTime() - 30 * DAY;
  const regular = clients.map((client) => client.regularity).filter((value): value is number => value !== null);
  const trends = clients.map((client) => client.trend).filter((value): value is number => value !== null);
  const withUs = average(clients.map((client) => client.withUsDays));
  return {
    total: clients.length,
    active: clients.filter((client) => client.status === 'active').length,
    slowing: clients.filter((client) => client.status === 'slowing').length,
    quiet: clients.filter((client) => client.status === 'quiet').length,
    fresh: clients.filter((client) => client.status === 'new').length,
    newThisWeek: clients.filter((client) => client.grantedAt.getTime() >= weekAgo).length,
    leftThisMonth: revokedAt.filter((at) => at.getTime() >= monthAgo).length,
    regularity: average(regular),
    avgWithUsDays: withUs === null ? null : Math.round(withUs),
    better: trends.filter((value) => value >= TREND_STEP).length,
    worse: trends.filter((value) => value <= -TREND_STEP).length,
    steady: trends.filter((value) => Math.abs(value) < TREND_STEP).length,
  };
}

/** Сколько клиенток отметили хоть один сон в каждый из последних N дней (старые слева). */
export function dailyActivity(
  sleepsByChild: Map<string, Set<string>>,
  now: Date,
  days = 14,
): { date: string; count: number }[] {
  const today = localDate(now);
  return Array.from({ length: days }, (_, index) => {
    const date = shiftIso(today, index - days + 1);
    let count = 0;
    for (const set of sleepsByChild.values()) if (set.has(date)) count += 1;
    return { date, count };
  });
}

/** Возрастные группы клиенток — видно, с кем она работает чаще. */
export const AGE_GROUPS = [
  { label: '0–3 мес', from: 0, to: 3 },
  { label: '4–6 мес', from: 4, to: 6 },
  { label: '7–12 мес', from: 7, to: 12 },
  { label: '1–2 года', from: 13, to: 24 },
  { label: 'старше 2', from: 25, to: Infinity },
] as const;

export function ageGroups(months: number[]): { label: string; count: number }[] {
  return AGE_GROUPS.map((group) => ({
    label: group.label,
    count: months.filter((value) => value >= group.from && value <= group.to).length,
  }));
}
