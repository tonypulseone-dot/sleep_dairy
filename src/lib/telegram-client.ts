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
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function webApp(): TelegramWebApp | undefined {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

/** Открыто внутри Telegram, а не в обычном браузере: только там есть initData. */
export function insideTelegram(): boolean {
  const app = webApp();
  return Boolean(app?.initData) && (app?.isVersionAtLeast?.('6.1') ?? false);
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

/**
 * Отдача в руку. Ночью мама отмечает сон, не глядя в экран: толчок при
 * нажатии говорит «нажалось», двойной «успех» — «записалось».
 * Вне Telegram — обычная вибрация, где браузер её умеет (на iPhone нет).
 */
export function haptic(kind: 'tap' | 'success' | 'error' | 'select') {
  const feedback = webApp()?.HapticFeedback;
  try {
    if (feedback && webApp()?.isVersionAtLeast?.('6.1')) {
      if (kind === 'tap') feedback.impactOccurred?.('medium');
      else if (kind === 'select') feedback.selectionChanged?.();
      else feedback.notificationOccurred?.(kind);
      return;
    }
    const pattern = { tap: 12, select: 6, success: [10, 60, 18], error: [30, 50, 30] }[kind];
    navigator.vibrate?.(pattern);
  } catch {
    // Вибрация — приятная мелочь, а не условие работы.
  }
}
