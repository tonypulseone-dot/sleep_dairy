import { NextResponse } from 'next/server';

/**
 * Жив ли сервер и какая версия на нём — короткий хеш коммита из GitHub.
 * По нему видно, доехало ли автообновление (scripts/auto-update.sh).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true, version: process.env.APP_VERSION ?? 'dev' });
}
