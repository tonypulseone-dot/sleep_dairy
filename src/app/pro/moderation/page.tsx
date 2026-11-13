import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { consultants, consultantProfiles } from "@/db/schema";
import { currentConsultant } from "@/lib/pro-session";
import { ConsultantCard } from "@/components/ConsultantCard";
import { ModerationControls } from "@/components/ModerationControls";
import styles from "@/components/Showcase.module.css";
export default async function ModerationPage() {
  const user = await currentConsultant();
  if (!user) redirect("/pro/login");
  if (!user.isModerator) notFound();
  const pending = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.status, "pending"))
    .orderBy(asc(consultantProfiles.updatedAt));
  const published = await db
    .select({ id: consultants.id, name: consultants.name })
    .from(consultants)
    .where(eq(consultants.showcaseStatus, "published"))
    .orderBy(asc(consultants.name));
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <h1>Проверка анкет</h1>
        <Link className={styles.link} href="/pro">
          В кабинет
        </Link>
      </div>
      <p className={styles.lead}>
        Проверьте подход, услуги и контакты. Родители видят только одобренные
        анкеты.
      </p>
      <div className={styles.cards}>
        {pending.map((d) => (
          <ConsultantCard
            key={`${d.consultantId}-${d.revision}`}
            profile={d.payload}
          >
            <ModerationControls id={d.consultantId} revision={d.revision} />
          </ConsultantCard>
        ))}
      </div>
      {!pending.length && (
        <p className={styles.empty}>
          Все заявки рассмотрены. Новые анкеты появятся здесь.
        </p>
      )}
      <section className={styles.section}>
        <h2>Опубликованы</h2>
        {published.map((p) => (
          <div className={styles.status} key={p.id}>
            <strong>{p.name}</strong>
            <ModerationControls id={p.id} />
          </div>
        ))}
        {!published.length && (
          <p className={styles.meta}>Пока нет опубликованных анкет.</p>
        )}
      </section>
    </main>
  );
}
