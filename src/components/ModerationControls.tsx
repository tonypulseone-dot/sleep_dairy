"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewProfile, hideConsultant } from "@/app/pro/profile/actions";
import { unwrap } from "@/lib/action-result";
import styles from "./Showcase.module.css";
export function ModerationControls({
  id,
  revision,
}: {
  id: string;
  revision?: number;
}) {
  const [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  const router = useRouter();
  function act(approve: boolean) {
    setError("");
    start(async () => {
      try {
        unwrap(
          revision === undefined
            ? await hideConsultant(id)
            : await reviewProfile(id, revision, approve, note),
        );
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Не удалось сохранить решение",
        );
      }
    });
  }
  return (
    <div>
      {revision !== undefined && (
        <label className={styles.field}>
          Комментарий к решению
          <textarea
              aria-label="Комментарий к решению"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="При отклонении укажите, что нужно изменить"
          />
        </label>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {revision !== undefined ? (
          <>
            <button
              className={styles.primary}
              disabled={pending}
              onClick={() => act(true)}
            >
              Одобрить
            </button>
            <button
              className={styles.secondary}
              disabled={pending || !note.trim()}
              onClick={() => act(false)}
            >
              Отклонить
            </button>
          </>
        ) : (
          <button
            className={styles.secondary}
            disabled={pending}
            onClick={() => act(false)}
          >
            Снять с публикации
          </button>
        )}
      </div>
    </div>
  );
}
