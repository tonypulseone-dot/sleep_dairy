/**
 * Перенос снов из других приложений: что спрашиваем у нейросети и как
 * проверяем ответ. Нейросеть только переписывает цифры со скриншота —
 * тип сна, сутки и проверки делает наш код, как при ручном вводе.
 */

export interface RecognizedSleep {
  /** Дата начала сна, «2026-09-23»; null — на скриншоте не видно. */
  date: string | null;
  /** «21:05». */
  start: string;
  end: string;
}

export interface Recognized {
  /** Дата экрана целиком, если она одна. */
  date: string | null;
  sleeps: RecognizedSleep[];
  /** На картинке нашлось время снов цифрами (а не только график). */
  timesVisible: boolean;
  /** Сколько записей нейросеть вернула, но мы отбросили как негодные. */
  dropped: number;
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

const FORMAT = `Верни ТОЛЬКО JSON, без пояснений и без markdown:
{"date": "ГГГГ-ММ-ДД или null", "times_visible": true или false, "sleeps": [{"date": "ГГГГ-ММ-ДД или null", "start": "ЧЧ:ММ", "end": "ЧЧ:ММ или null"}]}`;

function rules(today: string): string {
  const weekday = WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
  return `Правила:
- Сегодня ${today}, ${weekday}. «Сегодня» — это ${today}, «Вчера» — ${shift(today, -1)}. День недели без даты — ближайший прошедший такой день. Если год не указан — ${today.slice(0, 4)}.
- "date" у сна — дата, когда сон НАЧАЛСЯ. Не видно даты — null.
- Время — в 24-часовом формате: 9:15 PM → 21:15, 12:30 AM → 00:30, 12:10 PM → 12:10.
- Указаны начало и длительность без конца — вычисли конец. Сон ещё идёт — "end": null.
- Бери только сон. Кормления, подгузники, прогулки, купание, лекарства — пропускай.
- Ничего не придумывай. Если время снов цифрами не видно (например, только цветной график) — "sleeps": [] и "times_visible": false.`;
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

/** Дата не из будущего и не старше полугода — иначе это ошибка распознавания. */
export function normalizeDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== value) return null;
  if (value > today || value < shift(today, -183)) return null;
  return value;
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

/**
 * Разбирает ответ модели. Всё сомнительное отбрасываем: лучше показать маме
 * на один сон меньше, чем записать в дневник выдуманный.
 */
export function parseRecognized(content: string, today: string): Recognized {
  const raw = extractJson(content) as {
    date?: unknown;
    times_visible?: unknown;
    sleeps?: unknown;
  } | null;
  if (!raw || typeof raw !== 'object') return { date: null, sleeps: [], timesVisible: false, dropped: 0 };

  const screenDate = normalizeDate(raw.date, today);
  const list = Array.isArray(raw.sleeps) ? raw.sleeps : [];
  const seen = new Set<string>();
  const sleeps: RecognizedSleep[] = [];
  let dropped = 0;

  for (const item of list) {
    const row = (item ?? {}) as { date?: unknown; start?: unknown; end?: unknown };
    const start = normalizeTime(row.start);
    const end = normalizeTime(row.end);
    // Без конца сон не перенести: он либо ещё идёт, либо не распознан.
    if (!start || !end || start === end) {
      dropped += 1;
      continue;
    }
    const date = normalizeDate(row.date, today) ?? screenDate;
    const key = `${date}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sleeps.push({ date, start, end });
  }

  sleeps.sort((a, b) => `${a.date ?? ''}${a.start}`.localeCompare(`${b.date ?? ''}${b.start}`));
  return {
    date: screenDate,
    sleeps,
    timesVisible: raw.times_visible === false ? sleeps.length > 0 : true,
    dropped,
  };
}
