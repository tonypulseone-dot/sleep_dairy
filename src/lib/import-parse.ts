/**
 * Перенос снов из других приложений: что спрашиваем у нейросети и как
 * проверяем ответ. Нейросеть только переписывает цифры со скриншота —
 * тип сна, сутки и проверки делает наш код, как при ручном вводе.
 *
 * Главная страховка — длительность. В трекерах она почти всегда написана
 * рядом со сном («9 часов 47 минут»), и по ней видно, правильно ли
 * прочитано время. Лента многих приложений идёт снизу вверх, время
 * «проснулась» стоит над блоком сна, и нейросеть может перепутать начало
 * с концом: если время сходится с длительностью только наоборот —
 * переставляем, если не сходится никак — просим маму проверить.
 */

export interface RecognizedSleep {
  /** Дата начала сна, «2026-09-23»; null — на скриншоте не видно. */
  date: string | null;
  /** «21:05». */
  start: string;
  end: string;
  /** Время не сошлось с длительностью, написанной на скриншоте. */
  doubtful: boolean;
  /** Длительность, написанная на скриншоте, в минутах; null — не было. */
  stated: number | null;
}

/** Что за экран на скриншоте — от этого зависит, что сказать маме. */
export type ScreenKind = 'list' | 'stats' | 'chart' | 'other';

export interface Recognized {
  /** Дата экрана целиком, если она одна. */
  date: string | null;
  sleeps: RecognizedSleep[];
  /** На картинке нашлось время снов цифрами (а не только график). */
  timesVisible: boolean;
  screen: ScreenKind;
  /** Сколько записей нейросеть вернула, но мы отбросили как негодные. */
  dropped: number;
  /** Сколько снов переставили местами по длительности. */
  swapped: number;
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** Ошибка на пару минут — округления в самих приложениях. */
const DURATION_TOLERANCE = 3;
/** Дальше двух лет назад — почти наверняка ошибка распознавания. */
export const MAX_AGE_DAYS = 730;

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

const FORMAT = `Верни ТОЛЬКО JSON, без пояснений и без markdown:
{"screen": "list | stats | chart | other", "date": "ГГГГ-ММ-ДД или null", "times_visible": true или false,
 "sleeps": [{"date": "ГГГГ-ММ-ДД или null", "start": "ЧЧ:ММ", "end": "ЧЧ:ММ", "duration": "длительность как написана на экране или null"}]}`;

function rules(today: string): string {
  const weekday = WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
  return `Правила:
- Сегодня ${today}, ${weekday}. «Сегодня» — это ${today}, «Вчера» — ${shift(today, -1)}. День недели без даты — ближайший прошедший такой день. Если год не указан — ${today.slice(0, 4)}.
- "date" у сна — дата, когда сон НАЧАЛСЯ (когда уснул). Если у времени приписана другая дата («08:09, 26 мая»), это дата именно этого времени. Не видно даты — null.
- Время — в 24-часовом формате: 9:15 PM → 21:15, 12:30 AM → 00:30, 12:10 PM → 12:10.
- ВНИМАНИЕ: во многих приложениях лента идёт снизу вверх — новое сверху. Тогда время НАД блоком сна — это конец (проснулся), а время ПОД блоком — начало (уснул). Сверь с длительностью, написанной в блоке: от начала до конца должно пройти ровно столько.
- Длительность в блоке сна («9 часов 47 минут», «49 минут», «1ч 30м») перепиши в "duration" как есть.
- Числа между снами без блока сна («2 часа 55 минут» справа) — это бодрствование, НЕ сон. Не записывай их.
- Сон, у которого на скриншоте видно только начало или только конец (обрезан краем экрана), пропусти.
- Бери только сон. Кормления, подгузники, прогулки, купание, лекарства, реклама — пропускай.
- "screen": list — лента или список снов со временем; stats — таблица итогов по дням без времени каждого сна; chart — только график или полоски без цифр времени; other — что-то другое.
- Ничего не придумывай. Если время снов цифрами не видно — "sleeps": [] и "times_visible": false.`;
}

export function screenshotPrompt(today: string): string {
  return `Это скриншот из приложения, где мама отмечает сны ребёнка. Выпиши все записи о сне с временем начала и конца.

${rules(today)}

${FORMAT}`;
}

export function notesPrompt(today: string, text: string): string {
  return `Ниже — заметки мамы о снах ребёнка, скопированные из заметок или переписки. Выпиши все сны с временем начала и конца.

${rules(today)}

${FORMAT}

Заметки:
"""
${text}
"""`;
}

/** «9:05», «09:05», «9.05», «9:05 PM» → «09:05»; негодное → null. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])?\s*$/.exec(value);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const half = match[3]?.toLowerCase();
  if (half) {
    if (hours < 1 || hours > 12) return null;
    if (half === 'am') hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Дата не из будущего и не старше двух лет — иначе это ошибка распознавания. */
export function normalizeDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== value) return null;
  if (value > today || value < shift(today, -MAX_AGE_DAYS)) return null;
  return value;
}

/**
 * Длительность, как её пишут трекеры: «9 часов 47 минут», «49 минут»,
 * «1 час», «1ч 30м», «2h 5m», «1:30». Не распознали — null.
 */
export function parseDuration(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.toLowerCase().replace(',', '.');
  const clock = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  let total = 0;
  let found = false;
  for (const [, number, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*([a-zа-яё]+)/g)) {
    if (unit.startsWith('ч') || unit.startsWith('h')) {
      total += Number(number) * 60;
      found = true;
    } else if ((unit.startsWith('м') && !unit.startsWith('мес')) || unit.startsWith('m')) {
      total += Number(number);
      found = true;
    }
  }
  return found && total > 0 ? Math.round(total) : null;
}

function toMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

/** Минуты от «start» до «end», через полночь тоже. */
export function spanMinutes(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start) + 1440) % 1440 || 1440;
}

/** Вытаскивает JSON из ответа модели: она иногда оборачивает его в ```json или добавляет слова. */
function extractJson(content: string): unknown {
  const cleaned = content.replace(/```(?:json)?/gi, '');
  const from = cleaned.indexOf('{');
  const to = cleaned.lastIndexOf('}');
  if (from === -1 || to <= from) return null;
  try {
    return JSON.parse(cleaned.slice(from, to + 1));
  } catch {
    return null;
  }
}

const SCREENS = new Set<ScreenKind>(['list', 'stats', 'chart', 'other']);

/**
 * Разбирает ответ модели. Всё сомнительное отбрасываем или помечаем:
 * лучше показать маме на один сон меньше, чем записать выдуманный.
 */
export function parseRecognized(content: string, today: string): Recognized {
  const raw = extractJson(content) as {
    screen?: unknown;
    date?: unknown;
    times_visible?: unknown;
    sleeps?: unknown;
  } | null;
  if (!raw || typeof raw !== 'object') {
    return { date: null, sleeps: [], timesVisible: false, screen: 'other', dropped: 0, swapped: 0 };
  }

  const screenDate = normalizeDate(raw.date, today);
  const list = Array.isArray(raw.sleeps) ? raw.sleeps : [];
  const seen = new Set<string>();
  const sleeps: RecognizedSleep[] = [];
  let dropped = 0;
  let swapped = 0;

  for (const item of list) {
    const row = (item ?? {}) as { date?: unknown; start?: unknown; end?: unknown; duration?: unknown };
    let start = normalizeTime(row.start);
    let end = normalizeTime(row.end);
    // Без начала или конца сон не перенести: он обрезан краем экрана или ещё идёт.
    if (!start || !end || start === end) {
      dropped += 1;
      continue;
    }
    let date = normalizeDate(row.date, today) ?? screenDate;
    const duration = parseDuration(row.duration);
    let doubtful = false;

    if (duration !== null && Math.abs(spanMinutes(start, end) - duration) > DURATION_TOLERANCE) {
      if (Math.abs(spanMinutes(end, start) - duration) <= DURATION_TOLERANCE) {
        // Начало и конец перепутаны (лента снизу вверх) — длительность сходится наоборот.
        [start, end] = [end, start];
        swapped += 1;
        // Сон через полночь: дата, которую нейросеть приписала «началу», могла быть
        // датой утреннего конца («08:09, 26 мая»). Экран за день — это день, когда
        // уснули; нет даты экрана — значит, начало на день раньше.
        if (toMinutes(start) > toMinutes(end) && date) {
          if (!screenDate) date = shift(date, -1);
          else if (date > screenDate) date = screenDate;
        }
      } else {
        doubtful = true;
      }
    }

    const key = `${date}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sleeps.push({ date, start, end, doubtful, stated: duration });
  }

  sleeps.sort((a, b) => `${a.date ?? ''}${a.start}`.localeCompare(`${b.date ?? ''}${b.start}`));
  const said = SCREENS.has(raw.screen as ScreenKind) ? (raw.screen as ScreenKind) : 'other';
  const screen: ScreenKind = sleeps.length > 0 ? 'list' : said;
  return {
    date: screenDate,
    sleeps,
    timesVisible: sleeps.length > 0 || (raw.times_visible !== false && screen === 'list'),
    screen,
    dropped,
    swapped,
  };
}
