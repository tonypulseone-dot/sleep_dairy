'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addFeeding, deleteFeeding } from '@/app/actions';
import styles from './FeedingDiary.module.css';
import { IconClose } from './Icons';
import { BackButton } from './BackButton';

/**
 * Дневник кормления — только для искусственного и смешанного.
 *
 * Виктория описывала это как отдельную страницу, на которую мама
 * переходит кнопкой и возвращается обратно к снам. Поэтому здесь нет
 * ничего лишнего: объём и время, больше ей ничего не нужно.
 */

export interface FeedingRow {
  id: string;
  time: string;
  amountMl: number | null;
}

/** Ходовые объёмы бутылочки: чаще всего попадают в одно нажатие. */
const AMOUNTS = [60, 90, 120, 150, 180, 210] as const;

export function FeedingDiary({
  childName,
  rows,
  totalMl,
}: {
  childName: string;
  rows: FeedingRow[];
  totalMl: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await job();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <BackButton href="/" className={styles.back} label="К снам" />
        <h1>Кормления</h1>
        <span className={styles.name}>{childName}</span>
      </header>

      <span className={styles.amountsLabel}>Объём, мл</span>
      <div className={styles.amounts} role="group" aria-label="Объём в миллилитрах">
        {AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={amount === value}
            onClick={() => setAmount(amount === value ? null : value)}
            className={`${styles.amount} ${amount === value ? styles.amountOn : ''}`}
          >
            {value}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={styles.add}
        disabled={pending}
        onClick={() => run(async () => {
          await addFeeding(amount);
          setAmount(null);
        })}
      >
        {pending ? 'Записываем…' : 'Покормила сейчас'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {totalMl !== null && rows.length > 0 && (
        <p className={styles.total}>
          За сутки <b>{totalMl} мл</b> за {rows.length}{' '}
          {rows.length === 1 ? 'кормление' : rows.length < 5 ? 'кормления' : 'кормлений'}
        </p>
      )}

      <ul className={styles.list}>
        {rows.length === 0 && <li className={styles.empty}>Сегодня кормлений ещё не было</li>}
        {rows.map((row) => (
          <li key={row.id} className={styles.row}>
            <span className={styles.time}>{row.time}</span>
            <span className={styles.ml}>{row.amountMl === null ? '—' : `${row.amountMl} мл`}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Убрать кормление в ${row.time}`}
              disabled={pending}
              onClick={() => run(() => deleteFeeding(row.id))}
            >
              <IconClose size={18} />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
