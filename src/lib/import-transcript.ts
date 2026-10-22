/**
 * Сны из переписанного текста скриншота.
 *
 * Проверка на живом GigaChat показала: просьба «сразу выдай список снов»
 * для модели слишком сложна — она путает пары времён в ленте «снизу
 * вверх» и выдумывает сны по графикам. А переписать текст с картинки
 * построчно она может надёжно. Поэтому модель только переписывает
 * (transcribePrompt), а сны собирает этот код по строгим правилам:
 *
 *  - строка с диапазоном «20:35 - 06:48» — готовый сон, дата — из
 *    ближайшего заголовка выше («12 августа 2026 г.», «11.08.2026»,
 *    «10.10.26», «Вчера»). В отчётах с AM/PM пометка часто стоит только
 *    после второго времени («1:47—3:00 PM») — она относится к обоим;
 *    сомнение решает длительность в той же строке;
 *  - лента без диапазонов (время над и под плашкой сна) — пары соседних
 *    времён; сон — та пара, разница которой совпадает с длительностью в
 *    плашке, остальные пары — бодрствование. Так неважно даже, если модель
 *    переставила строки местами;
 *  - нет ни одного времени вида «13:05» — это график или статистика,
 *    снов нет и выдумать их неоткуда.
 *
 * Не справились правила (время есть, а снов не собрали) — возвращаем null,
 * и текст разбирает нейросеть (textPrompt), уже без картинки.
 */
import {
  finalizeSleeps,
  HALF_DAY,
  halfOf,
  normalizeTime,
  parseDuration,
  spanMinutes,
  type Recognized,
  type RecognizedSleep,
  type ScreenKind,
} from './import-parse';

export function transcribePrompt(): string {
  return `Перепиши весь текст с этого скриншота построчно, сверху вниз, точно как написано. Ничего не пропускай, не объясняй и не пересчитывай.
Правила:
- Каждая строка экрана — отдельной строкой. НЕ объединяй разные строки в одну: время над плашкой, плашка и время под плашкой — три разные строки.
- Если в одной строке есть что-то слева и справа — пиши через « | ». Числа и длительности справа («1 ч 15 м», «4») обязательно переписывай тоже.
- Не пропускай ни одного времени (вида 07:02, 21:10) — даже если оно стоит отдельно или мелко.
- Если строка находится внутри цветной плашки или карточки, начни её с [ПЛАШКА].
- Значки (луна, солнце) пиши словами: [луна], [солнце].
- Цифры и время переписывай в точности, со всеми знаками («07:02, 13 авг», «9 часов 52 минуты»).
- Время с AM/PM переписывай вместе с AM/PM ровно там, где оно стоит, и НЕ переводи в 24 часа: «1:47—3:00 PM», «11:09 AM—12:21 PM», «10:34 PM – 1:04 AM».
- Таблицу переписывай по строкам: дата, время, длительность и комментарий одной строки — в одну строку через « | » («8:35—9:36 AM | 1 ч 1 мин | д1»).`;
}

const MONTHS: [RegExp, number][] = [
  [/^янв/, 1], [/^фев/, 2], [/^мар/, 3], [/^апр/, 4], [/^ма[йя]/, 5], [/^июн/, 6],
  [/^июл/, 7], [/^авг/, 8], [/^сен/, 9], [/^окт/, 10], [/^ноя/, 11], [/^дек/, 12],
];

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function iso(year: number, month: number, day: number, today: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const at = new Date(`${value}T12:00:00Z`);
  if (at.toISOString().slice(0, 10) !== value) return null;
  // Без года и «в будущем» — значит, прошлый год (декабрь, открытый в январе).
  return value > today ? null : value;
}

/**
 * Все даты в строке по порядку: «12 авг. 2026», «11.08.2026», «Вчера», «26 мая».
 * Дата без года берёт год от `near` — даты заголовка выше («25 мая 2025» →
 * разделитель «26 мая» — тоже 2025-й), а без него — текущий.
 */
export function datesIn(line: string, today: string, near: string | null = null): { date: string; hasYear: boolean }[] {
  const found: { at: number; date: string; hasYear: boolean }[] = [];
  const lower = line.toLowerCase();
  for (const match of lower.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)) {
    const date = iso(Number(match[3]), Number(match[2]), Number(match[1]), today);
    if (date) found.push({ at: match.index ?? 0, date, hasYear: true });
  }
  // Год двумя цифрами — «10.10.26», как в выгрузках-отчётах.
  for (const match of lower.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{2})(?![\d.])/g)) {
    const date = iso(2000 + Number(match[3]), Number(match[2]), Number(match[1]), today);
    if (date) found.push({ at: match.index ?? 0, date, hasYear: true });
  }
  for (const match of lower.matchAll(/(\d{1,2})\s+([а-яё]{3,9})\.?(?:\s+(\d{4}))?/g)) {
    const month = MONTHS.find(([pattern]) => pattern.test(match[2]))?.[1];
    if (!month) continue;
    let date: string | null;
    if (match[3]) {
      date = iso(Number(match[3]), month, Number(match[1]), today);
    } else {
      // Ближайший к опорной дате год: 31 декабря рядом с «1 января 2026» — это 2025-й.
      const anchor = near ?? today;
      const base = Number(anchor.slice(0, 4));
      const options = [base - 1, base, base + 1]
        .map((year) => iso(year, month, Number(match[1]), today))
        .filter((value): value is string => value !== null);
      const distance = (value: string) => Math.abs(Date.parse(value) - Date.parse(anchor));
      date = options.sort((a, b) => distance(a) - distance(b))[0] ?? null;
    }
    if (date) found.push({ at: match.index ?? 0, date, hasYear: Boolean(match[3]) });
  }
  const today_ = /(^|[^а-яё])сегодня/.exec(lower);
  if (today_) found.push({ at: today_.index, date: today, hasYear: true });
  const yesterday = /(^|[^а-яё])вчера/.exec(lower);
  if (yesterday) found.push({ at: yesterday.index, date: shift(today, -1), hasYear: true });
  return found.sort((a, b) => a.at - b.at).map(({ date, hasYear }) => ({ date, hasYear }));
}

interface TimeMark {
  /** Время в 24 часа — по своей пометке AM/PM, а без неё — как написано. */
  value: string;
  at: number;
  end: number;
  hours: number;
  minutes: number;
  /** AM/PM у этого времени; null — пометки нет. */
  half: 'am' | 'pm' | null;
}

const TIME = new RegExp(String.raw`(?<![\d.:])(\d{1,2})([:.])(\d{2})(?![\d.:])(?:\s*(${HALF_DAY}))?`, 'g');

/** Времена в строке: «07:02», «9.15», «9:15 PM», «9:15 РМ»; даты «11.08.2026» не считаются. */
function timesIn(line: string): TimeMark[] {
  const out: TimeMark[] = [];
  for (const match of line.matchAll(TIME)) {
    const half = halfOf(match[4]);
    const value = normalizeTime(`${match[1]}:${match[3]}${half ? ` ${half}` : ''}`);
    if (!value) continue;
    const at = match.index ?? 0;
    out.push({ value, at, end: at + match[0].length, hours: Number(match[1]), minutes: Number(match[3]), half });
  }
  return out;
}

/** То же время с другой пометкой AM/PM; null — время уже 24-часовое («13:05», «0:30»). */
function withHalf(time: TimeMark, half: 'am' | 'pm'): string | null {
  return normalizeTime(`${time.hours}:${String(time.minutes).padStart(2, '0')} ${half}`);
}

const opposite = (half: 'am' | 'pm') => (half === 'am' ? 'pm' : 'am');

/**
 * Начало и конец диапазона в 24 часа. Пометка AM/PM у одного края относится
 * и к другому («1:47—3:00 PM» — 13:47–15:00), но не всегда: «11:30—12:15 PM»
 * начинается до полудня. Выбираем вариант, который сходится с длительностью
 * в строке, а без неё — самый короткий сон: сон в 13 часов «днём» не бывает.
 * В отчёте с AM/PM время без пометок у обоих краев — пометку потеряли при
 * переписывании: если прочитанное не сходится с длительностью, пробуем +12 часов,
 * но утро это или вечер, всё равно не узнать — такой сон помечаем (`unsure`).
 */
function resolveRange(
  a: TimeMark,
  b: TimeMark,
  nearby: number[],
  twelveHour: boolean,
): { start: string; end: string; unsure?: boolean } {
  const fits = (start: string, end: string) => nearby.some((value) => Math.abs(value - spanMinutes(start, end)) <= 3);
  const pick = (options: { start: string; end: string }[]) =>
    options.find((option) => fits(option.start, option.end)) ??
    [...options].sort((x, y) => spanMinutes(x.start, x.end) - spanMinutes(y.start, y.end))[0];
  const variants = (time: TimeMark, half: 'am' | 'pm') =>
    [withHalf(time, half), withHalf(time, opposite(half))].filter((value): value is string => value !== null);

  if (!a.half && b.half) {
    const options = variants(a, b.half).map((start) => ({ start, end: b.value }));
    if (options.length > 0) return pick(options);
  }
  if (a.half && !b.half) {
    const options = variants(b, a.half).map((end) => ({ start: a.value, end }));
    if (options.length > 0) return pick(options);
  }
  const lost = !a.half && !b.half && twelveHour && a.hours <= 12 && b.hours <= 12;
  if (lost && nearby.length > 0 && !fits(a.value, b.value)) {
    const later = (time: TimeMark) => (time.hours >= 1 && time.hours <= 11 ? withHalf(time, 'pm') : null);
    const options = [
      { start: later(a), end: b.value },
      { start: a.value, end: later(b) },
    ].filter((option): option is { start: string; end: string } => option.start !== null && option.end !== null);
    const found = options.find((option) => fits(option.start, option.end));
    if (found) return { ...found, unsure: true };
  }
  return { start: a.value, end: b.value, unsure: lost };
}

const toMin = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const toClock = (minutes: number) => {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

/** Длительности сна рядом с диапазоном: хвост строки и следующая строка без времени; без ВБ и бодрствования. */
function durationsNear(lines: Line[], index: number, from: number): number[] {
  const cells = [lines[index].text.slice(from)];
  const next = lines[index + 1];
  if (next && timesIn(next.text).length === 0) cells.push(next.text);
  const out: number[] = [];
  for (const chunk of cells) {
    for (const cell of chunk.split('|')) {
      if (/вб|бодрств/i.test(cell)) continue;
      const minutes = parseDuration(cell.replace(/^\s*(дс|нс)\s*:/i, ''));
      if (minutes) out.push(minutes);
    }
  }
  return out;
}

/** Дата в начале строки — колонка «Дата» таблицы-отчёта. */
const ROW_DATE = /^\s*\d{1,2}\.\d{1,2}\.\d{2,4}(?![\d.:])/;

const NOT_SLEEP = /корм|бутыл|груд(?!н)|сцеж|прикорм|прогул|купан|подгуз|лекарств|бодрств|вб:/i;

interface Line {
  text: string;
  plate: boolean;
  /** Значок сна (луна, солнце) или номер сна справа («| 4») — признак блока сна в ленте. */
  sleepMark: boolean;
  /** Дата, действующая для этой строки (последний заголовок выше). */
  context: string | null;
}

function readLines(transcript: string, today: string): Line[] {
  let context: string | null = null;
  const lines: Line[] = [];
  for (const rawLine of transcript.split('\n')) {
    const plate = /\[плашка\]/i.test(rawLine);
    const sleepMark = /\[(луна|солнце)\]|[☾☀☼🌙*]|\|\s*\d{1,2}\s*$/i.test(rawLine);
    const text = rawLine.replace(/\[(плашка|луна|солнце)\]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const hasTime = timesIn(text).length > 0;
    const dates = datesIn(text, today, context);
    // Строка-заголовок (дата без времени) задаёт день для строк ниже. Две даты:
    // «12 авг. 2026, ср | 26 авг.» — шапка, берём первую (с годом); разделитель
    // ленты «13 авг | 12 авг» — берём нижний день, вторую.
    if (dates.length > 0 && !hasTime) {
      context = dates.length > 1 && dates[0].hasYear && !dates[1].hasYear ? dates[0].date : dates[dates.length - 1].date;
    } else if (hasTime && ROW_DATE.test(text)) {
      // Строка таблицы-отчёта начинается с даты: «10.10.26 | 8:35—9:36 AM | 1 ч 1 мин» —
      // это и заголовок дня для строк ниже.
      context = datesIn(text.slice(0, timesIn(text)[0].at), today, context).at(-1)?.date ?? context;
    }
    lines.push({ text, plate, sleepMark, context });
  }
  return lines;
}

function screenWithoutTimes(transcript: string): ScreenKind {
  const text = transcript.toLowerCase();
  if (/миним|максим|средн|медиан/.test(text)) return 'stats';
  if (/раз[а]? ночью|раз[а]? дн[её]м|\b02\b.*\b04\b.*\b06\b/.test(text)) return 'chart';
  return 'other';
}

/** Сны из текста; null — правила не справились, нужен разбор нейросетью. */
export function sleepsFromTranscript(transcript: string, today: string): Recognized | null {
  const lines = readLines(transcript, today);
  const anyTime = lines.some((line) => timesIn(line.text).length > 0);
  if (!anyTime) {
    return { date: null, sleeps: [], timesVisible: false, screen: screenWithoutTimes(transcript), dropped: 0, swapped: 0 };
  }

  // 1. Диапазоны «20:35 - 06:48», «1:47—3:00 PM».
  const twelveHour = lines.some((line) => timesIn(line.text).some((time) => time.half !== null));
  const ranged: RecognizedSleep[] = [];
  lines.forEach((line, lineIndex) => {
    if (NOT_SLEEP.test(line.text)) return;
    const times = timesIn(line.text);
    for (let i = 0; i + 1 < times.length; i += 1) {
      const between = line.text.slice(times[i].end, times[i + 1].at);
      if (!/^\s*[-–—]\s*$/.test(between)) continue;
      const explicit = datesIn(line.text, today, line.context)[0]?.date ?? null;
      // Длительность рядом (справа в строке или в следующей строке карточки) —
      // проверка, что цифры прочитаны верно: «08:55 - 09:50» при «1 ч 15 м» — ошибка.
      const nearby = durationsNear(lines, lineIndex, times[i + 1].end);
      const { start, end, unsure } = resolveRange(times[i], times[i + 1], nearby, twelveHour);
      const span = spanMinutes(start, end);
      const matches = nearby.find((value) => Math.abs(value - span) <= 3);
      ranged.push({
        date: explicit ?? line.context,
        start,
        end,
        doubtful: (nearby.length > 0 && matches === undefined) || Boolean(unsure),
        stated: matches ?? nearby[0] ?? null,
        ...(unsure ? { ampm: true } : {}),
      });
      i += 1;
    }
  });
  if (ranged.length > 0) {
    fillPageTop(ranged, lines);
    // Страница таблицы-отчёта с одним заголовком: сны над ним — из другого дня,
    // дату заголовка им давать нельзя. Пусть её возьмут с прошлой страницы или выберет мама.
    const report = lines.some((line) => ROW_DATE.test(line.text));
    const undated = ranged.some((sleep) => sleep.date === null);
    return finalizeSleeps(ranged, report && undated ? null : (lines.find((line) => line.context)?.context ?? null));
  }

  // 2. Лента: одиночные времена и длительности в плашках.
  const points: { value: string; date: string | null; context: string | null }[] = [];
  // Строки-длительности без времени: из них — длительности снов (плашки) и бодрствований.
  const durationLines: { minutes: number; plate: boolean; mark: boolean }[] = [];
  const wakes: number[] = [];
  for (const line of lines) {
    const times = timesIn(line.text);
    const cells = line.text.split('|').map((cell) => cell.trim());
    if (times.length === 1) {
      const rest = line.text.slice(times[0].end);
      points.push({ value: times[0].value, date: datesIn(rest.split('|')[0], today, line.context)[0]?.date ?? null, context: line.context });
      for (const cell of cells.slice(1)) {
        const minutes = parseDuration(cell);
        if (minutes) wakes.push(minutes);
      }
    } else if (times.length === 0 && !NOT_SLEEP.test(line.text) && datesIn(line.text, today).length === 0) {
      const minutes = parseDuration(cells[0]);
      if (minutes) durationLines.push({ minutes, plate: line.plate, mark: line.sleepMark });
    }
  }
  /*
   * Какие длительности — сны. Надёжнее всего значок или номер сна («| 4»);
   * нет их — плашка (если плашками помечено не всё подряд); иначе все
   * длительности, а сны отберём по чередованию (см. ниже).
   */
  const marked = durationLines.filter((item) => item.mark);
  const plated = durationLines.filter((item) => item.plate);
  const sleepLines =
    marked.length > 0 ? marked : plated.length > 0 && plated.length < durationLines.length ? plated : durationLines;
  const byAlternation = sleepLines === durationLines;
  const plates = sleepLines.map((item) => item.minutes);
  for (const item of durationLines) if (!sleepLines.includes(item)) wakes.push(item.minutes);
  if (points.length < 2 || plates.length === 0) return null;

  // Лента вниз от новых к старым или наоборот — по большинству соседних пар.
  let down = 0;
  let up = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const diff = spanMinutes(points[i + 1].value, points[i].value);
    if (diff < 12 * 60) down += 1;
    else up += 1;
  }
  const descending = down >= up;

  const used = new Set<number>();
  const boundary = new Set<number>();
  const sleeps: RecognizedSleep[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [first, second] = descending ? [points[i + 1], points[i]] : [points[i], points[i + 1]];
    const minutes = spanMinutes(first.value, second.value);
    // Самая близкая по длительности свободная плашка, а не первая в пределах ±3 минут:
    // иначе «41 минута» забирает пару в 42 минуты у своей соседки.
    let plate = -1;
    plates.forEach((value, index) => {
      if (used.has(index) || Math.abs(value - minutes) > 3) return;
      if (plate === -1 || Math.abs(value - minutes) < Math.abs(plates[plate] - minutes)) plate = index;
    });
    if (plate === -1) continue; // бодрствование между снами
    used.add(plate);
    boundary.add(i);
    boundary.add(i + 1);
    const crosses = first.value > second.value;
    const date = first.date ?? (crosses && second.date ? shift(second.date, -1) : first.context);
    sleeps.push({ date, start: first.value, end: second.value, doubtful: false, stated: plates[plate] });
  }

  /*
   * Модель иногда теряет строку со временем (склеивает строки). Тогда у
   * плашки нет пары — восстанавливаем недостающий край из длительности:
   * в ленте «новое сверху» известен конец сна (время над плашкой), начало =
   * конец − длительность. Проверка — бодрствование: от времени ниже до
   * восстановленного начала должно пройти столько, сколько написано на
   * экране. Не сошлось — сон всё равно показываем, но с «проверьте».
   * Плашки и свободные времена идут по экрану в одном порядке — так и сопоставляем.
   */
  let cursor = 0;
  plates.forEach((plate, plateIndex) => {
    if (used.has(plateIndex)) return;
    for (let i = cursor; i < points.length; i += 1) {
      if (boundary.has(i)) continue;
      const anchor = points[i];
      const neighbour = descending ? points[i + 1] : points[i - 1];
      const shiftBy = descending ? -plate : plate;
      const other = toClock(toMin(anchor.value) + shiftBy);
      // Восстановленный край не должен заходить за соседнее время.
      if (neighbour) {
        const gap = descending ? spanMinutes(neighbour.value, other) : spanMinutes(other, neighbour.value);
        const whole = descending ? spanMinutes(neighbour.value, anchor.value) : spanMinutes(anchor.value, neighbour.value);
        if (gap >= whole) continue;
      }
      const wakeGap = neighbour
        ? descending
          ? spanMinutes(neighbour.value, other)
          : spanMinutes(other, neighbour.value)
        : null;
      const confirmed = wakeGap !== null && wakes.some((value) => Math.abs(value - wakeGap) <= 3);
      const [start, end] = descending ? [other, anchor.value] : [anchor.value, other];
      sleeps.push({ date: anchor.date ?? anchor.context, start, end, doubtful: !confirmed, stated: plate });
      used.add(plateIndex);
      boundary.add(i);
      cursor = i + 1;
      return;
    }
  });
  if (sleeps.length === 0) return null;
  if (byAlternation) return finalizeSleeps(keepAlternating(sleeps), points.find((point) => point.context)?.context ?? null);
  return finalizeSleeps(sleeps, points.find((point) => point.context)?.context ?? null);
}

/**
 * Все длительности ленты совпали с парами времён — и сны, и бодрствования.
 * Они чередуются; ночь (через полночь) — всегда сон. Оставляем ту половину
 * чередования, в которую попала ночь, а без ночи — ту, где суммарно дольше.
 */
function keepAlternating(all: RecognizedSleep[]): RecognizedSleep[] {
  const ordered = [...all].sort((a, b) => `${a.date ?? ''}${a.start}`.localeCompare(`${b.date ?? ''}${b.start}`));
  const even = ordered.filter((_, index) => index % 2 === 0);
  const odd = ordered.filter((_, index) => index % 2 === 1);
  const hasNight = (list: RecognizedSleep[]) => list.some((sleep) => sleep.start > sleep.end);
  if (hasNight(even) !== hasNight(odd)) return hasNight(even) ? even : odd;
  const total = (list: RecognizedSleep[]) => list.reduce((sum, sleep) => sum + spanMinutes(sleep.start, sleep.end), 0);
  return total(even) >= total(odd) ? even : odd;
}

/**
 * Страница отчёта часто начинается с продолжения прошлого дня — без заголовка
 * с датой (скриншот второй страницы PDF). Если дни ниже идут подряд по
 * возрастанию («13.10.26», «14.10.26»), сны над первым заголовком — из
 * предыдущего дня, по убыванию — из следующего. Заголовок один — порядок
 * не понять, дату выберет мама.
 */
function fillPageTop(sleeps: RecognizedSleep[], lines: Line[]) {
  if (!sleeps.some((sleep) => sleep.date === null)) return;
  const headers: string[] = [];
  for (const line of lines) if (line.context && line.context !== headers.at(-1)) headers.push(line.context);
  if (headers.length < 2) return;
  const ascending = headers.every((date, index) => index === 0 || date > headers[index - 1]);
  const descending = headers.every((date, index) => index === 0 || date < headers[index - 1]);
  if (!ascending && !descending) return;
  const date = shift(headers[0], ascending ? -1 : 1);
  for (const sleep of sleeps) if (sleep.date === null) sleep.date = date;
}
