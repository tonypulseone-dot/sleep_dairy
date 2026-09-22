import { composeSleep, durationMinutes, parseTimeOfDay, sleepKindOf, type DayWindow } from './sleep-day';

/**
 * Разбор дневника со снимка.
 *
 * Модель вытаскивает со скриншота то, что там написано словами, а этот модуль
 * превращает прочитанное в записи и проверяет их на прочность. Проверка нужна
 * не для красоты: распознавание ошибается молча, и без сверки мама узнает об
 * этом, только когда консультант увидит кривую таблицу.
 *
 * Главный приём — сверка двух независимых чисел. Трекеры показывают и время
 * начала с концом, и длительность отдельной строкой. Если длительность,
 * посчитанная из времён, не сходится с написанной, значит что-то прочитано
 * не так, и такую запись мы помечаем, а не тихо сохраняем.
 */

/** То, что модель прочитала на снимке. Сырые строки, как на экране. */
export interface RawSleep {
  /** Время засыпания, `"22:22"`. */
  start: string;
  /** Время пробуждения, `"08:09"`. */
  end: string;
  /** Длительность, как написана на экране: `"9 часов 47 минут"`. */
  statedDuration: string | null;
  /** Что показывал значок: луна или солнце. */
  kind: 'day' | 'night' | null;
}

export type CandidateProblem = 'duration-mismatch' | 'too-long' | 'too-short' | 'bad-time';

export interface Candidate {
  start: string;
  end: string;
  minutes: number;
  kind: 'day' | 'night';
  /** Длительность со снимка в минутах, если её удалось прочитать. */
  statedMinutes: number | null;
  /** Что не сошлось. Пусто — запись выглядит здоровой. */
  problem: CandidateProblem | null;
}

/**
 * `"9 часов 47 минут"` → 587. `"49 минут"` → 49. `"1 час 30 минут"` → 90.
 * Возвращает `null`, если чисел не нашлось.
 */
export function parseStatedDuration(text: string | null): number | null {
  if (!text) return null;

  const hours = /(\d+)\s*ч/i.exec(text);
  const minutes = /(\d+)\s*м/i.exec(text);
  if (!hours && !minutes) return null;

  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
}

/** Сон дольше этого — почти наверняка ошибка распознавания, а не рекорд. */
const MAX_SLEEP_MINUTES = 20 * 60;

/**
 * Превращает прочитанное в записи и проверяет каждую.
 * Ничего не отбрасываем: помеченные записи мама увидит на экране проверки
 * и решит сама. Молча выкинуть чужой сон хуже, чем показать сомнительный.
 */
export function buildCandidates(
  raw: RawSleep[],
  sleepDay: string,
  window: DayWindow,
): Candidate[] {
  return raw.map((item) => {
    let startMinutes: number;
    let endMinutes: number;
    try {
      startMinutes = parseTimeOfDay(item.start);
      endMinutes = parseTimeOfDay(item.end);
    } catch {
      return {
        start: item.start,
        end: item.end,
        minutes: 0,
        kind: item.kind ?? 'day',
        statedMinutes: parseStatedDuration(item.statedDuration),
        problem: 'bad-time',
      };
    }

    const { startedAt, endedAt } = composeSleep(sleepDay, startMinutes, endMinutes, window);
    const minutes = durationMinutes(startedAt, endedAt);
    const statedMinutes = parseStatedDuration(item.statedDuration);

    let problem: CandidateProblem | null = null;
    if (minutes < 1) {
      problem = 'too-short';
    } else if (minutes > MAX_SLEEP_MINUTES) {
      problem = 'too-long';
    } else if (statedMinutes !== null && Math.abs(statedMinutes - minutes) > 1) {
      // Минута расхождения — округление на экране трекера, а не ошибка чтения.
      problem = 'duration-mismatch';
    }

    return {
      start: item.start,
      end: item.end,
      minutes,
      // Значку со снимка не доверяем: у разных трекеров своя граница дня.
      // Тип считаем по настройкам мамы, чтобы дневник остался связным.
      kind: sleepKindOf(startedAt, window),
      statedMinutes,
      problem,
    };
  });
}

/** Сколько записей вызывают вопросы. По этому числу решаем, показывать ли предупреждение. */
export function problemCount(candidates: Candidate[]): number {
  return candidates.filter((candidate) => candidate.problem !== null).length;
}

export const PROBLEM_TEXT: Record<CandidateProblem, string> = {
  'duration-mismatch': 'Длительность не сходится с временем — проверьте',
  'too-long': 'Слишком длинный сон — проверьте',
  'too-short': 'Конец раньше начала — проверьте',
  'bad-time': 'Не удалось прочитать время',
};
