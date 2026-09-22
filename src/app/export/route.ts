import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { sleeps } from '@/db/schema';
import { currentChild, currentParent } from '@/lib/session';
import {
  averageTotalSleep,
  formatDuration,
  shiftDate,
  sleepDayOf,
  summarizeDay,
  type DayTotals,
  type DayWindow,
} from '@/lib/sleep-day';

/**
 * Выгрузка дневника таблицей.
 *
 * Виктория: «функция выгрузки дневника в стороннюю таблицу, Excel, PDF,
 * вообще любой формат» и «должна быть возможность указывать период».
 *
 * Отдаём CSV, потому что он открывается всюду. Две детали, без которых
 * русский Excel показывает кашу вместо букв: метка BOM в начале файла и
 * точка с запятой вместо запятой — в русской локали запятая занята под
 * десятичный разделитель.
 */

const PERIODS = [5, 7, 10, 14, 30, 365];

function cell(value: string): string {
  return value.includes(';') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(request: Request) {
  const parent = await currentParent();
  if (!parent) return new Response('Нужно открыть приложение', { status: 401 });

  const child = await currentChild(parent.id);
  if (!child) return new Response('Ребёнок не заведён', { status: 404 });

  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };

  const asked = Number(new URL(request.url).searchParams.get('days'));
  const period = PERIODS.includes(asked) ? asked : 7;

  const now = new Date();
  const today = sleepDayOf(now, window);
  const from = shiftDate(today, -(period - 1));

  const rows = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.childId, child.id), gte(sleeps.sleepDay, from)))
    .orderBy(asc(sleeps.startedAt));

  const byDay = new Map<string, { startedAt: Date; endedAt: Date | null }[]>();
  for (const row of rows) {
    const list = byDay.get(row.sleepDay) ?? [];
    list.push({ startedAt: row.startedAt, endedAt: row.endedAt });
    byDay.set(row.sleepDay, list);
  }

  const days: DayTotals[] = [];
  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const sleepDay = shiftDate(today, -offset);
    days.push(summarizeDay(sleepDay, byDay.get(sleepDay) ?? [], window, now));
  }

  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' });
  const lines = [
    ['День', 'Дневные сны', 'Бодрствования', 'Дневной', 'Ночной', 'Бодрствование', 'Суточный'],
    ...days.map((day) => [
      date.format(new Date(`${day.sleepDay}T12:00:00Z`)),
      day.naps.map(formatDuration).join(' · '),
      day.wakeWindows.map(formatDuration).join(' · '),
      formatDuration(day.daySleep),
      formatDuration(day.nightSleep),
      formatDuration(day.totalWake),
      formatDuration(day.totalSleep),
    ]),
  ];

  // Сегодняшний день не закончен, поэтому в среднее он не идёт — как и в кабинете.
  const completed = days.filter((day) => day.sleepDay !== today && day.totalSleep > 0);
  const average = averageTotalSleep(completed);
  if (average !== null) {
    lines.push([]);
    lines.push([`Средне-суточный сон за ${completed.length} дн.`, '', '', '', '', '', formatDuration(average)]);
  }

  const csv = '﻿' + lines.map((line) => line.map(cell).join(';')).join('\r\n');
  const fileName = `dnevnik-sna-${child.name.replace(/[^\p{L}\d]+/gu, '-')}-${today}.csv`;

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    },
  });
}
