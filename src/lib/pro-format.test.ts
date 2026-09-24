import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageLabel, ageWords, daysAgo, plural } from './pro-format';

const now = new Date('2026-09-24T10:00:00Z');

test('склоняет числа', () => {
  assert.equal(plural(1, 'день', 'дня', 'дней'), 'день');
  assert.equal(plural(3, 'день', 'дня', 'дней'), 'дня');
  assert.equal(plural(11, 'день', 'дня', 'дней'), 'дней');
  assert.equal(plural(22, 'день', 'дня', 'дней'), 'дня');
});

test('малышей младше двух месяцев считает неделями', () => {
  assert.equal(ageWords('2026-08-10', now), '6 недель');
  assert.equal(ageWords('2026-03-24', now), '6 месяцев');
  assert.equal(ageWords('2025-08-24', now), '13 месяцев');
});

test('добавляет скорректированный возраст по ПДР', () => {
  assert.equal(ageLabel('2026-03-01', '2026-04-20', now), '6 месяцев · скорректированный 5 месяцев');
});

test('говорит по-человечески, давно ли была запись', () => {
  assert.equal(daysAgo(0), 'сегодня');
  assert.equal(daysAgo(1), 'вчера');
  assert.equal(daysAgo(5), '5 дней назад');
});
