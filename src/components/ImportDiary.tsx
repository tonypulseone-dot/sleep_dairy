'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { recordImportAttempt } from '@/app/actions';
import styles from './ImportDiary.module.css';

/**
 * Загрузка дневника снимками.
 *
 * Выбор файлов и предпросмотр работают по-настоящему — это та обвязка,
 * в которую потом встанет разбор. Самой расшифровки ещё нет, и экран
 * говорит об этом прямо, а не крутит вечный индикатор.
 *
 * Снимки остаются в браузере: на сервер уходит только факт попытки,
 * чтобы было видно, пользуются этим вообще или нет.
 */
export function ImportDiary() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  // Ссылки на выбранные файлы живут в памяти вкладки — освобождаем их сами.
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews(files.map((file) => URL.createObjectURL(file)));
    setNames(files.map((file) => file.name));

    startTransition(async () => {
      try {
        await recordImportAttempt(files.length);
      } catch {
        // Счётчик спроса — не то, ради чего стоит показывать маме ошибку.
      }
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <Link href="/day" className={styles.back} aria-label="Назад">
          ‹
        </Link>
        <h1>Дневник снимками</h1>
      </header>

      <p className={styles.lead}>
        Скоро здесь можно будет загрузить скриншоты дневника за прошлые дни — записи внесутся
        сами, а вы проверите и поправите, если что-то распозналось не так.
      </p>

      {/* Предупреждаем до выбора файлов, а не после: иначе мама выберет снимки, ожидая результата. */}
      <p className={styles.badge}>Пока в работе — разбор снимков ещё не готов</p>

      <button type="button" className={styles.drop} onClick={() => inputRef.current?.click()}>
        <span className={styles.dropTitle}>Выбрать снимки</span>
        <span className={styles.dropHint}>Скриншоты или фотографии, можно несколько сразу</span>
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

      {previews.length > 0 && (
        <>
          <div className={styles.thumbs}>
            {previews.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={names[index] ?? 'Снимок дневника'} className={styles.thumb} />
            ))}
          </div>

          <div className={styles.notReady}>
            <b>Разбор снимков ещё в работе</b>
            <p>
              Мы пока не умеем вытаскивать записи из картинок — доделываем. Снимки остались на
              вашем телефоне и никуда не отправлялись.
            </p>
            <Link href="/day" className={styles.primary}>
              Внести записи вручную
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
