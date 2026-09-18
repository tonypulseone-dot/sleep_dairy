import { redirect } from 'next/navigation';
import { SettingsForm } from '@/components/SettingsForm';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { formatTimeOfDay } from '@/lib/sleep-day';

export default async function SettingsPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  return (
    <SettingsForm
      dayBoundary={formatTimeOfDay(child.dayBoundaryMinutes)}
      nightFrom={formatTimeOfDay(child.nightFromMinutes)}
      timeZone={parent.timeZone}
      themePref={parent.themePref}
    />
  );
}
