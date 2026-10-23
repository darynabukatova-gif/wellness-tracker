'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { _electron } = require('playwright-core');
const {
  E2E_DIRECTORY_PREFIX,
  E2E_MODE_VARIABLE,
  E2E_USER_DATA_VARIABLE,
} = require('../electron/e2e-config.js');

const projectDirectory = path.resolve(__dirname, '..');

async function removeCreatedE2EDirectory(directory) {
  const temporaryDirectory = await fsp.realpath(os.tmpdir());
  const realDirectory = await fsp.realpath(directory);

  if (path.dirname(realDirectory) !== temporaryDirectory ||
      !path.basename(realDirectory).startsWith(E2E_DIRECTORY_PREFIX)) {
    throw new Error(`Refusing to remove an unexpected E2E directory: ${directory}`);
  }

  await fsp.rm(realDirectory, { recursive: true, force: true });
}

async function launchIsolatedElectron(isolatedUserDataDirectory) {
  const electronEnvironment = { ...process.env };
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;
  electronEnvironment[E2E_MODE_VARIABLE] = '1';
  electronEnvironment[E2E_USER_DATA_VARIABLE] = isolatedUserDataDirectory;

  return _electron.launch({
    executablePath: require('electron'),
    args: [projectDirectory],
    cwd: projectDirectory,
    env: electronEnvironment,
    chromiumSandbox: true,
    timeout: 30_000,
  });
}

async function getReadyWindow(electronApplication) {
  const window = await electronApplication.firstWindow({ timeout: 15_000 });
  await window.waitForSelector('#entry-form-section', { state: 'visible', timeout: 15_000 });
  return window;
}

async function assertIsolatedUserData(electronApplication, isolatedUserDataDirectory) {
  const paths = await electronApplication.evaluate(({ app }) => ({
    userData: app.getPath('userData'),
    appData: app.getPath('appData'),
    name: app.getName(),
  }));
  const normalUserDataDirectory = path.join(paths.appData, paths.name);

  assert.equal(await fsp.realpath(paths.userData), isolatedUserDataDirectory);
  assert.notEqual(path.resolve(paths.userData), path.resolve(normalUserDataDirectory));
}

async function closeApplications(applications) {
  const errors = [];
  for (const electronApplication of [...applications].reverse()) {
    try {
      await electronApplication.close();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function assertHistoryRow(window, entry) {
  const row = window.locator('#entries-container tbody tr').filter({ hasText: entry.date });
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  const cells = await row.locator('td').allTextContents();
  assert.deepEqual(cells.slice(0, 4), [
    entry.date,
    String(entry.mood),
    String(entry.sleep),
    String(entry.water),
  ]);
  return row;
}

async function showHistoryRange(window, startDate, endDate) {
  await window.locator('#history-from-date').fill(startDate);
  await window.locator('#history-to-date').fill(endDate);
  await window.locator('#show-history-btn').click();
  await window.locator('#history-status').filter({
    hasText: `from ${startDate} to ${endDate}`,
  }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function createEntryThroughForm(window, entry) {
  await window.locator('#entry-date').fill(entry.date);
  await window.locator(`input[name="mood"][value="${entry.mood}"]`).check();
  if (entry.sleep === 0) {
    await window.locator('#sleep-minus').click();
  } else {
    await window.locator('#sleep-plus').click({ clickCount: Math.round(entry.sleep / 0.5) });
  }
  if (entry.water === 0) {
    await window.locator('#water-minus').click();
  } else {
    await window.locator('#water-plus').click({ clickCount: Math.round(entry.water / 0.1) });
  }
  await window.locator('#save-btn').click();
}

function localDateKey(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')]
    .join('-');
}

async function navigateCalendarToDate(window, date) {
  const dateButton = window.locator(`#calendar-grid .calendar-day[data-calendar-date="${date}"]`);
  for (let attempts = 0; attempts < 3; attempts++) {
    if (await dateButton.count() === 1) return dateButton;
    await window.locator('#calendar-prev-btn').click();
  }
  throw new Error(`Could not navigate the calendar to ${date}.`);
}

async function assertTrendDataRow(window, date, values) {
  const row = window.locator('#trend-data-table-container tbody tr').filter({ hasText: date });
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  assert.deepEqual(await row.locator('td').allTextContents(), [date].concat(values));
}

function backupDocument(entries, exportedAt = '2026-01-15T12:00:00.000Z') {
  return {
    application: 'wellness-tracker',
    backupVersion: 1,
    exportedAt,
    entries,
  };
}

async function writeBackupFixture(temporaryDirectory, name, documentValue) {
  const fixturesDirectory = path.join(temporaryDirectory, 'fixtures');
  await fsp.mkdir(fixturesDirectory, { recursive: true });
  const fixturePath = path.join(fixturesDirectory, name);
  const content = typeof documentValue === 'string'
    ? documentValue
    : JSON.stringify(documentValue, null, 2) + '\n';
  await fsp.writeFile(fixturePath, content, 'utf8');
  return fixturePath;
}

async function selectBackupFile(window, fixturePath) {
  const fileChooser = window.waitForEvent('filechooser', { timeout: 15_000 });
  await window.locator('#import-backup-btn').click();
  await (await fileChooser).setFiles(fixturePath);
}

function handleConfirmation(window, verify, accept) {
  return new Promise((resolve, reject) => {
    window.once('dialog', dialog => {
      try {
        verify(dialog);
        (accept ? dialog.accept() : dialog.dismiss()).then(resolve, reject);
      } catch (error) {
        dialog.dismiss().catch(() => undefined).finally(() => reject(error));
      }
    });
  });
}

async function finishIsolatedTest(applications, temporaryDirectory, testFailure) {
  const cleanupErrors = await closeApplications(applications);
  try {
    await removeCreatedE2EDirectory(temporaryDirectory);
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (cleanupErrors.length > 0) {
    const details = cleanupErrors.map(error => error.message).join('; ');
    if (testFailure) {
      testFailure.message += `\nCleanup also failed: ${details}`;
      return;
    }
    throw new Error(`E2E cleanup failed: ${details}`);
  }
}

async function prepareElectronDownload(electronApplication, destination) {
  await electronApplication.evaluate(({ session }, savePath) => {
    globalThis.wellnessTrackerE2EDownload = new Promise((resolve, reject) => {
      session.defaultSession.once('will-download', (event, item) => {
        item.setSavePath(savePath);
        item.once('done', (doneEvent, state) => {
          if (state === 'completed') {
            resolve({ fileName: item.getFilename(), savePath });
          } else {
            reject(new Error(`Electron download finished with state: ${state}`));
          }
        });
      });
    });
  }, destination);
}

function waitForElectronDownload(electronApplication) {
  return electronApplication.evaluate(async () => globalThis.wellnessTrackerE2EDownload);
}

test('Electron E2E: launches the source app with an isolated userData directory', { timeout: 45_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    assert.equal(await window.locator('h1').textContent(), 'Wellness Tracker');
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: saves a real form entry and reloads it after restart', { timeout: 60_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  const entry = {
    date: '2025-02-14',
    mood: 4,
    sleep: 7.5,
    water: 1.8,
  };

  try {
    const firstApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(firstApplication);
    const firstWindow = await getReadyWindow(firstApplication);
    await assertIsolatedUserData(firstApplication, isolatedUserDataDirectory);

    await firstWindow.locator('#entry-date').fill(entry.date);
    await firstWindow.locator('input[name="mood"][value="4"]').check();
    await firstWindow.locator('#sleep-plus').click({ clickCount: 15 });
    await firstWindow.locator('#water-plus').click({ clickCount: 18 });
    assert.equal(await firstWindow.locator('#sleep-value').textContent(), '7.5 h');
    assert.equal(await firstWindow.locator('#water-value').textContent(), '1.8 L');

    await firstWindow.locator('#save-btn').click();
    await showHistoryRange(firstWindow, entry.date, entry.date);
    await assertHistoryRow(firstWindow, entry);

    await firstApplication.close();
    applications.pop();

    const secondApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(secondApplication);
    const secondWindow = await getReadyWindow(secondApplication);
    await assertIsolatedUserData(secondApplication, isolatedUserDataDirectory);

    await showHistoryRange(secondWindow, entry.date, entry.date);
    await assertHistoryRow(secondWindow, entry);
    assert.equal(await secondWindow.locator('#entries-container tbody tr').count(), 1);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: edits and deletes an entry with persistence across restarts', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const initialEntry = {
    date: '2025-02-15',
    mood: 3,
    sleep: 6,
    water: 1.5,
  };
  const editedEntry = {
    date: initialEntry.date,
    mood: 5,
    sleep: 7.5,
    water: 1.8,
  };

  try {
    const firstApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(firstApplication);
    const firstWindow = await getReadyWindow(firstApplication);
    await assertIsolatedUserData(firstApplication, isolatedUserDataDirectory);

    await createEntryThroughForm(firstWindow, initialEntry);
    await showHistoryRange(firstWindow, initialEntry.date, initialEntry.date);
    await firstWindow.locator(`.btn-edit[data-date="${initialEntry.date}"]`).click();
    assert.equal(await firstWindow.locator('#form-heading').textContent(), 'Edit Wellness Entry');
    assert.equal(await firstWindow.locator('#save-btn').textContent(), 'Save changes');
    assert.equal(await firstWindow.locator('#entry-date').getAttribute('readonly'), '');

    await firstWindow.locator('input[name="mood"][value="5"]').check();
    await firstWindow.locator('#sleep-plus').click({ clickCount: 3 });
    await firstWindow.locator('#water-plus').click({ clickCount: 3 });
    assert.equal(await firstWindow.locator('#sleep-value').textContent(), '7.5 h');
    assert.equal(await firstWindow.locator('#water-value').textContent(), '1.8 L');
    await firstWindow.locator('#save-btn').click();
    await assertHistoryRow(firstWindow, editedEntry);
    assert.equal(await firstWindow.locator('#entries-container tbody tr').count(), 1);

    await firstApplication.close();
    applications.pop();

    const secondApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(secondApplication);
    const secondWindow = await getReadyWindow(secondApplication);
    await assertIsolatedUserData(secondApplication, isolatedUserDataDirectory);
    await showHistoryRange(secondWindow, editedEntry.date, editedEntry.date);
    await assertHistoryRow(secondWindow, editedEntry);
    assert.equal(await secondWindow.locator('#entries-container tbody tr').count(), 1);

    const dialogHandled = new Promise((resolve, reject) => {
      secondWindow.once('dialog', dialog => {
        try {
          assert.equal(dialog.type(), 'confirm');
          assert.equal(dialog.message(), `Delete entry for ${editedEntry.date}?`);
          dialog.accept().then(resolve, reject);
        } catch (error) {
          dialog.dismiss().catch(() => undefined).finally(() => reject(error));
        }
      });
    });
    await Promise.all([
      dialogHandled,
      secondWindow.locator(`.btn-delete[data-date="${editedEntry.date}"]`).click(),
    ]);
    await secondWindow.locator('#entries-container .empty-state').waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await secondWindow.locator('#entries-container tbody tr').count(), 0);

    await secondApplication.close();
    applications.pop();

    const thirdApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(thirdApplication);
    const thirdWindow = await getReadyWindow(thirdApplication);
    await assertIsolatedUserData(thirdApplication, isolatedUserDataDirectory);
    await showHistoryRange(thirdWindow, editedEntry.date, editedEntry.date);
    await thirdWindow.locator('#entries-container .empty-state').waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await thirdWindow.locator('#entries-container .empty-state').textContent(), 'No entries match this date range.');
    assert.equal(await thirdWindow.locator('#entries-container tbody tr').count(), 0);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: calendar details and calendar edit actions reflect saved changes', { timeout: 60_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const initialEntry = {
    date: localDateKey(-40),
    mood: 3,
    sleep: 6,
    water: 1.5,
  };
  const editedEntry = {
    date: initialEntry.date,
    mood: 5,
    sleep: 6,
    water: 1.5,
  };

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    await createEntryThroughForm(window, initialEntry);
    await showHistoryRange(window, initialEntry.date, initialEntry.date);
    const dateButton = await navigateCalendarToDate(window, initialEntry.date);
    assert.match(await dateButton.getAttribute('class'), /has-entry/);
    await dateButton.click();
    await window.locator('#calendar-details').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(
      await window.locator('#calendar-details').textContent(),
      /Mood 3, Sleep 6 h, Water 1.5 L\./
    );

    await window.locator('.calendar-detail-action[data-calendar-action="edit"]').click();
    assert.equal(await window.locator('#form-heading').textContent(), 'Edit Wellness Entry');
    await window.locator('input[name="mood"][value="5"]').check();
    await window.locator('#save-btn').click();
    await showHistoryRange(window, editedEntry.date, editedEntry.date);
    await assertHistoryRow(window, editedEntry);
    assert.match(
      await window.locator('#calendar-details').textContent(),
      /Mood 5, Sleep 6 h, Water 1.5 L\./
    );
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: charts show local-date values, gaps, zeroes, and successful updates', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const todayEntry = {
    date: localDateKey(0),
    mood: 4,
    sleep: 7.5,
    water: 1.8,
  };
  const earlierEntry = {
    date: localDateKey(-2),
    mood: 2,
    sleep: 0,
    water: 0,
  };
  const missingDate = localDateKey(-1);

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    await createEntryThroughForm(window, earlierEntry);
    await createEntryThroughForm(window, todayEntry);
    await window.locator('#history-view-charts').click();
    assert.equal(await window.locator('#history-charts-panel').isHidden(), false);
    assert.equal(await window.locator('.trend-period-btn').count(), 4);
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="30"]').getAttribute('aria-pressed'), 'true');

    await window.locator('.trend-data-details summary').click();
    await window.locator('.trend-period-btn[data-trend-days="7"]').click();
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="7"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 7);
    await assertTrendDataRow(window, earlierEntry.date, ['2', '0 h', '0 L']);
    await assertTrendDataRow(window, missingDate, ['— Missing', '— Missing', '— Missing']);
    await assertTrendDataRow(window, todayEntry.date, ['4', '7.5 h', '1.8 L']);

    const sleepChart = window.locator('svg[data-metric="sleep"]');
    const waterChart = window.locator('svg[data-metric="water"]');
    assert.equal(await sleepChart.locator(`circle[data-date="${earlierEntry.date}"][data-value="0"]`).count(), 1);
    assert.equal(await waterChart.locator(`circle[data-date="${earlierEntry.date}"][data-value="0"]`).count(), 1);
    assert.equal(await sleepChart.locator('circle.trend-point').count(), 2);
    assert.equal(await sleepChart.locator('path.trend-line').count(), 0);

    await window.locator('.trend-period-btn[data-trend-days="30"]').click();
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="30"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 30);
    await window.locator('.trend-period-btn[data-trend-days="90"]').click();
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="90"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 90);
    await showHistoryRange(window, earlierEntry.date, todayEntry.date);
    await assertHistoryRow(window, earlierEntry);
    await assertHistoryRow(window, todayEntry);

    await window.locator(`.btn-edit[data-date="${todayEntry.date}"]`).click();
    await window.locator('input[name="mood"][value="5"]').check();
    await window.locator('#save-btn').click();
    const updatedEntry = { ...todayEntry, mood: 5 };
    await assertHistoryRow(window, updatedEntry);
    assert.equal(await window.locator(`svg[data-metric="mood"] circle[data-date="${todayEntry.date}"]`).getAttribute('data-value'), '5');
    await assertTrendDataRow(window, todayEntry.date, ['5', '7.5 h', '1.8 L']);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: exports a versioned JSON backup through the real download flow', { timeout: 60_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = [
    { date: '2025-03-10', mood: 2, sleep: 0, water: 0 },
    { date: '2025-03-11', mood: 5, sleep: 8, water: 2.4 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, entries[0]);
    await createEntryThroughForm(window, entries[1]);

    const downloadsDirectory = path.join(temporaryDirectory, 'downloads');
    await fsp.mkdir(downloadsDirectory, { recursive: true });
    const downloadedPath = path.join(downloadsDirectory, 'captured-backup.json');
    await prepareElectronDownload(electronApplication, downloadedPath);
    await window.locator('#export-backup-btn').click();
    const downloaded = await waitForElectronDownload(electronApplication);

    const backup = JSON.parse(await fsp.readFile(downloadedPath, 'utf8'));
    assert.equal(backup.application, 'wellness-tracker');
    assert.equal(backup.backupVersion, 1);
    assert.equal(new Date(backup.exportedAt).toISOString(), backup.exportedAt);
    assert.equal(downloaded.fileName, `wellness-tracker-backup-${backup.exportedAt.slice(0, 10)}.json`);
    assert.deepEqual(backup.entries, entries);
    await showHistoryRange(window, entries[0].date, entries[1].date);
    await assertHistoryRow(window, entries[0]);
    await assertHistoryRow(window, entries[1]);
    assert.equal(await window.locator('#entries-container tbody tr').count(), 2);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: previews, rejects, and cancels backup imports without data loss', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const existingEntry = { date: '2025-04-10', mood: 3, sleep: 6, water: 1.5 };
  const previewEntries = [
    { date: '2025-04-11', mood: 1, sleep: 0, water: 0 },
    { date: '2025-04-12', mood: 5, sleep: 8, water: 2.4 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, existingEntry);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);

    const previewFixture = await writeBackupFixture(
      temporaryDirectory,
      'preview-backup.json',
      backupDocument(previewEntries)
    );
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await selectBackupFile(window, previewFixture);
    await window.locator('#import-preview').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(
      await window.locator('#import-preview-summary').textContent(),
      /Backup contains 2 entries, from 2025-04-11 to 2025-04-12\. You currently have 1 saved entries\. No data has been changed\./
    );
    assert.match(await window.locator('#import-preview-warning').textContent(), /REPLACE ALL existing entries/);
    assert.equal(await window.locator('#save-btn').isDisabled(), true);
    assert.equal(await window.locator('#erase-all-btn').isDisabled(), true);
    assert.equal(await window.locator('#export-backup-btn').isDisabled(), true);
    assert.equal(await window.locator('#import-backup-btn').isDisabled(), true);
    assert.equal(await window.locator('#cancel-import-btn').isDisabled(), false);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);
    await assertHistoryRow(window, existingEntry);

    await window.locator('#cancel-import-btn').click();
    assert.equal(await window.locator('#import-preview').isHidden(), true);
    assert.equal(await window.locator('#save-btn').isDisabled(), false);
    assert.equal(await window.locator('#import-backup-btn').isDisabled(), false);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);
    await assertHistoryRow(window, existingEntry);

    const malformedFixture = await writeBackupFixture(temporaryDirectory, 'malformed.json', '{not json');
    await selectBackupFile(window, malformedFixture);
    await window.locator('#backup-error').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#backup-error').textContent(), /Could not validate the backup file/);
    assert.equal(await window.locator('#import-preview').isHidden(), true);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);
    await assertHistoryRow(window, existingEntry);

    const unsupportedFixture = await writeBackupFixture(
      temporaryDirectory,
      'unsupported.json',
      backupDocument([], '2026-01-15T12:00:00.000Z')
    );
    const unsupportedDocument = JSON.parse(await fsp.readFile(unsupportedFixture, 'utf8'));
    unsupportedDocument.backupVersion = 99;
    await fsp.writeFile(unsupportedFixture, JSON.stringify(unsupportedDocument), 'utf8');
    await selectBackupFile(window, unsupportedFixture);
    await window.locator('#backup-error').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#backup-error').textContent(), /version is not supported/);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);
    await assertHistoryRow(window, existingEntry);

    const emptyFixture = await writeBackupFixture(temporaryDirectory, 'empty.json', backupDocument([]));
    await selectBackupFile(window, emptyFixture);
    await window.locator('#import-preview').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#import-preview-summary').textContent(), /Backup contains 0 entries\. No entries in backup/);
    assert.match(await window.locator('#import-preview-warning').textContent(), /empty backup would remove all existing entries/);
    const confirmationHandled = handleConfirmation(
      window,
      dialog => {
        assert.equal(dialog.type(), 'confirm');
        assert.match(dialog.message(), /This backup is empty/);
      },
      false
    );
    await Promise.all([confirmationHandled, window.locator('#replace-import-btn').click()]);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);
    await assertHistoryRow(window, existingEntry);
    assert.equal(await window.locator('#import-preview').isHidden(), false);
    await window.locator('#cancel-import-btn').click();
    assert.equal(await window.locator('#import-preview').isHidden(), true);
    await showHistoryRange(window, existingEntry.date, existingEntry.date);
    await assertHistoryRow(window, existingEntry);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: restores a replacement backup and persists its visual data after restart', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const existingEntry = { date: localDateKey(-4), mood: 1, sleep: 5, water: 1 };
  const importedEntries = [
    { date: localDateKey(-2), mood: 2, sleep: 0, water: 0 },
    { date: localDateKey(-1), mood: 5, sleep: 8, water: 2.4 },
  ];

  try {
    const firstApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(firstApplication);
    const firstWindow = await getReadyWindow(firstApplication);
    await assertIsolatedUserData(firstApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(firstWindow, existingEntry);

    const restoreFixture = await writeBackupFixture(
      temporaryDirectory,
      'restore-backup.json',
      backupDocument(importedEntries)
    );
    await assertIsolatedUserData(firstApplication, isolatedUserDataDirectory);
    await selectBackupFile(firstWindow, restoreFixture);
    await firstWindow.locator('#import-preview').waitFor({ state: 'visible', timeout: 15_000 });
    const confirmationHandled = handleConfirmation(
      firstWindow,
      dialog => {
        assert.equal(dialog.type(), 'confirm');
        assert.match(dialog.message(), /Replace all 1 currently saved entry with 2 backup entries/);
        assert.match(dialog.message(), /replaced, not merged/);
      },
      true
    );
    await Promise.all([confirmationHandled, firstWindow.locator('#replace-import-btn').click()]);
    await firstWindow.locator('#backup-status').waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await firstWindow.locator('#backup-status').textContent(), 'Backup restored. 2 entries are now saved.');
    await showHistoryRange(firstWindow, importedEntries[0].date, importedEntries[1].date);
    await assertHistoryRow(firstWindow, importedEntries[0]);
    await assertHistoryRow(firstWindow, importedEntries[1]);
    assert.equal(await firstWindow.locator('#entries-container tbody tr').count(), 2);
    assert.equal(await firstWindow.locator(`#entries-container .btn-edit[data-date="${existingEntry.date}"]`).count(), 0);
    assert.equal(await firstWindow.locator('#stat-count').textContent(), '2');

    const calendarDateButton = await navigateCalendarToDate(firstWindow, importedEntries[1].date);
    await calendarDateButton.click();
    assert.match(
      await firstWindow.locator('#calendar-details').textContent(),
      /Mood 5, Sleep 8 h, Water 2.4 L\./
    );
    await firstWindow.locator('#history-view-charts').click();
    await firstWindow.locator('.trend-data-details summary').click();
    await assertTrendDataRow(firstWindow, importedEntries[0].date, ['2', '0 h', '0 L']);
    await assertTrendDataRow(firstWindow, importedEntries[1].date, ['5', '8 h', '2.4 L']);

    await firstApplication.close();
    applications.pop();

    const secondApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(secondApplication);
    const secondWindow = await getReadyWindow(secondApplication);
    await assertIsolatedUserData(secondApplication, isolatedUserDataDirectory);
    await showHistoryRange(secondWindow, importedEntries[0].date, importedEntries[1].date);
    await assertHistoryRow(secondWindow, importedEntries[0]);
    await assertHistoryRow(secondWindow, importedEntries[1]);
    assert.equal(await secondWindow.locator('#entries-container tbody tr').count(), 2);
    assert.equal(await secondWindow.locator('#stat-count').textContent(), '2');
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: history filters are hidden until applied and can be cleared', { timeout: 60_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entry = { date: '2025-05-20', mood: 4, sleep: 7, water: 1.7 };

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    assert.equal(await window.locator('#entries-container tbody tr').count(), 0);
    assert.match(await window.locator('#entries-container').textContent(), /Select both dates/);

    await createEntryThroughForm(window, entry);
    const dataPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeClear = await fsp.readFile(dataPath, 'utf8');

    await window.locator('#clear-history-filters-btn').click();
    await window.locator('#entries-container tbody').waitFor({ state: 'detached', timeout: 15_000 });
    assert.equal(await window.locator('#history-from-date').inputValue(), '');
    assert.equal(await window.locator('#history-to-date').inputValue(), '');
    assert.match(await window.locator('#entries-container').textContent(), /Select both dates/);
    assert.equal(await fsp.readFile(dataPath, 'utf8'), beforeClear);

    await showHistoryRange(window, entry.date, entry.date);
    await assertHistoryRow(window, entry);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: calendar deletion keeps the date selected and persists after restart', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entry = { date: localDateKey(-2), mood: 4, sleep: 7, water: 1.7 };

  try {
    const firstApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(firstApplication);
    const firstWindow = await getReadyWindow(firstApplication);
    await assertIsolatedUserData(firstApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(firstWindow, entry);

    const dateButton = await navigateCalendarToDate(firstWindow, entry.date);
    await dateButton.click();
    await firstWindow.locator('#calendar-details .calendar-detail-action[data-calendar-action="delete"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const confirmationHandled = handleConfirmation(
      firstWindow,
      dialog => {
        assert.equal(dialog.type(), 'confirm');
        assert.equal(dialog.message(), `Delete entry for ${entry.date}?`);
      },
      true
    );
    await Promise.all([
      confirmationHandled,
      firstWindow.locator('#calendar-details .calendar-detail-action[data-calendar-action="delete"]').click(),
    ]);
    const createButton = firstWindow.locator('#calendar-details .calendar-detail-action[data-calendar-action="create"]');
    await createButton.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await firstWindow.locator(`#calendar-grid .calendar-day[data-calendar-date="${entry.date}"]`).getAttribute('aria-pressed'), 'true');
    assert.match(await firstWindow.locator('#calendar-details').textContent(), /No entry recorded/);
    assert.equal(await firstWindow.locator('#calendar-details .calendar-detail-action[data-calendar-action="edit"]').count(), 0);

    await firstApplication.close();
    applications.pop();

    const secondApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(secondApplication);
    const secondWindow = await getReadyWindow(secondApplication);
    await assertIsolatedUserData(secondApplication, isolatedUserDataDirectory);
    const secondDateButton = await navigateCalendarToDate(secondWindow, entry.date);
    await secondDateButton.click();
    await secondWindow.locator('#calendar-details .calendar-detail-action[data-calendar-action="create"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await secondWindow.locator('#calendar-details').textContent(), /No entry recorded/);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: custom chart ranges preserve historical gaps and survive preset switching', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const firstEntry = { date: localDateKey(-40), mood: 2, sleep: 6, water: 0 };
  const secondEntry = { date: localDateKey(-38), mood: 5, sleep: 8, water: 2.4 };
  const missingDate = localDateKey(-39);

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, firstEntry);
    await createEntryThroughForm(window, secondEntry);

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="30"]').click();
    assert.equal(await window.locator('#trend-custom-form').isHidden(), true);
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    assert.equal(await window.locator('#trend-custom-form').isHidden(), false);
    await window.locator('#trend-custom-start').fill(firstEntry.date);
    await window.locator('#trend-custom-end').fill(secondEntry.date);
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: `from ${firstEntry.date} to ${secondEntry.date}`,
    }).waitFor({ state: 'visible', timeout: 15_000 });
    await window.locator('.trend-data-details summary').click();
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 3);
    await assertTrendDataRow(window, firstEntry.date, ['2', '6 h', '0 L']);
    await assertTrendDataRow(window, missingDate, ['— Missing', '— Missing', '— Missing']);
    await assertTrendDataRow(window, secondEntry.date, ['5', '8 h', '2.4 L']);

    await window.locator('#trend-custom-start').fill(secondEntry.date);
    await window.locator('#trend-custom-end').fill(firstEntry.date);
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-custom-error').filter({ hasText: /on or after/ })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#trend-range-status').textContent(), new RegExp(`from ${firstEntry.date} to ${secondEntry.date}`));

    await window.locator('.trend-period-btn[data-trend-days="7"]').click();
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="7"]').getAttribute('aria-pressed'), 'true');
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    assert.equal(await window.locator('#trend-custom-start').inputValue(), firstEntry.date);
    assert.equal(await window.locator('#trend-custom-end').inputValue(), secondEntry.date);
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="custom"]').getAttribute('aria-pressed'), 'true');
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});
