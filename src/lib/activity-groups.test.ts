import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forAge, pickGroup } from './activity-groups';

const groups = [
  { title: '0–1 месяц', ageMonthsFrom: 0, ageMonthsTo: 1 },
  { title: '1–2 месяца', ageMonthsFrom: 1, ageMonthsTo: 2 },
  { title: '2–3 месяца', ageMonthsFrom: 2, ageMonthsTo: 4 },
  { title: '4–6 месяцев', ageMonthsFrom: 4, ageMonthsTo: 6 },
  { title: '6–8 месяцев', ageMonthsFrom: 6, ageMonthsTo: 9 },
  { title: '9–13 месяцев', ageMonthsFrom: 9, ageMonthsTo: 14 },
  { title: '1,5–2 года', ageMonthsFrom: 18, ageMonthsTo: 24 },
  { title: '2–3 года', ageMonthsFrom: 24, ageMonthsTo: 36 },
];
const pick = (months: number) => {
  const result = pickGroup(groups, months);
  return result && `${result.group.title}${result.exact ? '' : ' (ближайшая)'}`;
};

test('возраст внутри группы — её и показываем', () => {
  assert.equal(pick(0), '0–1 месяц');
  assert.equal(pick(1), '1–2 месяца');
  assert.equal(pick(3), '2–3 месяца');
  assert.equal(pick(5), '4–6 месяцев');
  assert.equal(pick(6), '6–8 месяцев');
  assert.equal(pick(13), '9–13 месяцев');
  assert.equal(pick(23), '1,5–2 года');
  assert.equal(pick(24), '2–3 года');
  assert.equal(pick(35), '2–3 года');
});

test('между группами — ближайшая, при равенстве младшая', () => {
  assert.equal(pick(14), '9–13 месяцев (ближайшая)');
  assert.equal(pick(15), '9–13 месяцев (ближайшая)');
  assert.equal(pick(16), '1,5–2 года (ближайшая)');
  assert.equal(pick(17), '1,5–2 года (ближайшая)');
  assert.equal(pick(40), '2–3 года (ближайшая)');
});

test('групп нет — нечего показать', () => {
  assert.equal(pickGroup([], 5), null);
});

test('«Занятия для …» — в родительном падеже', () => {
  assert.equal(forAge('0–1 месяц'), '0–1 месяца');
  assert.equal(forAge('1–2 месяца'), '1–2 месяцев');
  assert.equal(forAge('4–6 месяцев'), '4–6 месяцев');
  assert.equal(forAge('1,5–2 года'), '1,5–2 лет');
  assert.equal(forAge('2–3 года'), '2–3 лет');
});
