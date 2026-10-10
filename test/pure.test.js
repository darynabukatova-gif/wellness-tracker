/**
 * test/pure.test.js
 *
 * Automated tests for the seven pure functions extracted from index.html:
 *
 *   localDateString       — formats a Date as "YYYY-MM-DD" in local time
 *   isValidStep           — checks whether a value is an exact multiple of a step
 *   isValidEntryShape     — validates a single stored entry object
 *   validateStoredEntries — validates an entire array loaded from localStorage
 *   validateEntry         — validates raw form values before saving
 *   sortByDateDesc        — sorts entries newest-first without mutating input
 *   calcSummary           — computes averages over the seven most-recent entries
 *
 * Run with:
 *   ~/.nvm/versions/node/v24.21.0/bin/node --test test/pure.test.js
 *
 * CROSS-REALM NOTE
 *   Functions and objects returned from loadContext() live in a vm realm.
 *   Use Array.isArray() instead of instanceof Array.
 *   deepStrictEqual from node:assert/strict works correctly across realms.
 */

'use strict';

const { test }    = require('node:test');
const assert      = require('node:assert/strict');
const { loadContext } = require('./helpers.js');

/* ═══════════════════════════════════════════════════════════════════════════
   1. localDateString
   ═══════════════════════════════════════════════════════════════════════════ */

test('localDateString — returns a string in YYYY-MM-DD format', function () {
  const { localDateString } = loadContext();
  const result = localDateString(new Date('2025-06-15T00:00:00'));
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

test('localDateString — zero-pads single-digit month', function () {
  const { localDateString } = loadContext();
  // March = month 3 → should appear as "03"
  const d = new Date('2025-03-05T00:00:00');
  const result = localDateString(d);
  assert.equal(result.slice(5, 7), '03');
});

test('localDateString — zero-pads single-digit day', function () {
  const { localDateString } = loadContext();
  const d = new Date('2025-11-07T00:00:00');
  const result = localDateString(d);
  assert.equal(result.slice(8, 10), '07');
});

test('localDateString — is timezone-safe (local date matches construction date)', function () {
  // Build the Date in local time using the year/month/day constructor so there
  // is no UTC-vs-local ambiguity.  The function must return the same date we
  // used to build it.
  const { localDateString } = loadContext();
  const d = new Date(2025, 5, 15);  // June 15 2025, local midnight
  const result = localDateString(d);
  const expected = '2025-' + String(6).padStart(2, '0') + '-' + String(15).padStart(2, '0');
  assert.equal(result, expected);
});

test('localDateString — round-trip: result parses back to the same local date', function () {
  const { localDateString } = loadContext();
  const d = new Date(2024, 0, 1);  // 1 Jan 2024, local midnight
  const str = localDateString(d);
  const reparsed = new Date(str + 'T00:00:00');
  assert.equal(localDateString(reparsed), str);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. isValidStep
   ═══════════════════════════════════════════════════════════════════════════ */

// ── step = 0.5 ───────────────────────────────────────────────────────────────

test('isValidStep — step 0.5: integer 6 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(6, 0.5), true);
});

test('isValidStep — step 0.5: half-step 6.5 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(6.5, 0.5), true);
});

test('isValidStep — step 0.5: boundary 24 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(24, 0.5), true);
});

test('isValidStep — step 0.5: boundary 0 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(0, 0.5), true);
});

test('isValidStep — step 0.5: 6.3 is invalid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(6.3, 0.5), false);
});

test('isValidStep — step 0.5: 6.25 is invalid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(6.25, 0.5), false);
});

// ── step = 0.1 ───────────────────────────────────────────────────────────────

test('isValidStep — step 0.1: 0 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(0, 0.1), true);
});

test('isValidStep — step 0.1: 1.1 is valid (floating-point-safe)', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(1.1, 0.1), true);
});

test('isValidStep — step 0.1: 2.3 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(2.3, 0.1), true);
});

test('isValidStep — step 0.1: 3 is valid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(3, 0.1), true);
});

test('isValidStep — step 0.1: 1.15 is invalid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(1.15, 0.1), false);
});

test('isValidStep — step 0.1: 2.25 is invalid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(2.25, 0.1), false);
});

test('isValidStep — step 0.1: 0.05 is invalid', function () {
  const { isValidStep } = loadContext();
  assert.equal(isValidStep(0.05, 0.1), false);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. isValidEntryShape
   ═══════════════════════════════════════════════════════════════════════════ */

test('isValidEntryShape — complete valid entry returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }), true);
});

test('isValidEntryShape — null returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape(null), false);
});

test('isValidEntryShape — string returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape('entry'), false);
});

test('isValidEntryShape — number returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape(42), false);
});

test('isValidEntryShape — missing date field returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ mood: 3, sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — missing mood field returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — missing sleep field returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, water: 1.5 }), false);
});

test('isValidEntryShape — missing water field returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 6 }), false);
});

test('isValidEntryShape — wrong type for date (number) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: 20250610, mood: 3, sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — wrong type for mood (string) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: '3', sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — wrong type for sleep (string) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: '7', water: 1.5 }), false);
});

test('isValidEntryShape — wrong type for water (string) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 7, water: '1.5' }), false);
});

test('isValidEntryShape — mood below range (0) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 0, sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — mood above range (6) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 6, sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — mood boundary low (1) returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 1, sleep: 6, water: 1.5 }), true);
});

test('isValidEntryShape — mood boundary high (5) returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 5, sleep: 6, water: 1.5 }), true);
});

test('isValidEntryShape — sleep above range (25) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 25, water: 1.5 }), false);
});

test('isValidEntryShape — sleep boundary 0 returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 0, water: 1.5 }), true);
});

test('isValidEntryShape — sleep boundary 24 returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 24, water: 1.5 }), true);
});

test('isValidEntryShape — invalid sleep step (6.3) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 6.3, water: 1.5 }), false);
});

test('isValidEntryShape — water above range (3.1) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 6, water: 3.1 }), false);
});

test('isValidEntryShape — water boundary 0 returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 6, water: 0 }), true);
});

test('isValidEntryShape — water boundary 3 returns true', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 6, water: 3 }), true);
});

test('isValidEntryShape — invalid water step (1.15) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-06-10', mood: 3, sleep: 6, water: 1.15 }), false);
});

test('isValidEntryShape — impossible date 2025-02-30 returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '2025-02-30', mood: 3, sleep: 6, water: 1.5 }), false);
});

test('isValidEntryShape — date with wrong format (DD/MM/YYYY) returns false', function () {
  const { isValidEntryShape } = loadContext();
  assert.equal(isValidEntryShape({ date: '10/06/2025', mood: 3, sleep: 6, water: 1.5 }), false);
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. validateStoredEntries
   ═══════════════════════════════════════════════════════════════════════════ */

test('validateStoredEntries — empty array returns null (no error)', function () {
  const { validateStoredEntries } = loadContext();
  assert.equal(validateStoredEntries([]), null);
});

test('validateStoredEntries — valid array of entries returns null', function () {
  const { validateStoredEntries } = loadContext();
  const arr = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6.0, water: 1.8 },
  ];
  assert.equal(validateStoredEntries(arr), null);
});

test('validateStoredEntries — malformed first entry returns error for position 1', function () {
  const { validateStoredEntries } = loadContext();
  const arr = [
    { date: '2025-06-10', mood: 9, sleep: 7.5, water: 2.1 },  // mood out of range
  ];
  assert.equal(
    validateStoredEntries(arr),
    'Stored entry at position 1 is malformed. The saved data may be corrupted.'
  );
});

test('validateStoredEntries — malformed second entry returns error for position 2', function () {
  const { validateStoredEntries } = loadContext();
  const arr = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 99,  water: 1.8 }, // sleep out of range
  ];
  assert.equal(
    validateStoredEntries(arr),
    'Stored entry at position 2 is malformed. The saved data may be corrupted.'
  );
});

test('validateStoredEntries — malformed third entry returns error for position 3', function () {
  const { validateStoredEntries } = loadContext();
  const arr = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6.0, water: 1.8 },
    null,
  ];
  assert.equal(
    validateStoredEntries(arr),
    'Stored entry at position 3 is malformed. The saved data may be corrupted.'
  );
});

test('validateStoredEntries — duplicate dates returns duplicate-date error', function () {
  const { validateStoredEntries } = loadContext();
  const arr = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-10', mood: 3, sleep: 6.0, water: 1.8 },
  ];
  assert.equal(
    validateStoredEntries(arr),
    'Duplicate date found in stored data: 2025-06-10. The saved data may be corrupted.'
  );
});

test('validateStoredEntries — malformed entry is reported before duplicate check', function () {
  // Position 1 is malformed AND the dates are duplicated; shape error should win.
  const { validateStoredEntries } = loadContext();
  const arr = [
    { date: '2025-06-10', mood: 0, sleep: 7.5, water: 2.1 }, // mood=0 invalid
    { date: '2025-06-10', mood: 3, sleep: 6.0, water: 1.8 },
  ];
  assert.match(
    validateStoredEntries(arr),
    /malformed/
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. validateEntry
   ═══════════════════════════════════════════════════════════════════════════ */

// Helper: a complete valid set of arguments
function validArgs() {
  return ['2025-06-10', '4', '7.5', '2.1', []];
}

test('validateEntry — all valid inputs return null', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry(...validArgs()), null);
});

// ── Missing fields ────────────────────────────────────────────────────────────

test('validateEntry — missing date returns date-required error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('', '4', '7.5', '2.1', []),
    'Please select a date.'
  );
});

test('validateEntry — missing mood returns mood-required error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '', '7.5', '2.1', []),
    'Please select a mood (1–5).'
  );
});

test('validateEntry — null mood returns mood-required error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', null, '7.5', '2.1', []),
    'Please select a mood (1–5).'
  );
});

test('validateEntry — missing sleep returns sleep-required error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '', '2.1', []),
    'Please enter sleep hours (0–24).'
  );
});

test('validateEntry — missing water returns water-required error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '7.5', '', []),
    'Please enter water intake (0–3 litres).'
  );
});

// ── Date format and calendar validity ─────────────────────────────────────────

test('validateEntry — date with wrong format returns format error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('10/06/2025', '4', '7.5', '2.1', []),
    'Date must be in YYYY-MM-DD format.'
  );
});

test('validateEntry — impossible date 2025-02-30 returns calendar error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-02-30', '4', '7.5', '2.1', []),
    'Please enter a valid calendar date.'
  );
});

test('validateEntry — impossible date month 13 returns calendar error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-13-01', '4', '7.5', '2.1', []),
    'Please enter a valid calendar date.'
  );
});

test('validateEntry — leap year 2024-02-29 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2024-02-29', '4', '7.5', '2.1', []), null);
});

test('validateEntry — non-leap year 2025-02-29 returns calendar error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-02-29', '4', '7.5', '2.1', []),
    'Please enter a valid calendar date.'
  );
});

// ── Mood ──────────────────────────────────────────────────────────────────────

test('validateEntry — mood 0 returns mood-range error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '0', '7.5', '2.1', []),
    'Mood must be a whole number between 1 and 5.'
  );
});

test('validateEntry — mood 6 returns mood-range error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '6', '7.5', '2.1', []),
    'Mood must be a whole number between 1 and 5.'
  );
});

test('validateEntry — mood boundary 1 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2025-06-10', '1', '7.5', '2.1', []), null);
});

test('validateEntry — mood boundary 5 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2025-06-10', '5', '7.5', '2.1', []), null);
});

// ── Sleep ─────────────────────────────────────────────────────────────────────

test('validateEntry — sleep -1 returns sleep-range error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '-1', '2.1', []),
    'Sleep must be a number between 0 and 24 hours.'
  );
});

test('validateEntry — sleep 25 returns sleep-range error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '25', '2.1', []),
    'Sleep must be a number between 0 and 24 hours.'
  );
});

test('validateEntry — sleep boundary 0 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2025-06-10', '4', '0', '2.1', []), null);
});

test('validateEntry — sleep boundary 24 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2025-06-10', '4', '24', '2.1', []), null);
});

test('validateEntry — sleep invalid step 6.3 returns step error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '6.3', '2.1', []),
    'Sleep must be entered in 0.5-hour increments (e.g. 6, 6.5, 7).'
  );
});

// ── Water ─────────────────────────────────────────────────────────────────────

test('validateEntry — water -0.1 returns water-range error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '7.5', '-0.1', []),
    'Water must be a number between 0 and 3 litres.'
  );
});

test('validateEntry — water 3.1 returns water-range error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '7.5', '3.1', []),
    'Water must be a number between 0 and 3 litres.'
  );
});

test('validateEntry — water boundary 0 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2025-06-10', '4', '7.5', '0', []), null);
});

test('validateEntry — water boundary 3 is valid', function () {
  const { validateEntry } = loadContext();
  assert.equal(validateEntry('2025-06-10', '4', '7.5', '3', []), null);
});

test('validateEntry — water invalid step 1.15 returns step error', function () {
  const { validateEntry } = loadContext();
  assert.equal(
    validateEntry('2025-06-10', '4', '7.5', '1.15', []),
    'Water must be entered in 0.1-litre increments (e.g. 1, 1.5, 2.3).'
  );
});

// ── Duplicate date ─────────────────────────────────────────────────────────────

test('validateEntry — duplicate date returns duplicate-date error', function () {
  const { validateEntry } = loadContext();
  const existing = [{ date: '2025-06-10', mood: 3, sleep: 6, water: 1.5 }];
  assert.equal(
    validateEntry('2025-06-10', '4', '7.5', '2.1', existing),
    'An entry for 2025-06-10 already exists. Please choose a different date.'
  );
});

test('validateEntry — non-duplicate date with existing entries returns null', function () {
  const { validateEntry } = loadContext();
  const existing = [{ date: '2025-06-09', mood: 3, sleep: 6, water: 1.5 }];
  assert.equal(validateEntry('2025-06-10', '4', '7.5', '2.1', existing), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. sortByDateDesc
   ═══════════════════════════════════════════════════════════════════════════ */

test('sortByDateDesc — returns newest entry first', function () {
  const { sortByDateDesc } = loadContext();
  const entries = [
    { date: '2025-06-09', mood: 3, sleep: 6, water: 1.5 },
    { date: '2025-06-11', mood: 4, sleep: 7, water: 2.0 },
    { date: '2025-06-10', mood: 2, sleep: 5, water: 1.0 },
  ];
  const sorted = sortByDateDesc(entries);
  assert.equal(sorted[0].date, '2025-06-11');
  assert.equal(sorted[1].date, '2025-06-10');
  assert.equal(sorted[2].date, '2025-06-09');
});

test('sortByDateDesc — does not mutate the original array', function () {
  const { sortByDateDesc } = loadContext();
  const entries = [
    { date: '2025-06-09', mood: 3, sleep: 6, water: 1.5 },
    { date: '2025-06-11', mood: 4, sleep: 7, water: 2.0 },
  ];
  const originalFirst = entries[0].date;
  sortByDateDesc(entries);
  assert.equal(entries[0].date, originalFirst);
});

test('sortByDateDesc — returns a new array reference', function () {
  const { sortByDateDesc } = loadContext();
  const entries = [{ date: '2025-06-10', mood: 3, sleep: 6, water: 1.5 }];
  const sorted = sortByDateDesc(entries);
  // Must not be the same array object
  assert.notEqual(sorted, entries);
});

test('sortByDateDesc — single entry is returned unchanged', function () {
  const { sortByDateDesc } = loadContext();
  const entries = [{ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }];
  const sorted = sortByDateDesc(entries);
  assert.equal(sorted.length, 1);
  assert.equal(sorted[0].date, '2025-06-10');
});

test('sortByDateDesc — already-sorted input remains sorted', function () {
  const { sortByDateDesc } = loadContext();
  const entries = [
    { date: '2025-06-12', mood: 4, sleep: 8, water: 2.5 },
    { date: '2025-06-11', mood: 3, sleep: 7, water: 2.0 },
    { date: '2025-06-10', mood: 2, sleep: 6, water: 1.5 },
  ];
  const sorted = sortByDateDesc(entries);
  assert.equal(sorted[0].date, '2025-06-12');
  assert.equal(sorted[2].date, '2025-06-10');
});

test('sortByDateDesc — reverse-sorted input is correctly reordered', function () {
  const { sortByDateDesc } = loadContext();
  const entries = [
    { date: '2025-06-10', mood: 2, sleep: 6, water: 1.5 },
    { date: '2025-06-11', mood: 3, sleep: 7, water: 2.0 },
    { date: '2025-06-12', mood: 4, sleep: 8, water: 2.5 },
  ];
  const sorted = sortByDateDesc(entries);
  assert.equal(sorted[0].date, '2025-06-12');
  assert.equal(sorted[2].date, '2025-06-10');
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. calcSummary
   ═══════════════════════════════════════════════════════════════════════════ */

test('calcSummary — empty array returns null', function () {
  const { calcSummary } = loadContext();
  assert.equal(calcSummary([]), null);
});

test('calcSummary — single entry returns correct averages', function () {
  const { calcSummary } = loadContext();
  const result = calcSummary([
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
  ]);
  // Assert each field individually to avoid cross-realm deepStrictEqual
  // prototype mismatch (vm-realm objects have a different Object constructor).
  assert.equal(result.count,    1);
  assert.equal(result.avgMood,  4);
  assert.equal(result.avgSleep, 7.5);
  assert.equal(result.avgWater, 2.1);
});

test('calcSummary — three entries produce correctly rounded averages', function () {
  const { calcSummary } = loadContext();
  // mood:   (3 + 4 + 5)       / 3  = 4.0
  // sleep:  (6.0 + 7.5 + 8.0) / 3  = 7.166… → rounded to 7.2
  // water:  (1.5 + 2.0 + 2.5) / 3  = 2.0
  const entries = [
    { date: '2025-06-10', mood: 3, sleep: 6.0, water: 1.5 },
    { date: '2025-06-11', mood: 4, sleep: 7.5, water: 2.0 },
    { date: '2025-06-12', mood: 5, sleep: 8.0, water: 2.5 },
  ];
  const result = calcSummary(entries);
  assert.equal(result.count,    3);
  assert.equal(result.avgMood,  4.0);
  assert.equal(result.avgSleep, 7.2);
  assert.equal(result.avgWater, 2.0);
});

test('calcSummary — exactly 7 entries uses all of them', function () {
  const { calcSummary } = loadContext();
  const entries = [
    { date: '2025-06-01', mood: 1, sleep: 6, water: 1.0 },
    { date: '2025-06-02', mood: 2, sleep: 6, water: 1.0 },
    { date: '2025-06-03', mood: 3, sleep: 6, water: 1.0 },
    { date: '2025-06-04', mood: 4, sleep: 6, water: 1.0 },
    { date: '2025-06-05', mood: 5, sleep: 6, water: 1.0 },
    { date: '2025-06-06', mood: 4, sleep: 6, water: 1.0 },
    { date: '2025-06-07', mood: 3, sleep: 6, water: 1.0 },
  ];
  // mood sum = 1+2+3+4+5+4+3 = 22 / 7 = 3.142857… → 3.1
  const result = calcSummary(entries);
  assert.equal(result.count,    7);
  assert.equal(result.avgMood,  3.1);
  assert.equal(result.avgSleep, 6.0);
  assert.equal(result.avgWater, 1.0);
});

test('calcSummary — 8 entries: oldest entry is excluded from the window', function () {
  const { calcSummary } = loadContext();
  // The 8 entries have mood 1–8. The oldest (2025-06-01, mood 1) must be
  // excluded. The 7 newest have mood 2–8 → sum = 35, mean = 5.
  const entries = [
    { date: '2025-06-01', mood: 1, sleep: 6, water: 1.0 }, // oldest — excluded
    { date: '2025-06-02', mood: 2, sleep: 6, water: 1.0 },
    { date: '2025-06-03', mood: 3, sleep: 6, water: 1.0 },
    { date: '2025-06-04', mood: 4, sleep: 6, water: 1.0 },
    { date: '2025-06-05', mood: 5, sleep: 6, water: 1.0 },
    { date: '2025-06-06', mood: 4, sleep: 6, water: 1.0 },
    { date: '2025-06-07', mood: 3, sleep: 6, water: 1.0 },
    { date: '2025-06-08', mood: 2, sleep: 6, water: 1.0 },
  ];
  const result = calcSummary(entries);
  assert.equal(result.count, 7);
  // mood sum (newest 7) = 2+3+4+5+4+3+2 = 23, mean = 23/7 = 3.285… → 3.3
  assert.equal(result.avgMood, 3.3);
});

test('calcSummary — unsorted input: window is based on date, not array order', function () {
  const { calcSummary } = loadContext();
  // Provide 8 entries in random order. The oldest (2025-06-01, mood 1)
  // must still be excluded regardless of its position in the input array.
  const entries = [
    { date: '2025-06-05', mood: 5, sleep: 6, water: 1.0 },
    { date: '2025-06-01', mood: 1, sleep: 6, water: 1.0 }, // oldest — excluded
    { date: '2025-06-08', mood: 2, sleep: 6, water: 1.0 },
    { date: '2025-06-03', mood: 3, sleep: 6, water: 1.0 },
    { date: '2025-06-07', mood: 3, sleep: 6, water: 1.0 },
    { date: '2025-06-02', mood: 2, sleep: 6, water: 1.0 },
    { date: '2025-06-06', mood: 4, sleep: 6, water: 1.0 },
    { date: '2025-06-04', mood: 4, sleep: 6, water: 1.0 },
  ];
  const result = calcSummary(entries);
  assert.equal(result.count, 7);
  // Newest 7: 06-02 to 06-08 → moods 2,3,4,5,4,3,2 → sum=23 / 7 = 3.285… → 3.3
  assert.equal(result.avgMood, 3.3);
});

test('calcSummary — result fields are numbers, not strings', function () {
  const { calcSummary } = loadContext();
  const result = calcSummary([
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
  ]);
  assert.equal(typeof result.avgMood,  'number');
  assert.equal(typeof result.avgSleep, 'number');
  assert.equal(typeof result.avgWater, 'number');
  assert.equal(typeof result.count,    'number');
});
