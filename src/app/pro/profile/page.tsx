import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consultantProfiles } from "@/db/schema";
import { currentConsultant } from "@/lib/pro-session";
import { ConsultantProfileForm } from "@/components/ConsultantProfileForm";
import styles from "@/components/Showcase.module.css";
export default async function ProfilePage() {
  const user = await currentConsultant();
  if (!user) redirect("/pro/login");
  const [draft] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.consultantId, user.id));
  const initial = draft?.payload ?? {
    name: user.name,
    approach: user.approach ?? "",
    experienceYears: user.experienceYears ?? 0,
    photoUrl: user.photoUrl ?? "",
    contactUrl: user.contactUrl ?? "",
    services: user.services,
  };
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <h1>Моя анкета</h1>
        <Link className={styles.link} href="/pro">
          В кабинет
        </Link>
      </div>
      <p className={styles.lead}>
        Расскажите о себе родителям. Карточка появится в разделе «Консультанты»
        после одобрения Виктории.
      </p>
      <ConsultantProfileForm
        initial={initial}
        revision={draft?.revision ?? 0}
        status={draft?.status ?? "draft"}
        note={draft?.note ?? null}
        published={user.showcaseStatus === "published"}
      />
    </main>
  );
}
