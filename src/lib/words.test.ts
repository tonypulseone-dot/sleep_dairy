import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childWords } from './words';

test('девочка: «уснула», «проснулась»', () => {
  const w = childWords('girl');
  assert.equal(w.fellAsleep, 'Уснула');
  assert.equal(w.wokeUp, 'Проснулась');
  assert.equal(w.born, 'Родилась');
});

test('мальчик и не указано: мужской род, как о «малыше»', () => {
  for (const sex of ['boy', null, undefined] as const) {
    assert.equal(childWords(sex).fellAsleep, 'Уснул');
    assert.equal(childWords(sex).wokeUp, 'Проснулся');
  }
});
