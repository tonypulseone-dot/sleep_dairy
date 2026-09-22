'use client';

import { useEffect, useState } from 'react';
import styles from '@/app/page.module.css';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

/**
 * Первый вход. Мама ничего не заполняет и нигде не регистрируется:
 * Telegram уже подтвердил, кто она, нам остаётся проверить подпись.
 */
export function TelegramBoot() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();

    const initData = webApp?.initData;
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
