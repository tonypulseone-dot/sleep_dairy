'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setChildSex } from '@/app/actions';
import type { ChildSex } from '@/lib/words';
import styles from './SexPrompt.module.css';

/**
 * Разовый вопрос для детей, заведённых до того, как анкета стала его задавать.
 * Отвечают один раз — и на главной кнопке появляется «Уснула» вместо «Уснул».
 */
export function SexPrompt({ name }: { name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (sex: ChildSex) =>
    startTransition(async () => {
      await setChildSex(sex);
      router.refresh();
    });

  return (
    <div className={styles.card} role="group" aria-label="Мальчик или девочка">
      <p className={styles.text}>
        {name} — мальчик или девочка? Чтобы писать «уснул» или «уснула».
      </p>
      <div className={styles.buttons}>
        <button type="button" className={styles.choice} disabled={pending} onClick={() => choose('girl')}>
          Девочка
        </button>
        <button type="button" className={styles.choice} disabled={pending} onClick={() => choose('boy')}>
          Мальчик
        </button>
      </div>
    </div>
  );
}
