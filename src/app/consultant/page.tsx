import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, consultants } from '@/db/schema';
import { ConsultantList } from '@/components/ConsultantAccess';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';

export default async function ConsultantPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const rows = await db
    .select({
      id: accessGrants.id,
      grantedAt: accessGrants.grantedAt,
      consultantName: consultants.name,
    })
    .from(accessGrants)
    .innerJoin(consultants, eq(consultants.id, accessGrants.consultantId))
    .where(and(eq(accessGrants.childId, child.id), isNull(accessGrants.revokedAt)))
    .orderBy(desc(accessGrants.grantedAt));

  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: parent.timeZone,
  });

  return (
    <ConsultantList
      grants={rows.map((row) => ({
        id: row.id,
        consultantName: row.consultantName,
        since: date.format(row.grantedAt),
      }))}
    />
  );
}
