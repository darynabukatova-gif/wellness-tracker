'use strict';

const path = require('path');
const crypto = require('crypto');
const defaultFileSystem = require('fs').promises;

const FILE_NAME = 'entries.json';

function success(state, entries) {
  return { ok: true, state, entries };
}

function failure(code, error) {
  return {
    ok: false,
    code,
    error: error instanceof Error ? error.message : String(error),
  };
}

function isEntryPayload(entries) {
  return Array.isArray(entries) && entries.every(entry => (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.date === 'string' &&
    typeof entry.mood === 'number' && Number.isFinite(entry.mood) &&
    typeof entry.sleep === 'number' && Number.isFinite(entry.sleep) &&
    typeof entry.water === 'number' && Number.isFinite(entry.water)
  ));
}

function createStorage({ directory, fileSystem = defaultFileSystem } = {}) {
  if (typeof directory !== 'string' || directory.length === 0) {
    throw new TypeError('A storage directory is required.');
  }

  const filePath = path.join(directory, FILE_NAME);
  let writeQueue = Promise.resolve();

  async function loadEntries() {
    let raw;
    try {
      raw = await fileSystem.readFile(filePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return success('missing', []);
      return failure('READ_FAILED', error);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return failure('INVALID_JSON', error);
    }

    if (!Array.isArray(parsed)) {
      return failure('INVALID_TOP_LEVEL', 'Stored data must be an array.');
    }

    return success('present', parsed);
  }

  async function performSave(entries) {
    if (!isEntryPayload(entries)) {
      return failure('INVALID_ENTRIES', 'Entries must be an array of entry objects.');
    }

    const temporaryPath = path.join(
      directory,
      `.${FILE_NAME}.${process.pid}.${crypto.randomUUID()}.tmp`
    );

    try {
      await fileSystem.writeFile(temporaryPath, JSON.stringify(entries), 'utf8');
      await fileSystem.rename(temporaryPath, filePath);
      return { ok: true };
    } catch (error) {
      try {
        await fileSystem.unlink(temporaryPath);
      } catch (cleanupError) {
        // The original write/rename error is the useful result to the caller.
      }
      return failure('WRITE_FAILED', error);
    }
  }

  function saveEntries(entries) {
    const operation = writeQueue.then(() => performSave(entries));
    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  return {
    filePath,
    loadEntries,
    saveEntries,
  };
}

module.exports = { FILE_NAME, createStorage, isEntryPayload };
