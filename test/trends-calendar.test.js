'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  addCalendarDays,
  buildTrendSeries,
  buildCalendarMonth,
} = require('./helpers.js').loadContext();

function entry(date, mood, sleep, water) {
  return { date, mood, sleep, water };
}

test('addCalendarDays crosses month, year, and leap-day boundaries locally', () => {
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addCalendarDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addCalendarDays('2025-01-01', -1), '2024-12-31');
});

test('addCalendarDays preserves local calendar arithmetic across DST-adjacent dates', () => {
  assert.equal(addCalendarDays('2025-03-29', 1), '2025-03-30');
  assert.equal(addCalendarDays('2025-03-30', 1), '2025-03-31');
  assert.equal(addCalendarDays('2025-10-25', 1), '2025-10-26');
  assert.equal(addCalendarDays('2025-10-26', 1), '2025-10-27');
});

test('buildTrendSeries creates an inclusive chronological seven-day range with gaps', () => {
  const entries = [
    entry('2025-06-14', 4, 7.5, 2.1),
    entry('2025-06-10', 2, 6, 1.2),
    entry('2025-06-12', 5, 8, 2.5),
  ];
  const result = buildTrendSeries(entries, 'mood', 7, '2025-06-14');

  assert.equal(result.startDate, '2025-06-08');
  assert.equal(result.endDate, '2025-06-14');
  assert.deepEqual(JSON.parse(JSON.stringify(result.points)), [
    { date: '2025-06-08', value: null },
    { date: '2025-06-09', value: null },
    { date: '2025-06-10', value: 2 },
    { date: '2025-06-11', value: null },
    { date: '2025-06-12', value: 5 },
    { date: '2025-06-13', value: null },
    { date: '2025-06-14', value: 4 },
  ]);
});

test('buildTrendSeries preserves explicit zero values and selects the requested metric', () => {
  const entries = [entry('2025-06-14', 1, 0, 0)];
  const sleep = buildTrendSeries(entries, 'sleep', 7, '2025-06-14');
  const water = buildTrendSeries(entries, 'water', 7, '2025-06-14');

  assert.equal(sleep.points.at(-1).value, 0);
  assert.equal(water.points.at(-1).value, 0);
});

test('buildTrendSeries supports inclusive thirty- and ninety-day calendar ranges', () => {
  const thirty = buildTrendSeries([], 'sleep', 30, '2025-03-01');
  const ninety = buildTrendSeries([], 'water', 90, '2025-05-31');

  assert.equal(thirty.points.length, 30);
  assert.equal(thirty.startDate, '2025-01-31');
  assert.equal(thirty.points.at(-1).date, '2025-03-01');
  assert.equal(ninety.points.length, 90);
  assert.equal(ninety.startDate, '2025-03-03');
  assert.equal(ninety.points.at(-1).date, '2025-05-31');
  assert.ok(ninety.points.every(point => point.value === null));
});

test('buildTrendSeries excludes entries outside its selected interval without mutating input', () => {
  const entries = [
    entry('2025-06-07', 1, 5, 1),
    entry('2025-06-10', 2, 6, 1.5),
    entry('2025-06-15', 5, 9, 3),
  ];
  const original = JSON.stringify(entries);
  const result = buildTrendSeries(entries, 'mood', 7, '2025-06-14');

  assert.equal(result.points.find(point => point.date === '2025-06-10').value, 2);
  assert.equal(result.points.some(point => point.date === '2025-06-07'), false);
  assert.equal(result.points.some(point => point.date === '2025-06-15'), false);
  assert.equal(JSON.stringify(entries), original);
});

test('buildTrendSeries rejects unsupported metrics and periods', () => {
  assert.throws(
    () => buildTrendSeries([], 'weight', 7, '2025-06-14'),
    error => error.name === 'RangeError'
  );
  assert.throws(
    () => buildTrendSeries([], 'mood', 14, '2025-06-14'),
    error => error.name === 'RangeError'
  );
});

test('buildCalendarMonth uses Monday-first offsets and preserves entry associations', () => {
  const savedEntry = entry('2025-09-01', 4, 7.5, 2.1); // Monday
  const month = buildCalendarMonth([savedEntry], 2025, 8);

  assert.equal(month.weekdayOffset, 0);
  assert.equal(month.days.length, 30);
  assert.equal(month.days[0].date, '2025-09-01');
  assert.equal(month.days[0].hasEntry, true);
  assert.equal(month.days[0].entry, savedEntry);
  assert.equal(month.days[1].hasEntry, false);
  assert.equal(month.days[1].entry, null);
});

test('buildCalendarMonth gives a Sunday-starting month the Monday-first offset of six', () => {
  const month = buildCalendarMonth([], 2025, 5); // June 2025 began on Sunday.
  assert.equal(month.weekdayOffset, 6);
  assert.equal(month.days[0].date, '2025-06-01');
});

test('buildCalendarMonth handles February in leap and common years and does not mutate entries', () => {
  const entries = [entry('2024-02-29', 3, 7, 2)];
  const original = JSON.stringify(entries);
  const leapFebruary = buildCalendarMonth(entries, 2024, 1);
  const commonFebruary = buildCalendarMonth(entries, 2025, 1);

  assert.equal(leapFebruary.days.length, 29);
  assert.equal(leapFebruary.days.at(-1).date, '2024-02-29');
  assert.equal(leapFebruary.days.at(-1).hasEntry, true);
  assert.equal(commonFebruary.days.length, 28);
  assert.equal(JSON.stringify(entries), original);
});

test('buildCalendarMonth returns an empty-entry month with every date represented', () => {
  const month = buildCalendarMonth([], 2026, 0);
  assert.equal(month.days.length, 31);
  assert.equal(month.days[0].date, '2026-01-01');
  assert.equal(month.days.at(-1).date, '2026-01-31');
  assert.ok(month.days.every(day => day.hasEntry === false && day.entry === null));
});
