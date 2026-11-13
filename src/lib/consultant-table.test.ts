import test from "node:test";
import assert from "node:assert/strict";
import {
  diaryColumns,
  periodSummary,
  tableRows,
  diaryPeriod,
  type TableRecord,
} from "./consultant-table";
const window = { dayBoundary: 360, nightFrom: 1140, timeZone: "Europe/Moscow" };
const rec = (
  sleepDay: string,
  start: string,
  end: string | null,
): TableRecord => ({
  sleepDay,
  startedAt: new Date(start + "+03:00"),
  endedAt: end ? new Date(end + "+03:00") : null,
});
const records = [
  rec("2026-11-10", "2026-11-09T21:00", "2026-11-10T07:00"),
  rec("2026-11-10", "2026-11-10T09:00", "2026-11-10T10:00"),
  rec("2026-11-10", "2026-11-10T13:00", "2026-11-10T14:00"),
  rec("2026-11-11", "2026-11-10T21:00", "2026-11-11T07:00"),
];
const now = new Date("2026-11-11T12:00+03:00");
test("night belongs to morning, wake windows align with naps, bedtime closes day", () => {
  const [d] = diaryColumns(["2026-11-10"], records, window, now);
  assert.deepEqual(d.wakes, [120, 180, 420]);
  assert.equal(d.wake, "07:00");
  assert.equal(d.bedtime, "21:00");
  assert.equal(d.total, 720);
  assert.equal(d.complete, true);
  assert.deepEqual(periodSummary([d]), { count: 1, total: 720, average: 720 });
});
test("missing opening night does not shift wake slots or become a complete day", () => {
  const [d] = diaryColumns(["2026-11-10"], records.slice(1), window, now);
  assert.deepEqual(d.wakes, [null, 180, 420]);
  assert.equal(d.total, null);
  assert.equal(d.complete, false);
});
test("ongoing, empty and missing next night are excluded from averages", () => {
  const days = diaryColumns(
    ["2026-11-09", "2026-11-10", "2026-11-11"],
    records,
    window,
    now,
  );
  assert.deepEqual(periodSummary(days), { count: 1, total: 720, average: 720 });
  const ongoing = records.map((r, i) =>
    i === 2 ? { ...r, endedAt: null } : r,
  );
  assert.equal(
    diaryColumns(["2026-11-10"], ongoing, window, now)[0].complete,
    false,
  );
  assert.equal(
    diaryColumns(["2026-11-10"], records.slice(0, -1), window, now)[0].complete,
    false,
  );
});
test("split night does not create daytime wake rows; overlap is excluded", () => {
  const split = [
    rec("2026-11-10", "2026-11-09T21:00", "2026-11-10T02:00"),
    rec("2026-11-10", "2026-11-10T02:15", "2026-11-10T07:00"),
    ...records.slice(1),
  ];
  const [d] = diaryColumns(["2026-11-10"], split, window, now);
  assert.equal(d.night, 585);
  assert.deepEqual(d.wakes, [120, 180, 420]);
  const bad = [
    ...records,
    rec("2026-11-10", "2026-11-10T09:30", "2026-11-10T10:30"),
  ];
  assert.equal(
    diaryColumns(["2026-11-10"], bad, window, now)[0].complete,
    false,
  );
});
test("durations over 24 hours stay durations, not time of day", () => {
  const [d] = diaryColumns(["2026-11-10"], records, window, now);
  assert.equal(periodSummary([d, d, d]).total, 2160);
  assert.equal(
    tableRows([{ ...d, total: 900, awake: 600 }]).at(-1)?.cells[0],
    "25:00",
  );
});
test("date ranges reject invalid dates and cap at 90 days", () => {
  assert.equal(
    diaryPeriod("2026-02-30", undefined, "2026-11-13").dates.length,
    7,
  );
  assert.equal(
    diaryPeriod("2020-01-01", "2026-11-13", "2026-11-13").dates.length,
    7,
  );
  assert.equal(
    diaryPeriod("2026-11-01", "2026-11-07", "2026-11-13").dates.length,
    7,
  );
});
