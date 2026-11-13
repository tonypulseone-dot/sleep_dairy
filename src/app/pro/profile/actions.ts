"use server";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { consultants, consultantProfiles } from "@/db/schema";
import { currentConsultant, setProSession } from "@/lib/pro-session";
import { hashPassword } from "@/lib/password";
import { guard, UserError } from "@/lib/action-result";
import { validateProfile } from "@/lib/showcase";

export async function registerConsultant(input: {
  name: string;
  email: string;
  password: string;
}) {
  return guard(async () => {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email =
      typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (
      !name ||
      name.length > 100 ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email)
    )
      throw new UserError("Укажите имя и корректную почту");
    if (
      typeof input.password !== "string" ||
      input.password.length < 10 ||
      input.password.length > 128
    )
      throw new UserError("Пароль должен содержать от 10 до 128 символов");
    const [created] = await db
      .insert(consultants)
      .values({
        name,
        email,
        passwordHash: hashPassword(input.password),
        slug: `c-${randomUUID()}`,
      })
      .onConflictDoNothing()
      .returning({ id: consultants.id });
    if (!created)
      throw new UserError("Эта почта уже зарегистрирована. Войдите в кабинет");
    await setProSession(created.id);
  });
}
export async function saveProfile(
  raw: unknown,
  submit: boolean,
  revision: number,
) {
  return guard(async () => {
    const user = await currentConsultant();
    if (!user) throw new UserError("Войдите в кабинет");
    const payload = validateProfile(raw, submit);
    await db.transaction(async (tx) => {
      // One lock for both first saves and edits; publication takes the same lock.
      const [locked] = await tx
        .select({ status: consultants.showcaseStatus })
        .from(consultants)
        .where(eq(consultants.id, user.id))
        .for("update");
      const [old] = await tx
        .select()
        .from(consultantProfiles)
        .where(eq(consultantProfiles.consultantId, user.id));
      if ((old?.revision ?? 0) !== revision)
        throw new UserError(
          "Анкета изменилась в другой вкладке. Обновите страницу",
        );
      const values = {
        payload,
        status: submit ? "pending" : "draft",
        revision: revision + 1,
        note: null,
        updatedAt: new Date(),
      };
      if (old)
        await tx
          .update(consultantProfiles)
          .set(values)
          .where(eq(consultantProfiles.consultantId, user.id));
      else
        await tx
          .insert(consultantProfiles)
          .values({ consultantId: user.id, ...values });
      if (locked.status !== "published")
        await tx
          .update(consultants)
          .set({ showcaseStatus: submit ? "pending" : "hidden" })
          .where(eq(consultants.id, user.id));
    });
    revalidatePath("/pro/profile");
    revalidatePath("/pro/moderation");
    return { revision: revision + 1 };
  });
}
export async function reviewProfile(
  id: string,
  revision: number,
  approve: boolean,
  note: string,
) {
  return guard(async () => {
    const moderator = await currentConsultant();
    if (!moderator?.isModerator)
      throw new UserError("Нет доступа к проверке анкет");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(revision))
      throw new UserError("Анкета не найдена");
    if (
      typeof note !== "string" ||
      note.length > 1000 ||
      (!approve && !note.trim())
    )
      throw new UserError("Укажите причину решения (до 1000 символов)");
    await db.transaction(async (tx) => {
      await tx
        .select({ id: consultants.id })
        .from(consultants)
        .where(eq(consultants.id, id))
        .for("update");
      const [draft] = await tx
        .select()
        .from(consultantProfiles)
        .where(
          and(
            eq(consultantProfiles.consultantId, id),
            eq(consultantProfiles.revision, revision),
            eq(consultantProfiles.status, "pending"),
          ),
        );
      if (!draft)
        throw new UserError(
          "Анкета уже изменилась или рассмотрена. Обновите страницу",
        );
      if (approve) {
        const p = validateProfile(draft.payload, true);
        await tx
          .update(consultants)
          .set({
            ...p,
            priceFrom: Math.min(...p.services.map((s) => s.price)),
            showcaseStatus: "published",
            moderatedAt: new Date(),
            moderationNote: note.trim() || null,
          })
          .where(eq(consultants.id, id));
      } else {
        await tx
          .update(consultants)
          .set({
            showcaseStatus: sql`case when ${consultants.showcaseStatus} = 'published' then 'published'::showcase_status else 'rejected'::showcase_status end`,
            moderationNote: note.trim(),
          })
          .where(eq(consultants.id, id));
      }
      await tx
        .update(consultantProfiles)
        .set({
          status: approve ? "published" : "rejected",
          note: note.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(consultantProfiles.consultantId, id));
    });
    revalidatePath("/consultants");
    revalidatePath("/pro/profile");
    revalidatePath("/pro/moderation");
  });
}
export async function hideConsultant(id: string) {
  return guard(async () => {
    const moderator = await currentConsultant();
    if (!moderator?.isModerator) throw new UserError("Нет доступа");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Анкета не найдена");
    await db.transaction(async (tx) => {
      await tx
        .select({ id: consultants.id })
        .from(consultants)
        .where(eq(consultants.id, id))
        .for("update");
      await tx
        .update(consultants)
        .set({ showcaseStatus: "hidden" })
        .where(eq(consultants.id, id));
      await tx
        .update(consultantProfiles)
        .set({
          status: "draft",
          revision: sql`${consultantProfiles.revision}+1`,
          note: "Карточка снята с публикации. Для повторной публикации отправьте анкету на проверку.",
        })
        .where(eq(consultantProfiles.consultantId, id));
    });
    revalidatePath("/consultants");
    revalidatePath("/pro/moderation");
    revalidatePath("/pro/profile");
  });
}
