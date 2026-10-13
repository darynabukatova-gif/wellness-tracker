'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  E2E_DIRECTORY_PREFIX,
  E2E_MODE_VARIABLE,
  E2E_USER_DATA_VARIABLE,
  configureE2EUserData,
  resolveE2EUserDataConfiguration,
} = require('../electron/e2e-config.js');

async function withTemporaryDirectory(callback) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  try {
    return await callback(directory);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

function validEnvironment(directory) {
  return {
    [E2E_MODE_VARIABLE]: '1',
    [E2E_USER_DATA_VARIABLE]: directory,
  };
}

function assertInvalid(callback) {
  assert.throws(callback, error => error && error.code === 'INVALID_E2E_CONFIGURATION');
}

test('E2E configuration: absent variables preserve normal startup configuration', () => {
  assert.deepEqual(resolveE2EUserDataConfiguration({
    environment: {},
    productionUserDataDirectory: '/home/example/.config/wellness-tracker',
  }), { mode: 'production' });
});

test('E2E configuration: a valid dedicated temporary directory is selected', async () => {
  await withTemporaryDirectory(async directory => {
    const calls = [];
    const result = configureE2EUserData({
      app: { setPath: (...args) => calls.push(args) },
      environment: validEnvironment(directory),
      productionUserDataDirectory: '/home/example/.config/wellness-tracker',
    });

    assert.deepEqual(result, { mode: 'e2e', userDataDirectory: await fsp.realpath(directory) });
    assert.deepEqual(calls, [['userData', await fsp.realpath(directory)]]);
  });
});

test('E2E configuration: incomplete or malformed requests fail closed', async () => {
  await withTemporaryDirectory(async directory => {
    const invalidEnvironments = [
      { [E2E_MODE_VARIABLE]: '1' },
      { [E2E_USER_DATA_VARIABLE]: directory },
      { [E2E_MODE_VARIABLE]: '0', [E2E_USER_DATA_VARIABLE]: directory },
      { [E2E_MODE_VARIABLE]: '1', [E2E_USER_DATA_VARIABLE]: '' },
    ];

    for (const environment of invalidEnvironments) {
      assertInvalid(() => resolveE2EUserDataConfiguration({ environment }));
    }
  });
});

test('E2E configuration: relative, production, and unexpected paths are rejected', async () => {
  await withTemporaryDirectory(async directory => {
    assertInvalid(() => resolveE2EUserDataConfiguration({
      environment: validEnvironment('relative-directory'),
    }));

    assertInvalid(() => resolveE2EUserDataConfiguration({
      environment: validEnvironment(directory),
      productionUserDataDirectory: directory,
    }));

    const unexpectedDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'unrelated-'));
    try {
      assertInvalid(() => resolveE2EUserDataConfiguration({
        environment: validEnvironment(unexpectedDirectory),
      }));
    } finally {
      await fsp.rm(unexpectedDirectory, { recursive: true, force: true });
    }
  });
});

test('E2E configuration: nested and symlinked temporary paths are rejected', async t => {
  await withTemporaryDirectory(async directory => {
    const nestedDirectory = path.join(directory, 'nested');
    await fsp.mkdir(nestedDirectory);
    assertInvalid(() => resolveE2EUserDataConfiguration({
      environment: validEnvironment(nestedDirectory),
    }));

    const linkPath = path.join(os.tmpdir(), `${E2E_DIRECTORY_PREFIX}link`);
    try {
      await fsp.symlink(directory, linkPath);
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('Creating symlinks is not permitted in this environment.');
        return;
      }
      throw error;
    }
    try {
      assertInvalid(() => resolveE2EUserDataConfiguration({
        environment: validEnvironment(linkPath),
      }));
    } finally {
      await fsp.unlink(linkPath);
    }
  });
});

test('E2E configuration: main configures userData before requesting the single-instance lock', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.ok(mainSource.indexOf('configureE2EUserData({') < mainSource.indexOf('app.requestSingleInstanceLock()'));
  assert.ok(mainSource.indexOf('app.requestSingleInstanceLock()') < mainSource.indexOf("createStorage({ directory: app.getPath('userData') })"));
});
