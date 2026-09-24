'use client';

import { unwrap } from '@/lib/action-result';
import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setThemePref } from '@/app/actions';
import { applyTheme } from '@/lib/telegram-client';
import type { Theme } from '@/lib/theme';
import { IconMoon, IconSun } from './Icons';

/**
 * Переключатель темы в одно касание — на главном экране, рядом с настройками.
 *
 * Значок показывает, куда переключит: в светлой теме луна («сделать тёмной»),
 * в тёмной солнце. Тема меняется сразу, ещё до ответа сервера: ночью
 * лишняя секунда белого экрана — ровно то, от чего Виктория просила уберечь.
 * Выбор запоминается; вернуть «по времени суток» можно в настройках.
 */
export function ThemeToggle({ theme, className }: { theme: Theme; className?: string }) {
  const router = useRouter();
  // Пока сервер сохраняет выбор, показываем уже новую тему; после обновления
  // страницы значение снова приходит с сервера.
  const [current, setCurrent] = useOptimistic(theme);
  const [, startTransition] = useTransition();

  const next: Theme = current === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={className}
      aria-label={next === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему'}
      title={next === 'dark' ? 'Тёмная тема' : 'Светлая тема'}
      onClick={() => {
        applyTheme(next);
        startTransition(async () => {
          setCurrent(next);
          unwrap(await setThemePref(next));
          router.refresh();
        });
      }}
    >
      {next === 'dark' ? <IconMoon /> : <IconSun />}
    </button>
  );
}
