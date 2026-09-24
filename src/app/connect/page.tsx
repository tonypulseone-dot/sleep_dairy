import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, consultants } from '@/db/schema';
import { ConnectPrompt } from '@/components/ConsultantAccess';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;

  // Анкету заполняем до согласия: консультанту нужен уже заведённый ребёнок.
  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const slug = (await searchParams).c;
  if (!slug) redirect('/');

  const [consultant] = await db
    .select({ id: consultants.id, name: consultants.name })
    .from(consultants)
    .where(eq(consultants.slug, slug))
    .limit(1);
  if (!consultant) redirect('/');

  // Доступ уже открыт (например, при регистрации) — второй раз не спрашиваем.
  const [open] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.childId, child.id),
        eq(accessGrants.consultantId, consultant.id),
        isNull(accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (open) redirect('/');

  return <ConnectPrompt slug={slug} consultantName={consultant.name} />;
}
