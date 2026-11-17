'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  addCalendarDays,
  countCalendarDaysInclusive,
  getCalendarMonthRange,
  shiftCalendarMonth,
  shiftCalendarYear,
  getCalendarYearRange,
  validateCalendarDateRange,
  filterEntriesByDateRange,
  calculatePeriodStatistics,
  comparePeriodStatistics,
  buildTrendSeries,
  buildTrendSeriesForRange,
  buildMonthComparisonSeries,
  buildYearComparisonSeries,
  buildAggregatedYearSeries,
  buildAggregatedYearComparisonSeries,
  buildCalendarMonth,
} = require('./helpers.js').loadContext();

function entry(date, mood, sleep, water) {
  return { date, mood, sleep, water };
}

test('calendar month ranges cover January, December, and all month lengths', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(getCalendarMonthRange(2025, 0))), {
    startDate: '2025-01-01', endDate: '2025-01-31', dayCount: 31,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(getCalendarMonthRange(2025, 1))), {
    startDate: '2025-02-01', endDate: '2025-02-28', dayCount: 28,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(getCalendarMonthRange(2024, 1))), {
    startDate: '2024-02-01', endDate: '2024-02-29', dayCount: 29,
  });
  assert.equal(getCalendarMonthRange(2025, 3).dayCount, 30);
  assert.equal(getCalendarMonthRange(2025, 11).endDate, '2025-12-31');
});

test('calendar year ranges cover leap years and inclusive boundaries', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(getCalendarYearRange(2024))), {
    startDate: '2024-01-01', endDate: '2024-12-31', dayCount: 366,
  });
  assert.equal(getCalendarYearRange(2025).dayCount, 365);
  const range = getCalendarYearRange(2024);
  assert.equal(countCalendarDaysInclusive(range.startDate, range.endDate), range.dayCount);
  assert.equal(validateCalendarDateRange(range.startDate, range.endDate).dayCount, 366);
});

test('calendar ranges preserve years 0000 through 0099 without Date constructor offsets', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(getCalendarMonthRange(0, 1))), {
    startDate: '0000-02-01', endDate: '0000-02-29', dayCount: 29,
  });
  assert.equal(getCalendarYearRange(1).startDate, '0001-01-01');
  assert.equal(getCalendarYearRange(99).endDate, '0099-12-31');
  assert.equal(getCalendarYearRange(4).dayCount, 366);
});

test('calendar boundary helpers reject invalid years and month indices', () => {
  const rangeError = error => error.name === 'RangeError';
  assert.throws(() => getCalendarMonthRange(-1, 0), rangeError);
  assert.throws(() => getCalendarMonthRange(10000, 0), rangeError);
  assert.throws(() => getCalendarYearRange(2024.5), rangeError);
  assert.throws(() => getCalendarMonthRange(2024, -1), rangeError);
  assert.throws(() => getCalendarMonthRange(2024, 12), rangeError);
  assert.throws(() => getCalendarMonthRange(2024, 1.2), rangeError);
});

test('shiftCalendarMonth crosses years without producing unsupported month keys', () => {
  assert.equal(shiftCalendarMonth('2026-11', 1), '2026-12');
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftCalendarMonth('2027-01', -1), '2026-12');
  assert.equal(shiftCalendarMonth('0001-01', -1), '0000-12');
  assert.equal(shiftCalendarMonth('0000-01', -1), null);
  assert.equal(shiftCalendarMonth('9999-12', 1), null);
  assert.equal(shiftCalendarMonth('0099-12', 1), '0100-01');
  assert.throws(() => shiftCalendarMonth('2024-13', 1), error => error.name === 'RangeError');
  assert.throws(() => shiftCalendarMonth('2024-02', 0.5), error => error.name === 'RangeError');
});

test('shiftCalendarYear preserves leading zeroes and supported boundaries', () => {
  assert.equal(shiftCalendarYear('2026', -1), '2025');
  assert.equal(shiftCalendarYear('0099', 1), '0100');
  assert.equal(shiftCalendarYear('0001', -1), '0000');
  assert.equal(shiftCalendarYear('0000', -1), null);
  assert.equal(shiftCalendarYear('9999', 1), null);
  assert.throws(() => shiftCalendarYear('20x4', 1), error => error.name === 'RangeError');
  assert.throws(() => shiftCalendarYear('2024', 0.5), error => error.name === 'RangeError');
});

test('calendar boundary helpers do not mutate their input values', () => {
  const year = 2024;
  const monthIndex = 1;
  const result = getCalendarMonthRange(year, monthIndex);
  assert.equal(year, 2024);
  assert.equal(monthIndex, 1);
  assert.equal(result.startDate, '2024-02-01');
});

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

test('calendar date ranges are inclusive across month, year, leap-year, and DST boundaries', () => {
  assert.equal(countCalendarDaysInclusive('2024-02-28', '2024-03-01'), 3);
  assert.equal(countCalendarDaysInclusive('2025-12-31', '2026-01-01'), 2);
  assert.equal(countCalendarDaysInclusive('0001-12-31', '0002-01-01'), 2);
  assert.equal(countCalendarDaysInclusive('2025-03-29', '2025-03-31'), 3);
  assert.equal(countCalendarDaysInclusive('2025-10-25', '2025-10-27'), 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(validateCalendarDateRange('2025-06-10', '2025-06-12'))),
    { ok: true, startDate: '2025-06-10', endDate: '2025-06-12', dayCount: 3 }
  );
});

test('calendar date range validation rejects missing, invalid, reversed, and over-limit ranges', () => {
  assert.equal(validateCalendarDateRange('', '2025-06-12').ok, false);
  assert.equal(validateCalendarDateRange('2025-02-30', '2025-03-01').ok, false);
  assert.match(validateCalendarDateRange('2025-06-12', '2025-06-10').error, /on or after/);
  assert.equal(validateCalendarDateRange('2025-01-01', '2025-01-03', { maximumDays: 2 }).ok, false);
  assert.equal(validateCalendarDateRange('2025-01-01', '2025-01-03', { maximumDays: 3 }).ok, true);
  assert.equal(validateCalendarDateRange('2025-01-01', '2025-01-01', { maximumDays: 0 }).ok, false);
});

test('calendar date range validation allows very long and future intervals without a maximum', () => {
  const result = validateCalendarDateRange('1900-01-01', '2500-12-31');
  assert.equal(result.ok, true);
  assert.ok(result.dayCount > 200000);
  assert.equal(result.endDate, '2500-12-31');
});

test('filterEntriesByDateRange includes boundaries, sorts newest-first, preserves zeroes, and does not mutate', () => {
  const entries = [
    entry('2025-06-13', 5, 8, 2.2),
    entry('2025-06-10', 1, 0, 0),
    entry('2025-06-12', 3, 6.5, 1.5),
    entry('2025-06-09', 2, 7, 1),
  ];
  const original = JSON.stringify(entries);
  const filtered = filterEntriesByDateRange(entries, '2025-06-10', '2025-06-12');

  assert.deepEqual(filtered.map(candidate => candidate.date), ['2025-06-12', '2025-06-10']);
  assert.equal(filtered[1].sleep, 0);
  assert.equal(filtered[1].water, 0);
  assert.notEqual(filtered, entries);
  assert.equal(JSON.stringify(entries), original);
  assert.deepEqual(filterEntriesByDateRange(entries, '2026-01-01', '2026-01-02'), []);
  assert.throws(
    () => filterEntriesByDateRange(entries, '2025-06-12', '2025-06-10'),
    error => error.name === 'RangeError'
  );
});

test('calculatePeriodStatistics uses inclusive recorded observations for all metrics without rounding', () => {
  const entries = [
    entry('2024-03-01', 3, 6, 1),
    entry('2024-02-29', 5, 0, 0),
    entry('2024-02-28', 1, 8, 2),
    entry('2024-02-27', 4, 7, 1.5),
  ];
  const original = JSON.stringify(entries);
  const statistics = calculatePeriodStatistics(entries, '2024-02-28', '2024-03-01');

  assert.deepEqual(JSON.parse(JSON.stringify(statistics)), {
    startDate: '2024-02-28',
    endDate: '2024-03-01',
    recordedDayCount: 3,
    calendarDayCount: 3,
    metrics: {
      mood: { average: 3, minimum: 1, maximum: 5 },
      sleep: { average: 14 / 3, minimum: 0, maximum: 8 },
      water: { average: 1, minimum: 0, maximum: 2 },
    },
  });
  assert.equal(statistics.metrics.sleep.average, 14 / 3);
  assert.equal(JSON.stringify(entries), original);
});

test('calculatePeriodStatistics distinguishes empty, missing, and single-observation periods', () => {
  const entries = [entry('2025-01-15', 4, 0, 0)];
  const empty = calculatePeriodStatistics(entries, '2025-01-01', '2025-01-14');
  assert.deepEqual(JSON.parse(JSON.stringify(empty)), {
    startDate: '2025-01-01',
    endDate: '2025-01-14',
    recordedDayCount: 0,
    calendarDayCount: 14,
    metrics: {
      mood: { average: null, minimum: null, maximum: null },
      sleep: { average: null, minimum: null, maximum: null },
      water: { average: null, minimum: null, maximum: null },
    },
  });

  const single = calculatePeriodStatistics(entries, '2025-01-15', '2025-01-15');
  assert.equal(single.recordedDayCount, 1);
  assert.equal(single.calendarDayCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(single.metrics)), {
    mood: { average: 4, minimum: 4, maximum: 4 },
    sleep: { average: 0, minimum: 0, maximum: 0 },
    water: { average: 0, minimum: 0, maximum: 0 },
  });
});

test('calculatePeriodStatistics supports leap days and supported calendar-year boundaries', () => {
  const lowYear = calculatePeriodStatistics(
    [entry('0000-02-29', 2, 6, 1)], '0000-02-28', '0000-03-01'
  );
  assert.equal(lowYear.calendarDayCount, 3);
  assert.equal(lowYear.recordedDayCount, 1);
  assert.equal(lowYear.metrics.mood.average, 2);

  const earlyYear = calculatePeriodStatistics(
    [entry('0099-02-28', 3, 7, 1.5)], '0099-02-28', '0099-03-01'
  );
  assert.equal(earlyYear.calendarDayCount, 2);
  assert.equal(earlyYear.metrics.sleep.maximum, 7);

  const upperYear = calculatePeriodStatistics(
    [entry('9999-12-31', 5, 8, 2.5)], '9999-12-31', '9999-12-31'
  );
  assert.equal(upperYear.calendarDayCount, 1);
  assert.equal(upperYear.metrics.water.average, 2.5);
});

test('calculatePeriodStatistics rejects invalid and reversed ranges', () => {
  const entries = [entry('2025-01-01', 3, 6, 1)];
  assert.throws(
    () => calculatePeriodStatistics(entries, '2025-02-30', '2025-03-01'),
    error => error.name === 'RangeError'
  );
  assert.throws(
    () => calculatePeriodStatistics(entries, '2025-01-02', '2025-01-01'),
    error => error.name === 'RangeError' && /on or after/.test(error.message)
  );
});

test('comparePeriodStatistics reports second-minus-first differences without treating empty periods as zero', () => {
  const entries = [
    entry('2024-01-01', 1, 0, 0),
    entry('2024-01-02', 3, 4, 1),
    entry('2024-02-01', 4, 8, 2),
    entry('2024-02-03', 2, 2, 0),
  ];
  const original = JSON.stringify(entries);
  const firstRange = { startDate: '2024-01-01', endDate: '2024-01-02' };
  const secondRange = { startDate: '2024-02-01', endDate: '2024-02-03' };
  const comparison = comparePeriodStatistics(entries, firstRange, secondRange);

  assert.equal(comparison.firstPeriod.calendarDayCount, 2);
  assert.equal(comparison.secondPeriod.calendarDayCount, 3);
  assert.equal(comparison.firstPeriod.recordedDayCount, 2);
  assert.equal(comparison.secondPeriod.recordedDayCount, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.differences)), {
    recordedDayCount: 0,
    metrics: {
      mood: { average: 1 },
      sleep: { average: 3 },
      water: { average: 0.5 },
    },
  });
  const reversed = comparePeriodStatistics(entries, secondRange, firstRange);
  assert.deepEqual(JSON.parse(JSON.stringify(reversed.differences)), {
    recordedDayCount: 0,
    metrics: {
      mood: { average: -1 },
      sleep: { average: -3 },
      water: { average: -0.5 },
    },
  });
  const same = comparePeriodStatistics(entries, firstRange, firstRange);
  assert.deepEqual(JSON.parse(JSON.stringify(same.differences)), {
    recordedDayCount: 0,
    metrics: {
      mood: { average: 0 },
      sleep: { average: 0 },
      water: { average: 0 },
    },
  });
  const emptyComparison = comparePeriodStatistics(entries, {
    startDate: '2024-03-01', endDate: '2024-03-02',
  }, secondRange);
  assert.equal(emptyComparison.differences.recordedDayCount, 2);
  assert.equal(emptyComparison.differences.metrics.mood.average, null);
  assert.equal(emptyComparison.differences.metrics.sleep.average, null);
  assert.equal(emptyComparison.differences.metrics.water.average, null);
  const bothEmpty = comparePeriodStatistics(entries, {
    startDate: '2024-03-01', endDate: '2024-03-02',
  }, {
    startDate: '2024-04-01', endDate: '2024-04-02',
  });
  assert.equal(bothEmpty.differences.recordedDayCount, 0);
  assert.equal(bothEmpty.differences.metrics.mood.average, null);
  assert.equal(JSON.stringify(entries), original);
});

test('comparePeriodStatistics validates both range objects and matches monthly aggregation averages', () => {
  const entries = [
    entry('2024-01-01', 2, 0, 0),
    entry('2024-01-07', 4, 8, 2),
    entry('2024-02-29', 5, 3, 1),
  ];
  const january = { startDate: '2024-01-01', endDate: '2024-01-31' };
  const february = { startDate: '2024-02-01', endDate: '2024-02-29' };
  const comparison = comparePeriodStatistics(entries, january, february);
  const moodMonths = buildAggregatedYearSeries(entries, 'mood', 2024, 'monthly');
  const sleepMonths = buildAggregatedYearSeries(entries, 'sleep', 2024, 'monthly');
  const waterMonths = buildAggregatedYearSeries(entries, 'water', 2024, 'monthly');

  assert.equal(comparison.firstPeriod.metrics.mood.average, moodMonths.points[0].value);
  assert.equal(comparison.secondPeriod.metrics.mood.average, moodMonths.points[1].value);
  assert.equal(comparison.firstPeriod.metrics.sleep.average, sleepMonths.points[0].value);
  assert.equal(comparison.secondPeriod.metrics.sleep.average, sleepMonths.points[1].value);
  assert.equal(comparison.firstPeriod.metrics.water.average, waterMonths.points[0].value);
  assert.equal(comparison.secondPeriod.metrics.water.average, waterMonths.points[1].value);
  assert.throws(
    () => comparePeriodStatistics(entries, null, february),
    error => error.name === 'RangeError' && /First period/.test(error.message)
  );
  assert.throws(
    () => comparePeriodStatistics(entries, january, {
      startDate: '2024-02-30', endDate: '2024-02-31',
    }),
    error => error.name === 'RangeError'
  );
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

test('buildTrendSeriesForRange supports historical ranges, gaps, zeroes, and does not mutate inputs', () => {
  const entries = [
    entry('2020-01-03', 4, 7.5, 2),
    entry('2020-01-01', 1, 0, 0),
    entry('2020-01-05', 5, 8, 2.5),
  ];
  const original = JSON.stringify(entries);
  const series = buildTrendSeriesForRange(entries, 'water', '2020-01-01', '2020-01-05');

  assert.equal(series.dayCount, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(series.points)), [
    { date: '2020-01-01', value: 0 },
    { date: '2020-01-02', value: null },
    { date: '2020-01-03', value: 2 },
    { date: '2020-01-04', value: null },
    { date: '2020-01-05', value: 2.5 },
  ]);
  assert.equal(JSON.stringify(entries), original);
  assert.throws(
    () => buildTrendSeriesForRange(entries, 'mood', '2020-01-05', '2020-01-01'),
    error => error.name === 'RangeError'
  );
});

test('month comparisons align day numbers across different month lengths and preserve zeroes', () => {
  const entries = [
    entry('2025-02-28', 5, 8, 1.2),
    entry('2024-02-29', 2, 6, 0),
    entry('2024-02-01', 3, 7, 2),
  ];
  const periods = [{ year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }];
  const originalEntries = JSON.stringify(entries);
  const originalPeriods = JSON.stringify(periods);
  const series = buildMonthComparisonSeries(entries, 'water', periods[0], periods[1]);

  assert.equal(series.metric, 'water');
  assert.equal(series.alignment, 'day-of-month');
  assert.equal(series.points.length, 29);
  assert.deepEqual(JSON.parse(JSON.stringify(series.points[0])), {
    key: '01', label: '1',
    firstDate: '2024-02-01', secondDate: '2025-02-01',
    firstValue: 2, secondValue: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(series.points[27])), {
    key: '28', label: '28',
    firstDate: '2024-02-28', secondDate: '2025-02-28',
    firstValue: null, secondValue: 1.2,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(series.points[28])), {
    key: '29', label: '29',
    firstDate: '2024-02-29', secondDate: null,
    firstValue: 0, secondValue: null,
  });
  assert.equal(JSON.stringify(entries), originalEntries);
  assert.equal(JSON.stringify(periods), originalPeriods);
});

test('month comparisons retain full January and December boundaries and support identical periods', () => {
  const entries = [entry('2024-01-31', 4, 7, 2), entry('2025-12-31', 2, 6, 1)];
  const boundarySeries = buildMonthComparisonSeries(
    entries, 'mood', { year: 2024, monthIndex: 0 }, { year: 2025, monthIndex: 11 }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(boundarySeries.points.at(-1))), {
    key: '31', label: '31',
    firstDate: '2024-01-31', secondDate: '2025-12-31',
    firstValue: 4, secondValue: 2,
  });

  const samePeriod = buildMonthComparisonSeries(
    entries, 'mood', { year: 2024, monthIndex: 0 }, { year: 2024, monthIndex: 0 }
  );
  const finalDay = samePeriod.points.at(-1);
  assert.equal(finalDay.firstDate, '2024-01-31');
  assert.equal(finalDay.secondDate, '2024-01-31');
  assert.equal(finalDay.firstValue, 4);
  assert.equal(finalDay.secondValue, 4);
});

test('year comparisons align by month and day without shifting March after February 29', () => {
  const entries = [
    entry('2025-03-01', 2, 6, 1),
    entry('2024-03-01', 4, 8, 2),
    entry('2024-02-29', 1, 0, 0),
  ];
  const series = buildYearComparisonSeries(entries, 'water', 2024, 2025);
  const leapDay = series.points.find(point => point.key === '02-29');
  const marchFirst = series.points.find(point => point.key === '03-01');
  const februaryTwentyEighth = series.points.find(point => point.key === '02-28');

  assert.equal(series.metric, 'water');
  assert.equal(series.alignment, 'month-day');
  assert.equal(series.points.length, 366);
  assert.deepEqual(JSON.parse(JSON.stringify(leapDay)), {
    key: '02-29', label: '02-29',
    firstDate: '2024-02-29', secondDate: null,
    firstValue: 0, secondValue: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(marchFirst)), {
    key: '03-01', label: '03-01',
    firstDate: '2024-03-01', secondDate: '2025-03-01',
    firstValue: 2, secondValue: 1,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(februaryTwentyEighth)), {
    key: '02-28', label: '02-28',
    firstDate: '2024-02-28', secondDate: '2025-02-28',
    firstValue: null, secondValue: null,
  });
});

test('year comparisons support matching and low-numbered years without mutating inputs', () => {
  const entries = [
    entry('0000-02-29', 2, 6, 0),
    entry('0004-12-31', 5, 8, 3),
    entry('0099-12-31', 1, 4, 0),
  ];
  const original = JSON.stringify(entries);
  const sameYear = buildYearComparisonSeries(entries, 'mood', 4, 4);
  const lowYears = buildYearComparisonSeries(entries, 'water', 4, 99);

  assert.equal(sameYear.points.length, 366);
  const matchingFinalDay = sameYear.points.at(-1);
  assert.equal(matchingFinalDay.firstDate, '0004-12-31');
  assert.equal(matchingFinalDay.secondDate, '0004-12-31');
  assert.equal(matchingFinalDay.firstValue, 5);
  assert.equal(matchingFinalDay.secondValue, 5);
  const lowYearFinalDay = lowYears.points.at(-1);
  assert.equal(lowYearFinalDay.firstDate, '0004-12-31');
  assert.equal(lowYearFinalDay.secondDate, '0099-12-31');
  assert.equal(lowYearFinalDay.secondValue, 0);
  const zeroYear = buildYearComparisonSeries(entries, 'water', 0, 99);
  const zeroYearLeapDay = zeroYear.points.find(point => point.key === '02-29');
  assert.equal(zeroYearLeapDay.firstDate, '0000-02-29');
  assert.equal(zeroYearLeapDay.secondDate, null);
  assert.equal(zeroYearLeapDay.firstValue, 0);
  assert.equal(JSON.stringify(entries), original);
});

test('single-year weekly aggregation starts January 1 and preserves partial Week 53 blocks', () => {
  const entries = [
    entry('2024-12-31', 4, 0, 2),
    entry('2024-01-07', 3, 4, 1),
    entry('2024-12-30', 2, 6, 0),
    entry('2024-01-01', 2, 0, 0),
    entry('2024-01-03', 5, 1, 3),
  ];
  const original = JSON.stringify(entries);
  const leap = buildAggregatedYearSeries(entries, 'sleep', 2024, 'weekly');
  const common = buildAggregatedYearSeries([], 'sleep', 2025, 'weekly');

  assert.equal(leap.metric, 'sleep');
  assert.equal(leap.year, 2024);
  assert.equal(leap.resolution, 'weekly');
  assert.equal(leap.points.length, 53);
  assert.deepEqual(JSON.parse(JSON.stringify(leap.points[0])), {
    key: '01',
    label: 'Week 1',
    startDate: '2024-01-01',
    endDate: '2024-01-07',
    value: 5 / 3,
    recordedDayCount: 3,
    calendarDayCount: 7,
  });
  assert.equal(leap.points[1].value, null);
  assert.equal(leap.points[1].recordedDayCount, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(leap.points[52])), {
    key: '53',
    label: 'Week 53',
    startDate: '2024-12-30',
    endDate: '2024-12-31',
    value: 3,
    recordedDayCount: 2,
    calendarDayCount: 2,
  });
  assert.equal(common.points.length, 53);
  assert.equal(common.points[52].startDate, '2025-12-31');
  assert.equal(common.points[52].endDate, '2025-12-31');
  assert.equal(common.points[52].calendarDayCount, 1);
  assert.equal(common.points[52].value, null);
  assert.equal(JSON.stringify(entries), original);
});

test('single-year monthly aggregation returns all months with leap boundaries, gaps, and zeroes', () => {
  const entries = [
    entry('2024-04-30', 3, 7, 0),
    entry('2024-02-29', 4, 8, 2),
    entry('2024-02-01', 2, 6, 0),
  ];
  const original = JSON.stringify(entries);
  const series = buildAggregatedYearSeries(entries, 'water', 2024, 'monthly');

  assert.equal(series.points.length, 12);
  assert.deepEqual(
    JSON.parse(JSON.stringify(series.points.map(point => point.label))),
    [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
  );
  assert.equal(series.points[0].startDate, '2024-01-01');
  assert.equal(series.points[0].endDate, '2024-01-31');
  assert.equal(series.points[1].startDate, '2024-02-01');
  assert.equal(series.points[1].endDate, '2024-02-29');
  assert.equal(series.points[1].calendarDayCount, 29);
  assert.equal(series.points[1].recordedDayCount, 2);
  assert.equal(series.points[1].value, 1);
  assert.equal(series.points[2].value, null);
  assert.equal(series.points[2].recordedDayCount, 0);
  assert.equal(series.points[3].value, 0);
  assert.equal(series.points[3].recordedDayCount, 1);
  assert.equal(series.points[11].endDate, '2024-12-31');
  assert.equal(JSON.stringify(entries), original);
});

test('single-year aggregation validates inputs and supports years 0000 through 0099', () => {
  const entries = [
    entry('0099-12-31', 1, 4, 0),
    entry('0000-02-29', 5, 8, 2),
  ];
  const zeroYear = buildAggregatedYearSeries(entries, 'water', 0, 'monthly');
  const yearNinetyNine = buildAggregatedYearSeries(entries, 'sleep', 99, 'weekly');
  const rangeError = error => error.name === 'RangeError';

  assert.equal(zeroYear.year, 0);
  assert.equal(zeroYear.points[1].endDate, '0000-02-29');
  assert.equal(zeroYear.points[1].calendarDayCount, 29);
  assert.equal(zeroYear.points[1].value, 2);
  assert.equal(yearNinetyNine.points[52].startDate, '0099-12-31');
  assert.equal(yearNinetyNine.points[52].value, 4);
  assert.equal(yearNinetyNine.points[52].calendarDayCount, 1);
  assert.throws(() => buildAggregatedYearSeries([], 'weight', 2024, 'weekly'), rangeError);
  assert.throws(() => buildAggregatedYearSeries([], 'mood', -1, 'weekly'), rangeError);
  assert.throws(() => buildAggregatedYearSeries([], 'mood', 10_000, 'monthly'), rangeError);
  assert.throws(() => buildAggregatedYearSeries([], 'mood', 2024.5, 'monthly'), rangeError);
  assert.throws(() => buildAggregatedYearSeries([], 'mood', 2024, 'daily'), rangeError);
});

test('single-year aggregated points remain consistent with comparison aggregation fields', () => {
  const entries = [
    entry('2025-07-04', 3, 0, 0),
    entry('2024-01-02', 1, 5, 1),
    entry('2024-01-01', 5, 7, 3),
  ];
  const original = JSON.stringify(entries);

  ['weekly', 'monthly'].forEach(function (resolution) {
    const first = buildAggregatedYearSeries(entries, 'mood', 2024, resolution);
    const second = buildAggregatedYearSeries(entries, 'mood', 2025, resolution);
    const comparison = buildAggregatedYearComparisonSeries(
      entries, 'mood', 2024, 2025, resolution
    );

    comparison.points.forEach(function (point, index) {
      assert.equal(point.key, first.points[index].key);
      assert.equal(point.label, first.points[index].label);
      assert.equal(point.firstStartDate, first.points[index].startDate);
      assert.equal(point.firstEndDate, first.points[index].endDate);
      assert.equal(point.firstValue, first.points[index].value);
      assert.equal(point.firstRecordedDayCount, first.points[index].recordedDayCount);
      assert.equal(point.firstCalendarDayCount, first.points[index].calendarDayCount);
      assert.equal(point.secondStartDate, second.points[index].startDate);
      assert.equal(point.secondEndDate, second.points[index].endDate);
      assert.equal(point.secondValue, second.points[index].value);
      assert.equal(point.secondRecordedDayCount, second.points[index].recordedDayCount);
      assert.equal(point.secondCalendarDayCount, second.points[index].calendarDayCount);
    });
  });

  assert.equal(JSON.stringify(entries), original);
});

test('aggregated weekly comparisons start on January 1 and include partial Week 53 blocks', () => {
  const entries = [
    entry('2024-01-01', 1, 0, 0),
    entry('2024-01-07', 3, 8, 2),
    entry('2024-12-30', 2, 6, 1),
    entry('2024-12-31', 0, 4, 0),
    entry('2025-01-01', 4, 7, 2),
    entry('2025-12-31', 5, 9, 3),
  ];
  const series = buildAggregatedYearComparisonSeries(entries, 'mood', 2024, 2025, 'weekly');

  assert.equal(series.metric, 'mood');
  assert.equal(series.resolution, 'weekly');
  assert.equal(series.points.length, 53);
  assert.deepEqual(JSON.parse(JSON.stringify(series.points[0])), {
    key: '01', label: 'Week 1',
    firstStartDate: '2024-01-01', firstEndDate: '2024-01-07',
    secondStartDate: '2025-01-01', secondEndDate: '2025-01-07',
    firstValue: 2, secondValue: 4,
    firstRecordedDayCount: 2, secondRecordedDayCount: 1,
    firstCalendarDayCount: 7, secondCalendarDayCount: 7,
  });
  const final = series.points[52];
  assert.equal(final.firstStartDate, '2024-12-30');
  assert.equal(final.firstEndDate, '2024-12-31');
  assert.equal(final.secondStartDate, '2025-12-31');
  assert.equal(final.secondEndDate, '2025-12-31');
  assert.equal(final.firstValue, 1);
  assert.equal(final.firstRecordedDayCount, 2);
  assert.equal(final.firstCalendarDayCount, 2);
  assert.equal(final.secondValue, 5);
  assert.equal(final.secondCalendarDayCount, 1);
});

test('aggregated monthly comparisons average recorded values, including zero, without rounding', () => {
  const entries = [
    entry('2024-02-01', 1, 0, 0),
    entry('2024-02-29', 1, 3, 2),
    entry('2025-02-15', 1, 2, 1),
    entry('2024-04-30', 1, 1, 0),
  ];
  const original = JSON.stringify(entries);
  const series = buildAggregatedYearComparisonSeries(entries, 'sleep', 2024, 2025, 'monthly');
  const february = series.points[1];
  const march = series.points[2];
  const april = series.points[3];

  assert.equal(series.points.length, 12);
  assert.equal(february.label, 'February');
  assert.equal(february.firstValue, 1.5);
  assert.equal(february.firstRecordedDayCount, 2);
  assert.equal(february.firstCalendarDayCount, 29);
  assert.equal(february.secondValue, 2);
  assert.equal(february.secondRecordedDayCount, 1);
  assert.equal(february.secondCalendarDayCount, 28);
  assert.equal(march.firstValue, null);
  assert.equal(march.secondValue, null);
  assert.equal(march.firstRecordedDayCount, 0);
  assert.equal(march.secondRecordedDayCount, 0);
  assert.equal(april.firstStartDate, '2024-04-01');
  assert.equal(april.firstEndDate, '2024-04-30');
  assert.equal(JSON.stringify(entries), original);
});

test('aggregated comparisons preserve zeros, unsorted input, low years, and calendar consistency', () => {
  const entries = [
    entry('0099-12-31', 1, 4, 0),
    entry('0000-01-01', 5, 0, 0),
    entry('0000-01-07', 1, 8, 2),
  ];
  const original = JSON.stringify(entries);
  const weekly = buildAggregatedYearComparisonSeries(entries, 'water', 0, 99, 'weekly');
  const monthly = buildAggregatedYearComparisonSeries(entries, 'sleep', 0, 99, 'monthly');

  assert.equal(weekly.points[0].firstValue, 1);
  assert.equal(weekly.points[0].firstRecordedDayCount, 2);
  assert.equal(monthly.points[0].firstValue, 4);
  assert.equal(monthly.points[0].firstRecordedDayCount, 2);
  assert.equal(monthly.points[0].firstCalendarDayCount, 31);
  assert.equal(monthly.points[11].secondValue, 4);
  assert.equal(monthly.points[11].secondRecordedDayCount, 1);
  assert.equal(JSON.stringify(entries), original);
});

test('comparison helpers reject invalid metrics and periods', () => {
  const rangeError = error => error.name === 'RangeError';
  assert.throws(
    () => buildMonthComparisonSeries([], 'weight', { year: 2024, monthIndex: 0 }, { year: 2024, monthIndex: 1 }),
    rangeError
  );
  assert.throws(
    () => buildMonthComparisonSeries([], 'mood', null, { year: 2024, monthIndex: 1 }),
    rangeError
  );
  assert.throws(
    () => buildMonthComparisonSeries([], 'mood', { year: 2024, monthIndex: 12 }, { year: 2024, monthIndex: 1 }),
    rangeError
  );
  assert.throws(() => buildYearComparisonSeries([], 'mood', -1, 2024), rangeError);
  assert.throws(() => buildYearComparisonSeries([], 'mood', 2024, 10_000), rangeError);
  assert.throws(() => buildAggregatedYearComparisonSeries([], 'weight', 2024, 2025, 'weekly'), rangeError);
  assert.throws(() => buildAggregatedYearComparisonSeries([], 'mood', -1, 2025, 'monthly'), rangeError);
  assert.throws(() => buildAggregatedYearComparisonSeries([], 'mood', 2024, 2025, 'daily'), rangeError);
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
