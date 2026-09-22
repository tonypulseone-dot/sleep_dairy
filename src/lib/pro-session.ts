import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consultants } from '@/db/schema';

/**
 * Сессия консультанта. Отдельная от маминой: с одного устройства
 * консультант может смотреть кабинет, а мама — свой дневник.
 */

const COOKIE = 'sd_pro';
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET ?? process.env.TELEGRAM_BOT_TOKEN;
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET не задан — сессии нельзя подписать');
  }
  return 'dev-secret';
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(`pro:${value}`).digest('hex');
}

export async function setProSession(consultantId: string) {
  const store = await cookies();
  store.set(COOKIE, `${consultantId}.${sign(consultantId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearProSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function currentConsultant() {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  const at = raw.lastIndexOf('.');
  if (at <= 0) return null;
  const id = raw.slice(0, at);
  const signature = raw.slice(at + 1);
  const expected = sign(id);
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }

  const [consultant] = await db.select().from(consultants).where(eq(consultants.id, id)).limit(1);
  return consultant ?? null;
}
