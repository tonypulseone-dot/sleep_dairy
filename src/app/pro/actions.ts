'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consultants } from '@/db/schema';
import { verifyPassword } from '@/lib/password';
import { clearProSession, setProSession } from '@/lib/pro-session';

export async function proLogin(email: string, password: string) {
  const [consultant] = await db
    .select()
    .from(consultants)
    .where(eq(consultants.email, email.trim().toLowerCase()))
    .limit(1);

  // Один и тот же ответ на неизвестную почту и неверный пароль:
  // иначе форма превращается в способ узнать, кто зарегистрирован.
  if (!consultant || !verifyPassword(password, consultant.passwordHash)) {
    throw new Error('Неверная почта или пароль');
  }

  await setProSession(consultant.id);
}

export async function proLogout() {
  await clearProSession();
  redirect('/pro/login');
}
