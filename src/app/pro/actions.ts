'use server';

import { UserError, guard } from '@/lib/action-result';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, consultantNotes, consultants } from '@/db/schema';
import { verifyPassword } from '@/lib/password';
import { clearProSession, currentConsultant, setProSession } from '@/lib/pro-session';

export async function proLogin(email: string, password: string) {
  return guard(async () => {
    const [consultant] = await db
      .select()
      .from(consultants)
      .where(eq(consultants.email, email.trim().toLowerCase()))
      .limit(1);

    // Один и тот же ответ на неизвестную почту и неверный пароль:
    // иначе форма превращается в способ узнать, кто зарегистрирован.
    if (!consultant || !verifyPassword(password, consultant.passwordHash)) {
      throw new UserError('Неверная почта или пароль');
    }

    await setProSession(consultant.id);
  });
}

export async function proLogout() {
  await clearProSession();
  redirect('/pro/login');
}

/**
 * Заметки консультанта о клиентке. Мама их не видит: они живут только
 * в кабинете, в дневник и выгрузку не попадают.
 */
async function consultantWithAccess(childId: string) {
  const consultant = await currentConsultant();
  if (!consultant) throw new UserError('Войдите в кабинет заново');
  const [access] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.childId, childId),
        eq(accessGrants.consultantId, consultant.id),
        isNull(accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (!access) throw new UserError('Доступ к этому дневнику закрыт');
  return consultant;
}

export async function addNote(childId: string, body: string) {
  return guard(async () => {
    const text = body.trim();
    if (!text) throw new UserError('Заметка пустая');
    if (text.length > 2000) throw new UserError('Слишком длинная заметка — до 2000 знаков');
    const consultant = await consultantWithAccess(childId);
    await db.insert(consultantNotes).values({ childId, consultantId: consultant.id, body: text });
    revalidatePath(`/pro/${childId}`);
    revalidatePath('/pro');
  });
}

export async function deleteNote(childId: string, noteId: string) {
  return guard(async () => {
    const consultant = await consultantWithAccess(childId);
    await db
      .delete(consultantNotes)
      .where(
        and(
          eq(consultantNotes.id, noteId),
          eq(consultantNotes.childId, childId),
          eq(consultantNotes.consultantId, consultant.id),
        ),
      );
    revalidatePath(`/pro/${childId}`);
    revalidatePath('/pro');
  });
}
