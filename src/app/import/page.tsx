import { redirect } from 'next/navigation';
import { TelegramBoot } from '@/components/TelegramBoot';
import { ImportFlow } from '@/components/ImportFlow';
import { currentChild, currentParent } from '@/lib/session';
import { gigachatConfigured } from '@/lib/gigachat';
import { localDate } from '@/lib/sleep-day';

/** Перенос снов из других приложений — скриншотами или заметками. */
export default async function ImportPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;
  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  return (
    <ImportFlow
      consented={Boolean(parent.importConsentAt)}
      enabled={gigachatConfigured()}
      today={localDate(new Date(), parent.timeZone)}
      dayBoundary={child.dayBoundaryMinutes}
      nightFrom={child.nightFromMinutes}
      sex={child.sex}
    />
  );
}
