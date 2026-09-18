import { redirect } from 'next/navigation';
import { Onboarding } from '@/components/Onboarding';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';

export default async function OnboardingPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot />;

  const child = await currentChild(parent.id);
  if (child) redirect('/');

  return <Onboarding />;
}
