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

function localMonthKey(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0')].join('-');
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
    assert.equal(await firstWindow.locator('#entries-container tbody tr').count(), 0);

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

    assert.equal(await secondWindow.locator('#history-from-date').inputValue(), entry.date);
    assert.equal(await secondWindow.locator('#history-to-date').inputValue(), entry.date);
    assert.equal(await secondWindow.locator('#entries-container tbody tr').count(), 0);

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

test('Electron E2E: undoes a History deletion and persists the restoration', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entry = { date: '2025-03-14', mood: 4, sleep: 7.5, water: 1.6 };

  try {
    const firstApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(firstApplication);
    const firstWindow = await getReadyWindow(firstApplication);
    await assertIsolatedUserData(firstApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(firstWindow, entry);
    await showHistoryRange(firstWindow, entry.date, entry.date);

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
      firstWindow.locator(`.btn-delete[data-date="${entry.date}"]`).click(),
    ]);
    await firstWindow.locator('#undo-delete-status.is-visible').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await firstWindow.locator('#undo-delete-message').textContent(), /deleted/);
    await firstWindow.locator('#undo-delete-btn').click();
    await firstWindow.locator('#undo-delete-message').filter({ hasText: 'restored' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await showHistoryRange(firstWindow, entry.date, entry.date);
    await assertHistoryRow(firstWindow, entry);
    assert.equal(await firstWindow.locator('#undo-delete-btn').isHidden(), true);

    await firstApplication.close();
    applications.pop();

    const secondApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(secondApplication);
    const secondWindow = await getReadyWindow(secondApplication);
    await assertIsolatedUserData(secondApplication, isolatedUserDataDirectory);
    await showHistoryRange(secondWindow, entry.date, entry.date);
    await assertHistoryRow(secondWindow, entry);
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
    assert.equal(await window.locator('.trend-period-btn').count(), 5);
    for (const period of ['7', '30', '90', 'custom', 'compare']) {
      assert.equal(await window.locator(`.trend-period-btn[data-trend-days="${period}"]`).count(), 1);
    }
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

test('Electron E2E: explores single-period daily and aggregated chart points', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const dailyEntry = { date: localDateKey(-2), mood: 2, sleep: 0, water: 0 };
  const secondDailyEntry = { date: localDateKey(0), mood: 5, sleep: 8, water: 2.4 };
  const weeklyEntries = [
    { date: '2024-01-01', mood: 4, sleep: 0, water: 1 },
    { date: '2024-01-03', mood: 2, sleep: 8, water: 2 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    await createEntryThroughForm(window, dailyEntry);
    await createEntryThroughForm(window, secondDailyEntry);
    await createEntryThroughForm(window, weeklyEntries[0]);
    await createEntryThroughForm(window, weeklyEntries[1]);

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="7"]').click();
    await window.setViewportSize({ width: 320, height: 600 });
    const moodPoint = window.locator(
      `svg[data-metric="mood"] circle[data-date="${dailyEntry.date}"]`
    );
    const dailyDetails = window.locator('#trend-point-details-mood');
    await moodPoint.hover();
    await dailyDetails.waitFor({ state: 'visible', timeout: 15_000 });
    const tooltipBox = await dailyDetails.boundingBox();
    assert.ok(tooltipBox && tooltipBox.x >= 0 && tooltipBox.x + tooltipBox.width <= 320);
    assert.match(await dailyDetails.textContent(), new RegExp(dailyEntry.date));
    assert.equal(await dailyDetails.locator('.trend-point-history-action').count(), 0);
    await window.locator('#history-view-charts').hover();
    await dailyDetails.waitFor({ state: 'hidden', timeout: 15_000 });
    await moodPoint.click();
    await dailyDetails.waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await dailyDetails.textContent(), new RegExp(dailyEntry.date));
    assert.match(await dailyDetails.textContent(), /2/);
    assert.equal(await dailyDetails.locator('.trend-point-history-action').count(), 1);
    assert.equal(await dailyDetails.locator('.trend-point-history-action').isVisible(), true);

    const explorer = window.locator('.trend-chart-explorer[data-chart-explorer-metric="mood"]');
    await explorer.focus();
    await explorer.press('ArrowRight');
    await dailyDetails.filter({ hasText: secondDailyEntry.date }).waitFor({ state: 'visible', timeout: 15_000 });

    await dailyDetails.locator('.trend-point-history-action').click();
    await assertHistoryRow(window, secondDailyEntry);

    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    await window.locator('#trend-custom-type').selectOption('year');
    await window.locator('#trend-custom-year').fill('2024');
    await window.locator('#trend-custom-resolution').selectOption('weekly');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: 'Showing calendar year 2024 as Weekly averages',
    }).waitFor({ state: 'visible', timeout: 15_000 });

    const weeklyPoint = window.locator(
      'svg[data-metric="sleep"][data-resolution="weekly"] circle[data-period-key="01"]'
    );
    await weeklyPoint.click();
    const weeklyDetails = window.locator('#trend-point-details-sleep');
    await weeklyDetails.waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await weeklyDetails.textContent(), /Week 1/);
    assert.match(await weeklyDetails.textContent(), /2024-01-01 to 2024-01-07/);
    assert.match(await weeklyDetails.textContent(), /4 h/);
    assert.match(await weeklyDetails.textContent(), /Recorded days\s*2/);
    assert.equal(await weeklyDetails.locator('.trend-point-history-action').count(), 0);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: explores both series in daily and aggregated comparisons', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = [
    { date: '2024-02-01', mood: 4, sleep: 0, water: 1 },
    { date: '2025-02-01', mood: 2, sleep: 8, water: 2 },
    { date: '2024-01-01', mood: 5, sleep: 0, water: 1 },
    { date: '2025-01-02', mood: 3, sleep: 6, water: 0 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    for (const entry of entries) await createEntryThroughForm(window, entry);

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    assert.equal(await window.locator('#trend-comparison-type').inputValue(), 'month');
    await window.locator('#trend-comparison-first-month').fill('2024-02');
    await window.locator('#trend-comparison-second-month').fill('2025-02');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: 'Comparing February 2024 with February 2025',
    }).waitFor({ state: 'visible', timeout: 15_000 });

    const firstMoodPoint = window.locator(
      'svg[data-metric="mood"] circle[data-comparison-series="first"][data-date="2024-02-01"]'
    );
    const moodDetails = window.locator('#trend-point-details-mood');
    await firstMoodPoint.hover();
    await moodDetails.waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await moodDetails.textContent(), /First period: February 2024/);
    await firstMoodPoint.click();
    await moodDetails.waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await moodDetails.textContent(), /First period: February 2024/);
    assert.match(await moodDetails.textContent(), /2024-02-01/);
    assert.equal(await moodDetails.locator('.trend-point-history-action').count(), 1);

    await moodDetails.locator('.trend-point-history-action').click();
    await assertHistoryRow(window, entries[0]);

    const moodSeriesSelect = window.locator('#trend-comparison-series-mood');
    await moodSeriesSelect.selectOption('second');
    const moodExplorer = window.locator('.trend-chart-explorer[data-chart-explorer-metric="mood"]');
    await moodExplorer.focus();
    await moodExplorer.press('ArrowRight');
    await moodDetails.filter({ hasText: 'Second period: February 2025' }).waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await moodDetails.textContent(), /2025-02-01/);

    const appliedPointDate = await window.locator(
      'svg[data-metric="mood"] circle[data-comparison-series="first"][data-date="2024-02-01"]'
    ).getAttribute('data-date');
    await window.locator('#trend-comparison-first-month').fill('2023-02');
    assert.equal(await window.locator(
      'svg[data-metric="mood"] circle[data-comparison-series="first"][data-date="2024-02-01"]'
    ).getAttribute('data-date'), appliedPointDate);

    await window.locator('#trend-comparison-type').selectOption('year');
    await window.locator('#trend-comparison-first-year').fill('2024');
    await window.locator('#trend-comparison-second-year').fill('2025');
    await window.locator('#trend-comparison-resolution').selectOption('weekly');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: 'Weekly averages: Comparing 2024 with 2025',
    }).waitFor({ state: 'visible', timeout: 15_000 });

    const secondWeeklySleepPoint = window.locator(
      'svg[data-metric="sleep"] circle[data-comparison-series="second"][data-alignment-key="01"]'
    );
    await secondWeeklySleepPoint.click();
    const sleepDetails = window.locator('#trend-point-details-sleep');
    await sleepDetails.waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await sleepDetails.textContent(), /Second period: 2025/);
    assert.match(await sleepDetails.textContent(), /2025-01-01 to 2025-01-07/);
    assert.match(await sleepDetails.textContent(), /6 h/);
    assert.match(await sleepDetails.textContent(), /Recorded days\s*1/);
    assert.equal(await sleepDetails.locator('.trend-point-history-action').count(), 0);
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

test('Electron E2E: paginates filtered history and clamps after deleting the final page', { timeout: 120_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = Array.from({ length: 26 }, (_, index) => ({
    date: '2025-01-' + String(index + 1).padStart(2, '0'),
    mood: (index % 5) + 1,
    sleep: index % 9,
    water: (index % 10) / 10,
  }));

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    for (const entry of entries) await createEntryThroughForm(window, entry);

    await showHistoryRange(window, '2025-01-01', '2025-01-31');
    await window.setViewportSize({ width: 320, height: 700 });
    assert.equal(await window.locator('#entries-container tbody tr').count(), 25);
    assert.match(await window.locator('#history-page-status').textContent(), /Showing 1–25 of 26 matching entries/);
    assert.equal(await window.locator('#history-previous-page-btn').isDisabled(), true);
    assert.equal(await window.locator('#history-next-page-btn').isDisabled(), false);
    const tableScroll = window.locator('.history-table-scroll');
    const paginationBefore = await window.locator('.history-pagination').boundingBox();
    const dateBefore = await window.locator('.history-table tbody tr').first().locator('td').first().boundingBox();
    const headerBefore = await window.locator('.history-table thead th').first().boundingBox();
    await tableScroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    const paginationAfter = await window.locator('.history-pagination').boundingBox();
    const dateAfter = await window.locator('.history-table tbody tr').first().locator('td').first().boundingBox();
    assert.ok(paginationBefore && paginationAfter);
    assert.ok(Math.abs(paginationBefore.x - paginationAfter.x) < 1);
    assert.ok(paginationAfter.x >= 0 && paginationAfter.x + paginationAfter.width <= 320);
    assert.ok(dateBefore && dateAfter && Math.abs(dateBefore.x - dateAfter.x) < 1);
    assert.ok(await window.locator('.history-table tbody tr').first().locator('.btn-edit').isVisible());
    assert.ok(await window.locator('.history-table tbody tr').first().locator('.btn-delete').isVisible());

    await tableScroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const headerAfter = await window.locator('.history-table thead th').first().boundingBox();
    assert.ok(headerBefore && headerAfter && Math.abs(headerBefore.y - headerAfter.y) < 1);

    await window.locator('#history-next-page-btn').click();
    await window.locator('#history-page-status').filter({ hasText: 'Showing 26–26 of 26 matching entries' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#entries-container tbody tr').count(), 1);
    assert.equal(await window.locator('#entries-container tbody tr').first().locator('td').first().textContent(), '2025-01-01');

    const deletionDialog = handleConfirmation(window, dialog => {
      assert.equal(dialog.type(), 'confirm');
      assert.equal(dialog.message(), 'Delete entry for 2025-01-01?');
    }, true);
    await Promise.all([
      deletionDialog,
      window.locator('#entries-container .btn-delete[data-date="2025-01-01"]').click(),
    ]);
    await window.locator('#history-page-status').filter({ hasText: 'Showing 1–25 of 25 matching entries' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#entries-container tbody tr').count(), 25);
    assert.equal(await window.locator('#entries-container .btn-delete[data-date="2025-01-01"]').count(), 0);
    assert.equal(await window.locator('#history-previous-page-btn').count(), 0);
    assert.equal(await window.locator('#history-next-page-btn').count(), 0);
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

test('Electron E2E: Calendar deletion shares the Undo action and restores the selected date', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entry = { date: localDateKey(-3), mood: 2, sleep: 0, water: 0 };

  try {
    const application = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(application);
    const window = await getReadyWindow(application);
    await assertIsolatedUserData(application, isolatedUserDataDirectory);
    await createEntryThroughForm(window, entry);

    const dateButton = await navigateCalendarToDate(window, entry.date);
    await dateButton.click();
    const deleteButton = window.locator('#calendar-details .calendar-detail-action[data-calendar-action="delete"]');
    await deleteButton.waitFor({ state: 'visible', timeout: 15_000 });
    const confirmationHandled = handleConfirmation(
      window,
      dialog => {
        assert.equal(dialog.type(), 'confirm');
        assert.equal(dialog.message(), `Delete entry for ${entry.date}?`);
      },
      true
    );
    await Promise.all([confirmationHandled, deleteButton.click()]);
    await window.locator('#calendar-details .calendar-detail-action[data-calendar-action="create"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await window.locator('#undo-delete-btn').click();
    await window.locator('#undo-delete-message').filter({ hasText: 'restored' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await window.locator('#calendar-details .calendar-detail-action[data-calendar-action="edit"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#calendar-details').textContent(), /Mood/);
    assert.equal(await window.locator(`#calendar-grid .calendar-day[data-calendar-date="${entry.date}"]`).getAttribute('aria-pressed'), 'true');
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
    await window.locator('#trend-custom-type').selectOption('date-range');
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

test('Electron E2E: custom calendar month and year periods use complete ranges', { timeout: 75_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    await window.locator('#trend-custom-type').selectOption('month');
    await window.locator('#trend-custom-month').fill('2024-02');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: 'from 2024-02-01 to 2024-02-29',
    }).waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#trend-custom-month-controls').isHidden(), false);
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 29);

    await window.locator('.trend-period-btn[data-trend-days="7"]').click();
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    assert.equal(await window.locator('#trend-custom-type').inputValue(), 'month');
    assert.equal(await window.locator('#trend-custom-month').inputValue(), '2024-02');

    await window.locator('#trend-custom-type').selectOption('year');
    await window.locator('#trend-custom-year').fill('2024');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: 'from 2024-01-01 to 2024-12-31',
    }).waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#trend-custom-year-controls').isHidden(), false);
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 366);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: applies Daily, Weekly, and Monthly Custom calendar-year displays through the real UI', { timeout: 120_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = [
    { date: '2024-01-01', mood: 2, sleep: 0, water: 0 },
    { date: '2024-01-07', mood: 4, sleep: 8, water: 2 },
    { date: '2024-02-29', mood: 5, sleep: 3, water: 0 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    for (const entry of entries) await createEntryThroughForm(window, entry);

    const entriesPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeChartControls = await fsp.readFile(entriesPath, 'utf8');
    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    assert.equal(await window.locator('#trend-custom-type').inputValue(), 'year');
    assert.equal(await window.locator('#trend-custom-resolution').inputValue(), 'daily');
    assert.equal(await window.locator('#trend-custom-year-controls').isHidden(), false);
    assert.equal(await window.locator('#trend-custom-resolution-controls').isHidden(), false);
    assert.equal(await window.locator('#trend-comparison-resolution-controls').isHidden(), true);
    assert.equal(await window.locator('label[for="trend-custom-resolution"]').textContent(), 'Display');
    assert.equal(await window.locator('#trend-custom-resolution').getAttribute('aria-describedby'), 'trend-custom-error');
    await window.locator('#trend-custom-type').selectOption('month');
    assert.equal(await window.locator('#trend-custom-resolution-controls').isHidden(), true);
    await window.locator('#trend-custom-type').selectOption('date-range');
    assert.equal(await window.locator('#trend-custom-resolution-controls').isHidden(), true);
    await window.locator('#trend-custom-type').selectOption('year');
    assert.equal(await window.locator('#trend-custom-resolution-controls').isHidden(), false);

    await window.locator('#trend-custom-year').fill('2024');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({
      hasText: 'Showing calendar year 2024 from 2024-01-01 to 2024-12-31',
    }).waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 366);
    await window.locator('.trend-data-details summary').click();
    assert.equal(await window.locator('.trend-data-details[open]').count(), 1);
    assert.equal(await window.locator('.trend-data-summary-expanded').isVisible(), true);
    await window.locator('.trend-data-details summary').click();
    assert.equal(await window.locator('.trend-data-details[open]').count(), 0);
    assert.equal(await window.locator('.trend-data-summary-collapsed').isVisible(), true);
    await window.locator('.trend-data-details summary').click();
    await assertTrendDataRow(window, '2024-01-01', ['2', '0 h', '0 L']);

    const dailyStatus = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-custom-resolution').selectOption('weekly');
    assert.equal(await window.locator('#trend-range-status').textContent(), dailyStatus);
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 366);
    assert.equal(await fsp.readFile(entriesPath, 'utf8'), beforeChartControls);

    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Showing calendar year 2024 as Weekly averages' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    const weeklyRows = window.locator('#trend-data-table-container tbody tr');
    assert.equal(await weeklyRows.count(), 53);
    const weekOne = weeklyRows.nth(0);
    assert.equal(await weekOne.locator('th').textContent(), 'Week 1');
    assert.deepEqual(await weekOne.locator('td').allTextContents(), [
      '2024-01-01 to 2024-01-07', '2', '7', '3', '4 h', '1 L',
    ]);
    const emptyWeek = weeklyRows.nth(1);
    assert.equal((await emptyWeek.locator('td').allTextContents())[3], 'Missing');
    const finalWeek = weeklyRows.nth(52);
    assert.equal(await finalWeek.locator('th').textContent(), 'Week 53');
    assert.deepEqual((await finalWeek.locator('td').allTextContents()).slice(0, 3), [
      '2024-12-30 to 2024-12-31', '0', '2',
    ]);
    const weeklyMoodChart = window.locator('svg[data-metric="mood"][data-resolution="weekly"]');
    assert.equal(await weeklyMoodChart.count(), 1);
    assert.equal(await weeklyMoodChart.locator('title').textContent(), 'Mood weekly averages for 2024');
    assert.match(await weeklyMoodChart.locator('desc').textContent(), /Missing periods are shown as gaps/);
    assert.match(await window.locator('#trend-data-table-container table').getAttribute('aria-label'), /weekly aggregated chart data for 2024/);

    await window.locator('#trend-custom-resolution').selectOption('monthly');
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 53);
    assert.match(await window.locator('#trend-range-status').textContent(), /Weekly averages/);
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Showing calendar year 2024 as Monthly averages' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    const monthlyRows = window.locator('#trend-data-table-container tbody tr');
    assert.equal(await monthlyRows.count(), 12);
    assert.equal(await monthlyRows.nth(0).locator('th').textContent(), 'January');
    assert.deepEqual(await monthlyRows.nth(0).locator('td').allTextContents(), [
      '2024-01-01 to 2024-01-31', '2', '31', '3', '4 h', '1 L',
    ]);
    assert.deepEqual(await monthlyRows.nth(1).locator('td').allTextContents(), [
      '2024-02-01 to 2024-02-29', '1', '29', '5', '3 h', '0 L',
    ]);
    assert.equal((await monthlyRows.nth(2).locator('td').allTextContents())[3], 'Missing');
    assert.equal(await window.locator('svg[data-metric="water"][data-resolution="monthly"] circle[data-period-key="02"][data-value="0"]').count(), 1);

    await window.locator('.trend-period-btn[data-trend-days="30"]').click();
    assert.equal(await window.locator('#trend-custom-form').isHidden(), true);
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    assert.equal(await window.locator('#trend-custom-year').inputValue(), '2024');
    assert.equal(await window.locator('#trend-custom-resolution').inputValue(), 'monthly');
    assert.match(await window.locator('#trend-range-status').textContent(), /Monthly averages/);
    await window.locator('#trend-custom-resolution').selectOption('daily');
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 12);
    assert.match(await window.locator('#trend-range-status').textContent(), /Monthly averages/);

    await showHistoryRange(window, '2024-01-01', '2024-01-01');
    await window.locator('.btn-edit[data-date="2024-01-01"]').click();
    await window.locator('input[name="mood"][value="5"]').check();
    await window.locator('#save-btn').click();
    await assertHistoryRow(window, { ...entries[0], mood: 5 });
    const updatedJanuary = window.locator('#trend-data-table-container tbody tr').nth(0);
    assert.deepEqual((await updatedJanuary.locator('td').allTextContents()).slice(1), [
      '2', '31', '4.5', '4 h', '1 L',
    ]);
    assert.equal(await window.locator('#trend-custom-resolution').inputValue(), 'daily');
    assert.match(await window.locator('#trend-range-status').textContent(), /Monthly averages/);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: backup restoration refreshes an applied Custom year resolution without applying its draft', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const existingEntry = { date: '2024-01-02', mood: 2, sleep: 6, water: 1 };
  const restoredEntries = [
    { date: '2024-01-01', mood: 1, sleep: 0, water: 0 },
    { date: '2024-01-07', mood: 5, sleep: 8, water: 2 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, existingEntry);

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    await window.locator('#trend-custom-year').fill('2024');
    await window.locator('#trend-custom-resolution').selectOption('weekly');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Showing calendar year 2024 as Weekly averages' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await window.locator('#trend-custom-resolution').selectOption('monthly');
    assert.match(await window.locator('#trend-range-status').textContent(), /Weekly averages/);

    const fixture = await writeBackupFixture(
      temporaryDirectory,
      'custom-year-restore.json',
      backupDocument(restoredEntries)
    );
    await selectBackupFile(window, fixture);
    await window.locator('#import-preview').waitFor({ state: 'visible', timeout: 15_000 });
    const confirmationHandled = handleConfirmation(
      window,
      dialog => assert.match(dialog.message(), /Replace all 1 currently saved entry with 2 backup entries/),
      true
    );
    await Promise.all([confirmationHandled, window.locator('#replace-import-btn').click()]);
    await window.locator('#backup-status').filter({ hasText: 'Backup restored. 2 entries are now saved.' })
      .waitFor({ state: 'visible', timeout: 15_000 });

    assert.match(await window.locator('#trend-range-status').textContent(), /Showing calendar year 2024 as Weekly averages/);
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 53);
    const weekOne = window.locator('#trend-data-table-container tbody tr').first();
    assert.equal(await weekOne.locator('th').textContent(), 'Week 1');
    assert.deepEqual(await weekOne.locator('td').allTextContents(), [
      '2024-01-01 to 2024-01-07', '2', '7', '3', '4 h', '1 L',
    ]);
    assert.equal(await window.locator('#trend-custom-resolution').inputValue(), 'monthly');
    assert.equal(await window.locator('svg[data-metric="mood"][data-resolution="weekly"] circle[data-period-key="01"][data-value="3"]').count(), 1);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: compares calendar months with gaps, zeroes, and nonexistent leap dates', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = [
    { date: '2024-02-01', mood: 2, sleep: 0, water: 0 },
    { date: '2024-02-29', mood: 5, sleep: 8, water: 2.4 },
    { date: '2025-02-01', mood: 4, sleep: 7, water: 1.2 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    for (const entry of entries) await createEntryThroughForm(window, entry);
    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    assert.equal(await window.locator('#trend-comparison-form').isHidden(), false);
    assert.equal(await window.locator('#trend-comparison-month-controls').isHidden(), false);
    await window.locator('#trend-comparison-first-month').fill('2024-02');
    await window.locator('#trend-comparison-second-month').fill('2025-02');
    await window.locator('#apply-trend-comparison-btn').click();

    await window.locator('#trend-range-status').filter({
      hasText: 'Comparing February 2024 with February 2025',
    }).waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('.trend-comparison-legend').first().textContent(), /February 2024/);
    assert.match(await window.locator('.trend-comparison-legend').first().textContent(), /February 2025/);
    for (const metric of ['mood', 'sleep', 'water']) {
      const chart = window.locator(`.trend-chart-card[data-metric="${metric}"] svg`);
      assert.equal(await chart.locator('circle.trend-comparison-point-first').count(), 2);
      assert.equal(await chart.locator('circle.trend-comparison-point-second').count(), 1);
    }

    await window.locator('.trend-data-details summary').click();
    const leapRow = window.locator('#trend-data-table-container tbody tr').filter({ hasText: /^29/ });
    await leapRow.waitFor({ state: 'visible', timeout: 15_000 });
    assert.deepEqual(await leapRow.locator('td').allTextContents(), [
      '29', '5', 'Not in period', '8 h', 'Not in period', '2.4 L', 'Not in period',
    ]);
    const missingRow = window.locator('#trend-data-table-container tbody tr').nth(1);
    await missingRow.waitFor({ state: 'visible', timeout: 15_000 });
    assert.deepEqual(await missingRow.locator('td').allTextContents(), [
      '2', 'Missing', 'Missing', 'Missing', 'Missing', 'Missing', 'Missing',
    ]);

    await window.locator('.trend-period-btn[data-trend-days="30"]').click();
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="30"]').getAttribute('aria-pressed'), 'true');
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    assert.equal(await window.locator('#trend-comparison-first-month').inputValue(), '2024-02');
    assert.equal(await window.locator('#trend-comparison-second-month').inputValue(), '2025-02');
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="compare"]').getAttribute('aria-pressed'), 'true');

    const entriesPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeComparisonInteractions = await fsp.readFile(entriesPath, 'utf8');
    const beforeDraft = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-comparison-first-month').fill('2023-02');
    assert.equal(await window.locator('#trend-range-status').textContent(), beforeDraft);
    await window.locator('#trend-comparison-first-month').fill('');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-comparison-error').filter({ hasText: /valid calendar months/ })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#trend-range-status').textContent(), /Comparing February 2024 with February 2025/);
    assert.equal(await window.locator('#trend-comparison-first-month').getAttribute('aria-invalid'), 'true');
    assert.equal(await fsp.readFile(entriesPath, 'utf8'), beforeComparisonInteractions);

    await showHistoryRange(window, entries[0].date, entries[0].date);
    await window.locator(`.btn-edit[data-date="${entries[0].date}"]`).click();
    await window.locator('input[name="mood"][value="3"]').check();
    await window.locator('#save-btn').click();
    assert.equal(await window.locator('.trend-period-btn[data-trend-days="compare"]').getAttribute('aria-pressed'), 'true');
    const updatedFebruaryRow = window.locator('#trend-data-table-container tbody tr').first();
    await updatedFebruaryRow.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal((await updatedFebruaryRow.locator('td').allTextContents())[1], '3');
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: compares calendar years without shifting March after leap day', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = [
    { date: '2024-02-29', mood: 5, sleep: 8, water: 2.4 },
    { date: '2024-03-01', mood: 2, sleep: 0, water: 0 },
    { date: '2025-03-01', mood: 4, sleep: 7, water: 1.5 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    for (const entry of entries) await createEntryThroughForm(window, entry);

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    await window.locator('#trend-comparison-type').selectOption('year');
    await window.locator('#trend-comparison-resolution').selectOption('daily');
    await window.locator('#trend-comparison-first-year').fill('2024');
    await window.locator('#trend-comparison-second-year').fill('2025');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Comparing 2024 with 2025' })
      .waitFor({ state: 'visible', timeout: 15_000 });

    await window.locator('.trend-data-details summary').click();
    const leapRow = window.locator('#trend-data-table-container tbody tr').filter({ hasText: /^02-29/ });
    await leapRow.waitFor({ state: 'visible', timeout: 15_000 });
    assert.deepEqual(await leapRow.locator('td').allTextContents(), [
      '02-29', '5', 'Not in period', '8 h', 'Not in period', '2.4 L', 'Not in period',
    ]);
    const marchRow = window.locator('#trend-data-table-container tbody tr').filter({ hasText: /^03-01/ });
    await marchRow.waitFor({ state: 'visible', timeout: 15_000 });
    assert.deepEqual(await marchRow.locator('td').allTextContents(), [
      '03-01', '2', '4', '0 h', '7 h', '0 L', '1.5 L',
    ]);
    const moodChart = window.locator('.trend-chart-card[data-metric="mood"] svg');
    assert.ok(await moodChart.locator('circle.trend-comparison-point-first').count() > 0);
    assert.ok(await moodChart.locator('circle.trend-comparison-point-second').count() > 0);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: applies weekly and monthly year comparison resolutions through the real UI', { timeout: 120_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;
  const entries = [
    { date: '2024-01-01', mood: 2, sleep: 0, water: 0 },
    { date: '2024-01-07', mood: 4, sleep: 8, water: 2 },
    { date: '2025-01-01', mood: 3, sleep: 6, water: 1 },
    { date: '2024-02-01', mood: 2, sleep: 4, water: 1 },
    { date: '2024-02-15', mood: 4, sleep: 8, water: 2 },
    { date: '2025-02-01', mood: 5, sleep: 2, water: 0.5 },
  ];

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    for (const entry of entries) await createEntryThroughForm(window, entry);

    const entriesPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeComparisonControls = await fsp.readFile(entriesPath, 'utf8');
    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    await window.locator('#trend-comparison-type').selectOption('year');
    assert.equal(await window.locator('#trend-comparison-resolution').inputValue(), 'weekly');
    assert.equal(await window.locator('#trend-comparison-resolution-controls').isHidden(), false);

    await window.locator('#trend-comparison-type').selectOption('month');
    assert.equal(await window.locator('#trend-comparison-resolution-controls').isHidden(), true);
    await window.locator('#trend-comparison-type').selectOption('year');
    assert.equal(await window.locator('#trend-comparison-resolution').inputValue(), 'weekly');
    await window.locator('#trend-comparison-first-year').fill('2024');
    await window.locator('#trend-comparison-second-year').fill('2025');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Weekly averages: Comparing 2024 with 2025' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await window.locator('.trend-data-details summary').click();

    const weeklyRows = window.locator('#trend-data-table-container tbody tr');
    assert.equal(await weeklyRows.count(), 53);
    const weekOne = weeklyRows.nth(0);
    assert.deepEqual(await weekOne.locator('td').allTextContents(), [
      'Week 1', '2024-01-01 to 2024-01-07', '2025-01-01 to 2025-01-07',
      '2', '1', '7', '7', '3', '3', '4 h', '6 h', '1 L', '1 L',
    ]);
    const emptyWeek = weeklyRows.nth(1);
    assert.equal((await emptyWeek.locator('td').allTextContents())[9], 'Missing');
    assert.equal((await emptyWeek.locator('td').allTextContents())[3], '0');
    assert.ok(await window.locator('.trend-chart-card[data-metric="sleep"] .trend-comparison-point-first').count() > 0);
    assert.ok(await window.locator('.trend-chart-card[data-metric="sleep"] .trend-comparison-point-second').count() > 0);

    const weeklyStatus = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-comparison-resolution').selectOption('monthly');
    assert.equal(await window.locator('#trend-range-status').textContent(), weeklyStatus);
    assert.equal(await window.locator('#trend-data-table-container tbody tr').count(), 53);
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Monthly averages: Comparing 2024 with 2025' })
      .waitFor({ state: 'visible', timeout: 15_000 });

    const monthlyRows = window.locator('#trend-data-table-container tbody tr');
    assert.equal(await monthlyRows.count(), 12);
    const february = monthlyRows.nth(1);
    assert.equal((await february.locator('td').allTextContents())[0], 'February');
    assert.equal((await february.locator('td').allTextContents())[3], '2');
    assert.equal((await february.locator('td').allTextContents())[9], '6 h');
    assert.equal((await february.locator('td').allTextContents())[10], '2 h');
    const emptyMarch = monthlyRows.nth(2);
    assert.equal((await emptyMarch.locator('td').allTextContents())[7], 'Missing');

    await window.locator('.trend-period-btn[data-trend-days="30"]').click();
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    assert.equal(await window.locator('#trend-comparison-resolution').inputValue(), 'monthly');
    assert.equal(await window.locator('#trend-comparison-first-year').inputValue(), '2024');
    assert.equal(await window.locator('#trend-comparison-second-year').inputValue(), '2025');

    await window.locator('#trend-comparison-first-year').fill('');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-comparison-error').filter({ hasText: /calendar years/ })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await window.locator('#trend-range-status').textContent(), /Monthly averages/);
    assert.equal(await fsp.readFile(entriesPath, 'utf8'), beforeComparisonControls);

    await showHistoryRange(window, '2024-02-01', '2024-02-01');
    await window.locator('.btn-edit[data-date="2024-02-01"]').click();
    await window.locator('input[name="mood"][value="5"]').check();
    await window.locator('#save-btn').click();
    await window.locator('#form-heading').filter({ hasText: 'Log a Wellness Entry' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    const updatedFebruary = window.locator('#trend-data-table-container tbody tr').nth(1);
    assert.equal((await updatedFebruary.locator('td').allTextContents())[7], '4.5');
    assert.equal(await window.locator('#trend-comparison-resolution').inputValue(), 'monthly');
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: navigates custom and comparison calendar-year drafts without applying early', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, { date: '2024-01-01', mood: 3, sleep: 6, water: 1 });
    await showHistoryRange(window, '2024-01-01', '2024-01-01');
    const entriesPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeNavigation = await fsp.readFile(entriesPath, 'utf8');

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    await window.locator('#trend-custom-type').selectOption('year');
    assert.equal(await window.locator('#trend-custom-year-prev').getAttribute('aria-label'), 'Previous year for custom period');
    await window.locator('#trend-custom-year').fill('2024');
    const beforeCustomApply = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-custom-year-next').click();
    assert.equal(await window.locator('#trend-custom-year').inputValue(), '2025');
    assert.equal(await window.locator('#trend-range-status').textContent(), beforeCustomApply);
    await window.locator('#trend-custom-year-prev').click();
    assert.equal(await window.locator('#trend-custom-year').inputValue(), '2024');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Showing calendar year 2024' })
      .waitFor({ state: 'visible', timeout: 15_000 });

    await window.locator('#trend-custom-year').fill('0000');
    assert.equal(await window.locator('#trend-custom-year-prev').isDisabled(), true);
    await window.locator('#trend-custom-year').fill('9999');
    assert.equal(await window.locator('#trend-custom-year-next').isDisabled(), true);

    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    await window.locator('#trend-comparison-type').selectOption('year');
    assert.equal(await window.locator('#trend-comparison-first-year-prev').getAttribute('aria-label'), 'Previous year for first comparison period');
    assert.equal(await window.locator('#trend-comparison-second-year-next').getAttribute('aria-label'), 'Next year for second comparison period');
    await window.locator('#trend-comparison-first-year').fill('2024');
    await window.locator('#trend-comparison-second-year').fill('2025');
    const beforeComparisonApply = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-comparison-first-year-prev').click();
    assert.equal(await window.locator('#trend-comparison-first-year').inputValue(), '2023');
    assert.equal(await window.locator('#trend-comparison-second-year').inputValue(), '2025');
    await window.locator('#trend-comparison-second-year-next').click();
    assert.equal(await window.locator('#trend-comparison-first-year').inputValue(), '2023');
    assert.equal(await window.locator('#trend-comparison-second-year').inputValue(), '2026');
    assert.equal(await window.locator('#trend-range-status').textContent(), beforeComparisonApply);
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Comparing 2023 with 2026' })
      .waitFor({ state: 'visible', timeout: 15_000 });

    await window.locator('#trend-comparison-first-year').fill('0000');
    assert.equal(await window.locator('#trend-comparison-first-year-prev').isDisabled(), true);
    await window.locator('#trend-comparison-second-year').fill('9999');
    assert.equal(await window.locator('#trend-comparison-second-year-next').isDisabled(), true);
    assert.equal(await fsp.readFile(entriesPath, 'utf8'), beforeNavigation);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: swaps and prepares comparison shortcuts without applying early', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, { date: '2023-12-01', mood: 2, sleep: 6, water: 1 });
    await createEntryThroughForm(window, { date: '2024-01-01', mood: 4, sleep: 8, water: 2 });
    await showHistoryRange(window, '2023-12-01', '2024-01-01');
    const entriesPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeShortcuts = await fsp.readFile(entriesPath, 'utf8');

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    assert.equal(await window.locator('#trend-comparison-swap-btn').getAttribute('aria-label'), 'Swap first and second comparison periods');
    await window.locator('#trend-comparison-first-month').fill('2023-12');
    await window.locator('#trend-comparison-second-month').fill('2024-01');
    const beforeApply = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-comparison-swap-btn').click();
    assert.equal(await window.locator('#trend-comparison-first-month').inputValue(), '2024-01');
    assert.equal(await window.locator('#trend-comparison-second-month').inputValue(), '2023-12');
    assert.equal(await window.locator('#trend-range-status').textContent(), beforeApply);
    await window.locator('#trend-comparison-swap-btn').click();
    assert.equal(await window.locator('#trend-comparison-first-month').inputValue(), '2023-12');
    assert.equal(await window.locator('#trend-comparison-second-month').inputValue(), '2024-01');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-range-status').filter({ hasText: 'Comparing December 2023 with January 2024' })
      .waitFor({ state: 'visible', timeout: 15_000 });

    await window.locator('#trend-comparison-second-month').fill('2024-01');
    const beforePreviousShortcut = await window.locator('#trend-range-status').textContent();
    await window.locator('#trend-comparison-previous-btn').click();
    assert.equal(await window.locator('#trend-comparison-first-month').inputValue(), '2023-12');
    assert.equal(await window.locator('#trend-comparison-second-month').inputValue(), '2024-01');
    assert.equal(await window.locator('#trend-range-status').textContent(), beforePreviousShortcut);

    await window.locator('#trend-comparison-current-btn').click();
    assert.equal(await window.locator('#trend-comparison-first-month').inputValue(), localMonthKey(-1));
    assert.equal(await window.locator('#trend-comparison-second-month').inputValue(), localMonthKey(0));
    assert.equal(await window.locator('#trend-range-status').textContent(), beforePreviousShortcut);

    await window.locator('#trend-comparison-type').selectOption('year');
    await window.locator('#trend-comparison-second-year').fill('0000');
    assert.equal(await window.locator('#trend-comparison-previous-btn').isDisabled(), true);
    await window.locator('#trend-comparison-second-year').fill('');
    assert.equal(await window.locator('#trend-comparison-previous-btn').isDisabled(), false);
    await window.locator('#trend-comparison-previous-btn').click();
    await window.locator('#trend-comparison-error').filter({ hasText: /valid second calendar year/ })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await fsp.readFile(entriesPath, 'utf8'), beforeShortcuts);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: displays applied period and comparison statistics from committed entries', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);
    await createEntryThroughForm(window, { date: '2024-01-01', mood: 2, sleep: 0, water: 0 });
    await createEntryThroughForm(window, { date: '2024-01-02', mood: 4, sleep: 8, water: 2 });
    await createEntryThroughForm(window, { date: '2025-01-01', mood: 5, sleep: 6, water: 1 });

    await window.locator('#history-view-charts').click();
    await window.locator('.trend-period-btn[data-trend-days="custom"]').click();
    await window.locator('#trend-custom-type').selectOption('year');
    await window.locator('#trend-custom-year').fill('2024');
    await window.locator('#apply-trend-custom-btn').click();
    await window.locator('#trend-statistics').filter({ hasText: 'Period statistics' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    const statisticsDisclosure = window.locator('#trend-statistics > details.trend-statistics-disclosure');
    await statisticsDisclosure.locator('summary').first().click();
    assert.match(await window.locator('#trend-statistics').textContent(),
      /2 recorded days out of 366 calendar days/);
    const periodRows = window.locator('#trend-statistics tbody tr');
    assert.deepEqual(await periodRows.nth(1).locator('th, td').allTextContents(), ['Sleep', '4.0 h', '0.0 h', '8.0 h']);
    assert.deepEqual(await periodRows.nth(2).locator('th, td').allTextContents(), ['Water', '1.0 L', '0.0 L', '2.0 L']);

    await window.locator('#trend-custom-year').fill('2025');
    assert.match(await window.locator('#trend-statistics').textContent(), /2024-01-01 to 2024-12-31/);

    await window.locator('.trend-period-btn[data-trend-days="compare"]').click();
    await window.locator('#trend-comparison-type').selectOption('year');
    await window.locator('#trend-comparison-first-year').fill('2024');
    await window.locator('#trend-comparison-second-year').fill('2025');
    await window.locator('#apply-trend-comparison-btn').click();
    await window.locator('#trend-statistics').filter({ hasText: 'Comparison statistics' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    const comparisonDisclosure = window.locator('#trend-statistics > details.trend-statistics-disclosure');
    await comparisonDisclosure.locator('summary').first().click();
    assert.match(await window.locator('#trend-statistics').textContent(), /Differences are second period minus first period/);
    const comparisonTables = window.locator('#trend-statistics table');
    const comparisonRows = comparisonTables.nth(1).locator('tbody tr');
    assert.deepEqual(await comparisonRows.nth(1).locator('th, td').allTextContents(), ['Sleep', '4.0 h', '6.0 h', '+2.0 h']);
    assert.deepEqual(await comparisonRows.nth(2).locator('th, td').allTextContents(), ['Water', '1.0 L', '1.0 L', '0 L']);
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});

test('Electron E2E: navigates entry dates, copies previous values, and edits existing dates explicitly', { timeout: 90_000 }, async () => {
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), E2E_DIRECTORY_PREFIX));
  const isolatedUserDataDirectory = await fsp.realpath(temporaryDirectory);
  const applications = [];
  let testFailure;

  try {
    const electronApplication = await launchIsolatedElectron(isolatedUserDataDirectory);
    applications.push(electronApplication);
    const window = await getReadyWindow(electronApplication);
    await assertIsolatedUserData(electronApplication, isolatedUserDataDirectory);

    await createEntryThroughForm(window, { date: '2025-06-10', mood: 3, sleep: 6, water: 1.5 });
    const entriesPath = path.join(isolatedUserDataDirectory, 'entries.json');
    const beforeCopy = await fsp.readFile(entriesPath, 'utf8');

    await window.locator('#entry-date').fill('2025-06-11');
    await window.locator('#entry-date-prev').click();
    assert.equal(await window.locator('#entry-date').inputValue(), '2025-06-10');
    await window.locator('#entry-date-next').click();
    assert.equal(await window.locator('#entry-date').inputValue(), '2025-06-11');
    await window.locator('#copy-previous-values-btn').click();
    await window.locator('#entry-date-status').filter({ hasText: 'Copied values from 2025-06-10' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('input[name="mood"]:checked').inputValue(), '3');
    assert.equal(await window.locator('#entry-sleep').inputValue(), '6');
    assert.equal(await window.locator('#entry-water').inputValue(), '1.5');
    assert.equal(await fsp.readFile(entriesPath, 'utf8'), beforeCopy);

    await window.locator('#save-btn').click();
    await showHistoryRange(window, '2025-06-11', '2025-06-11');
    await assertHistoryRow(window, { date: '2025-06-11', mood: 3, sleep: 6, water: 1.5 });

    await window.locator('#entry-date').fill('2025-06-10');
    await window.locator('#entry-date-status').filter({ hasText: 'already saved' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#edit-existing-entry-btn').isVisible(), true);
    assert.equal(await window.locator('#edit-existing-entry-btn').getAttribute('aria-label'), 'Edit existing entry for 2025-06-10');
    const editConfirmation = handleConfirmation(window, dialog => {
      assert.match(dialog.message(), /Discard unsaved form changes/);
    }, true);
    await window.locator('#edit-existing-entry-btn').click();
    await editConfirmation;
    await window.locator('#form-heading').filter({ hasText: 'Edit Wellness Entry' })
      .waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await window.locator('#entry-date').isEditable(), false);
    await window.locator('#cancel-edit-btn').click();
    await window.locator('#form-heading').filter({ hasText: 'Log a Wellness Entry' })
      .waitFor({ state: 'visible', timeout: 15_000 });
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await finishIsolatedTest(applications, temporaryDirectory, testFailure);
  }
});
