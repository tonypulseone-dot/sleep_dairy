'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addSleepManual, deleteSleep, updateSleep } from '@/app/actions';
import styles from './DayView.module.css';

export interface DayRow {
  id: string;
  kind: 'day' | 'night';
  start: string;
  end: string | null;
  duration: string;
}

export interface DayTotalsView {
  daySleep: string;
  nightSleep: string;
  totalSleep: string;
  totalWake: string;
  napCount: number;
}

interface Props {
  sleepDay: string;
  title: string;
  prevDay: string;
  nextDay: string | null;
  rows: DayRow[];
  totals: DayTotalsView;
}

interface Draft {
  id: string | null;
  start: string;
  end: string;
}

export function DayView({ sleepDay, title, prevDay, nextDay, rows, totals }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await job();
        setDraft(null);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  const save = () => {
    if (!draft) return;
    run(async () => {
      const input = { sleepDay, start: draft.start, end: draft.end };
      if (draft.id) await updateSleep(draft.id, input);
      else await addSleepManual(input);
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <Link href="/" className={styles.back} aria-label="Назад">
          ‹
        </Link>
        <div className={styles.nav}>
          <Link href={`/day?d=${prevDay}`} className={styles.step} aria-label="Предыдущий день">
            ‹
          </Link>
          <span className={styles.title}>{title}</span>
          {nextDay ? (
            <Link href={`/day?d=${nextDay}`} className={styles.step} aria-label="Следующий день">
              ›
            </Link>
          ) : (
            <span className={`${styles.step} ${styles.stepOff}`} aria-hidden="true">
              ›
            </span>
          )}
        </div>
      </header>

      <section className={styles.totals} aria-label="Итоги дня">
        <div>
          <span className={styles.totalValue}>{totals.totalSleep}</span>
          <span className={styles.totalLabel}>суточный</span>
        </div>
        <div>
          <span className={styles.totalValue}>{totals.daySleep}</span>
          <span className={styles.totalLabel}>дневной</span>
        </div>
        <div>
          <span className={styles.totalValue}>{totals.nightSleep}</span>
          <span className={styles.totalLabel}>ночной</span>
        </div>
        <div>
          <span className={styles.totalValue}>{totals.totalWake}</span>
          <span className={styles.totalLabel}>бодрствование</span>
        </div>
      </section>

      <ul className={styles.list}>
        {rows.length === 0 && <li className={styles.empty}>За этот день записей нет</li>}

        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`${styles.row} ${row.kind === 'night' ? styles.night : styles.nap}`}
              onClick={() =>
                setDraft(
                  draft?.id === row.id
                    ? null
                    : { id: row.id, start: row.start, end: row.end ?? row.start },
                )
              }
            >
              <span className={styles.rowKind}>{row.kind === 'night' ? 'Ночной' : 'Дневной'}</span>
              <span className={styles.rowTime}>
                {row.start}
                {row.end ? `–${row.end}` : ' — идёт'}
              </span>
              <span className={styles.rowDuration}>{row.duration}</span>
            </button>

            {draft?.id === row.id && (
              <Editor
                draft={draft}
                pending={pending}
                onChange={setDraft}
                onSave={save}
                onCancel={() => setDraft(null)}
                onDelete={() => run(() => deleteSleep(row.id))}
              />
            )}
          </li>
        ))}
      </ul>

      {error && <p className={styles.error}>{error}</p>}

      {draft && draft.id === null ? (
        <Editor
          draft={draft}
          pending={pending}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <button
          type="button"
          className={styles.add}
          onClick={() => setDraft({ id: null, start: '13:00', end: '14:30' })}
        >
          Добавить сон
        </button>
      )}
    </main>
  );
}

function Editor({
  draft,
  pending,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  pending: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={styles.editor}>
      <div className={styles.times}>
        <label className={styles.timeField}>
          <span>Уснул</span>
          <input
            type="time"
            value={draft.start}
            onChange={(event) => onChange({ ...draft, start: event.target.value })}
          />
        </label>
        <label className={styles.timeField}>
          <span>Проснулся</span>
          <input
            type="time"
            value={draft.end}
            onChange={(event) => onChange({ ...draft, end: event.target.value })}
          />
        </label>
      </div>

      <div className={styles.editorActions}>
        <button type="button" className={styles.save} onClick={onSave} disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={pending}>
          Отмена
        </button>
        {onDelete && (
          <button type="button" className={styles.danger} onClick={onDelete} disabled={pending}>
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
