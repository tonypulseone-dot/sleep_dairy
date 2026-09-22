import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCandidates, parseStatedDuration, problemCount } from './diary-parse';
import { DEFAULT_DAY_BOUNDARY, DEFAULT_NIGHT_FROM, type DayWindow } from './sleep-day';

const moscow: DayWindow = {
  dayBoundary: DEFAULT_DAY_BOUNDARY,
  nightFrom: DEFAULT_NIGHT_FROM,
  timeZone: 'Europe/Moscow',
};

test('длительность со снимка читается в минутах', () => {
  assert.equal(parseStatedDuration('9 часов 47 минут'), 587);
  assert.equal(parseStatedDuration('10 часов 14 минут'), 614);
  assert.equal(parseStatedDuration('1 час 30 минут'), 90);
  assert.equal(parseStatedDuration('49 минут'), 49);
  assert.equal(parseStatedDuration('2 часа 56 минут'), 176);
  assert.equal(parseStatedDuration(null), null);
  assert.equal(parseStatedDuration('—'), null);
});

test('день со скриншота Виктории разбирается целиком', () => {
  // 25 мая 2025 с её снимка, снизу вверх: два дневных, вечерний и ночной.
  const candidates = buildCandidates(
    [
      { start: '11:07', end: '11:43', statedDuration: '36 минут', kind: 'day' },
      { start: '14:14', end: '15:44', statedDuration: '1 час 30 минут', kind: 'day' },
      { start: '18:38', end: '19:27', statedDuration: '49 минут', kind: 'night' },
      { start: '22:22', end: '08:09', statedDuration: '9 часов 47 минут', kind: 'night' },
    ],
    '2025-05-25',
    moscow,
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.minutes),
    [36, 90, 49, 587],
  );
  assert.equal(problemCount(candidates), 0);
});

test('ночной сон через полночь не схлопывается', () => {
  const [night] = buildCandidates(
    [{ start: '22:22', end: '08:09', statedDuration: '9 часов 47 минут', kind: 'night' }],
    '2025-05-25',
    moscow,
  );
  assert.equal(night.minutes, 587);
  assert.equal(night.kind, 'night');
  assert.equal(night.problem, null);
});

test('значку со снимка не доверяем — тип считаем по настройкам мамы', () => {
  // На её скриншоте сон в 18:38 помечен луной, но при границе ночи 19:00
  // для этой мамы он дневной. Иначе дневник разъедется с её же настройками.
  const [evening] = buildCandidates(
    [{ start: '18:38', end: '19:27', statedDuration: '49 минут', kind: 'night' }],
    '2025-05-25',
    moscow,
  );
  assert.equal(evening.kind, 'day');
});

test('расхождение длительности со временем помечается', () => {
  const [bad] = buildCandidates(
    // Время говорит 36 минут, подпись — 56. Значит что-то прочитано неверно.
    [{ start: '11:07', end: '11:43', statedDuration: '56 минут', kind: 'day' }],
    '2025-05-25',
    moscow,
  );
  assert.equal(bad.problem, 'duration-mismatch');
  assert.equal(bad.statedMinutes, 56);
  assert.equal(bad.minutes, 36);
});

test('минута расхождения — это округление трекера, а не ошибка', () => {
  const [ok] = buildCandidates(
    [{ start: '14:14', end: '15:44', statedDuration: '1 час 31 минута', kind: 'day' }],
    '2025-05-25',
    moscow,
  );
  assert.equal(ok.problem, null);
});

test('нечитаемое время не роняет разбор остальных записей', () => {
  const candidates = buildCandidates(
    [
      { start: '8:oo', end: '09:30', statedDuration: null, kind: 'day' },
      { start: '14:14', end: '15:44', statedDuration: '1 час 30 минут', kind: 'day' },
    ],
    '2025-05-25',
    moscow,
  );
  assert.equal(candidates[0].problem, 'bad-time');
  assert.equal(candidates[1].problem, null);
  assert.equal(problemCount(candidates), 1);
});

test('неправдоподобно длинный сон помечается, а не сохраняется тихо', () => {
  const [tooLong] = buildCandidates(
    [{ start: '09:00', end: '08:00', statedDuration: '23 часа', kind: 'night' }],
    '2025-05-25',
    moscow,
  );
  assert.equal(tooLong.problem, 'too-long');
});
