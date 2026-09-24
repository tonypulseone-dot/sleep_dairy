import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partOfDay } from './day-parts';

test('части суток: утро, день, вечер, ночь', () => {
  assert.equal(partOfDay(6), 'утро');
  assert.equal(partOfDay(12), 'день');
  assert.equal(partOfDay(18), 'вечер');
  assert.equal(partOfDay(0), 'ночь');
  assert.equal(partOfDay(4), 'ночь');
  assert.equal(partOfDay(23), 'ночь');
});
