'use client';

import { unwrap } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addNote, deleteNote } from '@/app/pro/actions';
import styles from './Pro.module.css';

export interface NoteView {
  id: string;
  body: string;
  /** «24 сент., 14:05» */
  when: string;
}

/**
 * Заметки «на лету» — только для консультанта: «позвонить в четверг»,
 * «пробуем укладывание без укачивания». Свежие сверху.
 */
export function ProNotes({ childId, notes }: { childId: string; notes: NoteView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<void>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await job();
        after?.();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    run(async () => unwrap(await addNote(childId, draft)), () => setDraft(''));
  };

  return (
    <section className={styles.notes} aria-labelledby="notes-title">
      <div className={styles.sectionHead}>
        <h2 id="notes-title" className={styles.sectionTitle}>Мои заметки</h2>
        <span className={styles.private}>видите только вы — мама их не видит</span>
      </div>

      <form onSubmit={save} className={styles.noteForm}>
        <textarea
          className={styles.noteInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter — сохранить, не отрываясь от клавиатуры.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save(event);
          }}
          placeholder="Например: позвонить в четверг, спросить про ночь"
          rows={3}
          maxLength={2000}
          aria-label="Новая заметка"
        />
        <button type="submit" className={styles.noteSave} disabled={pending || !draft.trim()}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {notes.length > 0 && (
        <ul className={styles.noteList}>
          {notes.map((note) => (
            <li key={note.id} className={styles.note}>
              <div className={styles.noteBody}>{note.body}</div>
              <div className={styles.noteMeta}>
                <span>{note.when}</span>
                <button
                  type="button"
                  className={styles.noteDelete}
                  onClick={() => {
                    if (confirm('Удалить заметку?')) run(async () => unwrap(await deleteNote(childId, note.id)));
                  }}
                  disabled={pending}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
