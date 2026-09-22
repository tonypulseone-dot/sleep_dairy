import { redirect } from 'next/navigation';
import { ProLogin } from '@/components/ProLogin';
import { currentConsultant } from '@/lib/pro-session';

export default async function ProLoginPage() {
  if (await currentConsultant()) redirect('/pro');
  return <ProLogin />;
}
