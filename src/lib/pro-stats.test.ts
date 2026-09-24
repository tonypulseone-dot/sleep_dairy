import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageGroups, clientStats, dailyActivity, summarize } from './pro-stats';

const now = new Date('2026-09-24T09:00:00Z'); // 12:00 по Москве
const base = { childId: 'c', today: '2026-09-24', sleeps: [] as { sleepDay: string; minutes: number }[] };

test('статус: записи вчера — ведёт дневник', () => {
  const s = clientStats({ ...base, grantedAt: new Date('2026-09-01T10:00:00Z'), lastEntryAt: new Date('2026-09-23T18:00:00Z') }, now);
  assert.equal(s.status, 'active');
  assert.equal(s.silentDays, 1);
});

test('статус: три дня тишины — пора напомнить', () => {
  const s = clientStats({ ...base, grantedAt: new Date('2026-09-01T10:00:00Z'), lastEntryAt: new Date('2026-09-21T08:00:00Z') }, now);
  assert.equal(s.status, 'quiet');
  assert.equal(s.silentDays, 3);
});

test('статус: только подключилась и ещё не писала — не тревожим', () => {
  const s = clientStats({ ...base, grantedAt: new Date('2026-09-23T15:00:00Z'), lastEntryAt: null }, now);
  assert.equal(s.status, 'new');
  const later = clientStats({ ...base, grantedAt: new Date('2026-09-20T15:00:00Z'), lastEntryAt: null }, now);
  assert.equal(later.status, 'quiet');
});

test('регулярность и динамика сна по неделям', () => {
  const sleeps = [];
  // Прошлая неделя — по 12 часов, эта — по 13; сегодняшние сутки не считаются.
  for (let d = 8; d <= 14; d += 1) sleeps.push({ sleepDay: `2026-09-${String(24 - d).padStart(2, '0')}`, minutes: 720 });
  for (let d = 1; d <= 5; d += 1) sleeps.push({ sleepDay: `2026-09-${String(24 - d).padStart(2, '0')}`, minutes: 780 });
  sleeps.push({ sleepDay: '2026-09-24', minutes: 100 });
  const s = clientStats({ ...base, sleeps, grantedAt: new Date('2026-09-01T10:00:00Z'), lastEntryAt: now }, now);
  assert.equal(s.regularity, 5 / 7);
  assert.equal(s.avgSleep, 780);
  assert.equal(s.trend, 60);
});

test('новенькую не штрафуем за дни до подключения', () => {
  const s = clientStats(
    { ...base, sleeps: [{ sleepDay: '2026-09-23', minutes: 700 }], grantedAt: new Date('2026-09-22T10:00:00Z'), lastEntryAt: now },
    now,
  );
  assert.equal(s.regularity, 1 / 2);
  assert.equal(s.trend, null);
});

test('сводка и активность по дням', () => {
  const a = { ...clientStats({ ...base, grantedAt: new Date('2026-09-20T10:00:00Z'), lastEntryAt: now }, now), grantedAt: new Date('2026-09-20T10:00:00Z') };
  const b = { ...clientStats({ ...base, grantedAt: new Date('2026-08-01T10:00:00Z'), lastEntryAt: new Date('2026-09-10T10:00:00Z') }, now), grantedAt: new Date('2026-08-01T10:00:00Z') };
  const sum = summarize([a, b], [new Date('2026-09-10T10:00:00Z'), new Date('2026-07-01T10:00:00Z')], now);
  assert.equal(sum.total, 2);
  assert.equal(sum.active, 1);
  assert.equal(sum.quiet, 1);
  assert.equal(sum.newThisWeek, 1);
  assert.equal(sum.leftThisMonth, 1);

  const series = dailyActivity(new Map([['a', new Set(['2026-09-24', '2026-09-23'])], ['b', new Set(['2026-09-23'])]]), now, 3);
  assert.deepEqual(series, [
    { date: '2026-09-22', count: 0 },
    { date: '2026-09-23', count: 2 },
    { date: '2026-09-24', count: 1 },
  ]);
});

test('возрастные группы', () => {
  assert.deepEqual(ageGroups([1, 2, 5, 9, 30]).map((g) => g.count), [2, 1, 1, 0, 1]);
});
