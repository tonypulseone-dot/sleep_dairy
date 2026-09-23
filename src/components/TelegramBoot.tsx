'use client';

import { useEffect, useState } from 'react';
import { webApp } from '@/lib/telegram-client';
import styles from '@/app/page.module.css';

/**
 * Первый вход. Мама ничего не заполняет и нигде не регистрируется:
 * Telegram уже подтвердил, кто она, нам остаётся проверить подпись.
 */
export function TelegramBoot() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const app = webApp();
    app?.ready?.();
    app?.expand?.();

    const initData = app?.initData;
    fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(initData ? { initData } : { dev: true }),
    })
      .then(async (response) => {
        if (response.ok) {
          const body = (await response.json().catch(() => ({}))) as { invite?: string | null };
          // Мама пришла по ссылке консультанта — сразу на экран согласия.
          window.location.href = body.invite ? `/connect?c=${encodeURIComponent(body.invite)}` : '/';
          return;
        }
        setError(await response.text());
      })
      .catch(() => setError('Не получилось связаться с сервером. Попробуйте ещё раз.'));
  }, []);

  return (
    <main className={styles.gate}>
      <h1>Сонное царство</h1>
      <p>{error ?? 'Открываем дневник…'}</p>
    </main>
  );
}
