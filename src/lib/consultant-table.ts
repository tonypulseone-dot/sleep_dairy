import {
  formatDuration,
  formatTimeOfDay,
  localMinutes,
  shiftDate,
  sleepKindOf,
  durationMinutes,
  type DayWindow,
} from "./sleep-day";

export interface TableRecord {
  sleepDay: string;
  startedAt: Date;
  endedAt: Date | null;
}
export interface DiaryColumn {
  date: string;
  wake: string | null;
  bedtime: string | null;
  naps: (number | null)[];
  wakes: (number | null)[];
  day: number | null;
  night: number | null;
  total: number | null;
  awake: number | null;
  complete: boolean;
  status: string;
}
export function diaryColumns(
  dates: string[],
  records: TableRecord[],
  window: DayWindow,
  now: Date,
): DiaryColumn[] {
  const sorted = [...records].sort((a, b) => +a.startedAt - +b.startedAt);
  const kind = (r: TableRecord) => sleepKindOf(r.startedAt, window, r.endedAt);
  const clock = (at: Date) =>
    formatTimeOfDay(localMinutes(at, window.timeZone));
  return dates.map((date) => {
    const rows = sorted.filter((r) => r.sleepDay === date);
    const nights = rows.filter((r) => kind(r) === "night");
    const naps = rows.filter((r) => kind(r) === "day");
    const next = sorted.find(
      (r) => r.sleepDay === shiftDate(date, 1) && kind(r) === "night",
    );
    const morning = nights.at(-1)?.endedAt ?? null;
    let previous = morning;
    const wakes: (number | null)[] = [];
    let ordered = true;
    for (const nap of naps) {
      const gap = previous ? (+nap.startedAt - +previous) / 60000 : null;
      if (gap !== null && gap < 0) ordered = false;
      wakes.push(
        gap !== null && gap >= 0 && gap <= 20 * 60 ? Math.round(gap) : null,
      );
      previous = nap.endedAt;
    }
    const evening =
      previous && next ? (+next.startedAt - +previous) / 60000 : null;
    wakes.push(
      evening !== null && evening >= 0 && evening <= 20 * 60
        ? Math.round(evening)
        : null,
    );
    const napMinutes = naps.map((r) =>
      r.endedAt ? durationMinutes(r.startedAt, r.endedAt) : null,
    );
    const night =
      nights.length && nights.every((r) => r.endedAt)
        ? nights.reduce(
            (n, r) => n + durationMinutes(r.startedAt, r.endedAt),
            0,
          )
        : null;
    const day =
      rows.length && napMinutes.every((n) => n !== null)
        ? napMinutes.reduce<number>((n, v) => n + (v ?? 0), 0)
        : null;
    const total = night !== null && day !== null ? night + day : null;
    const awake =
      wakes.every((n) => n !== null) && rows.length
        ? wakes.reduce<number>((n, v) => n + (v ?? 0), 0)
        : null;
    const noOverlap = rows.every(
      (r, i) =>
        !i ||
        (rows[i - 1].endedAt !== null && +rows[i - 1].endedAt! <= +r.startedAt),
    );
    const complete = !!(
      morning &&
      next &&
      +next.startedAt <= +now &&
      total !== null &&
      awake !== null &&
      ordered &&
      noOverlap &&
      rows.every((r) => r.endedAt && +r.endedAt <= +now)
    );
    return {
      date,
      wake: morning ? clock(morning) : null,
      bedtime: next ? clock(next.startedAt) : null,
      naps: napMinutes,
      wakes,
      day,
      night,
      total,
      awake,
      complete,
      status: !rows.length
        ? "Нет записей"
        : complete
          ? "Учтён в среднем"
          : "Неполные сутки — вне среднего",
    };
  });
}
export function periodSummary(days: DiaryColumn[]) {
  const complete = days.filter((d) => d.complete);
  const total = complete.reduce((n, d) => n + (d.total ?? 0), 0);
  return {
    count: complete.length,
    total: complete.length ? total : null,
    average: complete.length ? Math.round(total / complete.length) : null,
  };
}
export function tableRows(
  days: DiaryColumn[],
): { label: string; tone: string; cells: string[] }[] {
  const duration = (v: number | null | undefined) =>
    v == null ? "—" : formatDuration(v);
  const rows = [
    { label: "Подъём", tone: "wake", cells: days.map((d) => d.wake ?? "—") },
  ];
  const count = Math.max(0, ...days.map((d) => d.naps.length));
  for (let i = 0; i <= count; i++) {
    rows.push({
      label: `Бодрствование ${i + 1}`,
      tone: "",
      cells: days.map((d) => duration(d.wakes[i])),
    });
    if (i < count)
      rows.push({
        label: `Дневной сон ${i + 1}`,
        tone: "day",
        cells: days.map((d) => duration(d.naps[i])),
      });
  }
  rows.push({
    label: "Отбой",
    tone: "wake",
    cells: days.map((d) => d.bedtime ?? "—"),
  });
  for (const [label, key, tone] of [
    ["Суточный сон", "total", "total"],
    ["Общее бодрствование", "awake", ""],
    ["Ночной сон", "night", "night"],
    ["Суммарный дневной сон", "day", "day"],
  ] as const) {
    rows.push({ label, tone, cells: days.map((d) => duration(d[key])) });
  }
  rows.push({
    label: "Всего часов в сутках",
    tone: "",
    cells: days.map((d) =>
      duration(d.complete ? (d.total ?? 0) + (d.awake ?? 0) : null),
    ),
  });
  return rows;
}
export function diaryPeriod(
  from: string | undefined,
  to: string | undefined,
  today: string,
  requested = 7,
) {
  const valid = (s: string | undefined): s is string =>
    !!s &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  const end = valid(to) && to <= today ? to : today;
  const fallback = [5, 7, 10, 14, 30].includes(requested) ? requested : 7;
  const start =
    valid(from) && from <= end && from >= shiftDate(end, -89)
      ? from
      : shiftDate(end, -fallback + 1);
  const dates: string[] = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) dates.push(d);
  return { from: start, to: end, dates };
}
