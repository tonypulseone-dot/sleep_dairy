'use client';

import { useEffect, useState, useTransition } from 'react';
import { startSleep, stopSleep } from '@/app/actions';
import styles from './SleepToggle.module.css';

interface Props {
  /** Момент начала текущего сна, если ребёнок спит прямо сейчас. */
  sleepingSince: string | null;
  /** Конец последнего сна — от него считаем бодрствование. */
  awakeSince: string | null;
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

export function SleepToggle({ sleepingSince, awakeSince }: Props) {
  const isSleeping = sleepingSince !== null;
  const since = sleepingSince ?? awakeSince;

  const [elapsed, setElapsed] = useState<number | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [pending, startTransition] = useTransition();

  // Часы тикают только в браузере: на сервере времени «сейчас» ещё нет,
  // и рисовать его в разметке — значит получить расхождение при гидрации.
  useEffect(() => {
    if (!since) {
      setElapsed(null);
      return;
    }
    const from = new Date(since).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - from) / 60_000)));
    tick();
    const timer = setInterval(tick, 20_000);
    return () => clearInterval(timer);
  }, [since]);

  const act = () => {
    startTransition(async () => {
      if (isSleeping) {
        await stopSleep(offset);
      } else {
        await startSleep(offset);
      }
      setOffset(0);
    });
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.status} aria-live="polite">
        {elapsed === null
          ? since
            ? ' '
            : 'Первый сон ещё не отмечен'
          : isSleeping
            ? `Спит ${human(elapsed)}`
            : `Бодрствует ${human(elapsed)}`}
      </p>

      <button
        type="button"
        onClick={act}
        disabled={pending}
        className={`${styles.big} ${isSleeping ? styles.wake : styles.sleep}`}
      >
        {isSleeping ? 'Проснулся' : 'Уснул'}
      </button>

      <div className={styles.offsets} role="group" aria-label="Когда это случилось">
        <span className={styles.offsetLabel}>
          {isSleeping ? 'проснулся' : 'уснул'}
        </span>
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
