import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  averageTotalSleep,
  composeSleep,
  daySegments,
  DEFAULT_DAY_BOUNDARY,
  DEFAULT_NIGHT_FROM,
  durationMinutes,
  formatDuration,
  localDate,
  parseTimeOfDay,
  sleepDayOf,
  sleepKindOf,
  summarizeDay,
  sleepDayFor,
  openingNight,
  currentSleepDay,
  latestAt,
  zonedTimeToUtc,
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

test('сутки 16 сентября: ночь, закончившаяся утром 16-го, дневные сны и бодрствование до следующей ночи', () => {
  const totals = summarizeDay(
    '2026-09-16',
    [
      { startedAt: msk('2026-09-15T21:00:00'), endedAt: msk('2026-09-16T07:00:00') },
      { startedAt: msk('2026-09-16T10:00:00'), endedAt: msk('2026-09-16T11:20:00') },
      { startedAt: msk('2026-09-16T14:00:00'), endedAt: msk('2026-09-16T15:30:00') },
    ],
    moscow,
    msk('2026-09-17T09:00:00'),
    msk('2026-09-16T20:30:00'),
  );

  assert.deepEqual(totals.naps, [80, 90]);
  assert.equal(totals.daySleep, 170);
  assert.equal(totals.nightSleep, 600);
  assert.equal(formatDuration(totals.totalSleep), '12:50');
  assert.equal(totals.napCount, 2);
  // С утра 07:00→10:00, между снами 11:20→14:00, перед ночью 15:30→20:30.
  assert.deepEqual(totals.wakeWindows, [180, 160]);
  assert.equal(totals.eveningWake, 300);
  assert.equal(formatDuration(totals.totalWake), '10:40');
  // Сон + бодрствование = сутки от начала ночи до следующей ночи.
  assert.equal(totals.totalSleep + totals.totalWake, 23.5 * 60);
});

test('итог бодрствования: 5:18 с утра + 6:35 перед ночью = 11:53', () => {
  const totals = summarizeDay(
    '2026-09-17',
    [
      { startedAt: msk('2026-09-16T21:00:00'), endedAt: msk('2026-09-17T07:00:00') },
      { startedAt: msk('2026-09-17T12:18:00'), endedAt: msk('2026-09-17T13:30:00') },
    ],
    moscow,
    msk('2026-09-17T22:00:00'),
    msk('2026-09-17T20:05:00'),
  );
  assert.deepEqual(totals.wakeWindows, [5 * 60 + 18]);
  assert.equal(totals.eveningWake, 6 * 60 + 35);
  assert.equal(totals.totalWake, 11 * 60 + 53);
});

test('ночное пробуждение между кусками ночи — не бодрствование дня', () => {
  const totals = summarizeDay(
    '2026-09-17',
    [
      { startedAt: msk('2026-09-16T21:00:00'), endedAt: msk('2026-09-17T02:00:00') },
      { startedAt: msk('2026-09-17T02:40:00'), endedAt: msk('2026-09-17T07:00:00') },
      { startedAt: msk('2026-09-17T10:00:00'), endedAt: msk('2026-09-17T11:00:00') },
    ],
    moscow,
    msk('2026-09-17T12:00:00'),
  );
  assert.equal(totals.nightSleep, 5 * 60 + 260);
  assert.deepEqual(totals.wakeWindows, [180]);
  assert.equal(totals.eveningWake, null);
  assert.equal(totals.totalWake, 180);
});

test('ночь относится к суткам, в которые закончилась, дневной сон — к суткам начала', () => {
  assert.equal(sleepDayFor(msk('2026-09-26T21:00:00'), moscow, msk('2026-09-27T07:00:00')), '2026-09-27');
  assert.equal(sleepDayFor(msk('2026-09-27T00:30:00'), moscow, msk('2026-09-27T07:00:00')), '2026-09-27');
  // Уложили в 18:40, до «ночи», но проспал до утра — ночь 27-го.
  assert.equal(sleepDayFor(msk('2026-09-26T18:40:00'), moscow, msk('2026-09-27T06:30:00')), '2026-09-27');
  // Идущая ночь (конец неизвестен) — уже в следующих сутках.
  assert.equal(sleepDayFor(msk('2026-09-26T21:00:00'), moscow), '2026-09-27');
  assert.equal(sleepDayFor(msk('2026-09-27T12:00:00'), moscow, msk('2026-09-27T13:30:00')), '2026-09-27');
});

test('начало ночи, которой открываются сутки', () => {
  const night = { startedAt: msk('2026-09-26T21:00:00'), endedAt: msk('2026-09-27T07:00:00') };
  const nap = { startedAt: msk('2026-09-27T10:00:00'), endedAt: msk('2026-09-27T11:00:00') };
  assert.deepEqual(openingNight([nap, night], moscow), night.startedAt);
  assert.equal(openingNight([nap], moscow), null);
  assert.equal(openingNight([], moscow), null);
});

test('сегодняшние сутки: по утренней границе, но ранний подъём после ночи уже открыл новые', () => {
  assert.equal(currentSleepDay(msk('2026-09-28T05:30:00'), moscow), '2026-09-27');
  assert.equal(currentSleepDay(msk('2026-09-28T05:30:00'), moscow, '2026-09-28'), '2026-09-28');
  assert.equal(currentSleepDay(msk('2026-09-27T23:00:00'), moscow, '2026-09-27'), '2026-09-27');
});

test('идущий сон начался в последний раз, когда на часах было это время', () => {
  const now = msk('2026-09-27T01:10:00');
  assert.deepEqual(latestAt(parseTimeOfDay('21:30'), moscow, now), msk('2026-09-26T21:30:00'));
  assert.deepEqual(latestAt(parseTimeOfDay('00:40'), moscow, now), msk('2026-09-27T00:40:00'));
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

test('местное время превращается в момент с учётом зоны', () => {
  assert.equal(
    zonedTimeToUtc('2026-09-16', parseTimeOfDay('14:00'), 'Europe/Moscow').toISOString(),
    '2026-09-16T11:00:00.000Z',
  );
  assert.equal(
    zonedTimeToUtc('2026-09-16', parseTimeOfDay('14:00'), 'Asia/Vladivostok').toISOString(),
    '2026-09-16T04:00:00.000Z',
  );
});

test('дневной сон задним числом собирается в тот же календарный день', () => {
  const { startedAt, endedAt } = composeSleep(
    '2026-09-16',
    parseTimeOfDay('14:00'),
    parseTimeOfDay('15:30'),
    moscow,
  );
  assert.equal(sleepDayOf(startedAt, moscow), '2026-09-16');
  assert.equal(durationMinutes(startedAt, endedAt), 90);
});

test('ночь в сутках 17-го, начатая после полуночи, — это утро 17-го', () => {
  const { startedAt, endedAt } = composeSleep(
    '2026-09-17',
    parseTimeOfDay('00:30'),
    parseTimeOfDay('07:00'),
    moscow,
  );
  assert.equal(localDate(startedAt, 'Europe/Moscow'), '2026-09-17');
  assert.equal(sleepKindOf(startedAt, moscow), 'night');
  assert.equal(sleepDayFor(startedAt, moscow, endedAt), '2026-09-17');
  assert.equal(formatDuration(durationMinutes(startedAt, endedAt)), '6:30');
});

test('ночь в сутках 17-го, начатая вечером, — ночь с 16 на 17', () => {
  const { startedAt, endedAt } = composeSleep(
    '2026-09-17',
    parseTimeOfDay('21:10'),
    parseTimeOfDay('06:50'),
    moscow,
  );
  assert.deepEqual(startedAt, msk('2026-09-16T21:10:00'));
  assert.deepEqual(endedAt, msk('2026-09-17T06:50:00'));
  assert.equal(sleepDayFor(startedAt, moscow, endedAt), '2026-09-17');
  assert.equal(formatDuration(durationMinutes(startedAt, endedAt)), '9:40');
});

test('уложили до «ночи», проспал до утра: в сутках 17-го это ночь с 16 на 17', () => {
  const { startedAt, endedAt } = composeSleep('2026-09-17', parseTimeOfDay('18:40'), parseTimeOfDay('06:30'), moscow);
  assert.deepEqual(startedAt, msk('2026-09-16T18:40:00'));
  assert.equal(sleepDayFor(startedAt, moscow, endedAt), '2026-09-17');
});

test('сны раскладываются по кругу от утренней границы', () => {
  const segments = daySegments(
    '2026-09-16',
    [
      { startedAt: msk('2026-09-16T10:00:00'), endedAt: msk('2026-09-16T11:20:00') },
      { startedAt: msk('2026-09-17T00:30:00'), endedAt: msk('2026-09-17T07:00:00') },
    ],
    moscow,
  );

  // Утро в 06:00, значит сон в 10:00 начинается на 240-й минуте круга.
  assert.deepEqual(segments[0], { from: 240, to: 320, kind: 'day', ongoing: false });
  // Ночь с 00:30 — это 1110-я минута суток; конец подрезан по границе круга.
  assert.equal(segments[1].from, 1110);
  assert.equal(segments[1].to, 1440);
  assert.equal(segments[1].kind, 'night');
});

test('идущий сон доходит до текущего момента', () => {
  const segments = daySegments(
    '2026-09-16',
    [{ startedAt: msk('2026-09-16T14:00:00'), endedAt: null }],
    moscow,
    msk('2026-09-16T14:45:00'),
  );
  assert.deepEqual(segments[0], { from: 480, to: 525, kind: 'day', ongoing: true });
});

test('сон нулевой длины на круге не рисуется', () => {
  const segments = daySegments(
    '2026-09-16',
    [{ startedAt: msk('2026-09-16T10:00:00'), endedAt: msk('2026-09-16T10:00:00') }],
    moscow,
  );
  assert.equal(segments.length, 0);
});

test('сон, проспанный до утра, — ночной, даже если уложили до «ночи»', () => {
  const w = { dayBoundary: 360, nightFrom: 1140, timeZone: 'Europe/Moscow' };
  // 18:40 → 06:30 по Москве: начался днём, но перешёл утреннюю границу.
  const start = new Date('2026-09-23T15:40:00Z');
  assert.equal(sleepKindOf(start, w), 'day');
  assert.equal(sleepKindOf(start, w, new Date('2026-09-24T03:30:00Z')), 'night');
  // Вечерний сон 18:40 → 19:20 остаётся дневным.
  assert.equal(sleepKindOf(start, w, new Date('2026-09-23T16:20:00Z')), 'day');
  // 21:00 → 08:30 — ночной по началу.
  assert.equal(sleepKindOf(new Date('2026-09-23T18:00:00Z'), w, new Date('2026-09-24T05:30:00Z')), 'night');
});
