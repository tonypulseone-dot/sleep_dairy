'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { photoImports, sleeps } from '@/db/schema';
import { buildCandidates, type Candidate } from '@/lib/diary-parse';
import { currentChild, currentParent } from '@/lib/session';
import { composeSleep, parseTimeOfDay, sleepDayOf, sleepKindOf, type DayWindow } from '@/lib/sleep-day';
import { readDiaryImage, toRawSleeps, visionConfigured, type VisionImage } from '@/lib/vision';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function context() {
  const parent = await currentParent();
  if (!parent) throw new Error('Сессия не найдена');
  const child = await currentChild(parent.id);
  if (!child) throw new Error('Ребёнок не заведён');
  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };
  return { child, window };
}

export interface ParsedDay {
  importId: string;
  /** Дата дневника со снимка. Пусто — прочитать не удалось. */
  sleepDay: string | null;
  dateText: string | null;
  candidates: Candidate[];
  /** Что пошло не так, если снимок не прочитался. */
  error: string | null;
}

/** Разбирает снимки дневника. Каждый снимок — отдельный день. */
export async function parseDiaryImages(images: VisionImage[]): Promise<ParsedDay[]> {
  const { child, window } = await context();

  if (!visionConfigured()) {
    throw new Error('Распознавание пока не настроено. Внесите записи вручную.');
  }
  if (images.length === 0) throw new Error('Не выбрано ни одного снимка');
  if (images.length > 10) throw new Error('За раз можно разобрать не больше десяти снимков');

  const results: ParsedDay[] = [];

  for (const image of images) {
    const [record] = await db
      .insert(photoImports)
      .values({ childId: child.id, fileKey: null, status: 'uploaded', fileCount: 1 })
      .returning();

    try {
      const diary = await readDiaryImage(image);
      const sleepDay = diary.date && DATE.test(diary.date) ? diary.date : null;
      const candidates = sleepDay
        ? buildCandidates(toRawSleeps(diary), sleepDay, window)
        : [];

      await db
        .update(photoImports)
        .set({
          status: diary.confident && sleepDay ? 'parsed' : 'failed',
          parsed: diary,
          recordsParsed: candidates.length,
          parseError: diary.confident ? null : (diary.comment ?? 'Снимок прочитан неуверенно'),
        })
        .where(eq(photoImports.id, record.id));

      results.push({
        importId: record.id,
        sleepDay,
        dateText: diary.dateText,
        candidates,
        error: diary.confident
          ? sleepDay
            ? null
            : 'Не видно, за какое это число — укажите дату'
          : (diary.comment ?? 'Снимок прочитан неуверенно'),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось прочитать снимок';
      await db
        .update(photoImports)
        .set({ status: 'failed', parseError: message })
        .where(eq(photoImports.id, record.id));
      results.push({
        importId: record.id,
        sleepDay: null,
        dateText: null,
        candidates: [],
        error: message,
      });
    }
  }

  return results;
}

export interface ConfirmedSleep {
  start: string;
  end: string;
}

/**
 * Сохраняет подтверждённые мамой записи.
 *
 * `editedCount` — сколько строк она поправила перед сохранением. Это наша
 * метрика точности: если правят больше трети, распознавание не помогает,
 * а мешает, и это должно быть видно в цифрах.
 */
export async function confirmImport(
  importId: string,
  sleepDay: string,
  records: ConfirmedSleep[],
  editedCount: number,
) {
  const { child, window } = await context();
  if (!DATE.test(sleepDay)) throw new Error('Не выбрана дата');

  const [record] = await db
    .select()
    .from(photoImports)
    .where(and(eq(photoImports.id, importId), eq(photoImports.childId, child.id)))
    .limit(1);
  if (!record) throw new Error('Загрузка не найдена');
  if (record.confirmedAt) throw new Error('Эти записи уже сохранены');

  let saved = 0;
  for (const item of records) {
    const { startedAt, endedAt } = composeSleep(
      sleepDay,
      parseTimeOfDay(item.start),
      parseTimeOfDay(item.end),
      window,
    );
    await db.insert(sleeps).values({
      childId: child.id,
      startedAt,
      endedAt,
      sleepDay: sleepDayOf(startedAt, window),
      kind: sleepKindOf(startedAt, window),
      source: 'photo',
      importId: record.id,
    });
    saved += 1;
  }

  await db
    .update(photoImports)
    .set({
      status: 'confirmed',
      confirmedAt: new Date(),
      recordsParsed: saved,
      recordsEdited: Math.min(Math.max(Math.round(editedCount), 0), saved),
    })
    .where(eq(photoImports.id, record.id));

  revalidatePath('/');
  revalidatePath('/day');
  return saved;
}
