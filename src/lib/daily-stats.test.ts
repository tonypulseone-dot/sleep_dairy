import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyStats, periodDays, summarizeMetric } from './daily-stats';
import { DEFAULT_DAY_BOUNDARY, DEFAULT_NIGHT_FROM, type DayWindow } from './sleep-day';

const moscow: DayWindow = { dayBoundary: DEFAULT_DAY_BOUNDARY, nightFrom: DEFAULT_NIGHT_FROM, timeZone: 'Europe/Moscow' };
const msk = (iso: string) => new Date(`${iso}+03:00`);
const sleep = (sleepDay: string, from: string, to: string | null) => ({
  sleepDay,
  startedAt: msk(from),
  endedAt: to === null ? null : msk(to),
});

/** Три дня: у каждого ночь, дневные сны и уход в следующую ночь. */
const records = [
  sleep('2026-10-08', '2026-10-07T20:00:00', '2026-10-08T07:00:00'),
  sleep('2026-10-08', '2026-10-08T10:00:00', '2026-10-08T11:30:00'),
  sleep('2026-10-08', '2026-10-08T14:00:00', '2026-10-08T15:30:00'),
  sleep('2026-10-09', '2026-10-08T20:00:00', '2026-10-09T07:00:00'),
  sleep('2026-10-09', '2026-10-09T11:00:00', '2026-10-09T13:00:00'),
  sleep('2026-10-10', '2026-10-09T20:30:00', '2026-10-10T06:30:00'),
  sleep('2026-10-10', '2026-10-10T11:00:00', '2026-10-10T12:00:00'),
];

test('период — сутки по порядку, заканчивая выбранным днём', () => {
  assert.deepEqual(periodDays('2026-10-10', 3), ['2026-10-08', '2026-10-09', '2026-10-10']);
});

test('цифры суток: ночь, дневной, суточный и бодрствование до следующей ночи', () => {
  const days = dailyStats({
    days: ['2026-10-08', '2026-10-09'],
    records,
    window: moscow,
    today: '2026-10-11',
    now: msk('2026-10-11T12:00:00'),
  });
  assert.deepEqual(days[0].values, {
    night: 11 * 60,
    day: 180,
    total: 14 * 60,
    // 07:00→10:00, 11:30→14:00, 15:30→20:00 (уход в ночь 9-го).
    wake: 180 + 150 + 270,
  });
  assert.deepEqual(days[1].values, { night: 11 * 60, day: 120, total: 13 * 60, wake: 240 + 450 });
  assert.ok(days.every((day) => !day.empty && !day.isToday));
});

test('сегодня бодрствование идёт до сих пор, а в среднее и сравнение день не берём', () => {
  const days = dailyStats({
    days: periodDays('2026-10-10', 3),
    records,
    window: moscow,
    today: '2026-10-10',
    now: msk('2026-10-10T15:00:00'),
  });
  const today = days[2];
  assert.equal(today.isToday, true);
  // 06:30→11:00 и 12:00→15:00, пока не уснул.
  assert.equal(today.values.wake, 270 + 180);

  const day = summarizeMetric(days, 'day');
  assert.deepEqual(day.deltas, [null, -60, null]);
  assert.equal(day.average, 150);
  assert.equal(day.min, 120);
  assert.equal(day.max, 180);
});

test('день без записей — пропуск: не ноль в среднем и не сравнение через него', () => {
  const days = dailyStats({
    days: ['2026-10-07', '2026-10-08', '2026-10-09'],
    records,
    window: moscow,
    today: '2026-10-11',
    now: msk('2026-10-11T12:00:00'),
  });
  assert.equal(days[0].empty, true);
  const total = summarizeMetric(days, 'total');
  assert.deepEqual(total.deltas, [null, null, -60]);
  assert.equal(total.average, 810);
});

test('если записей нет совсем, сводки нет', () => {
  const days = dailyStats({ days: ['2026-10-01'], records: [], window: moscow, today: '2026-10-11', now: new Date() });
  const summary = summarizeMetric(days, 'wake');
  assert.equal(summary.average, null);
  assert.deepEqual(summary.deltas, [null]);
});
