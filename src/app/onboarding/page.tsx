import { redirect } from 'next/navigation';
import { Onboarding } from '@/components/Onboarding';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { defaultConsultant } from '@/lib/default-consultant';

export default async function OnboardingPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;

  const child = await currentChild(parent.id);
  if (child) redirect('/');

  const consultant = await defaultConsultant();
  return <Onboarding consultantName={consultant?.name ?? null} />;
}
