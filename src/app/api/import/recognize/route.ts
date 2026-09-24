import { NextResponse } from 'next/server';
import { currentChild, currentParent } from '@/lib/session';
import { askGigaChat, gigachatConfigured, GigaChatError } from '@/lib/gigachat';
import { notesPrompt, parseRecognized, screenshotPrompt } from '@/lib/import-parse';
import { localDate } from '@/lib/sleep-day';

/**
 * Распознаёт один скриншот (или текст из заметок) и возвращает найденные
 * сны. Ничего не записывает: мама сначала проверяет список сама.
 * По одному скриншоту за запрос — так у мамы идёт видимый прогресс,
 * а запрос не упирается в таймауты.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 6000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

/*
 * Защита бесплатного лимита GigaChat от случайной «пачки» запросов:
 * не больше 60 распознаваний на маму за сутки. Счётчик в памяти процесса —
 * после перезапуска сервера он обнуляется, и это нормально.
 */
const DAILY_LIMIT = 60;
const usage = new Map<string, { day: string; count: number }>();

function spend(parentId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const entry = usage.get(parentId);
  if (!entry || entry.day !== day) {
    usage.set(parentId, { day, count: 1 });
    return true;
  }
  if (entry.count >= DAILY_LIMIT) return false;
  entry.count += 1;
  return true;
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const parent = await currentParent();
  if (!parent) return fail('Сессия закончилась — откройте приложение заново', 401);
  const child = await currentChild(parent.id);
  if (!child) return fail('Сначала заполните анкету малыша', 400);
  if (!parent.importConsentAt) return fail('Нужно согласие на распознавание скриншотов', 403);
  if (!gigachatConfigured()) return fail('Перенос из других приложений пока не подключён', 503);

  const form = await request.formData().catch(() => null);
  if (!form) return fail('Не получилось прочитать загрузку', 400);
  const image = form.get('image');
  const text = form.get('text');

  const today = localDate(new Date(), parent.timeZone);
  let prompt: string;
  let attachment: { data: Buffer; mime: string } | undefined;

  if (image instanceof File) {
    if (!IMAGE_TYPES.has(image.type)) return fail('Нужна картинка — скриншот в JPG или PNG', 400);
    if (image.size > MAX_IMAGE_BYTES) return fail('Картинка слишком большая — до 8 МБ', 400);
    prompt = screenshotPrompt(today);
    attachment = { data: Buffer.from(await image.arrayBuffer()), mime: image.type };
  } else if (typeof text === 'string' && text.trim()) {
    if (text.length > MAX_TEXT) return fail('Слишком длинный текст — вставьте заметки частями', 400);
    prompt = notesPrompt(today, text.trim());
  } else {
    return fail('Прикрепите скриншот или вставьте текст', 400);
  }

  if (!spend(parent.id)) {
    return fail('На сегодня лимит распознаваний исчерпан — попробуйте завтра или внесите сны вручную', 429);
  }

  try {
    const content = await askGigaChat(prompt, attachment);
    return NextResponse.json(parseRecognized(content, today));
  } catch (error) {
    console.error('Перенос снов: ошибка распознавания', error);
    if (error instanceof GigaChatError && error.kind === 'quota') {
      return fail('Распознавание временно недоступно: закончился лимит. Внесите сны вручную или попробуйте позже', 503);
    }
    if (error instanceof GigaChatError && error.kind === 'rate') {
      return fail('Слишком много скриншотов подряд — подождите минуту и попробуйте ещё раз', 429);
    }
    return fail('Не получилось распознать — попробуйте ещё раз чуть позже', 502);
  }
}
