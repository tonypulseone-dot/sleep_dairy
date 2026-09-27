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
 * Сутки по Виктории: ночной сон + бодрствование + дневные сны + бодрствование
 * до следующей ночи. Поэтому ночь относится к тем суткам, в которые она
 * ЗАКОНЧИЛАСЬ (ночь с 26 на 27 — в сутках 27-го), а дневной сон — к суткам,
 * в которые он начался. См. sleepDayFor.
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
 * Дневной сон или ночной.
 *
 * Ночь — это интервал [nightFrom, dayBoundary), который перешагивает полночь:
 * уснул в нём — сон ночной. Но и сон, начатый чуть раньше «ночи» (уложили
 * в 18:40 при границе 19:00), ночной, если малыш проспал до утра: сон,
 * который переходит утреннюю границу, — это ночь, а не дневной сон.
 * Поэтому, когда конец известен, смотрим и на него.
 */
export function sleepKindOf(startedAt: Date, window: DayWindow, endedAt?: Date | null): SleepKind {
  const { minutes } = localParts(startedAt, window.timeZone);
  const byStart =
    window.nightFrom > window.dayBoundary
      ? // Обычный случай: ночь с 19:00 до 06:00.
        minutes >= window.nightFrom || minutes < window.dayBoundary
      : // Вырожденный случай, когда мама выставила границы наоборот.
        minutes >= window.nightFrom && minutes < window.dayBoundary;
  if (byStart) return 'night';
  if (endedAt) {
    const nextMorning = dayStartInstant(shiftDate(sleepDayOf(startedAt, window), 1), window);
    if (endedAt.getTime() > nextMorning.getTime()) return 'night';
  }
  return 'day';
}

/**
 * К каким суткам дневника относится сон. Дневной — к суткам начала, ночной —
 * к следующим: ночь с 26 на 27 открывает сутки 27-го, с неё начинается день.
 */
export function sleepDayFor(startedAt: Date, window: DayWindow, endedAt?: Date | null): string {
  const base = sleepDayOf(startedAt, window);
  return sleepKindOf(startedAt, window, endedAt) === 'night' ? shiftDate(base, 1) : base;
}

/**
 * Какие сутки сейчас. Обычно — по утренней границе; но если малыш уже проснулся
 * после ночи раньше неё (ночь закончилась в 05:10), новые сутки начались.
 */
export function currentSleepDay(now: Date, window: DayWindow, lastNightDay: string | null = null): string {
  const byClock = sleepDayOf(now, window);
  return lastNightDay && lastNightDay > byClock ? lastNightDay : byClock;
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
  /**
   * Бодрствования дня по порядку: первое — с утра, после ночи, дальше — между
   * дневными снами. Ночные пробуждения (между кусками одной ночи) сюда не идут.
   */
  wakeWindows: number[];
  /** Бодрствование от последнего сна до следующей ночи. null — ночь ещё не началась или не записана. */
  eveningWake: number | null;
  daySleep: number;
  nightSleep: number;
  totalSleep: number;
  /** Всё бодрствование суток: с утра, между снами и перед ночью. */
  totalWake: number;
  napCount: number;
}

/**
 * Считает всё, что Виктория выписывает руками: длительности снов,
 * бодрствования между ними, дневной, ночной и суточный сон.
 *
 * Сутки начинаются с ночи (она в этих же сутках), дальше бодрствования и
 * дневные сны, и заканчиваются уходом в следующую ночь — `nextNight`, начало
 * первого ночного сна следующих суток.
 */
export function summarizeDay(
  sleepDay: string,
  records: SleepRecord[],
  window: DayWindow,
  now: Date = new Date(),
  nextNight: Date | null = null,
): DayTotals {
  const sorted = [...records].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const naps: number[] = [];
  const wakeWindows: number[] = [];
  let daySleep = 0;
  let nightSleep = 0;
  let previous: { end: Date; night: boolean } | null = null;

  for (const record of sorted) {
    const night = sleepKindOf(record.startedAt, window, record.endedAt) === 'night';
    // Между двумя кусками ночи — ночное пробуждение, а не бодрствование дня.
    if (previous && !(previous.night && night)) {
      wakeWindows.push(durationMinutes(previous.end, record.startedAt, now));
    }
    const minutes = durationMinutes(record.startedAt, record.endedAt, now);
    if (night) {
      nightSleep += minutes;
    } else {
      daySleep += minutes;
      naps.push(minutes);
    }
    previous = { end: record.endedAt ?? now, night };
  }

  const last = sorted.at(-1);
  const evening =
    last?.endedAt && nextNight ? Math.round((nextNight.getTime() - last.endedAt.getTime()) / 60000) : 0;
  // Больше полусуток «перед ночью» — это пропуск в записях, а не бодрствование.
  const eveningWake = evening > 0 && evening <= 12 * 60 ? evening : null;

  return {
    sleepDay,
    naps,
    wakeWindows,
    eveningWake,
    daySleep,
    nightSleep,
    totalSleep: daySleep + nightSleep,
    totalWake: wakeWindows.reduce((sum, value) => sum + value, 0) + (eveningWake ?? 0),
    napCount: naps.length,
  };
}

/** Начало ночи, которой открываются сутки: первый сон, если он ночной. Для «ухода в ночь» накануне. */
export function openingNight(records: SleepRecord[], window: DayWindow): Date | null {
  const first = [...records].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
  return first && sleepKindOf(first.startedAt, window, first.endedAt) === 'night' ? first.startedAt : null;
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
 * Мама выбирает сутки и время начала и конца — здесь это превращается
 * в два момента времени.
 *
 * Ловушки, из-за которых ручной ввод обычно и врёт:
 *   — сон, начавшийся до утренней границы, календарно уже на следующий день
 *     (укладывание в 00:30);
 *   — конец раньше начала означает, что сон перешагнул полночь;
 *   — ночь в сутках 27-го — это ночь с 26 на 27: она закончилась утром
 *     этих суток, а началась накануне вечером.
 */
export function composeSleep(
  sleepDay: string,
  startMinutes: MinutesOfDay,
  endMinutes: MinutesOfDay,
  window: DayWindow,
): ComposedSleep {
  const place = (day: string) => {
    const startDate = startMinutes < window.dayBoundary ? shiftDate(day, 1) : day;
    const endDate = endMinutes <= startMinutes ? shiftDate(startDate, 1) : startDate;
    return {
      startedAt: zonedTimeToUtc(startDate, startMinutes, window.timeZone),
      endedAt: zonedTimeToUtc(endDate, endMinutes, window.timeZone),
    };
  };
  const asDay = place(sleepDay);
  return sleepKindOf(asDay.startedAt, window, asDay.endedAt) === 'night' ? place(shiftDate(sleepDay, -1)) : asDay;
}

/**
 * Сон, который идёт сейчас, начался в `minutes` по часам ребёнка — значит,
 * в последний раз, когда на часах было это время.
 */
export function latestAt(minutes: MinutesOfDay, window: DayWindow, now: Date = new Date()): Date {
  const today = localDate(now, window.timeZone);
  const candidate = zonedTimeToUtc(today, minutes, window.timeZone);
  return candidate.getTime() > now.getTime() + 60_000
    ? zonedTimeToUtc(shiftDate(today, -1), minutes, window.timeZone)
    : candidate;
}

/* ------------------------------------------------------------------ *
 * Суточное кольцо
 *
 * Сутки — это круг, и консультанты читают день именно так: не списком,
 * а формой. Здесь сны раскладываются в доли круга, где верх — утренняя
 * граница, то есть начало дня этой мамы, а не абстрактная полночь.
 * ------------------------------------------------------------------ */

/** Момент, с которого начинаются сонные сутки. */
export function dayStartInstant(sleepDay: string, window: DayWindow): Date {
  return zonedTimeToUtc(sleepDay, window.dayBoundary, window.timeZone);
}

export interface DaySegment {
  /** Минуты от начала суток, 0…1440. */
  from: number;
  to: number;
  kind: SleepKind;
  /** Сон ещё идёт — рисуем его иначе. */
  ongoing: boolean;
}

/**
 * Раскладывает сны суток по кругу.
 *
 * Края подрезаем по суткам: ночной сон, начавшийся в 23:40 и закончившийся
 * утром, упирается в конец круга, а не уходит на второй виток. Иначе дуга
 * наложилась бы на утренние сны и день читался бы неверно.
 */
export function daySegments(
  sleepDay: string,
  records: SleepRecord[],
  window: DayWindow,
  now: Date = new Date(),
): DaySegment[] {
  const start = dayStartInstant(sleepDay, window).getTime();
  const minutesFrom = (at: Date) => (at.getTime() - start) / 60000;

  return records
    .map((record) => {
      const from = Math.max(0, Math.min(1440, minutesFrom(record.startedAt)));
      const rawTo = minutesFrom(record.endedAt ?? now);
      const to = Math.max(from, Math.min(1440, rawTo));
      return {
        from,
        to,
        kind: sleepKindOf(record.startedAt, window, record.endedAt),
        ongoing: record.endedAt === null,
      };
    })
    .filter((segment) => segment.to > segment.from)
    .sort((a, b) => a.from - b.from);
}
