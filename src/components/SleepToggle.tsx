'use client';

import { unwrap } from '@/lib/action-result';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { startSleep, stopSleep } from '@/app/actions';
import { SleepRing } from './SleepRing';
import type { DaySegment } from '@/lib/sleep-day';
import { childWords, type ChildSex } from '@/lib/words';
import { haptic } from '@/lib/telegram-client';
import styles from './SleepToggle.module.css';

interface Props {
  /** Момент начала текущего сна, если ребёнок спит прямо сейчас. */
  sleepingSince: string | null;
  /** Конец последнего сна — от него считаем бодрствование. */
  awakeSince: string | null;
  segments: DaySegment[];
  dayBoundary: number;
  nowMinutes: number | null;
  /** «обычно бодрствует около 1 ч 25 мин» — пусто, если показывать нечего. */
  hint: string | null;
  /** Сон идёт неправдоподобно долго: похоже, забыли отметить пробуждение. */
  stale: boolean;
  sex: ChildSex | null;
}

/** 72 → «1 ч 12 мин». Для мамы, а не для таблицы. */
function human(minutes: number): string {
  if (minutes < 1) return 'меньше минуты';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

const OFFSETS = [0, 5, 10, 15] as const;

export function SleepToggle({
  sleepingSince,
  awakeSince,
  segments,
  dayBoundary,
  nowMinutes,
  hint,
  stale,
  sex,
}: Props) {
  const words = childWords(sex);
  const isSleeping = sleepingSince !== null;
  const since = sleepingSince ?? awakeSince;

  const [elapsed, setElapsed] = useState<number | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Часы тикают только в браузере: на сервере «сейчас» ещё нет,
  // и нарисованное время разошлось бы с разметкой при гидрации.
  useEffect(() => {
    if (!since) return;
    const from = new Date(since).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - from) / 60_000)));
    tick();
    const timer = setInterval(tick, 20_000);
    return () => clearInterval(timer);
  }, [since]);

  // Без отсчёта (ни одного сна) показываем не старое значение, а ничего.
  const minutes = since ? elapsed : null;

  /*
   * Проснуться «N мин назад» можно, только если сон длится дольше N минут:
   * иначе пробуждение оказалось бы раньше засыпания. Такие варианты гасим,
   * а выбранный недоступный — сбрасываем на «сейчас».
   */
  const unavailable = (value: number) => isSleeping && value > 0 && minutes !== null && value >= minutes;
  const chosen = unavailable(offset) ? 0 : offset;

  const act = () => {
    haptic('tap');
    setError(null);
    startTransition(async () => {
      try {
        if (isSleeping) unwrap(await stopSleep(chosen));
        else unwrap(await startSleep(chosen));
        haptic('success');
        setOffset(0);
      } catch (cause) {
        // Ошибку показываем словами под кнопкой, а не роняем весь экран.
        haptic('error');
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить — попробуйте ещё раз');
      }
    });
  };

  return (
    <div className={styles.wrap}>
      <SleepRing segments={segments} dayBoundary={dayBoundary} nowMinutes={nowMinutes}>
        <button
          type="button"
          onClick={act}
          disabled={pending}
          className={`${styles.big} ${isSleeping ? styles.wake : styles.sleep}`}
        >
          <span className={styles.bigLabel}>{isSleeping ? words.wokeUp : words.fellAsleep}</span>
        </button>
      </SleepRing>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.status} aria-live="polite">
        <p className={styles.elapsed}>
          {minutes === null
            ? since
              ? ' '
              : 'Первый сон ещё не отмечен'
            : stale
              ? 'Сон идёт больше суток'
              : isSleeping
                ? `Спит ${human(minutes)}`
                : `Бодрствует ${human(minutes)}`}
        </p>
        {/*
          «Спит 98 ч» маму не информирует, а пугает. Сон дольше двадцати
          часов — почти всегда забытая отметка, поэтому говорим прямо и
          ведём туда, где время пробуждения можно вписать задним числом.
        */}
        {stale ? (
          <p className={styles.hint}>
            Похоже, пробуждение не отметили.{' '}
            <Link href="/day" className={styles.fix}>
              Вписать время
            </Link>
          </p>
        ) : (
          hint && <p className={styles.hint}>{hint}</p>
        )}
      </div>

      {/*
        «−5» без пояснений читался как загадка. Теперь вопрос задан словами,
        а варианты — сегментами одной ширины: «сейчас» или «N мин назад».
        Выбор действует на следующее нажатие большой кнопки и сбрасывается.
      */}
      <div className={styles.when}>
        <span className={styles.whenLabel} id="when-label">
          Когда {(isSleeping ? words.wokeUp : words.fellAsleep).toLowerCase()}?
        </span>
        <div className={styles.offsets} role="group" aria-labelledby="when-label">
          {OFFSETS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={chosen === value}
              aria-label={value === 0 ? 'Сейчас' : `${value} минут назад`}
              disabled={unavailable(value)}
              onClick={() => {
                haptic('select');
                setError(null);
                setOffset(value);
              }}
              className={`${styles.offset} ${chosen === value ? styles.offsetOn : ''}`}
            >
              {value === 0 ? (
                'сейчас'
              ) : (
                <>
                  <span className={styles.offsetMain}>{value} мин</span>
                  <span className={styles.offsetSub}>назад</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
