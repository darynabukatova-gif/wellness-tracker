/**
 * test/storage.test.js
 *
 * Automated tests for the two storage functions from index.html:
 *
 *   loadEntries()        — reads and parses the JSON string from localStorage
 *   saveEntries(entries) — serialises entries to JSON and writes to localStorage
 *
 * Both functions are tested through the in-memory localStorage stub provided
 * by makeLocalStorageStub() from test/helpers.js, which replicates the exact
 * semantics of the browser's localStorage:
 *   • getItem() returns null for absent keys (not undefined)
 *   • setItem() coerces values to strings (as the browser does)
 *
 * Run with:
 *   ~/.nvm/versions/node/v24.21.0/bin/node --test test/storage.test.js
 *
 * CROSS-REALM NOTE
 *   Arrays returned by loadEntries() live in the vm realm.
 *   Use Array.isArray() instead of instanceof Array.
 */

'use strict';

const { test }                           = require('node:test');
const assert                             = require('node:assert/strict');
const { loadContext, makeLocalStorageStub } = require('./helpers.js');

// The key the application uses — must match STORAGE_KEY in index.html.
const STORAGE_KEY = 'wellness-tracker-demo-v1';

/* ═══════════════════════════════════════════════════════════════════════════
   loadEntries
   ═══════════════════════════════════════════════════════════════════════════ */

test('loadEntries — key absent: returns empty array', function () {
  // Fresh stub has nothing stored; getItem returns null.
  const { loadEntries } = loadContext();
  const result = loadEntries();
  assert.ok(Array.isArray(result), 'expected an array');
  assert.equal(result.length, 0);
});

test('loadEntries — valid stored array: returns parsed array', function () {
  const storage = makeLocalStorageStub();
  const entries = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6.0, water: 1.8 },
  ];
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2);
  assert.equal(result[0].date,  '2025-06-10');
  assert.equal(result[0].mood,  4);
  assert.equal(result[0].sleep, 7.5);
  assert.equal(result[0].water, 2.1);
  assert.equal(result[1].date,  '2025-06-11');
});

test('loadEntries — stored empty array: returns empty array (not null)', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, '[]');

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('loadEntries — single entry: returns array of length 1', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, JSON.stringify([
    { date: '2025-06-15', mood: 5, sleep: 8.0, water: 2.5 },
  ]));

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.equal(result[0].mood, 5);
});

test('loadEntries — corrupt JSON string: returns null', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, 'not-valid-json{{');

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.equal(result, null);
});

test('loadEntries — stored value is JSON but not an array (object): returns null', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, JSON.stringify({ date: '2025-06-10', mood: 4 }));

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.equal(result, null);
});

test('loadEntries — stored value is JSON but not an array (number): returns null', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, '42');

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.equal(result, null);
});

test('loadEntries — stored value is JSON null: returns null', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, 'null');

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.equal(result, null);
});

test('loadEntries — stored value is JSON string: returns null', function () {
  const storage = makeLocalStorageStub();
  storage.setItem(STORAGE_KEY, '"just a string"');

  const { loadEntries } = loadContext(storage);
  const result = loadEntries();

  assert.equal(result, null);
});

test('loadEntries — getItem throws: returns null', function () {
  // Simulate a storage read failure (e.g. private-browsing quota error).
  const throwingStorage = {
    getItem() { throw new Error('simulated read failure'); },
    setItem() {},
    removeItem() {},
  };

  const { loadEntries } = loadContext(throwingStorage);
  const result = loadEntries();

  assert.equal(result, null);
});

test('loadEntries — does not modify the stored raw value on corruption', function () {
  const storage = makeLocalStorageStub();
  const corruptValue = 'not-json!!!';
  storage.setItem(STORAGE_KEY, corruptValue);

  const { loadEntries } = loadContext(storage);
  loadEntries();  // return value is null (corrupt); storage must be untouched

  assert.equal(storage.getItem(STORAGE_KEY), corruptValue);
});

/* ═══════════════════════════════════════════════════════════════════════════
   saveEntries
   ═══════════════════════════════════════════════════════════════════════════ */

test('saveEntries — returns true on success', function () {
  const { saveEntries, storage } = loadContext();
  const result = saveEntries([{ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }]);
  assert.equal(result, true);
});

test('saveEntries — writes serialised JSON to localStorage under the correct key', function () {
  const { saveEntries, storage } = loadContext();
  const entries = [{ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }];
  saveEntries(entries);

  const raw = storage.getItem(STORAGE_KEY);
  assert.notEqual(raw, null);
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].date, '2025-06-10');
  assert.equal(parsed[0].mood, 4);
});

test('saveEntries — empty array is serialised and stored correctly', function () {
  const { saveEntries, storage } = loadContext();
  saveEntries([]);

  const raw = storage.getItem(STORAGE_KEY);
  assert.equal(raw, '[]');
});

test('saveEntries — multiple entries are all preserved', function () {
  const { saveEntries, storage } = loadContext();
  const entries = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6.0, water: 1.8 },
    { date: '2025-06-12', mood: 5, sleep: 8.0, water: 2.5 },
  ];
  saveEntries(entries);

  const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[2].date, '2025-06-12');
});

test('saveEntries — overwrites previously stored data', function () {
  const { saveEntries, storage } = loadContext();

  saveEntries([{ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }]);
  saveEntries([{ date: '2025-06-20', mood: 2, sleep: 5.0, water: 1.0 }]);

  const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].date, '2025-06-20');
});

test('saveEntries — setItem throws: returns false', function () {
  // Simulate a storage write failure (e.g. quota exceeded).
  const throwingStorage = {
    getItem() { return null; },
    setItem() { throw new Error('simulated quota exceeded'); },
    removeItem() {},
  };

  const { saveEntries } = loadContext(throwingStorage);
  const result = saveEntries([{ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }]);

  assert.equal(result, false);
});

/* ═══════════════════════════════════════════════════════════════════════════
   loadEntries + saveEntries round-trip
   ═══════════════════════════════════════════════════════════════════════════ */

test('round-trip: saveEntries then loadEntries returns the original data', function () {
  const storage = makeLocalStorageStub();
  const { saveEntries, loadEntries } = loadContext(storage);

  const original = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6.0, water: 1.8 },
  ];
  saveEntries(original);
  const loaded = loadEntries();

  assert.ok(Array.isArray(loaded));
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].date,  original[0].date);
  assert.equal(loaded[0].mood,  original[0].mood);
  assert.equal(loaded[0].sleep, original[0].sleep);
  assert.equal(loaded[0].water, original[0].water);
  assert.equal(loaded[1].date,  original[1].date);
});

test('round-trip: saveEntries empty array then loadEntries returns empty array', function () {
  const storage = makeLocalStorageStub();
  const { saveEntries, loadEntries } = loadContext(storage);

  saveEntries([]);
  const loaded = loadEntries();

  assert.ok(Array.isArray(loaded));
  assert.equal(loaded.length, 0);
});

test('round-trip: numeric field precision is preserved through JSON serialisation', function () {
  const storage = makeLocalStorageStub();
  const { saveEntries, loadEntries } = loadContext(storage);

  const original = [{ date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 }];
  saveEntries(original);
  const loaded = loadEntries();

  // JSON.stringify / JSON.parse must not alter the numeric field values.
  assert.equal(loaded[0].sleep, 7.5);
  assert.equal(loaded[0].water, 2.1);
});
