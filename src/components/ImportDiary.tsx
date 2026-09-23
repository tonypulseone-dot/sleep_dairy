'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { confirmImport, parseDiaryImages, type ParsedDay } from '@/app/import-actions';
import { PROBLEM_TEXT } from '@/lib/diary-parse';
import styles from './ImportDiary.module.css';
import { IconBack, IconClose } from './Icons';

/**
 * Загрузка дневника снимками.
 *
 * Мамы ведут сны в других трекерах и присылают консультанту скриншоты.
 * Здесь такой снимок превращается в записи: читаем, показываем маме, что
 * получилось, и сохраняем только после её подтверждения — распознавание
 * ошибается молча, и последнее слово должно оставаться за человеком.
 */

interface Row {
  start: string;
  end: string;
  problem: string | null;
  /** Правила ли мама эту строку. По этому считаем реальную точность. */
  edited: boolean;
}

interface DayState extends Omit<ParsedDay, 'candidates'> {
  rows: Row[];
  saved: boolean;
}

/** Уменьшает снимок перед отправкой: экран читается и в 1400 точек. */
async function downscale(file: File): Promise<{ data: string; mediaType: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

export function ImportDiary({ visionReady }: { visionReady: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState<DayState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 10);
    if (files.length === 0) return;
    setError(null);

    startTransition(async () => {
      try {
        const images = await Promise.all(files.map(downscale));
        const parsed = await parseDiaryImages(images);
        setDays(
          parsed.map((day) => ({
            ...day,
            saved: false,
            rows: day.candidates.map((candidate) => ({
              start: candidate.start,
              end: candidate.end,
              problem: candidate.problem ? PROBLEM_TEXT[candidate.problem] : null,
              edited: false,
            })),
          })),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось прочитать снимки');
      }
    });
  };

  const edit = (dayIndex: number, rowIndex: number, field: 'start' | 'end', value: string) => {
    setDays((current) =>
      current?.map((day, di) =>
        di !== dayIndex
          ? day
          : {
              ...day,
              rows: day.rows.map((row, ri) =>
                ri !== rowIndex ? row : { ...row, [field]: value, edited: true },
              ),
            },
      ) ?? null,
    );
  };

  const setDate = (dayIndex: number, value: string) => {
    setDays(
      (current) =>
        current?.map((day, di) => (di === dayIndex ? { ...day, sleepDay: value } : day)) ?? null,
    );
  };

  const drop = (dayIndex: number, rowIndex: number) => {
    setDays(
      (current) =>
        current?.map((day, di) =>
          di !== dayIndex ? day : { ...day, rows: day.rows.filter((_, ri) => ri !== rowIndex) },
        ) ?? null,
    );
  };

  const save = (dayIndex: number) => {
    const day = days?.[dayIndex];
    if (!day?.sleepDay) return;
    setError(null);

    startTransition(async () => {
      try {
        await confirmImport(
          day.importId,
          day.sleepDay!,
          day.rows.map((row) => ({ start: row.start, end: row.end })),
          day.rows.filter((row) => row.edited).length,
        );
        setDays(
          (current) =>
            current?.map((item, di) => (di === dayIndex ? { ...item, saved: true } : item)) ?? null,
        );
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <Link href="/day" className={styles.back} aria-label="Назад">
          <IconBack />
        </Link>
        <h1>Дневник снимками</h1>
      </header>

      <p className={styles.lead}>
        Загрузите скриншоты из другого приложения — записи перенесутся сюда. Перед сохранением
        вы всё проверите.
      </p>

      {!visionReady && <p className={styles.badge}>Распознавание пока не настроено</p>}

      <button
        type="button"
        className={styles.drop}
        onClick={() => inputRef.current?.click()}
        disabled={pending || !visionReady}
      >
        <span className={styles.dropTitle}>{pending ? 'Читаем снимки…' : 'Выбрать снимки'}</span>
        <span className={styles.dropHint}>Можно несколько — каждый снимок это один день</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={pick}
        className={styles.input}
        aria-label="Снимки дневника"
      />

      {error && <p className={styles.error}>{error}</p>}

      {days?.map((day, dayIndex) => (
        <section key={day.importId} className={styles.day}>
          <div className={styles.dayHead}>
            <input
              type="date"
              value={day.sleepDay ?? ''}
              onChange={(event) => setDate(dayIndex, event.target.value)}
              disabled={day.saved}
              aria-label="Дата дневника"
            />
            {day.dateText && <span className={styles.dayText}>на снимке: {day.dateText}</span>}
          </div>

          {day.error && <p className={styles.dayError}>{day.error}</p>}

          {day.rows.length === 0 && !day.error && (
            <p className={styles.dayError}>На этом снимке записей не нашлось</p>
          )}

          {day.rows.map((row, rowIndex) => (
            <div key={rowIndex} className={`${styles.row} ${row.problem ? styles.rowWarn : ''}`}>
              <div className={styles.rowTimes}>
                <input
                  type="time"
                  value={row.start}
                  onChange={(event) => edit(dayIndex, rowIndex, 'start', event.target.value)}
                  disabled={day.saved}
                  aria-label="Уснул"
                />
                <span className={styles.dash}>–</span>
                <input
                  type="time"
                  value={row.end}
                  onChange={(event) => edit(dayIndex, rowIndex, 'end', event.target.value)}
                  disabled={day.saved}
                  aria-label="Проснулся"
                />
                {!day.saved && (
                  <button
                    type="button"
                    className={styles.dropRow}
                    onClick={() => drop(dayIndex, rowIndex)}
                    aria-label="Убрать запись"
                  >
                    <IconClose size={18} />
                  </button>
                )}
              </div>
              {row.problem && <span className={styles.warn}>{row.problem}</span>}
            </div>
          ))}

          {day.saved ? (
            <p className={styles.savedNote}>Сохранено в дневник</p>
          ) : (
            day.rows.length > 0 && (
              <button
                type="button"
                className={styles.primary}
                onClick={() => save(dayIndex)}
                disabled={pending || !day.sleepDay}
              >
                {pending ? 'Сохраняем…' : `Сохранить ${day.rows.length}`}
              </button>
            )
          )}
        </section>
      ))}

      {days && (
        <Link href="/day" className={styles.ghost}>
          К дневнику
        </Link>
      )}
    </main>
  );
}
