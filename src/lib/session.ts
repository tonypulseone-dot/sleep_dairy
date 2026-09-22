import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { children, parents } from '@/db/schema';

const COOKIE = 'sd_session';
const MAX_AGE = 60 * 60 * 24 * 180;

function secret(): string {
  const value = process.env.SESSION_SECRET ?? process.env.TELEGRAM_BOT_TOKEN;
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET не задан — сессии нельзя подписать');
  }
  return 'dev-secret';
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

/** Кука подписана: подменить id родителя в браузере не выйдет. */
export function packSession(parentId: string): string {
  return `${parentId}.${sign(parentId)}`;
}

export function unpackSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const at = raw.lastIndexOf('.');
  if (at <= 0) return null;
  const parentId = raw.slice(0, at);
  const signature = raw.slice(at + 1);
  const expected = sign(parentId);
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  return parentId;
}

export async function setSessionCookie(parentId: string) {
  const store = await cookies();
  store.set(COOKIE, packSession(parentId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

/** Выйти из сессии: нужна при удалении дневника, чтобы кука не вела на пустоту. */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function currentParentId(): Promise<string | null> {
  const store = await cookies();
  return unpackSession(store.get(COOKIE)?.value);
}

export async function currentParent() {
  const id = await currentParentId();
  if (!id) return null;
  const [parent] = await db.select().from(parents).where(eq(parents.id, id)).limit(1);
  return parent ?? null;
}

/**
 * Ребёнок, с которым мама работает сейчас.
 * Пока один на маму — второй появится, когда попросят, а не «на всякий случай».
 */
export async function currentChild(parentId: string) {
  const [child] = await db
    .select()
    .from(children)
    .where(and(eq(children.parentId, parentId), isNull(children.archivedAt)))
    .orderBy(desc(children.createdAt))
    .limit(1);
  return child ?? null;
}

/** Заводит родителя по телеграм-аккаунту или возвращает существующего. */
export async function upsertParent(input: {
  telegramId: string;
  firstName?: string | null;
  timeZone?: string;
}) {
  const [existing] = await db
    .select()
    .from(parents)
    .where(eq(parents.telegramId, input.telegramId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(parents)
    .values({
      telegramId: input.telegramId,
      firstName: input.firstName ?? null,
      timeZone: input.timeZone ?? 'Europe/Moscow',
    })
    .returning();
  return created;
}
