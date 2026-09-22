import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { RawSleep } from './diary-parse';

/**
 * Чтение снимка дневника.
 *
 * Мамы ведут сны в других трекерах и присылают консультанту скриншоты —
 * именно это Виктория и получает от клиенток. Здесь мы читаем такой снимок
 * и достаём из него записи; проверяет их потом diary-parse, а подтверждает
 * сама мама.
 *
 * Модель только читает написанное. Ничего не досчитывает и не угадывает:
 * пересчёт и классификация — наша работа, у нас для этого есть настройки
 * конкретного ребёнка.
 */

const DiarySchema = z.object({
  /** Дата, как написана на экране: «25 мая 2025, вс». */
  dateText: z.string().nullable(),
  /** Она же в виде `2025-05-25`, если год понятен. */
  date: z.string().nullable(),
  sleeps: z.array(
    z.object({
      /** Когда уснул, `"22:22"`. */
      start: z.string(),
      /** Когда проснулся, `"08:09"`. */
      end: z.string(),
      /** Длительность ровно как написана: «9 часов 47 минут». */
      statedDuration: z.string().nullable(),
      /** Что показывал значок: луна — night, солнце — day. */
      kind: z.enum(['day', 'night']).nullable(),
    }),
  ),
  /** Удалось ли прочитать экран уверенно. */
  confident: z.boolean(),
  /** Что помешало, если не удалось. */
  comment: z.string().nullable(),
});

export type ParsedDiary = z.infer<typeof DiarySchema>;

const SYSTEM = `Ты читаешь скриншот приложения-дневника детского сна и переносишь с него записи.

Что нужно достать:
— дату, которая написана вверху экрана;
— каждый сон: во сколько ребёнок уснул, во сколько проснулся, какая длительность подписана и каким значком помечен сон.

Как устроены такие экраны:
— записи обычно идут сверху вниз от позднего к раннему, то есть последний сон дня оказывается вверху;
— время стоит не внутри блока сна, а по его краям: одна отметка — начало сна, другая — конец;
— между блоками снов подписано время бодрствования. Это НЕ сон, такие промежутки пропускай;
— значок луны означает ночной сон, солнце — дневной;
— ночной сон переходит через полночь, и время пробуждения у него помечено следующей датой. Это нормально, записывай его одной записью.

Правила:
— переноси только то, что видно на экране. Ничего не досчитывай и не выводи логически;
— длительность копируй ровно как написана, словами, не переводи в числа;
— время записывай в формате ЧЧ:ММ;
— рекламу, панель состояния, нижнее меню и кнопки игнорируй;
— если экран нечитаем или это не дневник сна, поставь confident: false и объясни в comment;
— лучше пропустить запись, в которой не уверен, чем выдумать её.`;

export interface VisionImage {
  /** Содержимое файла в base64, без префикса data:. */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export function visionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Читает один снимок. Бросает, если ключ не настроен или модель отказалась. */
export async function readDiaryImage(image: VisionImage): Promise<ParsedDiary> {
  if (!visionConfigured()) {
    throw new Error('Распознавание не настроено');
  }

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.data },
          },
          { type: 'text', text: 'Перенеси записи с этого экрана.' },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(DiarySchema) },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Модель отказалась читать этот снимок');
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error('Не удалось разобрать ответ модели');
  }
  return parsed;
}

/** Приводит прочитанное к виду, который проверяет diary-parse. */
export function toRawSleeps(diary: ParsedDiary): RawSleep[] {
  return diary.sleeps.map((sleep) => ({
    start: sleep.start,
    end: sleep.end,
    statedDuration: sleep.statedDuration,
    kind: sleep.kind,
  }));
}
