import { redirect } from 'next/navigation';
import { ImportDiary } from '@/components/ImportDiary';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';

export default async function ImportPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  return <ImportDiary />;
}
