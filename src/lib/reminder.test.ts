import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderText } from './reminder';
import { clientStats } from './pro-stats';

test('напоминание называет те же дни, что строка «последняя запись N дней назад»', () => {
  assert.match(reminderText('Анна', 3, 30), /^Анна, здравствуйте!.*была 3 дня назад/);
  assert.match(reminderText(null, 4, 30), /^Здравствуйте!.*4 дня назад/);
  assert.match(reminderText(null, 5, 30), /уже 5 дней без записей/);
  assert.match(reminderText(null, 21, 30), /была 21 день назад/);
});

test('тон меняется со сроком: день пропуска — мягко, неделя — просим продолжить, дольше — предлагаем паузу', () => {
  assert.match(reminderText(null, 2, 30), /вчера в дневнике сна не было записей/);
  assert.match(reminderText(null, 7, 30), /Давайте продолжим/);
  assert.match(reminderText(null, 12, 30), /нужна пауза/);
});

test('в тексте нет длинных тире и «ёлочек»: так пишут шаблоны, а не человек в мессенджере', () => {
  const texts = [
    reminderText('Анна', null, 2), reminderText('Анна', null, 8),
    ...[2, 3, 4, 5, 9, 10, 30].map((days) => reminderText('Анна', days, 40)),
  ];
  for (const text of texts) assert.doesNotMatch(text, /[—–«»]/, text);
});

test('ещё не начинала: сначала — получилось ли открыть, потом — сколько дней с подключения', () => {
  assert.match(reminderText(null, null, 2), /дневник сна пока пустой/);
  assert.match(reminderText(null, null, 2, 'girl'), /"Уснула" и "Проснулась"/);
  assert.match(reminderText(null, null, 6), /подключились к дневнику сна 6 дней назад/);
});

test('напоминание появляется ровно тогда, когда для него есть текст про пропуск', () => {
  const now = new Date('2026-09-24T09:00:00Z');
  const base = { childId: 'c', today: '2026-09-24', sleeps: [], grantedAt: new Date('2026-09-01T10:00:00Z') };
  const sleeps = [{ sleepDay: '2026-09-23', minutes: 700 }, { sleepDay: '2026-09-22', minutes: 700 }, { sleepDay: '2026-09-21', minutes: 700 }, { sleepDay: '2026-09-20', minutes: 700 }];
  const yesterday = clientStats({ ...base, sleeps, lastEntryAt: new Date('2026-09-23T10:00:00Z') }, now);
  const dayBefore = clientStats({ ...base, lastEntryAt: new Date('2026-09-22T10:00:00Z') }, now);
  assert.equal(yesterday.status, 'active');
  assert.equal(dayBefore.status, 'quiet');
  assert.match(reminderText(null, dayBefore.silentDays, dayBefore.withUsDays), /вчера в дневнике сна не было записей/);
});
