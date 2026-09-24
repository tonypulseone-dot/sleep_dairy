import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate, normalizeTime, parseRecognized, screenshotPrompt } from './import-parse';

const today = '2026-09-24';

test('время: 24 часа, AM/PM, точка вместо двоеточия', () => {
  assert.equal(normalizeTime('9:05'), '09:05');
  assert.equal(normalizeTime('21.40'), '21:40');
  assert.equal(normalizeTime('9:15 PM'), '21:15');
  assert.equal(normalizeTime('12:30 AM'), '00:30');
  assert.equal(normalizeTime('12:10 pm'), '12:10');
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(normalizeTime('13:00 PM'), null);
  assert.equal(normalizeTime(null), null);
});

test('дата: не из будущего и не старше полугода', () => {
  assert.equal(normalizeDate('2026-09-23', today), '2026-09-23');
  assert.equal(normalizeDate('2026-09-25', today), null);
  assert.equal(normalizeDate('2025-01-01', today), null);
  assert.equal(normalizeDate('2026-02-30', today), null);
});

test('разбор ответа: markdown, дубликаты, сны без конца, дата экрана', () => {
  const content = 'Вот что нашлось:\n```json\n' + JSON.stringify({
    date: '2026-09-23',
    times_visible: true,
    sleeps: [
      { date: null, start: '9:30 AM', end: '10:45 AM' },
      { date: '2026-09-23', start: '09:30', end: '10:45' },
      { date: '2026-09-23', start: '20:10', end: '06:40' },
      { date: '2026-09-23', start: '13:00', end: null },
      { date: '2026-09-23', start: 'ночь', end: '07:00' },
    ],
  }) + '\n```';
  const result = parseRecognized(content, today);
  assert.deepEqual(result.sleeps, [
    { date: '2026-09-23', start: '09:30', end: '10:45' },
    { date: '2026-09-23', start: '20:10', end: '06:40' },
  ]);
  assert.equal(result.dropped, 2);
  assert.equal(result.timesVisible, true);
});

test('разбор ответа: только график без цифр и мусор вместо JSON', () => {
  assert.equal(parseRecognized('{"date": null, "times_visible": false, "sleeps": []}', today).timesVisible, false);
  const junk = parseRecognized('Не могу распознать изображение', today);
  assert.deepEqual(junk.sleeps, []);
  assert.equal(junk.timesVisible, false);
});

test('подсказка модели знает сегодняшнюю дату и вчера', () => {
  const prompt = screenshotPrompt(today);
  assert.match(prompt, /Сегодня 2026-09-24, четверг/);
  assert.match(prompt, /«Вчера» — 2026-09-23/);
});
