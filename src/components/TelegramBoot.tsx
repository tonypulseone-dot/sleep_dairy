'use client';

import { useEffect, useState } from 'react';
import { webApp } from '@/lib/telegram-client';
import { Moon } from './Moon';
import styles from '@/app/page.module.css';

/**
 * Первый вход. Мама ничего не заполняет и нигде не регистрируется:
 * Telegram уже подтвердил, кто она, нам остаётся проверить подпись.
 *
 * Если открыть адрес в обычном браузере, подписи нет и войти нельзя.
 * Раньше экран так и висел на «Открываем дневник…»; теперь он прямо
 * говорит, где открывать, и ведёт в бота.
 */
export function TelegramBoot({ botUsername }: { botUsername?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);

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
        if (!initData) {
          setOutside(true);
          return;
        }
        setError(await response.text());
      })
      .catch(() => setError('Не получилось связаться с сервером. Попробуйте ещё раз.'));
  }, []);

  if (outside) {
    return (
      <main className={styles.gate}>
        <Moon />
        <h1>Дневник открывается в Telegram</h1>
        <p>
          Это мини-приложение живёт внутри Telegram: там оно узнаёт вас без паролей.
          Откройте бота и нажмите кнопку «Дневник».
        </p>
        {botUsername && (
          <a className={styles.gateButton} href={`https://t.me/${botUsername}`}>
            Открыть @{botUsername}
          </a>
        )}
      </main>
    );
  }

  return (
    <main className={styles.gate}>
      <h1>Сонное царство</h1>
      <p>{error ?? 'Открываем дневник…'}</p>
    </main>
  );
}
