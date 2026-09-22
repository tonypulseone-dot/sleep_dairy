import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageInMonths, ownWakeWindow, pickNorm, rhythmHint, typicalNapCount, type NormRow } from './rhythm';
import type { DayTotals } from './sleep-day';

const row = (from: number, to: number, naps: number | null, windows: [number, number][]): NormRow => ({
  ageMonthsFrom: from,
  ageMonthsTo: to,
  napsCount: naps,
  wakeWindows: windows.map(([min, max]) => ({ min, max })),
  totalWakeMin: null, totalWakeMax: null,
  daySleepMin: null, daySleepMax: null,
  totalSleepMin: null, totalSleepMax: null,
  note: 'Это ориентиры, а не строгие правила.',
});

const day = (naps: number[], wake: number[]): DayTotals => ({
  sleepDay: '2026-09-18', naps, wakeWindows: wake,
  daySleep: 0, nightSleep: 0, totalSleep: 0, totalWake: 0, napCount: naps.length,
});

test('возраст недоношенного считается от ПДР', () => {
  const now = new Date('2026-09-18T12:00:00Z');
  assert.equal(ageInMonths('2026-03-04', null, now), 6);
  // Родился на два месяца раньше срока — скорректированный возраст меньше.
  assert.equal(ageInMonths('2026-03-04', '2026-05-04', now), 4);
});

test('точная строка возраста побеждает широкую', () => {
  const rows = [row(6, 7, 3, [[135, 150]]), row(7, 7, 3, [[165, 180]])];
  assert.equal(pickNorm(rows, 7, 3)?.ageMonthsFrom, 7);
  assert.equal(pickNorm(rows, 6, 3)?.ageMonthsFrom, 6);
});

test('вариант режима подбирается по числу снов', () => {
  const rows = [row(8, 8, 3, [[165, 180]]), row(8, 8, 2, [[180, 195]])];
  assert.equal(pickNorm(rows, 8, 2)?.napsCount, 2);
  assert.equal(pickNorm(rows, 8, 3)?.napsCount, 3);
});

test('типичное число снов берётся медианой, а не средним', () => {
  assert.equal(typicalNapCount([day([1], [1]), day([1, 1], [1]), day([1, 1], [1])]), 2);
  assert.equal(typicalNapCount([]), null);
});

test('последнее бодрствование дня в среднее не идёт — это отбой', () => {
  // По два окна в дне, последнее отбрасывается: остаются 120, 130, 140.
  const days = [day([1], [120, 600]), day([1], [130, 620]), day([1], [140, 610])];
  assert.equal(ownWakeWindow(days), 130);
});

test('пока окон мало, своего ритма не выдумываем', () => {
  assert.equal(ownWakeWindow([day([1], [120, 600])]), null);
});

test('при своих данных показываем ритм ребёнка, а не норму', () => {
  const days = [day([1], [120, 600]), day([1], [130, 620]), day([1], [140, 610])];
  const hint = rhythmHint(days, [row(6, 6, 2, [[135, 150]])], 6);
  assert.equal(hint?.source, 'own');
  assert.equal(hint?.min, 130);
  assert.equal(hint?.max, 130);
});

test('пока данных нет, берём её таблицу и показываем диапазоном', () => {
  const hint = rhythmHint([], [row(8, 8, 3, [[165, 180], [180, 195], [150, 165]])], 8);
  assert.equal(hint?.source, 'norm');
  assert.equal(hint?.min, 150);
  assert.equal(hint?.max, 195);
  assert.match(hint?.note ?? '', /ориентиры/);
});

test('на неизвестный возраст лучше пусто, чем выдуманная цифра', () => {
  assert.equal(rhythmHint([], [row(8, 8, 3, [[165, 180]])], 24), null);
  assert.equal(rhythmHint([], [], 6), null);
});
