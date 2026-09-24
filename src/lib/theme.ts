import { localMinutes } from './sleep-day';

export type Theme = 'light' | 'dark';
export type ThemePref = 'auto' | 'light' | 'dark';

/**
 * Какую тему показать.
 *
 * Виктория: «обязательно цвет либо белый, либо чёрный, потому что в ночи очень
 * в глаза светит белый свет». Поэтому в режиме auto тема едет за границами
 * суток, которые мама выставила сама: наступила ночь — приложение открывается
 * тёмным, без вспышки в глаза.
 */
export function resolveTheme(
  pref: ThemePref,
  window: { dayBoundary: number; nightFrom: number; timeZone: string },
  now: Date = new Date(),
): Theme {
  if (pref !== 'auto') return pref;
  const minutes = localMinutes(now, window.timeZone);
  const isNight =
    window.nightFrom > window.dayBoundary
      ? minutes >= window.nightFrom || minutes < window.dayBoundary
      : minutes >= window.nightFrom && minutes < window.dayBoundary;
  return isNight ? 'dark' : 'light';
}

/**
 * Глубокая ночь — от полуночи до маминой утренней границы. В это время
 * даже тёмная тема кажется яркой: мама смотрит на экран в полной темноте,
 * рядом спит ребёнок. Тогда приглушаем цветные пятна (см. data-hush).
 */
export function isDeepNight(
  window: { dayBoundary: number; timeZone: string },
  now: Date = new Date(),
): boolean {
  return localMinutes(now, window.timeZone) < window.dayBoundary;
}
