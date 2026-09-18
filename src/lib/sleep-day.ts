/**
 * Сонные сутки.
 *
 * Календарная полночь для дневника сна не годится: если ребёнка уложили в 00:30,
 * ночной сон по календарю попадает в следующий день, и суточный сон за вчера
 * выглядит катастрофой. Поэтому сутки режем не в полночь, а по границе,
 * которую мама выставляет сама (Виктория настояла: у всех разные часовые пояса
 * и разные режимы).
 *
 * Две настройки на ребёнка:
 *   dayBoundary — во сколько начинается утро. Сон, начавшийся раньше этого часа,
 *                 относится к предыдущим сонным суткам.
 *   nightFrom   — во сколько начинается ночь. Сон, начавшийся после этого часа
 *                 (и до утренней границы), считается ночным, остальные — дневные.
 *
 * Сон всегда относится к тем суткам, в которые он НАЧАЛСЯ.
 */

/** Время суток в минутах от полуночи. `06:30` → 390. */
export type MinutesOfDay = number;

export interface DayWindow {
  /** Начало утра, минуты от полуночи. По умолчанию 06:00. */
  dayBoundary: MinutesOfDay;
  /** Начало ночи, минуты от полуночи. По умолчанию 19:00. */
  nightFrom: MinutesOfDay;
  /** IANA-зона ребёнка, например 'Europe/Moscow'. */
  timeZone: string;
}

export const DEFAULT_DAY_BOUNDARY: MinutesOfDay = 6 * 60;
export const DEFAULT_NIGHT_FROM: MinutesOfDay = 19 * 60;

export type SleepKind = 'day' | 'night';

/** `"06:30"` → 390. Бросает на некорректном формате, чтобы кривая настройка не утекла в расчёты. */
export function parseTimeOfDay(value: string): MinutesOfDay {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Некорректное время: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Некорректное время: ${value}`);
  return hours * 60 + minutes;
}

/** 390 → `"06:30"`. */
export function formatTimeOfDay(value: MinutesOfDay): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Разбирает момент времени в локальные для ребёнка части.
 * Считаем через Intl, чтобы не тащить зависимость ради часовых поясов.
 */
function localParts(at: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Локальные минуты от полуночи в зоне ребёнка. Нужны и для тем оформления. */
export function localMinutes(at: Date, timeZone: string): MinutesOfDay {
  return localParts(at, timeZone).minutes;
}

/** Локальная дата вида `2026-09-17` в зоне ребёнка. */
export function localDate(at: Date, timeZone: string): string {
  return localParts(at, timeZone).date;
}

/** Сдвигает дату вида `2026-09-17` на `days` суток, оставаясь строкой. */
export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * К каким сонным суткам относится момент времени.
 * Всё, что раньше утренней границы, уходит в предыдущий день.
 */
export function sleepDayOf(at: Date, window: DayWindow): string {
  const { date, minutes } = localParts(at, window.timeZone);
  return minutes < window.dayBoundary ? shiftDate(date, -1) : date;
}

/**
 * Дневной сон или ночной — по времени начала.
 * Ночь — это интервал [nightFrom, dayBoundary), который перешагивает полночь.
 */
export function sleepKindOf(startedAt: Date, window: DayWindow): SleepKind {
  const { minutes } = localParts(startedAt, window.timeZone);
  if (window.nightFrom > window.dayBoundary) {
    // Обычный случай: ночь с 19:00 до 06:00.
    return minutes >= window.nightFrom || minutes < window.dayBoundary ? 'night' : 'day';
  }
  // Вырожденный случай, когда мама выставила границы наоборот.
  return minutes >= window.nightFrom && minutes < window.dayBoundary ? 'night' : 'day';
}

/** Длительность в минутах. Незакрытый сон считаем до `now`. */
export function durationMinutes(startedAt: Date, endedAt: Date | null, now: Date = new Date()): number {
  const end = endedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60000));
}

/** `195` → `"3:15"`. Формат, в котором консультант читает таблицу. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

export interface SleepRecord {
  startedAt: Date;
  endedAt: Date | null;
}

export interface DayTotals {
  sleepDay: string;
  /** Длительности дневных снов по порядку. */
  naps: number[];
  /** Длительности бодрствований между снами. */
  wakeWindows: number[];
  daySleep: number;
  nightSleep: number;
  totalSleep: number;
  totalWake: number;
  napCount: number;
}

/**
 * Считает всё, что Виктория выписывает руками: длительности снов,
 * бодрствования между ними, дневной, ночной и суточный сон.
 *
 * Бодрствования считаем внутри суток: от конца одного сна до начала следующего.
 * Последний интервал — от конца последнего сна до утренней границы следующего дня,
 * он закрывается только когда день завершён.
 */
export function summarizeDay(
  sleepDay: string,
  records: SleepRecord[],
  window: DayWindow,
  now: Date = new Date(),
): DayTotals {
  const sorted = [...records].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const naps: number[] = [];
  const wakeWindows: number[] = [];
  let daySleep = 0;
  let nightSleep = 0;
  let previousEnd: Date | null = null;

  for (const record of sorted) {
    if (previousEnd) {
      wakeWindows.push(durationMinutes(previousEnd, record.startedAt, now));
    }
    const minutes = durationMinutes(record.startedAt, record.endedAt, now);
    if (sleepKindOf(record.startedAt, window) === 'night') {
      nightSleep += minutes;
    } else {
      daySleep += minutes;
      naps.push(minutes);
    }
    previousEnd = record.endedAt ?? now;
  }

  const totalSleep = daySleep + nightSleep;
  return {
    sleepDay,
    naps,
    wakeWindows,
    daySleep,
    nightSleep,
    totalSleep,
    totalWake: wakeWindows.reduce((sum, value) => sum + value, 0),
    napCount: naps.length,
  };
}

/**
 * Средне-суточный сон за период — то самое, что консультант сейчас
 * складывает на калькуляторе и делит на число дней.
 * Незавершённые дни в среднее не берём, иначе оно занижается.
 */
export function averageTotalSleep(days: DayTotals[]): number | null {
  if (days.length === 0) return null;
  const sum = days.reduce((total, day) => total + day.totalSleep, 0);
  return Math.round(sum / days.length);
}

/* ------------------------------------------------------------------ *
 * Ручной ввод: из того, что мама набрала на экране, в момент времени
 * ------------------------------------------------------------------ */

/** Смещение зоны относительно UTC в минутах на конкретный момент. */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60000;
}

/**
 * Местное время в зоне ребёнка → момент времени.
 * Считаем в два прохода: первое смещение берём приблизительно,
 * вторым уточняем — иначе на переводе часов можно промахнуться на час.
 */
export function zonedTimeToUtc(date: string, minutes: MinutesOfDay, timeZone: string): Date {
  const naive = Date.parse(`${date}T00:00:00Z`) + minutes * 60000;
  const firstPass = new Date(naive - tzOffsetMinutes(new Date(naive), timeZone) * 60000);
  return new Date(naive - tzOffsetMinutes(firstPass, timeZone) * 60000);
}

export interface ComposedSleep {
  startedAt: Date;
  endedAt: Date;
}

/**
 * Мама выбирает сонные сутки и время начала и конца — здесь это превращается
 * в два момента времени.
 *
 * Две ловушки, из-за которых ручной ввод обычно и врёт:
 *   — сон, начавшийся до утренней границы, календарно уже на следующий день
 *     (укладывание в 00:30 относится к 16-м суткам, но дата у него 17-е);
 *   — конец раньше начала означает, что сон перешагнул полночь.
 */
export function composeSleep(
  sleepDay: string,
  startMinutes: MinutesOfDay,
  endMinutes: MinutesOfDay,
  window: DayWindow,
): ComposedSleep {
  const startDate = startMinutes < window.dayBoundary ? shiftDate(sleepDay, 1) : sleepDay;
  const startedAt = zonedTimeToUtc(startDate, startMinutes, window.timeZone);

  const endDate = endMinutes <= startMinutes ? shiftDate(startDate, 1) : startDate;
  const endedAt = zonedTimeToUtc(endDate, endMinutes, window.timeZone);

  return { startedAt, endedAt };
}
