'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createStorage } = require('../electron/storage.js');

const entryA = { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 };
const entryB = { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 };

async function withTempDirectory(callback) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'wellness-tracker-'));
  try {
    return await callback(directory);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

test('file storage: missing and existing empty files have distinct load states', async () => {
  await withTempDirectory(async directory => {
    const storage = createStorage({ directory });
    assert.deepEqual(await storage.loadEntries(), { ok: true, state: 'missing', entries: [] });
    await fsp.writeFile(storage.filePath, '[]', 'utf8');
    assert.deepEqual(await storage.loadEntries(), { ok: true, state: 'present', entries: [] });
  });
});

test('file storage: saves and loads the existing entry-array format', async () => {
  await withTempDirectory(async directory => {
    const storage = createStorage({ directory });
    assert.deepEqual(await storage.saveEntries([entryA, entryB]), { ok: true });
    assert.deepEqual(await storage.loadEntries(), { ok: true, state: 'present', entries: [entryA, entryB] });
    assert.deepEqual(JSON.parse(await fsp.readFile(storage.filePath, 'utf8')), [entryA, entryB]);
  });
});

test('file storage: invalid JSON returns a distinguishable failure', async () => {
  await withTempDirectory(async directory => {
    await fsp.writeFile(path.join(directory, 'entries.json'), '{not json', 'utf8');
    const result = await createStorage({ directory }).loadEntries();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_JSON');
  });
});

test('file storage: a non-array top level returns a distinguishable failure', async () => {
  await withTempDirectory(async directory => {
    await fsp.writeFile(path.join(directory, 'entries.json'), '{"date":"2025-06-10"}', 'utf8');
    const result = await createStorage({ directory }).loadEntries();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_TOP_LEVEL');
  });
});

test('file storage: simulated write failure reports failure', async () => {
  await withTempDirectory(async directory => {
    const fileSystem = {
      ...fsp,
      writeFile: async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); },
    };
    const result = await createStorage({ directory, fileSystem }).saveEntries([entryA]);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'WRITE_FAILED');
  });
});

test('file storage: failed replacement preserves the existing data file', async () => {
  await withTempDirectory(async directory => {
    const storage = createStorage({ directory });
    await storage.saveEntries([entryA]);
    const fileSystem = {
      ...fsp,
      rename: async () => { throw new Error('rename failed'); },
    };
    const failingStorage = createStorage({ directory, fileSystem });
    const result = await failingStorage.saveEntries([entryB]);
    assert.equal(result.ok, false);
    assert.deepEqual(JSON.parse(await fsp.readFile(storage.filePath, 'utf8')), [entryA]);
  });
});

test('file storage: overlapping saves are serialized and the last call wins', async () => {
  await withTempDirectory(async directory => {
    const writes = [];
    const fileSystem = {
      ...fsp,
      async writeFile(...args) {
        writes.push(args[1]);
        await new Promise(resolve => setTimeout(resolve, args[1].includes('2025-06-10') ? 20 : 0));
        return fsp.writeFile(...args);
      },
    };
    const storage = createStorage({ directory, fileSystem });
    const first = storage.saveEntries([entryA]);
    const second = storage.saveEntries([entryB]);
    assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
    assert.deepEqual(await storage.loadEntries(), { ok: true, state: 'present', entries: [entryB] });
    assert.equal(writes.length, 2);
  });
});
