import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consultants } from '@/db/schema';
import { ConnectPrompt } from '@/components/ConsultantAccess';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot />;

  // Анкету заполняем до согласия: консультанту нужен уже заведённый ребёнок.
  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const slug = (await searchParams).c;
  if (!slug) redirect('/');

  const [consultant] = await db
    .select({ name: consultants.name })
    .from(consultants)
    .where(eq(consultants.slug, slug))
    .limit(1);
  if (!consultant) redirect('/');

  return <ConnectPrompt slug={slug} consultantName={consultant.name} />;
}
