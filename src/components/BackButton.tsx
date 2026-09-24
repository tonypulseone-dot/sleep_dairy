'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { insideTelegram, webApp } from '@/lib/telegram-client';
import { IconBack } from './Icons';

/**
 * «Назад» для всех экранов.
 *
 * Внутри Telegram показываем его родную кнопку в шапке — мамы привыкли к ней
 * в любом мини-приложении, и она не занимает место на экране. Наша стрелка
 * тогда скрыта (класс tg-hide, см. globals.css). В обычном браузере — наоборот.
 *
 * `href` — куда вернуться. Без него — туда, откуда пришли: так открывают
 * политику конфиденциальности, на неё попадают с разных экранов.
 */
export function BackButton({
  href,
  className,
  label = 'Назад',
}: {
  href?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();

  const go = useCallback(() => {
    if (href) router.push(href);
    else if (window.history.length > 1) router.back();
    else router.push('/');
  }, [href, router]);

  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back || !insideTelegram()) return;
    back.onClick(go);
    back.show();
    return () => {
      back.offClick(go);
      back.hide();
    };
  }, [go]);

  const cls = `${className ?? ''} tg-hide`;
  return href ? (
    <Link href={href} className={cls} aria-label={label}>
      <IconBack />
    </Link>
  ) : (
    <button type="button" className={cls} aria-label={label} onClick={go}>
      <IconBack />
    </button>
  );
}
