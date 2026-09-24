import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { currentChild, currentParent } from '@/lib/session';
import { DEFAULT_DAY_BOUNDARY, DEFAULT_NIGHT_FROM } from '@/lib/sleep-day';
import { resolveTheme } from '@/lib/theme';
import { THEME_BG } from '@/lib/telegram-client';
import { TelegramChrome } from '@/components/TelegramChrome';
import './fonts.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Дневник сна',
  description: 'Дневник сна малыша в одно касание',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Тему решаем на сервере, чтобы ночью не мигнуть белым экраном перед отрисовкой.
  const parent = await currentParent();
  const child = parent ? await currentChild(parent.id) : null;
  const theme = resolveTheme(parent?.themePref ?? 'auto', {
    dayBoundary: child?.dayBoundaryMinutes ?? DEFAULT_DAY_BOUNDARY,
    nightFrom: child?.nightFromMinutes ?? DEFAULT_NIGHT_FROM,
    timeZone: parent?.timeZone ?? 'Europe/Moscow',
  });

  return (
    <html lang="ru" data-theme={theme}>
      <head>
        {/* Шрифты, которые нужны на первом же экране, — заранее, чтобы текст не «прыгал». */}
        <link rel="preload" href="/fonts/golos-text-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/golos-text-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/literata-cyrillic-600-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <meta name="theme-color" content={THEME_BG[theme]} />
      </head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramChrome theme={theme} />
        {children}
      </body>
    </html>
  );
}
