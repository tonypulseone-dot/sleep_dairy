import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  averageTotalSleep,
  DEFAULT_DAY_BOUNDARY,
  DEFAULT_NIGHT_FROM,
  formatDuration,
  parseTimeOfDay,
  sleepDayOf,
  sleepKindOf,
  summarizeDay,
  type DayWindow,
} from './sleep-day';

const moscow: DayWindow = {
  dayBoundary: DEFAULT_DAY_BOUNDARY,
  nightFrom: DEFAULT_NIGHT_FROM,
  timeZone: 'Europe/Moscow',
};

/** Локальное московское время в Date. МСК круглый год UTC+3. */
const msk = (iso: string) => new Date(`${iso}+03:00`);

test('укладывание в 00:30 относится к предыдущим суткам', () => {
  assert.equal(sleepDayOf(msk('2026-09-17T00:30:00'), moscow), '2026-09-16');
});

test('сон, начавшийся после утренней границы, относится к своим суткам', () => {
  assert.equal(sleepDayOf(msk('2026-09-17T10:00:00'), moscow), '2026-09-17');
});

test('граница ровно в 06:00 уже принадлежит новым суткам', () => {
  assert.equal(sleepDayOf(msk('2026-09-17T06:00:00'), moscow), '2026-09-17');
  assert.equal(sleepDayOf(msk('2026-09-17T05:59:00'), moscow), '2026-09-16');
});

test('ночь определяется по времени начала и перешагивает полночь', () => {
  assert.equal(sleepKindOf(msk('2026-09-16T14:00:00'), moscow), 'day');
  assert.equal(sleepKindOf(msk('2026-09-16T21:10:00'), moscow), 'night');
  assert.equal(sleepKindOf(msk('2026-09-17T00:30:00'), moscow), 'night');
  assert.equal(sleepKindOf(msk('2026-09-17T07:30:00'), moscow), 'day');
});

test('мама сдвинула границы — классификация едет за настройкой', () => {
  const early: DayWindow = { dayBoundary: parseTimeOfDay('04:30'), nightFrom: parseTimeOfDay('18:00'), timeZone: 'Europe/Moscow' };
  assert.equal(sleepDayOf(msk('2026-09-17T05:00:00'), early), '2026-09-17');
  assert.equal(sleepKindOf(msk('2026-09-16T18:30:00'), early), 'night');
});

test('часовой пояс учитывается: во Владивостоке те же сутки считаются иначе', () => {
  const vladivostok: DayWindow = { ...moscow, timeZone: 'Asia/Vladivostok' };
  // 2026-09-16T22:00 UTC — это 17-е 08:00 во Владивостоке и 17-е 01:00 в Москве.
  const at = new Date('2026-09-16T22:00:00Z');
  assert.equal(sleepDayOf(at, vladivostok), '2026-09-17');
  assert.equal(sleepDayOf(at, moscow), '2026-09-16');
});

test('сутки 16 сентября считаются целиком, вместе с ночью после полуночи', () => {
  const totals = summarizeDay(
    '2026-09-16',
    [
      { startedAt: msk('2026-09-16T10:00:00'), endedAt: msk('2026-09-16T11:20:00') },
      { startedAt: msk('2026-09-16T14:00:00'), endedAt: msk('2026-09-16T15:30:00') },
      { startedAt: msk('2026-09-17T00:30:00'), endedAt: msk('2026-09-17T07:00:00') },
    ],
    moscow,
  );

  assert.deepEqual(totals.naps, [80, 90]);
  assert.equal(totals.daySleep, 170);
  assert.equal(totals.nightSleep, 390);
  assert.equal(totals.totalSleep, 560);
  assert.equal(formatDuration(totals.totalSleep), '9:20');
  assert.equal(totals.napCount, 2);
  // Бодрствования между снами: 11:20→14:00 и 15:30→00:30.
  assert.deepEqual(totals.wakeWindows, [160, 540]);
  assert.equal(formatDuration(totals.totalWake), '11:40');
});

test('незакрытый сон считается до текущего момента', () => {
  const now = msk('2026-09-16T10:45:00');
  const totals = summarizeDay(
    '2026-09-16',
    [{ startedAt: msk('2026-09-16T10:00:00'), endedAt: null }],
    moscow,
    now,
  );
  assert.equal(totals.daySleep, 45);
});

test('средне-суточный сон за период', () => {
  const days = [
    { totalSleep: 560 },
    { totalSleep: 775 },
    { totalSleep: 820 },
  ] as Parameters<typeof averageTotalSleep>[0];
  assert.equal(averageTotalSleep(days), 718);
  assert.equal(formatDuration(718), '11:58');
  assert.equal(averageTotalSleep([]), null);
});

test('некорректное время настройки не проходит молча', () => {
  assert.throws(() => parseTimeOfDay('25:00'));
  assert.throws(() => parseTimeOfDay('6:0'));
  assert.equal(parseTimeOfDay('06:30'), 390);
});
