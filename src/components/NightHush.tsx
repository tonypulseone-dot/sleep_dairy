'use client';

import { useEffect } from 'react';
import { isDeepNight } from '@/lib/theme';

/**
 * Держит признак глубокой ночи (data-hush на <html>) в актуальном виде,
 * даже если приложение открыто и полночь наступила без перезагрузки.
 * Сервер ставит его сразу, чтобы в полночь экран не мигнул ярким.
 */
export function NightHush({ dayBoundary, timeZone }: { dayBoundary: number; timeZone: string }) {
  useEffect(() => {
    const update = () => {
      document.documentElement.toggleAttribute('data-hush', isDeepNight({ dayBoundary, timeZone }));
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [dayBoundary, timeZone]);

  return null;
}
