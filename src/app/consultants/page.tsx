import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { consultants, accessGrants } from "@/db/schema";
import { currentParent, currentChild } from "@/lib/session";
import { SERVICE_TYPES, matchesFilters } from "@/lib/showcase";
import { ConsultantCard } from "@/components/ConsultantCard";
import styles from "@/components/Showcase.module.css";
export const dynamic = "force-dynamic";
export default async function ConsultantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    price?: string;
    experience?: string;
  }>;
}) {
  const q = await searchParams;
  const kind =
    q.service && Object.hasOwn(SERVICE_TYPES, q.service) ? q.service : "";
  const number = (s: string | undefined, max: number) =>
    s && /^\d+$/.test(s) && Number(s) <= max ? Number(s) : null;
  const price = number(q.price, 1000000),
    experience = number(q.experience, 70);
  // Never select private account fields or unreviewed drafts for the public catalogue.
  const rows = await db
    .select({
      id: consultants.id,
      name: consultants.name,
      approach: consultants.approach,
      experienceYears: consultants.experienceYears,
      photoUrl: consultants.photoUrl,
      contactUrl: consultants.contactUrl,
      services: consultants.services,
    })
    .from(consultants)
    .where(eq(consultants.showcaseStatus, "published"))
    .orderBy(asc(consultants.name));
  const shown = rows
    .map((r) => ({
      ...r,
      approach: r.approach ?? "",
      experienceYears: r.experienceYears ?? 0,
      photoUrl: r.photoUrl ?? "",
      contactUrl: r.contactUrl ?? "",
    }))
    .filter((p) => matchesFilters(p, kind, price, experience));
  const parent = await currentParent();
  const child = parent ? await currentChild(parent.id) : null;
  const mine = child
    ? await db
        .select({ name: consultants.name })
        .from(accessGrants)
        .innerJoin(consultants, eq(consultants.id, accessGrants.consultantId))
        .where(
          and(
            eq(accessGrants.childId, child.id),
            isNull(accessGrants.revokedAt),
          ),
        )
    : [];
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <h1>Консультанты</h1>
        <Link className={styles.link} href="/">
          В дневник
        </Link>
      </div>
      <p className={styles.lead}>
        Найдите специалиста, чей подход вам близок. Каждую анкету перед
        публикацией проверяет Виктория.
      </p>
      {mine.length > 0 && (
        <div className={styles.status}>
          <strong>Мой консультант</strong>
          <p>{mine.map((m) => m.name).join(", ")}</p>
          <Link className={styles.link} href="/consultant">
            Доступ к дневнику
          </Link>
        </div>
      )}
      <form className={styles.filters} key={`${kind}-${price}-${experience}`}>
        <label className={styles.field}>
          Вид услуги
          <select name="service" defaultValue={kind}>
            <option value="">Все услуги</option>
            {Object.entries(SERVICE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Цена до, ₽
          <input
            name="price"
            type="number"
            min={0}
            max={1000000}
            placeholder="Любая"
            defaultValue={price ?? ""}
          />
        </label>
        <label className={styles.field}>
          Опыт от, лет
          <input
            name="experience"
            type="number"
            min={0}
            max={70}
            placeholder="Любой"
            defaultValue={experience ?? ""}
          />
        </label>
        <button className={styles.primary}>Найти</button>
        <Link className={styles.link} href="/consultants">
          Сбросить
        </Link>
      </form>
      <div className={styles.cards}>
        {shown.map((p) => (
          <ConsultantCard key={p.id} profile={p} />
        ))}
      </div>
      {!shown.length && (
        <p className={styles.empty}>
          {rows.length
            ? "По этим условиям никого не найдено. Попробуйте изменить фильтры."
            : "Витрина скоро откроется — Виктория проверяет анкеты специалистов."}
        </p>
      )}
      <p className={styles.lead}>
        Вы консультант?{" "}
        <Link className={styles.link} href="/pro/profile">
          Заполнить анкету
        </Link>{" "}
        ·{" "}
        <Link className={styles.link} href="/pro/register">
          Создать аккаунт
        </Link>
      </p>
    </main>
  );
}
