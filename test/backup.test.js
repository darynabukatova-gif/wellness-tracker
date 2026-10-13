'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createBackupDocument,
  parseBackupDocument,
} = require('./helpers.js').loadContext();

const EXPORTED_AT = '2026-10-12T14:30:00.000Z';

function entry(date = '2026-10-10', mood = 4, sleep = 7.5, water = 1.8) {
  return { date, mood, sleep, water };
}

function backup(entries, overrides = {}) {
  return JSON.stringify({
    application: 'wellness-tracker',
    backupVersion: 1,
    exportedAt: EXPORTED_AT,
    entries,
    ...overrides,
  });
}

test('createBackupDocument returns the exact versioned envelope and detached entries', () => {
  const entries = [entry('2026-10-10', 1, 0, 0), entry('2026-10-11', 5, 8, 2.3)];
  const result = createBackupDocument(entries, EXPORTED_AT);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    application: 'wellness-tracker',
    backupVersion: 1,
    exportedAt: EXPORTED_AT,
    entries,
  });
  assert.deepEqual(Object.keys(result).sort(), ['application', 'backupVersion', 'entries', 'exportedAt']);
  assert.notEqual(result.entries, entries);
  assert.notEqual(result.entries[0], entries[0]);
  entries[0].mood = 5;
  entries.push(entry('2026-10-12'));
  assert.equal(result.entries[0].mood, 1);
  assert.equal(result.entries.length, 2);
});

test('createBackupDocument rejects malformed entries and noncanonical export timestamps', () => {
  assert.throws(
    () => createBackupDocument([{ date: '2026-10-10', mood: 4, sleep: 7.5 }], EXPORTED_AT),
    /Cannot create backup/
  );
  assert.throws(
    () => createBackupDocument([entry()], '2026-10-12T14:30:00Z'),
    /canonical UTC timestamp/
  );
});

test('parseBackupDocument accepts valid backups, including empty entries and zero values', () => {
  const populated = parseBackupDocument(backup([entry('2026-10-10', 2, 0, 0)]));
  const empty = parseBackupDocument(backup([]));

  assert.equal(populated.ok, true);
  assert.equal(populated.backup.entries[0].date, '2026-10-10');
  assert.equal(populated.backup.entries[0].sleep, 0);
  assert.equal(populated.backup.entries[0].water, 0);
  assert.equal(empty.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(empty.backup.entries)), []);
});

test('parseBackupDocument returns a detached copy of valid parsed values', () => {
  const text = backup([entry()]);
  const first = parseBackupDocument(text);
  first.backup.entries[0].mood = 1;
  first.backup.entries.push(entry('2026-10-11'));
  const second = parseBackupDocument(text);

  assert.equal(second.ok, true);
  assert.equal(second.backup.entries[0].mood, 4);
  assert.equal(second.backup.entries.length, 1);
});

test('parseBackupDocument rejects malformed JSON and non-text input', () => {
  const malformed = parseBackupDocument('{not json');
  const nonText = parseBackupDocument(null);

  assert.deepEqual(JSON.parse(JSON.stringify(malformed)), {
    ok: false, code: 'INVALID_JSON', error: 'Backup file is not valid JSON.',
  });
  assert.equal(nonText.ok, false);
  assert.equal(nonText.code, 'INVALID_JSON');
});

test('parseBackupDocument rejects unsupported applications and versions', () => {
  const wrongApplication = parseBackupDocument(backup([], { application: 'another-app' }));
  const wrongVersion = parseBackupDocument(backup([], { backupVersion: 2 }));

  assert.equal(wrongApplication.code, 'UNSUPPORTED_APPLICATION');
  assert.equal(wrongVersion.code, 'UNSUPPORTED_VERSION');
});

test('parseBackupDocument rejects missing and unexpected envelope fields', () => {
  const missing = JSON.stringify({
    application: 'wellness-tracker', backupVersion: 1, exportedAt: EXPORTED_AT,
  });
  const unexpected = backup([], { extra: true });

  assert.equal(parseBackupDocument(missing).code, 'INVALID_ENVELOPE');
  assert.equal(parseBackupDocument(unexpected).code, 'INVALID_ENVELOPE');
  assert.equal(parseBackupDocument('[]').code, 'INVALID_ENVELOPE');
});

test('parseBackupDocument rejects missing and unexpected entry fields', () => {
  const missing = { date: '2026-10-10', mood: 4, sleep: 7.5 };
  const unexpected = { ...entry(), note: 'not part of the schema' };

  assert.equal(parseBackupDocument(backup([missing])).code, 'INVALID_ENTRIES');
  assert.equal(parseBackupDocument(backup([unexpected])).code, 'INVALID_ENTRIES');
});

test('parseBackupDocument rejects noncanonical and invalid UTC timestamps', () => {
  [
    '2026-10-12T14:30:00Z',
    '2026-10-12T14:30:00.000+00:00',
    '2026-02-30T14:30:00.000Z',
    'not-a-timestamp',
  ].forEach(exportedAt => {
    const result = parseBackupDocument(backup([], { exportedAt }));
    assert.equal(result.code, 'INVALID_TIMESTAMP');
  });
});

test('parseBackupDocument reuses entry validation for dates, ranges, and steps', () => {
  const invalidEntries = [
    entry('2026-02-30'),
    entry('2026-10-10', 6),
    entry('2026-10-10', 4, 7.3),
    entry('2026-10-10', 4, 7.5, 1.15),
  ];

  invalidEntries.forEach(invalidEntry => {
    const result = parseBackupDocument(backup([invalidEntry]));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_ENTRIES');
  });
});

test('parseBackupDocument rejects duplicates without partially accepting records', () => {
  const result = parseBackupDocument(backup([
    entry('2026-10-10', 4, 7.5, 1.8),
    entry('2026-10-10', 3, 6, 1),
    entry('2026-10-11', 5, 8, 2),
  ]));

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_ENTRIES');
  assert.equal(Object.hasOwn(result, 'backup'), false);
});
