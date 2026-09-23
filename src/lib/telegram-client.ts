import type { Theme } from './theme';

/**
 * То немногое из Telegram WebApp API, чем мы пользуемся.
 *
 * Скрипт Telegram может не загрузиться (приложение открыли в браузере) или
 * оказаться старым — поэтому каждый вызов защищён проверкой версии.
 */
interface TelegramWebApp {
  initData?: string;
  version?: string;
  ready?: () => void;
  expand?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function webApp(): TelegramWebApp | undefined {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

/** Фон страницы в каждой теме — тот же, что --bg в globals.css. */
export const THEME_BG: Record<Theme, string> = { light: '#F7F5F0', dark: '#0B0F1A' };

/**
 * Красит рамку Telegram — шапку над приложением и подложку при прокрутке —
 * в цвет нашей темы. Иначе при светлой теме над приложением висит тёмная
 * шапка Telegram, а при оттягивании экрана из-под страницы выглядывает чужой фон.
 */
export function paintTelegram(theme: Theme) {
  const app = webApp();
  if (!app) return;
  const color = THEME_BG[theme];
  const atLeast = (v: string) => app.isVersionAtLeast?.(v) ?? false;
  try {
    if (atLeast('6.1')) {
      app.setHeaderColor?.(color);
      app.setBackgroundColor?.(color);
    }
    if (atLeast('7.10')) app.setBottomBarColor?.(color);
  } catch {
    // Старый клиент Telegram: оставляем его цвета, приложение от этого не ломается.
  }
}

/** Мгновенно применяет тему на странице, не дожидаясь ответа сервера. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[theme]);
  paintTelegram(theme);
}
