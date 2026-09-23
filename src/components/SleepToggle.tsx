'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { startSleep, stopSleep } from '@/app/actions';
import { SleepRing } from './SleepRing';
import type { DaySegment } from '@/lib/sleep-day';
import { childWords, type ChildSex } from '@/lib/words';
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

  const act = () => {
    startTransition(async () => {
      if (isSleeping) await stopSleep(offset);
      else await startSleep(offset);
      setOffset(0);
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

      <div className={styles.offsets} role="group" aria-label="Когда это случилось">
        <span className={styles.offsetLabel}>{(isSleeping ? words.wokeUp : words.fellAsleep).toLowerCase()}</span>
        {OFFSETS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={offset === value}
            onClick={() => setOffset(value)}
            className={`${styles.offset} ${offset === value ? styles.offsetOn : ''}`}
          >
            {value === 0 ? 'сейчас' : `−${value}`}
          </button>
        ))}
      </div>
    </div>
  );
}
