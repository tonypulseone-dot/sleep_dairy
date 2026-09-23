'use client';

import { useRouter } from 'next/navigation';
import { IconBack } from './Icons';

/**
 * Стрелка «назад» для страниц, на которые приходят с разных экранов.
 * Политику открывают и из настроек, и с экрана согласия, поэтому
 * возвращаемся туда, откуда пришли, а не на фиксированный адрес.
 */
export function BackLink({ className, fallback = '/' }: { className?: string; fallback?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      aria-label="Назад"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <IconBack />
    </button>
  );
}
