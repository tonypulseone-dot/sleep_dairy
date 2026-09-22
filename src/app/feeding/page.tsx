import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { feedings } from '@/db/schema';
import { FeedingDiary, type FeedingRow } from '@/components/FeedingDiary';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { sleepDayOf, type DayWindow } from '@/lib/sleep-day';

export default async function FeedingPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');
  // На грудном вскармливании этого экрана нет вовсе — так просила Виктория.
  if (child.feedingType === 'breast') redirect('/');

  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };
  const today = sleepDayOf(new Date(), window);

  const rows = await db
    .select()
    .from(feedings)
    .where(and(eq(feedings.childId, child.id), eq(feedings.sleepDay, today)))
    .orderBy(asc(feedings.at));

  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: parent.timeZone,
  });

  const view: FeedingRow[] = rows.map((row) => ({
    id: row.id,
    time: time.format(row.at),
    amountMl: row.amountMl,
  }));

  const withAmount = rows.filter((row) => row.amountMl !== null);
  const totalMl = withAmount.length
    ? withAmount.reduce((sum, row) => sum + (row.amountMl ?? 0), 0)
    : null;

  return <FeedingDiary childName={child.name} rows={view} totalMl={totalMl} />;
}
