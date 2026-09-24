import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepNight } from './theme';

const window = { dayBoundary: 6 * 60, timeZone: 'Europe/Moscow' };

test('глубокая ночь — от полуночи до утренней границы', () => {
  assert.equal(isDeepNight(window, new Date('2026-09-24T00:10:00+03:00')), true);
  assert.equal(isDeepNight(window, new Date('2026-09-24T05:59:00+03:00')), true);
  assert.equal(isDeepNight(window, new Date('2026-09-24T06:00:00+03:00')), false);
  assert.equal(isDeepNight(window, new Date('2026-09-23T23:30:00+03:00')), false);
});
