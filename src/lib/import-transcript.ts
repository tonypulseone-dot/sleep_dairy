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
 *    ближайшего заголовка выше («12 августа 2026 г.», «11.08.2026», «Вчера»);
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
import { finalizeSleeps, normalizeTime, parseDuration, spanMinutes, type Recognized, type RecognizedSleep, type ScreenKind } from './import-parse';

export function transcribePrompt(): string {
  return `Перепиши весь текст с этого скриншота построчно, сверху вниз, точно как написано. Ничего не пропускай, не объясняй и не пересчитывай.
Правила:
- Каждая строка экрана — отдельной строкой.
- Если в одной строке есть что-то слева и справа — пиши через « | ».
- Если строка находится внутри цветной плашки или карточки, начни её с [ПЛАШКА].
- Значки (луна, солнце) пиши словами: [луна], [солнце].
- Цифры и время переписывай в точности, со всеми знаками («07:02, 13 авг», «9 часов 52 минуты»).`;
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

/** Времена в строке: «07:02», «9.15», «9:15 PM»; даты «11.08.2026» не считаются. */
function timesIn(line: string): { value: string; at: number; end: number }[] {
  const out: { value: string; at: number; end: number }[] = [];
  for (const match of line.matchAll(/(?<![\d.:])(\d{1,2})([:.])(\d{2})(?![\d.:])(\s*[AaPp][Mm])?/g)) {
    const value = normalizeTime(`${match[1]}:${match[3]}${match[4] ?? ''}`);
    if (value) out.push({ value, at: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return out;
}

const NOT_SLEEP = /корм|бутыл|груд(?!н)|сцеж|прикорм|прогул|купан|подгуз|лекарств|бодрств|вб:/i;

interface Line {
  text: string;
  plate: boolean;
  /** Дата, действующая для этой строки (последний заголовок выше). */
  context: string | null;
}

function readLines(transcript: string, today: string): Line[] {
  let context: string | null = null;
  const lines: Line[] = [];
  for (const rawLine of transcript.split('\n')) {
    const plate = /\[плашка\]/i.test(rawLine);
    const text = rawLine.replace(/\[(плашка|луна|солнце)\]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const hasTime = timesIn(text).length > 0;
    const dates = datesIn(text, today, context);
    // Строка-заголовок (дата без времени) задаёт день для строк ниже. Две даты:
    // «12 авг. 2026, ср | 26 авг.» — шапка, берём первую (с годом); разделитель
    // ленты «13 авг | 12 авг» — берём нижний день, вторую.
    if (dates.length > 0 && !hasTime) {
      context = dates.length > 1 && dates[0].hasYear && !dates[1].hasYear ? dates[0].date : dates[dates.length - 1].date;
    }
    lines.push({ text, plate, context });
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

  // 1. Диапазоны «20:35 - 06:48».
  const ranged: RecognizedSleep[] = [];
  for (const line of lines) {
    if (NOT_SLEEP.test(line.text)) continue;
    const times = timesIn(line.text);
    for (let i = 0; i + 1 < times.length; i += 1) {
      const between = line.text.slice(times[i].end, times[i + 1].at);
      if (!/^\s*[-–—]\s*$/.test(between)) continue;
      const explicit = datesIn(line.text, today, line.context)[0]?.date ?? null;
      ranged.push({ date: explicit ?? line.context, start: times[i].value, end: times[i + 1].value, doubtful: false, stated: null });
      i += 1;
    }
  }
  if (ranged.length > 0) return finalizeSleeps(ranged, lines.find((line) => line.context)?.context ?? null);

  // 2. Лента: одиночные времена и длительности в плашках.
  const points: { value: string; date: string | null; context: string | null }[] = [];
  const plates: number[] = [];
  for (const line of lines) {
    const times = timesIn(line.text);
    if (times.length === 1) {
      const rest = line.text.slice(times[0].end);
      points.push({ value: times[0].value, date: datesIn(rest, today, line.context)[0]?.date ?? null, context: line.context });
    } else if (times.length === 0 && line.plate && !NOT_SLEEP.test(line.text)) {
      const minutes = parseDuration(line.text.split('|')[0]);
      if (minutes) plates.push(minutes);
    }
  }
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
  const sleeps: RecognizedSleep[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [first, second] = descending ? [points[i + 1], points[i]] : [points[i], points[i + 1]];
    const minutes = spanMinutes(first.value, second.value);
    const plate = plates.findIndex((value, index) => !used.has(index) && Math.abs(value - minutes) <= 3);
    if (plate === -1) continue; // бодрствование между снами
    used.add(plate);
    const crosses = first.value > second.value;
    const date = first.date ?? (crosses && second.date ? shift(second.date, -1) : first.context);
    sleeps.push({ date, start: first.value, end: second.value, doubtful: false, stated: plates[plate] });
  }
  if (sleeps.length === 0) return null;
  return finalizeSleeps(sleeps, points.find((point) => point.context)?.context ?? null);
}
