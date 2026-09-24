import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate, normalizeTime, parseDuration, parseRecognized, screenshotPrompt } from './import-parse';

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

test('дата: не из будущего и не старше двух лет', () => {
  assert.equal(normalizeDate('2026-09-23', today), '2026-09-23');
  assert.equal(normalizeDate('2025-05-25', today), '2025-05-25');
  assert.equal(normalizeDate('2026-09-25', today), null);
  assert.equal(normalizeDate('2024-01-01', today), null);
  assert.equal(normalizeDate('2026-02-30', today), null);
});

test('длительность, как её пишут трекеры', () => {
  assert.equal(parseDuration('9 часов 47 минут'), 587);
  assert.equal(parseDuration('49 минут'), 49);
  assert.equal(parseDuration('1 час 30 минут'), 90);
  assert.equal(parseDuration('2 часа'), 120);
  assert.equal(parseDuration('1ч 16м'), 76);
  assert.equal(parseDuration('10h 14m'), 614);
  assert.equal(parseDuration('1:10'), 70);
  assert.equal(parseDuration('22 мес'), null);
  assert.equal(parseDuration(null), null);
});

/*
 * Скриншот ленты за 25 мая 2025 (приложение, где новое сверху):
 * 11:07–11:43 (36 минут), 14:14–15:44 (1 час 30 минут),
 * 18:38–19:27 (49 минут), 22:22–08:09 «26 мая» (9 часов 47 минут),
 * внизу обрезанный конец прошлой ночи «08:30».
 */
const correct = {
  screen: 'list',
  date: '2025-05-25',
  times_visible: true,
  sleeps: [
    { date: '2025-05-25', start: '22:22', end: '08:09', duration: '9 часов 47 минут' },
    { date: '2025-05-25', start: '18:38', end: '19:27', duration: '49 минут' },
    { date: '2025-05-25', start: '14:14', end: '15:44', duration: '1 час 30 минут' },
    { date: '2025-05-25', start: '11:07', end: '11:43', duration: '36 минут' },
    { date: '2025-05-25', start: null, end: '08:30', duration: null },
  ],
};
const expected = [
  { date: '2025-05-25', start: '11:07', end: '11:43', doubtful: false, stated: 36 },
  { date: '2025-05-25', start: '14:14', end: '15:44', doubtful: false, stated: 90 },
  { date: '2025-05-25', start: '18:38', end: '19:27', doubtful: false, stated: 49 },
  { date: '2025-05-25', start: '22:22', end: '08:09', doubtful: false, stated: 587 },
];

test('лента снизу вверх, прочитанная правильно', () => {
  const result = parseRecognized(JSON.stringify(correct), today);
  assert.deepEqual(result.sleeps, expected);
  assert.equal(result.dropped, 1, 'обрезанная ночь без начала отброшена');
  assert.equal(result.swapped, 0);
});

test('та же лента, прочитанная сверху вниз: начало и конец переставляются по длительности', () => {
  const reversed = {
    ...correct,
    sleeps: [
      // «08:09, 26 мая» над блоком приняли за начало
      { date: '2025-05-26', start: '08:09', end: '22:22', duration: '9 часов 47 минут' },
      { date: '2025-05-25', start: '19:27', end: '18:38', duration: '49 минут' },
      { date: '2025-05-25', start: '15:44', end: '14:14', duration: '1 час 30 минут' },
      { date: '2025-05-25', start: '11:43', end: '11:07', duration: '36 минут' },
    ],
  };
  const result = parseRecognized('```json\n' + JSON.stringify(reversed) + '\n```', today);
  assert.deepEqual(result.sleeps, expected);
  assert.equal(result.swapped, 4);
});

test('ночь переставлена, а дата экрана не видна — начало на день раньше конца', () => {
  const result = parseRecognized(
    JSON.stringify({ screen: 'list', date: null, sleeps: [{ date: '2025-05-26', start: '08:09', end: '22:22', duration: '9ч 47м' }] }),
    today,
  );
  assert.deepEqual(result.sleeps, [{ date: '2025-05-25', start: '22:22', end: '08:09', doubtful: false, stated: 587 }]);
});

test('время не сходится с длительностью ни так, ни наоборот — помечаем «проверьте»', () => {
  const result = parseRecognized(
    JSON.stringify({ screen: 'list', date: '2025-05-26', sleeps: [{ date: '2025-05-26', start: '15:18', end: '16:22', duration: '44 минуты' }] }),
    today,
  );
  assert.equal(result.sleeps[0].doubtful, true);
});

test('экран статистики: итоги по дням без времени снов', () => {
  const result = parseRecognized('{"screen": "stats", "date": null, "times_visible": false, "sleeps": []}', today);
  assert.equal(result.screen, 'stats');
  assert.equal(result.timesVisible, false);
  assert.deepEqual(result.sleeps, []);
});

test('мусор вместо JSON', () => {
  const junk = parseRecognized('Не могу распознать изображение', today);
  assert.deepEqual(junk.sleeps, []);
  assert.equal(junk.timesVisible, false);
});

test('подсказка модели: дата, лента снизу вверх, бодрствование — не сон', () => {
  const prompt = screenshotPrompt(today);
  assert.match(prompt, /Сегодня 2026-09-24, четверг/);
  assert.match(prompt, /«Вчера» — 2026-09-23/);
  assert.match(prompt, /время НАД блоком сна — это конец/);
  assert.match(prompt, /бодрствование, НЕ сон/);
});
