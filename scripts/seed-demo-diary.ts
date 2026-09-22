/**
 * Заполняет дневник правдоподобной неделей: npm run seed:demo
 *
 * Нужно, чтобы кабинет консультанта было на чём смотреть до того, как
 * появятся живые клиентки. Ночной сон каждый раз начинается поздно
 * вечером или после полуночи — именно на этом ломается разбивка по суткам.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '../src/db';
import { children, parents, sleeps } from '../src/db/schema';
import { composeSleep, parseTimeOfDay, shiftDate, sleepDayOf, sleepKindOf } from '../src/lib/sleep-day';

const PATTERN = [
  { naps: [['09:40', '11:05'], ['13:30', '15:20']], night: ['20:50', '06:40'] },
  { naps: [['10:00', '11:20'], ['14:00', '15:30']], night: ['00:30', '07:00'] },
  { naps: [['09:20', '10:40'], ['13:10', '14:55'], ['17:30', '18:10']], night: ['21:10', '06:50'] },
  { naps: [['10:10', '11:35'], ['14:20', '15:40']], night: ['20:30', '06:20'] },
  { naps: [['09:50', '11:10'], ['13:45', '15:05']], night: ['23:40', '07:10'] },
  { naps: [['10:05', '11:15'], ['14:10', '16:00']], night: ['21:00', '06:30'] },
  { naps: [['09:30', '10:50'], ['13:20', '15:10']], night: ['20:45', '06:55'] },
];

async function main() {
  const [child] = await db.select().from(children).orderBy(desc(children.createdAt)).limit(1);
  if (!child) {
    console.error('Сначала заведите ребёнка в приложении');
    process.exit(1);
  }
  const [parent] = await db.select().from(parents).where(eq(parents.id, child.parentId)).limit(1);

  const window = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };

  const today = sleepDayOf(new Date(), window);
  let inserted = 0;

  for (let offset = PATTERN.length; offset >= 1; offset -= 1) {
    const sleepDay = shiftDate(today, -offset);
    const plan = PATTERN[(PATTERN.length - offset) % PATTERN.length];

    for (const [from, to] of [...plan.naps, plan.night]) {
      const { startedAt, endedAt } = composeSleep(
        sleepDay,
        parseTimeOfDay(from),
        parseTimeOfDay(to),
        window,
      );
      await db.insert(sleeps).values({
        childId: child.id,
        startedAt,
        endedAt,
        sleepDay: sleepDayOf(startedAt, window),
        kind: sleepKindOf(startedAt, window),
        source: 'manual',
      });
      inserted += 1;
    }
  }

  console.log(`Добавлено записей: ${inserted} для «${child.name}»`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
