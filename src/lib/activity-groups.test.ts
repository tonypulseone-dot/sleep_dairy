import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickGroup } from './activity-groups';

const groups = [
  { title: '1–2 месяца', ageMonthsFrom: 0, ageMonthsTo: 2 },
  { title: '2–3 месяца', ageMonthsFrom: 2, ageMonthsTo: 4 },
  { title: '4–6 месяцев', ageMonthsFrom: 4, ageMonthsTo: 6 },
  { title: '6–8 месяцев', ageMonthsFrom: 6, ageMonthsTo: 9 },
  { title: '9–13 месяцев', ageMonthsFrom: 9, ageMonthsTo: 14 },
  { title: '1,5–2 года', ageMonthsFrom: 18, ageMonthsTo: 25 },
];
const pick = (months: number) => {
  const result = pickGroup(groups, months);
  return result && `${result.group.title}${result.exact ? '' : ' (ближайшая)'}`;
};

test('возраст внутри группы — её и показываем', () => {
  assert.equal(pick(0), '1–2 месяца');
  assert.equal(pick(3), '2–3 месяца');
  assert.equal(pick(5), '4–6 месяцев');
  assert.equal(pick(6), '6–8 месяцев');
  assert.equal(pick(13), '9–13 месяцев');
  assert.equal(pick(24), '1,5–2 года');
});

test('между группами — ближайшая, при равенстве младшая', () => {
  assert.equal(pick(14), '9–13 месяцев (ближайшая)');
  assert.equal(pick(15), '9–13 месяцев (ближайшая)');
  assert.equal(pick(16), '1,5–2 года (ближайшая)');
  assert.equal(pick(17), '1,5–2 года (ближайшая)');
  assert.equal(pick(30), '1,5–2 года (ближайшая)');
});

test('групп нет — нечего показать', () => {
  assert.equal(pickGroup([], 5), null);
});
