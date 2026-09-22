/**
 * Таблица режимов Виктории: npm run seed:norms
 *
 * Данные с двух её инфографик — «Варианты режима по возрастам» (4–15+ мес)
 * и «Средние нормы сна и бодрствования» (1–3 мес). Её обозначения:
 *   ВБ  — окно бодрствования, по порядку от первого к последнему
 *   СВБ — суммарное бодрствование за сутки
 *   ДС  — суммарный дневной сон
 *
 * Запись «2.15» у неё означает 2 часа 15 минут, а не 2,25 часа.
 * Всё сохраняем в минутах.
 */
import { db } from '../src/db';
import { rhythmNorms } from '../src/db/schema';

/** `'2.15'` → 135. `'4'` → 240. */
function hm(value: string): number {
  const [hours, minutes = '0'] = value.split('.');
  return Number(hours) * 60 + Number(minutes.padEnd(2, '0'));
}

/** `'1.45-2'` → { min: 105, max: 120 }. Одно значение — min и max совпадают. */
function span(value: string): { min: number; max: number } {
  const [from, to] = value.split('-');
  return { min: hm(from), max: hm(to ?? from) };
}

const NOTE = 'Это ориентиры, а не строгие правила. Оценивайте сон в динамике за 3–5 дней.';

interface Row {
  from: number;
  to: number;
  naps?: number;
  /** Окна бодрствования по порядку. */
  wake?: string[];
  /** СВБ */
  totalWake?: string;
  /** ДС */
  daySleep?: string;
  nightSleep?: string;
  totalSleep?: string;
}

const ROWS: Row[] = [
  // --- 1–3 месяца: режима ещё нет, есть суточные ориентиры ---
  { from: 1, to: 1, wake: ['0.40-1.20'], totalWake: '7', totalSleep: '15-17', nightSleep: '10' },
  { from: 2, to: 2, wake: ['1-1.30'], totalWake: '8', totalSleep: '14-16', nightSleep: '10' },
  { from: 3, to: 3, wake: ['1.10-1.40'], totalWake: '9', totalSleep: '13-15', nightSleep: '10' },

  // --- 4–15+ месяцев: варианты режима по числу снов ---
  {
    from: 4, to: 4, naps: 4,
    wake: ['1.30-1.50', '1.45-2', '1.45-2', '1.45-2', '1.30-1.50'],
    totalWake: '9.30-10', daySleep: '4',
  },
  {
    from: 4, to: 4, naps: 3,
    wake: ['1.40-2', '2-2.15', '2.15-2.30', '2.30-2.40'],
    totalWake: '9-9.30', daySleep: '4',
  },
  {
    from: 5, to: 5, naps: 4,
    wake: ['1.45-2', '2-2.15', '2-2.15', '2-2.15', '2-2.15'],
    totalWake: '10-10.30', daySleep: '3.30',
  },
  {
    from: 5, to: 5, naps: 3,
    wake: ['2-2.15', '2.20-2.35', '2.20-2.35', '2.15-2.30'],
    totalWake: '9.30-10', daySleep: '3.30',
  },
  {
    from: 6, to: 6, naps: 3,
    wake: ['2.15-2.30', '2.30-2.45', '2.30-2.45', '2.30'],
    totalWake: '10-10.40', daySleep: '3',
  },
  {
    // У неё это «6,5–7 месяцев» — переходный вариант между шестым и седьмым.
    from: 6, to: 7, naps: 3,
    wake: ['2.15-2.30', '2.45-3', '2.45-3', '2.30'],
    totalWake: '10-11', daySleep: '3',
  },
  {
    from: 7, to: 7, naps: 3,
    wake: ['2.15-2.30', '2.45-3', '2.45-3', '2.30'],
    totalWake: '11-11.30', daySleep: '2.30-2.40',
  },
  {
    from: 8, to: 8, naps: 3,
    wake: ['2.45-3', '3-3.15', '3-3.15', '2.30-2.45'],
    totalWake: '11-11.30', daySleep: '2.30',
  },
  {
    from: 8, to: 8, naps: 2,
    wake: ['3-3.15', '3.30-3.45', '3.30-4'],
    totalWake: '10.45-11', daySleep: '2.30',
  },
  {
    from: 9, to: 9, naps: 3,
    wake: ['2.45-3', '3-3.15', '3-3.15', '2.30-2.45'],
    totalWake: '11-11.30', daySleep: '2.30',
  },
  {
    from: 9, to: 9, naps: 2,
    wake: ['3-3.15', '3.30-3.45', '3.45-4'],
    totalWake: '11', daySleep: '2.30',
  },
  {
    from: 10, to: 10, naps: 2,
    wake: ['3-3.15', '4', '4'],
    totalWake: '11.15', daySleep: '2.15-2.30',
  },
  {
    from: 11, to: 11, naps: 2,
    wake: ['3-3.15', '4', '4'],
    totalWake: '11.15', daySleep: '2.15',
  },
  {
    from: 12, to: 12, naps: 2,
    wake: ['3-3.30', '4', '4-4.30'],
    totalWake: '11.45-12', daySleep: '2-2.10',
  },
  {
    from: 13, to: 15, naps: 2,
    wake: ['3-3.30', '4', '4.30-5'],
    totalWake: '12-13', daySleep: '1.40-2',
  },
  {
    from: 15, to: 36, naps: 1,
    wake: ['5-5.30', '6-6.30'],
    totalWake: '11-11.30', daySleep: '1.30-2',
  },
];

async function main() {
  await db.delete(rhythmNorms);

  for (const row of ROWS) {
    const totalWake = row.totalWake ? span(row.totalWake) : null;
    const daySleep = row.daySleep ? span(row.daySleep) : null;
    const nightSleep = row.nightSleep ? span(row.nightSleep) : null;
    const totalSleep = row.totalSleep ? span(row.totalSleep) : null;

    await db.insert(rhythmNorms).values({
      ageMonthsFrom: row.from,
      ageMonthsTo: row.to,
      napsCount: row.naps ?? null,
      wakeWindows: row.wake?.map(span) ?? null,
      totalWakeMin: totalWake?.min ?? null,
      totalWakeMax: totalWake?.max ?? null,
      daySleepMin: daySleep?.min ?? null,
      daySleepMax: daySleep?.max ?? null,
      nightSleepMin: nightSleep?.min ?? null,
      nightSleepMax: nightSleep?.max ?? null,
      totalSleepMin: totalSleep?.min ?? null,
      totalSleepMax: totalSleep?.max ?? null,
      note: NOTE,
    });
  }

  console.log(`Загружено вариантов режима: ${ROWS.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
