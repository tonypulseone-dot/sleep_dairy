'use client';

import { useState } from 'react';
import styles from './Pro.module.css';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Буфер обмена бывает закрыт (старый браузер, не https) — копируем
    // по-старому через скрытое поле, чтобы кнопка всё равно сработала.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

/** Кнопка «Скопировать»: текст сразу в буфер, без выделения пальцем. */
export function CopyButton({
  text,
  label = 'Скопировать',
  className = styles.copyButton,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-live="polite"
    >
      {copied ? 'Скопировано ✓' : label}
    </button>
  );
}

/** Ссылка-приглашение целиком (с переносом, а не обрезанная) и кнопка «Скопировать». */
export function CopyLink({ link }: { link: string }) {
  return (
    <div className={styles.copyRow}>
      <code className={styles.copyField} aria-label="Ссылка для мам">
        {link}
      </code>
      <CopyButton text={link} />
    </div>
  );
}
