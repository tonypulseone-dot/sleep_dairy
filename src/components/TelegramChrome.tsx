'use client';

import { useEffect } from 'react';
import { paintTelegram, webApp } from '@/lib/telegram-client';
import type { Theme } from '@/lib/theme';

/**
 * Связывает приложение с рамкой Telegram на каждом экране: сообщает, что
 * мы готовы, разворачивает на весь экран и красит шапку в цвет темы.
 */
export function TelegramChrome({ theme }: { theme: Theme }) {
  useEffect(() => {
    const app = webApp();
    app?.ready?.();
    app?.expand?.();
  }, []);

  useEffect(() => {
    paintTelegram(theme);
  }, [theme]);

  return null;
}
