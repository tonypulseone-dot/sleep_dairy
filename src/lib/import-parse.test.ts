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

/*
 * Приложение с карточками: «Сон 18:00 - 18:46», метки «ДС: 45м 18с»
 * (длительность), «ВБ: 2ч 23м 32с» (бодрствование перед сном); у ночи
 * общая длительность «10ч 1м 16с» и части «ДС» и «НС».
 */
test('карточки с ДС/НС/ВБ и секундами', () => {
  const result = parseRecognized(
    JSON.stringify({
      screen: 'list',
      date: '2026-08-01',
      sleeps: [
        { date: '2026-08-01', start: '20:27', end: '06:30', duration: '10ч 1м 16с' },
        { date: '2026-08-01', start: '18:00', end: '18:46', duration: 'ДС: 45м 18с' },
        { date: '2026-08-01', start: '14:33', end: '15:37', duration: 'ДС: 1ч 3м 38с' },
        { date: '2026-08-01', start: '11:40', end: '12:15', duration: '35м 32с' },
      ],
    }),
    today,
  );
  assert.deepEqual(
    result.sleeps.map((sleep) => `${sleep.start}–${sleep.end}${sleep.doubtful ? ' ?' : ''}`),
    ['11:40–12:15', '14:33–15:37', '18:00–18:46', '20:27–06:30'],
  );
  assert.equal(parseDuration('ДС: 45м 18с'), 45);
  assert.equal(parseDuration('10ч 1м 16с'), 601);
});

test('если нейросеть взяла у ночи только НС — строка помечается «проверьте»', () => {
  const result = parseRecognized(
    JSON.stringify({ screen: 'list', date: '2026-08-01', sleeps: [{ date: '2026-08-01', start: '20:27', end: '06:30', duration: 'НС: 9ч 29м 7с' }] }),
    today,
  );
  assert.equal(result.sleeps[0].doubtful, true);
});

test('график-полоски по часам: снов нет, экран — график', () => {
  const result = parseRecognized('{"screen": "chart", "date": null, "times_visible": false, "sleeps": []}', today);
  assert.equal(result.screen, 'chart');
  assert.equal(result.timesVisible, false);
});

test('подсказка модели: ДС/НС/ВБ и графики', () => {
  const prompt = screenshotPrompt(today);
  assert.match(prompt, /ДС \(дневной сон\), НС \(ночной сон\), ВБ \(бодрствование\)/);
  assert.match(prompt, /НЕ оценивай время по положению полосок/);
});

/*
 * PDF-выгрузка Baby Soma: группы по датам, внутри — по возрастанию, ночь
 * первой («Ночной сон 20:49 - 05:51 … 9 ч 2 м»): это ночь, закончившаяся
 * утром даты группы.
 */
test('Baby Soma: ночь перед утренними снами начиналась накануне', () => {
  const result = parseRecognized(
    JSON.stringify({
      screen: 'list',
      date: null,
      sleeps: [
        { date: '2026-08-08', start: '20:49', end: '05:51', duration: '9 ч 2 м' },
        { date: '2026-08-08', start: '07:32', end: '09:41', duration: '2 ч 9 м' },
        { date: '2026-08-08', start: '12:13', end: '12:43', duration: '0 ч 30 м' },
        { date: '2026-08-08', start: '15:05', end: '15:45', duration: '0 ч 40 м' },
        { date: '2026-08-07', start: '20:35', end: '07:36', duration: '11 ч 0 м' },
        { date: '2026-08-07', start: '09:25', end: '10:49', duration: '1 ч 24 м' },
        { date: '2026-08-07', start: '13:13', end: '14:13', duration: '1 ч 0 м' },
        { date: '2026-08-07', start: '16:44', end: '17:34', duration: '0 ч 50 м' },
      ],
    }),
    today,
  );
  const nights = result.sleeps.filter((sleep) => sleep.start > sleep.end);
  assert.deepEqual(nights.map((night) => `${night.date} ${night.start}`), ['2026-08-06 20:35', '2026-08-07 20:49']);
  assert.equal(result.sleeps.filter((sleep) => sleep.doubtful).length, 0);
});

test('карточки «от новых к старым»: ночь сверху группы 03.08 началась 3-го', () => {
  const result = parseRecognized(
    JSON.stringify({
      screen: 'list',
      date: '2026-08-03',
      sleeps: [
        { date: '2026-08-03', start: '20:20', end: '05:41', duration: '9ч 21м 4с' },
        { date: '2026-08-03', start: '18:18', end: '18:56', duration: 'ДС: 36м 20с' },
        { date: '2026-08-03', start: '15:07', end: '15:50', duration: 'ДС: 43м 26с' },
        { date: '2026-08-03', start: '11:15', end: '12:34', duration: 'ДС: 1ч 18м 15с' },
        { date: '2026-08-03', start: '08:19', end: '09:02', duration: 'ДС: 43м 57с' },
      ],
    }),
    today,
  );
  assert.equal(result.sleeps.find((sleep) => sleep.start === '20:20')?.date, '2026-08-03');
  assert.equal(result.sleeps.filter((sleep) => sleep.doubtful).length, 0);
});

test('если нейросеть сама поставила ночи Baby Soma вчерашнюю дату — второй раз не сдвигаем', () => {
  const result = parseRecognized(
    JSON.stringify({
      screen: 'list',
      date: null,
      sleeps: [
        { date: '2026-08-07', start: '20:49', end: '05:51', duration: '9 ч 2 м' },
        { date: '2026-08-08', start: '07:32', end: '09:41', duration: '2 ч 9 м' },
        { date: '2026-08-08', start: '12:13', end: '12:43', duration: '0 ч 30 м' },
      ],
    }),
    today,
  );
  assert.equal(result.sleeps.find((sleep) => sleep.start === '20:49')?.date, '2026-08-07');
});
