import { NextResponse, type NextRequest } from 'next/server';

/**
 * Помечает запросы в кабинет консультанта, чтобы общий layout знал, где он.
 * Кабинет всегда светлый: Виктория работает днём, скринит таблицы маме
 * и обводит поверх — тёмная тема там только мешает.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-sd-area', 'pro');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/pro', '/pro/:path*'],
};
