'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const coreSource = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'core.js'), 'utf8');
const viewsSource = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'views.js'), 'utf8');
const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'styles', 'app.css'), 'utf8');

class Element {
  constructor(id) {
    this.id = id;
    this.tagName = String(id).toUpperCase();
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.readOnly = false;
    this.disabled = false;
    this.checked = false;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.classList = { add() {}, remove() {} };
    this.listeners = {};
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  focus() {
    if (this.disabled) return false;
    this.focused = true;
    return true;
  }
  scrollIntoView() { this.scrolled = true; }
  reset() { this.value = ''; this.checked = false; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    this[name] = String(value);
    if (name === 'hidden') this.hidden = true;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  click() { this.clicked = true; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1) ? this : null;
    if (selector.startsWith('.')) {
      return this.className && this.className.split(/\s+/).includes(selector.slice(1)) ? this : null;
    }
    return null;
  }
}

function makeApp() {
  const elements = new Map();
  ['entry-date', 'entry-sleep', 'entry-water', 'form-heading', 'save-btn',
   'cancel-edit-btn', 'form-error', 'table-error', 'erase-all-btn', 'export-backup-btn', 'import-backup-btn',
   'import-backup-input', 'cancel-import-btn', 'replace-import-btn', 'backup-error', 'backup-status', 'import-preview',
   'import-preview-summary', 'import-preview-exported-at', 'import-preview-warning',
   'entries-container', 'entries-heading', 'entry-form', 'app-error', 'sleep-value',
   'history-filter-form', 'history-from-date', 'history-to-date', 'show-history-btn',
   'clear-history-filters-btn', 'history-filter-error', 'history-status',
   'trend-custom-form', 'trend-custom-type', 'trend-custom-start', 'trend-custom-end',
   'trend-custom-month', 'trend-custom-year', 'trend-custom-date-range-controls',
   'trend-custom-month-controls', 'trend-custom-year-controls', 'trend-custom-month-prev',
   'trend-custom-month-next', 'trend-custom-year-prev', 'trend-custom-year-next',
   'apply-trend-custom-btn',
   'trend-custom-error', 'trend-range-status',
   'trend-comparison-form', 'trend-comparison-type', 'trend-comparison-first-month',
   'trend-comparison-second-month', 'trend-comparison-first-year', 'trend-comparison-second-year',
   'trend-comparison-month-controls', 'trend-comparison-year-controls',
   'trend-comparison-first-month-prev', 'trend-comparison-first-month-next',
   'trend-comparison-second-month-prev', 'trend-comparison-second-month-next',
   'trend-comparison-first-year-prev', 'trend-comparison-first-year-next',
   'trend-comparison-second-year-prev', 'trend-comparison-second-year-next',
   'trend-comparison-resolution-controls', 'trend-comparison-resolution',
   'trend-comparison-swap-btn', 'trend-comparison-previous-btn',
   'trend-comparison-current-btn', 'apply-trend-comparison-btn', 'trend-comparison-error',
   'water-value', 'sleep-minus', 'sleep-plus', 'water-minus', 'water-plus',
   'entry-form-section',
   'stat-count', 'stat-mood', 'stat-sleep', 'stat-water',
   'sleep-unit', 'water-unit', 'history-trends-section', 'history-view-charts',
   'history-view-calendar', 'history-charts-panel', 'history-calendar-panel',
   'calendar-prev-btn', 'calendar-next-btn', 'calendar-month-heading',
   'calendar-month-status', 'calendar-grid', 'calendar-details', 'trend-chart-list',
   'trend-data-table-container', 'trend-period-7', 'trend-period-30',
   'trend-period-90'].forEach(id => {
    elements.set(id, new Element(id));
  });
  elements.get('trend-custom-date-range-controls').hidden = false;
  elements.get('trend-custom-month-controls').hidden = true;
  elements.get('trend-custom-year-controls').hidden = true;
  elements.get('trend-custom-type').value = 'date-range';
  elements.get('trend-comparison-month-controls').hidden = false;
  elements.get('trend-comparison-year-controls').hidden = true;
  elements.get('trend-comparison-type').value = 'month';
  elements.get('trend-comparison-resolution').value = 'weekly';
  elements.get('trend-comparison-resolution-controls').hidden = true;
  [
    ['trend-custom-month-prev', 'custom', '-1', 'Previous month for custom period'],
    ['trend-custom-month-next', 'custom', '1', 'Next month for custom period'],
    ['trend-comparison-first-month-prev', 'comparison-first', '-1', 'Previous month for first comparison period'],
    ['trend-comparison-first-month-next', 'comparison-first', '1', 'Next month for first comparison period'],
    ['trend-comparison-second-month-prev', 'comparison-second', '-1', 'Previous month for second comparison period'],
    ['trend-comparison-second-month-next', 'comparison-second', '1', 'Next month for second comparison period'],
  ].forEach(([id, monthDraft, monthOffset, label]) => {
    const button = elements.get(id);
    button.className = 'trend-month-nav-btn';
    button.dataset.monthDraft = monthDraft;
    button.dataset.monthOffset = monthOffset;
    button.setAttribute('aria-label', label);
  });
  [
    ['trend-custom-year-prev', 'custom', '-1', 'Previous year for custom period'],
    ['trend-custom-year-next', 'custom', '1', 'Next year for custom period'],
    ['trend-comparison-first-year-prev', 'comparison-first', '-1', 'Previous year for first comparison period'],
    ['trend-comparison-first-year-next', 'comparison-first', '1', 'Next year for first comparison period'],
    ['trend-comparison-second-year-prev', 'comparison-second', '-1', 'Previous year for second comparison period'],
    ['trend-comparison-second-year-next', 'comparison-second', '1', 'Next year for second comparison period'],
  ].forEach(([id, yearDraft, yearOffset, label]) => {
    const button = elements.get(id);
    button.className = 'trend-year-nav-btn';
    button.dataset.yearDraft = yearDraft;
    button.dataset.yearOffset = yearOffset;
    button.setAttribute('aria-label', label);
  });
  [
    ['trend-comparison-swap-btn', 'swap', 'Swap first and second comparison periods'],
    ['trend-comparison-previous-btn', 'previous', 'Set the first comparison period to the period before the second'],
    ['trend-comparison-current-btn', 'current', 'Set comparison periods to the previous and current periods'],
  ].forEach(([id, shortcut, label]) => {
    const button = elements.get(id);
    button.className = 'trend-comparison-shortcut-btn';
    button.dataset.comparisonShortcut = shortcut;
    button.setAttribute('aria-label', label);
  });
  [7, 30, 90].forEach(dayCount => {
    const button = elements.get('trend-period-' + dayCount);
    button.className = 'trend-period-btn';
    button.dataset.trendDays = String(dayCount);
  });
  const customTrendButton = new Element('trend-period-custom');
  customTrendButton.className = 'trend-period-btn';
  customTrendButton.dataset.trendDays = 'custom';
  elements.set('trend-period-custom', customTrendButton);
  const comparisonTrendButton = new Element('trend-period-compare');
  comparisonTrendButton.className = 'trend-period-btn';
  comparisonTrendButton.dataset.trendDays = 'compare';
  elements.set('trend-period-compare', comparisonTrendButton);
  const radios = [1, 2, 3, 4, 5].map(value => {
    const radio = new Element('mood-' + value);
    radio.value = String(value);
    return radio;
  });
  const buttons = [];
  const downloads = { blobs: [], urls: [], revoked: [], links: [] };
  class BlobMock {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
      downloads.blobs.push(this);
    }
  }
  const body = {
    children: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      downloads.links.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(candidate => candidate !== child);
      child.parentNode = null;
    },
  };
  const document = {
    getElementById(id) { return elements.get(id); },
    createElement(tag) { return new Element(tag); },
    createElementNS(_, tag) { return new Element(tag); },
    querySelector(selector) {
      if (selector === 'input[name="mood"]:checked') return radios.find(r => r.checked) || null;
      if (selector === 'input[name="mood"]') return radios[0];
      if (selector === '#calendar-details .calendar-detail-action[data-calendar-action="create"]') {
        return elements.get('calendar-details').children.find(button =>
          button.dataset && button.dataset.calendarAction === 'create'
        ) || null;
      }
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="mood"]') return radios;
      if (selector === '#entries-container .btn-edit') return buttons.filter(b => b.className === 'btn-edit');
      if (selector === '#entries-container .btn-delete') return buttons.filter(b => b.className === 'btn-delete');
      if (selector === '#entries-container .btn-edit, #entries-container .btn-delete') return buttons;
      if (selector === '.trend-period-btn') {
        return [7, 30, 90].map(dayCount => elements.get('trend-period-' + dayCount))
          .concat(customTrendButton, comparisonTrendButton);
      }
      if (selector === '#calendar-details .calendar-detail-action') {
        return elements.get('calendar-details').children.filter(button =>
          button.className && button.className.includes('calendar-detail-action')
        );
      }
      return [];
    },
    body,
    addEventListener() {},
  };
  const storage = { value: null, getItem() { return this.value; }, setItem(_, value) { this.value = String(value); } };
  const confirms = [];
  const confirmationMessages = [];
  const sandbox = {
    document,
    localStorage: storage,
    console,
    window: {
      confirm(message) {
        confirmationMessages.push(message);
        return confirms.shift() ?? true;
      },
      setTimeout(callback) { callback(); },
    },
    Date,
    Blob: BlobMock,
    URL: {
      createObjectURL(blob) {
        const url = 'blob:wellness-tracker-' + (downloads.urls.length + 1);
        downloads.urls.push({ url, blob });
        return url;
      },
      revokeObjectURL(url) { downloads.revoked.push(url); },
    },
  };
  vm.createContext(sandbox);
  const source = appSource + '\nthis.__api = { init, render, renderHistoryTrends, renderHistoryTrendsForCurrentState, renderCharts, renderCalendar, renderCalendarForCurrentState, renderCalendarDetails, renderHistoryTable, getHistoryRenderState, handleHistoryFilterSubmit, invalidateAppliedHistoryRange, handleClearHistoryFilters, ensureCalendarMonth, normalizeCalendarSelection, setHistoryView, setTrendDayCount, getChartPeriodDefaults, getMonthNavigationState, getYearNavigationState, navigateTrendMonthDraft, navigateTrendYearDraft, swapComparisonTrendDrafts, compareWithPreviousTrendDraft, setComparisonToPreviousAndCurrent, selectCustomTrendRange, selectTrendComparison, resolveCustomTrendPeriod, resolveComparisonPeriod, handleCustomTrendTypeChange, handleCustomTrendDraftInput, handleCustomTrendSubmit, handleComparisonTrendTypeChange, handleComparisonTrendDraftInput, handleComparisonTrendResolutionChange, handleComparisonTrendSubmit, changeCalendarMonth, handleHistoryTrendsClick, hasUnsavedFormChanges, enterNewEntryModeForDate, enterEditMode, exitEditMode, handleFormSubmit, handleTableClick, handleEraseAll, handleExportBackup, handleImportBackup, handleImportFileChange, handleCancelImport, handleReplaceImport, adjustValueControl, resetValueControls, setValueControlValues, updateSleepControl, updateWaterControl, setBusyState, lockApp, getStorageAdapter, get entries() { return entries; }, get editingDate() { return editingDate; }, get sleepSelected() { return sleepSelected; }, get waterSelected() { return waterSelected; }, get busy() { return busy; }, get locked() { return locked; }, get pendingImport() { return pendingImport; }, get importReading() { return importReading; }, get historyView() { return historyView; }, get trendDayCount() { return trendDayCount; }, get trendMode() { return trendMode; }, get customTrendType() { return customTrendType; }, get customTrendDraftStart() { return customTrendDraftStart; }, get customTrendDraftEnd() { return customTrendDraftEnd; }, get customTrendDraftMonth() { return customTrendDraftMonth; }, get customTrendDraftYear() { return customTrendDraftYear; }, get appliedCustomTrendRange() { return appliedCustomTrendRange; }, get comparisonTrendType() { return comparisonTrendType; }, get comparisonTrendDraftFirst() { return comparisonTrendDraftFirst; }, get comparisonTrendDraftSecond() { return comparisonTrendDraftSecond; }, get comparisonTrendDraftResolution() { return comparisonTrendDraftResolution; }, get appliedTrendComparison() { return appliedTrendComparison; }, get appliedHistoryRange() { return appliedHistoryRange; }, get calendarYear() { return calendarYear; }, get calendarMonthIndex() { return calendarMonthIndex; }, get selectedCalendarDate() { return selectedCalendarDate; }, set entries(value) { entries = value; }, set editingDate(value) { editingDate = value; }, set storageAdapter(value) { storageAdapter = value; }, set calendarYear(value) { calendarYear = value; }, set calendarMonthIndex(value) { calendarMonthIndex = value; }, set selectedCalendarDate(value) { selectedCalendarDate = value; } };';
  new vm.Script(coreSource + '\n' + viewsSource + '\n' + source).runInContext(sandbox);
  const realRender = sandbox.render;
  sandbox.render = () => {};
  sandbox.__api.entries = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 },
  ];
  sandbox.__api.storageAdapter = {
    async loadEntries() { return { ok: true, state: 'present', entries: sandbox.__api.entries }; },
    async saveEntries() { return { ok: true }; },
  };
  const now = new Date();
  elements.get('entry-date').value = [
    now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'),
  ].join('-');
  sandbox.__api.resetValueControls();
  return { api: sandbox.__api, elements, radios, buttons, storage, confirms, confirmationMessages, window: sandbox.window, sandbox, downloads, realRender };
}

function makeViews() {
  const app = makeApp();
  const sandbox = { document: app.sandbox.document, Date };
  vm.createContext(sandbox);
  const source = coreSource + '\n' + viewsSource + '\nthis.__views = { renderSummary, renderTable, renderCharts, renderComparisonCharts, renderAggregatedComparisonCharts, renderCalendar, renderHistoryTrends };';
  new vm.Script(source).runInContext(sandbox);
  return { ...app, views: sandbox.__views };
}

function trendDataTable(renderer) {
  const firstChild = renderer.elements.get('trend-data-table-container').children[0];
  return firstChild.tagName === 'TABLE' ? firstChild : firstChild.children[0];
}

function trendDataFrame(renderer) {
  const container = renderer.elements.get('trend-data-table-container');
  const region = container.children[0];
  return { region, table: trendDataTable(renderer), hint: container.children[1] };
}

async function submit(app) { await app.api.handleFormSubmit({ preventDefault() {}, target: app.elements.get('entry-form') }); }

function backupText(entries, exportedAt = '2026-10-12T14:30:00.000Z') {
  return JSON.stringify({
    application: 'wellness-tracker',
    backupVersion: 1,
    exportedAt,
    entries,
  });
}

function importFile(text, options = {}) {
  return {
    size: options.size === undefined ? text.length : options.size,
    async text() {
      if (options.readError) throw options.readError;
      return text;
    },
  };
}

async function selectImport(app, file) {
  const input = app.elements.get('import-backup-input');
  input.files = file ? [file] : [];
  await app.api.handleImportFileChange({ target: input });
}

function renderTableIntoMock(app) {
  app.sandbox.render = () => {
    app.buttons.length = 0;
    app.api.entries.forEach(entry => {
      ['btn-edit', 'btn-delete'].forEach(className => {
        const button = new Element(className);
        button.className = className;
        button.dataset.date = entry.date;
        button.disabled = app.api.busy;
        button.closest = selector => selector === '.' + className ? button : null;
        app.buttons.push(button);
      });
    });
  };
  app.sandbox.render();
}

function findCalendarDateButton(app, date) {
  return app.elements.get('calendar-grid').children.find(node =>
    node.dataset && node.dataset.calendarDate === date
  );
}

function findCalendarDetailAction(app) {
  return app.elements.get('calendar-details').children.find(node =>
    node.className && node.className.includes('calendar-detail-action')
  );
}

function findDescendants(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  node.children.forEach(child => findDescendants(child, predicate, matches));
  return matches;
}

function trendCard(app, metric) {
  return app.elements.get('trend-chart-list').children.find(card => card.dataset.metric === metric);
}

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function renderChartsForApp(app) {
  app.api.renderCharts(app.api.entries, app.api.trendDayCount, localDateKey());
}

function renderHistoryTrendsForApp(app) {
  app.api.renderHistoryTrendsForCurrentState();
}

function applyHistoryRange(app, startDate, endDate) {
  app.elements.get('history-from-date').value = startDate;
  app.elements.get('history-to-date').value = endDate;
  app.api.handleHistoryFilterSubmit({ preventDefault() {} });
}

function historyTableRows(app) {
  const table = app.elements.get('entries-container').children.find(node => node.tagName === 'TABLE');
  if (!table) return [];
  const tbody = table.children.find(node => node.tagName === 'TBODY');
  return tbody ? tbody.children : [];
}

function historyRowDates(app) {
  return historyTableRows(app).map(row => row.children[0].textContent);
}

test('calendar detail container permits its interactive action button', () => {
  assert.match(html, /<div id="calendar-details" class="calendar-details" aria-live="polite"><\/div>/);
  assert.doesNotMatch(html, /<p id="calendar-details"/);
});

test('history is hidden initially while the total saved-entry count remains visible', () => {
  const app = makeApp();
  app.api.renderHistoryTable();

  assert.equal(app.api.appliedHistoryRange, null);
  assert.match(app.elements.get('entries-container').children[0].textContent, /Select both dates/);
  assert.equal(app.elements.get('history-status').textContent, '2 saved entries.');
  assert.equal(historyTableRows(app).length, 0);
});

test('history applies an inclusive range with newest-first entries and no storage write', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };

  applyHistoryRange(app, '2025-06-10', '2025-06-11');

  assert.deepEqual(historyRowDates(app), ['2025-06-11', '2025-06-10']);
  assert.match(app.elements.get('history-status').textContent, /Showing 2 matching entries/);
  assert.equal(saveCalls, 0);
});

test('history rejects incomplete and reversed ranges without showing stale results', () => {
  const app = makeApp();
  applyHistoryRange(app, '2025-06-10', '2025-06-11');
  app.elements.get('history-to-date').value = '';
  app.api.invalidateAppliedHistoryRange();
  app.api.handleHistoryFilterSubmit({ preventDefault() {} });

  assert.equal(app.api.appliedHistoryRange, null);
  assert.match(app.elements.get('history-filter-error').textContent, /both a start date and an end date/);
  assert.equal(historyTableRows(app).length, 0);

  applyHistoryRange(app, '2025-06-11', '2025-06-10');
  assert.match(app.elements.get('history-filter-error').textContent, /on or after/);
  assert.equal(historyTableRows(app).length, 0);
});

test('changing or clearing history filters hides applied results without changing entries', () => {
  const app = makeApp();
  const original = JSON.stringify(app.api.entries);
  applyHistoryRange(app, '2025-06-10', '2025-06-11');
  app.elements.get('history-from-date').value = '2025-06-11';
  app.api.invalidateAppliedHistoryRange();

  assert.equal(app.api.appliedHistoryRange, null);
  assert.equal(historyTableRows(app).length, 0);
  assert.match(app.elements.get('entries-container').children[0].textContent, /Select both dates/);

  app.api.handleClearHistoryFilters();
  assert.equal(app.elements.get('history-from-date').value, '');
  assert.equal(app.elements.get('history-to-date').value, '');
  assert.equal(JSON.stringify(app.api.entries), original);
});

test('history renders an empty selected range and limits large result sets to the newest 100', () => {
  const app = makeApp();
  applyHistoryRange(app, '2026-01-01', '2026-01-02');
  assert.match(app.elements.get('entries-container').children[0].textContent, /No entries match/);

  app.api.entries = Array.from({ length: 102 }, (_, index) => ({
    date: '2025-01-' + String(index + 1).padStart(2, '0'),
    mood: 3,
    sleep: 6,
    water: 1,
  })).filter(entry => Number(entry.date.slice(-2)) <= 31);
  app.api.entries = Array.from({ length: 102 }, (_, index) => ({
    date: String(2025 + Math.floor(index / 31)).padStart(4, '0') + '-01-' + String((index % 31) + 1).padStart(2, '0'),
    mood: 3,
    sleep: 6,
    water: 1,
  }));
  applyHistoryRange(app, '2025-01-01', '2028-01-31');

  assert.equal(historyTableRows(app).length, 100);
  assert.match(app.elements.get('entries-container').children[0].textContent, /newest 100 of 102/);
  assert.match(app.elements.get('history-status').textContent, /Showing 102 matching entries/);
});

test('history edit and delete actions continue to operate on filtered rows', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  applyHistoryRange(app, '2025-06-10', '2025-06-11');
  const firstRow = historyTableRows(app)[0];
  const editButton = firstRow.children[4].children[0];
  const deleteButton = firstRow.children[4].children[1];

  await app.api.handleTableClick({ target: editButton });
  assert.equal(app.api.editingDate, '2025-06-11');
  await app.api.handleTableClick({ target: deleteButton });
  assert.equal(app.api.entries.length, 1);
  assert.deepEqual(historyRowDates(app), ['2025-06-10']);
});

test('applied history ranges refresh only after successful writes and backup replacement', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  applyHistoryRange(app, '2025-06-10', '2025-06-12');

  app.api.storageAdapter = { async saveEntries() { return { ok: false }; } };
  app.api.enterEditMode('2025-06-10');
  await submit(app);
  assert.deepEqual(historyRowDates(app), ['2025-06-11', '2025-06-10']);

  app.api.storageAdapter = { async saveEntries() { return { ok: true }; } };
  await selectImport(app, importFile(backupText([
    { date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 },
  ])));
  await app.api.handleReplaceImport();
  assert.deepEqual(historyRowDates(app), ['2025-06-12']);
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedHistoryRange)), {
    startDate: '2025-06-10', endDate: '2025-06-12',
  });
});

test('history filtering remains read-only while busy, locked, or an import preview is pending', async () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.setBusyState(true);
  applyHistoryRange(app, '2025-06-10', '2025-06-11');
  assert.deepEqual(historyRowDates(app), ['2025-06-11', '2025-06-10']);
  app.api.setBusyState(false);
  app.api.lockApp();
  applyHistoryRange(app, '2025-06-10', '2025-06-10');
  assert.deepEqual(historyRowDates(app), ['2025-06-10']);
  assert.equal(saveCalls, 0);

  const pendingApp = makeApp();
  await selectImport(pendingApp, importFile(backupText([])));
  applyHistoryRange(pendingApp, '2025-06-10', '2025-06-11');
  assert.ok(pendingApp.api.pendingImport);
  assert.deepEqual(historyRowDates(pendingApp), ['2025-06-11', '2025-06-10']);
});

test('erase all deletes the full dataset rather than only the applied history range', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  applyHistoryRange(app, '2025-06-10', '2025-06-10');

  await app.api.handleEraseAll();

  assert.equal(app.api.entries.length, 0);
  assert.match(app.confirmationMessages[0], /ALL saved entries, not only displayed history results/);
  assert.match(app.elements.get('entries-container').children[0].textContent, /No entries match/);
});

test('calendar detail renderer uses explicit entries, selected date, and mutation state', () => {
  const app = makeApp();
  app.api.entries = [{ date: '2025-06-11', mood: 1, sleep: 1, water: 0.1 }];
  app.api.selectedCalendarDate = '2025-06-11';
  app.api.setBusyState(true);
  const explicitEntries = [{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }];

  app.api.renderCalendarDetails(explicitEntries, '2025-06-12', false);

  let action = findCalendarDetailAction(app);
  assert.match(app.elements.get('calendar-details').textContent, /Mood 5, Sleep 8 h, Water 2.4 L/);
  assert.equal(action.dataset.calendarDate, '2025-06-12');
  assert.equal(action.dataset.calendarAction, 'edit');
  assert.equal(action.disabled, false);
  assert.equal(app.api.selectedCalendarDate, '2025-06-11');
  assert.equal(app.api.entries[0].date, '2025-06-11');
  assert.equal(app.api.busy, true);

  app.api.renderCalendarDetails([], '2025-06-13', true);
  action = findCalendarDetailAction(app);
  assert.equal(action.dataset.calendarDate, '2025-06-13');
  assert.equal(action.dataset.calendarAction, 'create');
  assert.equal(action.disabled, true);
});

test('calendar renderer uses explicit state without changing controller calendar state', () => {
  const app = makeApp();
  app.api.entries = [{ date: '2025-07-10', mood: 1, sleep: 1, water: 0.1 }];
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 6;
  app.api.selectedCalendarDate = '2025-07-10';
  app.api.setBusyState(true);
  const explicitEntries = [{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }];

  app.api.renderCalendar(explicitEntries, {
    year: 2025,
    monthIndex: 5,
    selectedDate: '2025-06-12',
    announceMonth: true,
    mutationsBlocked: false,
  });

  const selected = findCalendarDateButton(app, '2025-06-12');
  const action = findCalendarDetailAction(app);
  assert.match(app.elements.get('calendar-month-heading').textContent, /June 2025/);
  assert.match(app.elements.get('calendar-month-status').textContent, /Showing June 2025/);
  assert.match(selected.className, /has-entry/);
  assert.match(selected.className, /is-selected/);
  assert.match(app.elements.get('calendar-details').textContent, /Mood 5, Sleep 8 h, Water 2.4 L/);
  assert.equal(action.disabled, false);
  assert.equal(app.api.calendarYear, 2025);
  assert.equal(app.api.calendarMonthIndex, 6);
  assert.equal(app.api.selectedCalendarDate, '2025-07-10');
});

test('controller normalizes only calendar selections outside the displayed month', () => {
  const app = makeApp();
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-07-01';

  app.api.normalizeCalendarSelection();
  assert.equal(app.api.selectedCalendarDate, null);

  app.api.selectedCalendarDate = '2025-06-10';
  app.api.normalizeCalendarSelection();
  assert.equal(app.api.selectedCalendarDate, '2025-06-10');
  assert.equal(app.api.calendarYear, 2025);
  assert.equal(app.api.calendarMonthIndex, 5);
});

test('isolated chart renderer uses explicit inputs for populated and empty states', () => {
  const renderer = makeViews();
  const entries = [{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }];
  const originalEntries = JSON.stringify(entries);

  renderer.views.renderCharts(entries, 7, '2025-06-12');

  assert.equal(renderer.elements.get('trend-period-7').attributes['aria-pressed'], 'true');
  assert.equal(renderer.elements.get('trend-chart-list').children.length, 3);
  const populatedMood = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(populatedMood, node => node.className === 'trend-point')[0].attributes['data-date'], '2025-06-12');
  assert.equal(JSON.stringify(entries), originalEntries);

  renderer.views.renderCharts([], 7, '2025-06-12');
  const emptyMood = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(emptyMood, node => node.className === 'trend-empty-label').length, 1);
});

test('all exact-data renderers place tables in a described scroll region', () => {
  const renderer = makeViews();
  const emptyMonth = {
    mood: renderer.sandbox.buildMonthComparisonSeries([], 'mood', { year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }),
    sleep: renderer.sandbox.buildMonthComparisonSeries([], 'sleep', { year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }),
    water: renderer.sandbox.buildMonthComparisonSeries([], 'water', { year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }),
  };

  renderer.views.renderCharts([], 7, '2025-06-12');
  let frame = trendDataFrame(renderer);
  assert.equal(frame.region.className, 'trend-data-table-scroll-region');
  assert.equal(frame.hint.id, 'trend-single-table-hint');
  assert.equal(frame.region.attributes['aria-describedby'], frame.hint.id);
  assert.equal(frame.table.attributes['aria-describedby'], frame.hint.id);

  renderer.views.renderComparisonCharts(emptyMonth, {
    firstPeriodLabel: 'February 2024', secondPeriodLabel: 'February 2025',
  });
  frame = trendDataFrame(renderer);
  assert.equal(frame.hint.id, 'trend-comparison-table-hint');
  assert.equal(frame.region.attributes['aria-describedby'], frame.hint.id);

  const emptyYear = {
    mood: renderer.sandbox.buildAggregatedYearComparisonSeries([], 'mood', 2024, 2025, 'monthly'),
    sleep: renderer.sandbox.buildAggregatedYearComparisonSeries([], 'sleep', 2024, 2025, 'monthly'),
    water: renderer.sandbox.buildAggregatedYearComparisonSeries([], 'water', 2024, 2025, 'monthly'),
  };
  renderer.views.renderAggregatedComparisonCharts(emptyYear, {
    firstPeriodLabel: '2024', secondPeriodLabel: '2025',
  }, 'monthly');
  frame = trendDataFrame(renderer);
  assert.equal(frame.hint.id, 'trend-aggregated-table-hint');
  assert.equal(frame.region.attributes['aria-describedby'], frame.hint.id);
});

test('comparison renderer draws independent solid and dashed series with an accessible legend', () => {
  const renderer = makeViews();
  const points = [
    { key: '02-27', label: '02-27', firstDate: '2024-02-27', secondDate: '2025-02-27', firstValue: 1, secondValue: null },
    { key: '02-28', label: '02-28', firstDate: '2024-02-28', secondDate: '2025-02-28', firstValue: 2, secondValue: 2 },
    { key: '02-29', label: '02-29', firstDate: '2024-02-29', secondDate: null, firstValue: null, secondValue: null },
    { key: '03-01', label: '03-01', firstDate: '2024-03-01', secondDate: '2025-03-01', firstValue: 4, secondValue: 4 },
    { key: '03-02', label: '03-02', firstDate: '2024-03-02', secondDate: '2025-03-02', firstValue: null, secondValue: 5 },
  ];
  const comparison = {
    mood: { metric: 'mood', alignment: 'month-day', points },
    sleep: {
      metric: 'sleep', alignment: 'month-day', points: points.map(point => ({
        ...point,
        firstValue: point.firstValue === null ? null : point.firstValue * 2,
        secondValue: point.secondValue === null ? null : point.secondValue * 2,
      })),
    },
    water: {
      metric: 'water', alignment: 'month-day', points: points.map(point => ({
        ...point,
        firstValue: point.key === '02-28' ? 0 : point.firstValue,
        secondValue: point.secondValue,
      })),
    },
  };
  const original = JSON.stringify(comparison);

  renderer.views.renderComparisonCharts(comparison, {
    firstPeriodLabel: 'February 2024',
    secondPeriodLabel: 'February 2025',
  });

  const moodSvg = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  const firstLines = findDescendants(moodSvg, node =>
    node.className && node.className.includes('trend-comparison-line-first')
  );
  const secondLines = findDescendants(moodSvg, node =>
    node.className && node.className.includes('trend-comparison-line-second')
  );
  assert.equal(firstLines.length, 1);
  assert.equal(secondLines.length, 1);
  assert.equal(firstLines[0].attributes['data-comparison-series'], 'first');
  assert.equal(secondLines[0].attributes['data-comparison-series'], 'second');
  assert.match(stylesSource, /\.trend-comparison-line-second\s*\{[\s\S]*?stroke-dasharray:\s*6 4/);
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-axis-label')
    .filter(node => /^\d{2}-\d{2}$/.test(node.textContent))[0].attributes['text-anchor'], 'start');
  const legend = trendCard(renderer, 'mood').children.find(child => child.className === 'trend-comparison-legend');
  assert.match(legend.children[0].children[1].textContent, /February 2024 — solid line/);
  assert.match(legend.children[1].children[1].textContent, /February 2025 — dashed line/);

  const waterSvg = trendCard(renderer, 'water').children.find(child => child.tagName === 'SVG');
  const zeroPoint = findDescendants(waterSvg, node =>
    node.className && node.className.includes('trend-comparison-point-first') &&
    node.attributes['data-alignment-key'] === '02-28'
  )[0];
  assert.equal(zeroPoint.attributes['data-value'], '0');

  const table = trendDataTable(renderer);
  const tbody = table.children.find(child => child.tagName === 'TBODY');
  const leapRow = tbody.children.find(row => row.children[0].textContent === '02-29');
  assert.deepEqual(leapRow.children.map(cell => cell.textContent), [
    '02-29', 'Missing', 'Not in period', 'Missing', 'Not in period', 'Missing', 'Not in period',
  ]);
  const zeroRow = tbody.children.find(row => row.children[0].textContent === '02-28');
  assert.equal(zeroRow.children[5].textContent, '0 L');
  assert.equal(JSON.stringify(comparison), original);
});

test('comparison renderer reports empty and one-sided periods and keeps labels as text', () => {
  const renderer = makeViews();
  const absentPoints = [
    { key: '01', label: '1', firstDate: '2024-02-01', secondDate: '2025-02-01', firstValue: null, secondValue: null },
  ];
  const emptyComparison = {
    mood: { metric: 'mood', alignment: 'day-of-month', points: absentPoints },
    sleep: { metric: 'sleep', alignment: 'day-of-month', points: absentPoints },
    water: { metric: 'water', alignment: 'day-of-month', points: absentPoints },
  };
  renderer.views.renderComparisonCharts(emptyComparison, {
    firstPeriodLabel: '<first period>', secondPeriodLabel: '<second period>',
  });
  const moodCard = trendCard(renderer, 'mood');
  const moodSvg = moodCard.children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-empty-label').length, 1);
  const legend = moodCard.children.find(child => child.className === 'trend-comparison-legend');
  assert.equal(legend.children[0].children[1].textContent, '<first period> — solid line (no recorded values)');
  const table = trendDataTable(renderer);
  const headers = table.children.find(child => child.tagName === 'THEAD').children[0].children;
  assert.equal(headers[1].textContent, '<first period> Mood');

  const oneSidedComparison = {
    mood: {
      metric: 'mood', alignment: 'day-of-month', points: [{
        key: '01', label: '1', firstDate: '2024-02-01', secondDate: '2025-02-01', firstValue: 3, secondValue: null,
      }],
    },
    sleep: {
      metric: 'sleep', alignment: 'day-of-month', points: [{
        key: '01', label: '1', firstDate: '2024-02-01', secondDate: '2025-02-01', firstValue: 7, secondValue: null,
      }],
    },
    water: {
      metric: 'water', alignment: 'day-of-month', points: [{
        key: '01', label: '1', firstDate: '2024-02-01', secondDate: '2025-02-01', firstValue: 1.5, secondValue: null,
      }],
    },
  };
  renderer.views.renderComparisonCharts(oneSidedComparison, {
    firstPeriodLabel: 'First', secondPeriodLabel: 'Second',
  });
  const oneSidedMood = trendCard(renderer, 'mood');
  const oneSidedSvg = oneSidedMood.children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(oneSidedSvg, node =>
    node.className && node.className.includes('trend-comparison-point-first')
  ).length, 1);
  assert.match(findDescendants(oneSidedSvg, node => node.tagName === 'DESC')[0].textContent, /Only First has recorded mood values/);
  const oneSidedLegend = oneSidedMood.children.find(child => child.className === 'trend-comparison-legend');
  assert.match(oneSidedLegend.children[1].children[1].textContent, /no recorded values/);
});

test('year comparison axes use calendar-month ticks at their actual alignment positions', () => {
  const renderer = makeViews();
  const seriesByMetric = {
    mood: renderer.sandbox.buildYearComparisonSeries([], 'mood', 2024, 2025),
    sleep: renderer.sandbox.buildYearComparisonSeries([], 'sleep', 2024, 2025),
    water: renderer.sandbox.buildYearComparisonSeries([], 'water', 2024, 2025),
  };
  renderer.views.renderComparisonCharts(seriesByMetric, {
    firstPeriodLabel: '2024', secondPeriodLabel: '2025',
  });

  const moodSvg = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  const labels = findDescendants(moodSvg, node => node.className === 'trend-axis-label')
    .filter(node => ['Jan', 'Apr', 'Jul', 'Oct', 'Dec'].includes(node.textContent));
  assert.deepEqual(labels.map(label => label.textContent), ['Jan', 'Apr', 'Jul', 'Oct', 'Dec']);
  const expectedKeys = ['01-01', '04-01', '07-01', '10-01', '12-01'];
  labels.forEach((label, index) => {
    const pointIndex = seriesByMetric.mood.points.findIndex(point => point.key === expectedKeys[index]);
    const expectedX = 38 + (pointIndex / (seriesByMetric.mood.points.length - 1)) * 266;
    assert.equal(Number(label.attributes.x), expectedX);
  });
  assert.equal(labels[0].attributes['text-anchor'], 'start');
  assert.equal(labels[4].attributes['text-anchor'], 'end');
  assert.equal(seriesByMetric.mood.points.find(point => point.key === '02-29').firstDate, '2024-02-29');
  assert.equal(seriesByMetric.mood.points.find(point => point.key === '03-01').key, '03-01');
});

test('month comparison axes retain day-of-month labels and single charts remain unchanged', () => {
  const renderer = makeViews();
  const monthSeries = {
    mood: renderer.sandbox.buildMonthComparisonSeries([], 'mood', { year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }),
    sleep: renderer.sandbox.buildMonthComparisonSeries([], 'sleep', { year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }),
    water: renderer.sandbox.buildMonthComparisonSeries([], 'water', { year: 2024, monthIndex: 1 }, { year: 2025, monthIndex: 1 }),
  };
  renderer.views.renderComparisonCharts(monthSeries, {
    firstPeriodLabel: 'February 2024', secondPeriodLabel: 'February 2025',
  });
  const monthSvg = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  const monthLabels = findDescendants(monthSvg, node => node.className === 'trend-axis-label')
    .filter(node => Number(node.attributes.x) >= 38)
    .map(node => node.textContent);
  assert.deepEqual(monthLabels, ['1', '15', '29']);
  assert.equal(monthLabels.includes('Jan'), false);

  renderer.views.renderCharts([{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }], 7, '2025-06-12');
  const singleSvg = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(singleSvg, node => node.className === 'trend-axis-label')
    .some(node => ['Jan', 'Apr', 'Jul', 'Oct', 'Dec'].includes(node.textContent)), false);
});

test('aggregated comparison renderer shows weekly averages, metadata, gaps, and calendar ticks', () => {
  const renderer = makeViews();
  const entries = [
    { date: '2024-01-01', mood: 2, sleep: 7, water: 0 },
    { date: '2024-01-07', mood: 4, sleep: 9, water: 2 },
    { date: '2025-01-01', mood: 5, sleep: 8, water: 1.5 },
  ];
  const seriesByMetric = {
    mood: renderer.sandbox.buildAggregatedYearComparisonSeries(entries, 'mood', 2024, 2025, 'weekly'),
    sleep: renderer.sandbox.buildAggregatedYearComparisonSeries(entries, 'sleep', 2024, 2025, 'weekly'),
    water: renderer.sandbox.buildAggregatedYearComparisonSeries(entries, 'water', 2024, 2025, 'weekly'),
  };
  renderer.views.renderAggregatedComparisonCharts(seriesByMetric, {
    firstPeriodLabel: '2024', secondPeriodLabel: '2025',
  }, 'weekly');

  assert.equal(seriesByMetric.mood.points.length, 53);
  const moodCard = trendCard(renderer, 'mood');
  assert.match(moodCard.children[0].textContent, /Weekly averages/);
  const legend = moodCard.children.find(child => child.className === 'trend-comparison-legend');
  assert.match(legend.children[0].children[1].textContent, /2024/);
  assert.match(legend.children[1].children[1].textContent, /2025/);
  const moodSvg = moodCard.children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className && node.className.includes('trend-comparison-point-first')).length, 1);
  assert.equal(findDescendants(moodSvg, node => node.className && node.className.includes('trend-comparison-point-second')).length, 1);
  const xLabels = findDescendants(moodSvg, node => node.className === 'trend-axis-label')
    .filter(node => Number(node.attributes.x) >= 38)
    .map(node => node.textContent);
  assert.deepEqual(xLabels, ['Jan', 'Apr', 'Jul', 'Oct', 'Dec']);

  const scrollRegion = renderer.elements.get('trend-data-table-container').children[0];
  const table = scrollRegion.children[0];
  const hint = renderer.elements.get('trend-data-table-container').children[1];
  assert.equal(hint.id, 'trend-aggregated-table-hint');
  assert.match(hint.textContent, /Scroll horizontally/);
  assert.equal(scrollRegion.className, 'trend-data-table-scroll-region');
  assert.equal(scrollRegion.attributes['aria-describedby'], 'trend-aggregated-table-hint');
  assert.equal(table.attributes['aria-describedby'], 'trend-aggregated-table-hint');
  assert.match(stylesSource, /\.trend-data-table th:first-child,[\s\S]*?position:\s*sticky/);
  assert.match(stylesSource, /\.trend-data-table thead th:first-child[\s\S]*?z-index:\s*3/);
  const headers = table.children.find(child => child.tagName === 'THEAD').children[0].children;
  assert.equal(headers.length, 13);
  assert.equal(headers[3].textContent, '2024 recorded days');
  const firstRow = table.children.find(child => child.tagName === 'TBODY').children[0];
  assert.equal(firstRow.children[0].textContent, 'Week 1');
  assert.equal(firstRow.children[7].textContent, '3');
  assert.equal(firstRow.children[9].textContent, '8 h');
  assert.equal(firstRow.children[11].textContent, '1 L');
  const emptySecondWeek = table.children.find(child => child.tagName === 'TBODY').children[1];
  assert.equal(emptySecondWeek.children[7].textContent, 'Missing');
  assert.equal(emptySecondWeek.children[3].textContent, '0');
  assert.equal(emptySecondWeek.children[5].textContent, '7');
});

test('aggregated comparison renderer shows twelve monthly averages, zeroes, and empty periods', () => {
  const renderer = makeViews();
  const entries = [
    { date: '2024-02-01', mood: 1, sleep: 0, water: 0 },
    { date: '2024-02-29', mood: 5, sleep: 3, water: 2 },
    { date: '2025-02-15', mood: 3, sleep: 2, water: 1 },
  ];
  const seriesByMetric = {
    mood: renderer.sandbox.buildAggregatedYearComparisonSeries(entries, 'mood', 2024, 2025, 'monthly'),
    sleep: renderer.sandbox.buildAggregatedYearComparisonSeries(entries, 'sleep', 2024, 2025, 'monthly'),
    water: renderer.sandbox.buildAggregatedYearComparisonSeries(entries, 'water', 2024, 2025, 'monthly'),
  };
  renderer.views.renderAggregatedComparisonCharts(seriesByMetric, {
    firstPeriodLabel: '2024', secondPeriodLabel: '2025',
  }, 'monthly');

  assert.equal(seriesByMetric.mood.points.length, 12);
  const moodCard = trendCard(renderer, 'mood');
  assert.match(moodCard.children[0].textContent, /Monthly averages/);
  const moodSvg = moodCard.children.find(child => child.tagName === 'SVG');
  assert.deepEqual(findDescendants(moodSvg, node => node.className === 'trend-axis-label')
    .filter(node => Number(node.attributes.x) >= 38)
    .map(node => node.textContent), ['Jan', 'Apr', 'Jul', 'Oct', 'Dec']);
  const table = trendDataTable(renderer);
  const february = table.children.find(child => child.tagName === 'TBODY').children[1];
  assert.equal(february.children[0].textContent, 'February');
  assert.equal(february.children[7].textContent, '3');
  assert.equal(february.children[8].textContent, '3');
  assert.equal(february.children[9].textContent, '1.5 h');
  assert.equal(february.children[11].textContent, '1 L');
  const march = table.children.find(child => child.tagName === 'TBODY').children[2];
  assert.equal(march.children[7].textContent, 'Missing');
  assert.equal(march.children[3].textContent, '0');
  assert.equal(march.children[4].textContent, '0');
});

test('comparison rendering does not change the existing single-series chart output', () => {
  const renderer = makeViews();
  const comparison = {
    mood: { metric: 'mood', alignment: 'day-of-month', points: [] },
    sleep: { metric: 'sleep', alignment: 'day-of-month', points: [] },
    water: { metric: 'water', alignment: 'day-of-month', points: [] },
  };
  renderer.views.renderComparisonCharts(comparison, {});
  renderer.views.renderCharts([{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }], 7, '2025-06-12');

  const moodSvg = trendCard(renderer, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-point').length, 1);
  assert.equal(findDescendants(moodSvg, node =>
    node.className && node.className.includes('trend-comparison-line')
  ).length, 0);
});

test('isolated calendar renderer uses explicit populated state without mutating inputs', () => {
  const renderer = makeViews();
  const entries = [{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }];
  const calendar = {
    year: 2025,
    monthIndex: 5,
    selectedDate: '2025-06-12',
    announceMonth: true,
    mutationsBlocked: true,
  };
  const originalEntries = JSON.stringify(entries);
  const originalCalendar = JSON.stringify(calendar);

  renderer.views.renderCalendar(entries, calendar);

  const selected = findCalendarDateButton(renderer, '2025-06-12');
  const action = findCalendarDetailAction(renderer);
  assert.match(renderer.elements.get('calendar-month-heading').textContent, /June 2025/);
  assert.match(selected.className, /has-entry/);
  assert.match(selected.className, /is-selected/);
  assert.equal(action.disabled, true);
  assert.equal(JSON.stringify(entries), originalEntries);
  assert.equal(JSON.stringify(calendar), originalCalendar);
});

test('isolated History and Trends renderer uses explicit active view and shared inputs', () => {
  const renderer = makeViews();
  const entries = [{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }];
  const viewState = {
    activeView: 'charts',
    trendDayCount: 7,
    trendEndDate: '2025-06-12',
    calendar: {
      year: 2025,
      monthIndex: 5,
      selectedDate: '2025-06-12',
      announceMonth: false,
      mutationsBlocked: false,
    },
  };
  const originalEntries = JSON.stringify(entries);
  const originalViewState = JSON.stringify(viewState);

  renderer.views.renderHistoryTrends(entries, viewState);

  assert.equal(renderer.elements.get('history-charts-panel').hidden, false);
  assert.equal(renderer.elements.get('history-calendar-panel').hidden, true);
  assert.equal(renderer.elements.get('trend-period-7').attributes['aria-pressed'], 'true');
  assert.equal(findCalendarDetailAction(renderer).disabled, false);
  assert.equal(JSON.stringify(entries), originalEntries);
  assert.equal(JSON.stringify(viewState), originalViewState);
});

test('History and Trends renderer uses explicit view state without changing controller state', () => {
  const app = makeApp();
  app.api.entries = [{ date: '2025-07-10', mood: 1, sleep: 1, water: 0.1 }];
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 6;
  app.api.selectedCalendarDate = '2025-07-10';
  app.api.setBusyState(true);
  const explicitEntries = [{ date: '2025-06-12', mood: 5, sleep: 8, water: 2.4 }];

  app.api.renderHistoryTrends(explicitEntries, {
    activeView: 'charts',
    trendDayCount: 7,
    trendEndDate: '2025-06-12',
    calendar: {
      year: 2025,
      monthIndex: 5,
      selectedDate: '2025-06-12',
      announceMonth: true,
      mutationsBlocked: false,
    },
  });

  const moodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  const point = findDescendants(moodSvg, node => node.className === 'trend-point')[0];
  const action = findCalendarDetailAction(app);
  assert.equal(app.elements.get('history-charts-panel').hidden, false);
  assert.equal(app.elements.get('history-calendar-panel').hidden, true);
  assert.equal(app.elements.get('trend-period-7').attributes['aria-pressed'], 'true');
  assert.equal(point.attributes['data-date'], '2025-06-12');
  assert.match(app.elements.get('calendar-month-heading').textContent, /June 2025/);
  assert.equal(action.dataset.calendarDate, '2025-06-12');
  assert.equal(action.disabled, false);
  assert.equal(app.api.historyView, 'calendar');
  assert.equal(app.api.calendarYear, 2025);
  assert.equal(app.api.calendarMonthIndex, 6);
  assert.equal(app.api.selectedCalendarDate, '2025-07-10');
  assert.equal(app.api.entries[0].date, '2025-07-10');
  assert.equal(app.api.busy, true);
});

test('entering edit mode loads the selected entry and keeps its date read-only', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-11');
  assert.equal(app.elements.get('entry-date').value, '2025-06-11');
  assert.equal(app.elements.get('entry-date').readOnly, true);
  assert.equal(app.elements.get('entry-sleep').value, 6);
  assert.equal(app.radios[2].checked, true);
  assert.equal(app.api.editingDate, '2025-06-11');
});

test('saving an edit replaces one entry and preserves other entries and date', async () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  app.elements.get('entry-water').value = '2.5';
  await submit(app);
  assert.equal(app.api.entries.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.entries[0])), { date: '2025-06-10', mood: 4, sleep: 8, water: 2.5 });
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.entries[1])), { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 });
  assert.equal(app.api.editingDate, null);
});

test('successful edit focuses the re-enabled Edit button after rendering', async () => {
  const app = makeApp();
  renderTableIntoMock(app);
  app.api.enterEditMode('2025-06-10');
  await submit(app);

  const updatedEditButton = app.buttons.find(button =>
    button.className === 'btn-edit' && button.dataset.date === '2025-06-10'
  );
  assert.equal(updatedEditButton.disabled, false);
  assert.equal(updatedEditButton.focused, true);
});

test('invalid edited values are rejected without changing the entry', async () => {
  const app = makeApp();
  const original = JSON.stringify(app.api.entries);
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-water').value = '1.15';
  await submit(app);
  assert.equal(JSON.stringify(app.api.entries), original);
  assert.equal(app.api.editingDate, '2025-06-10');
});

test('failed edit storage write preserves entries, edit mode, and form values', async () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  app.api.storageAdapter = {
    async saveEntries() { return { ok: false, code: 'WRITE_FAILED', error: 'quota' }; },
  };
  await submit(app);
  assert.equal(app.api.entries[0].sleep, 7.5);
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-sleep').value, '8');
});

test('cancelling edit resets the form without changing stored data', () => {
  const app = makeApp();
  const original = JSON.stringify(app.api.entries);
  app.api.enterEditMode('2025-06-10');
  app.api.exitEditMode();
  assert.equal(JSON.stringify(app.api.entries), original);
  assert.equal(app.api.editingDate, null);
});

test('deleting another entry preserves the current edit', async () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  const button = new Element('delete');
  button.className = 'btn-delete';
  button.dataset.date = '2025-06-11';
  button.closest = selector => selector === '.btn-delete' ? button : null;
  app.buttons.push(button);
  await app.api.handleTableClick({ target: button });
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-sleep').value, '8');
});

test('deleting the edited entry exits edit mode only after successful deletion', async () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  const button = new Element('delete');
  button.className = 'btn-delete';
  button.dataset.date = '2025-06-10';
  button.closest = selector => selector === '.btn-delete' ? button : null;
  app.buttons.push(button);
  app.confirms.push(false);
  await app.api.handleTableClick({ target: button });
  assert.equal(app.api.editingDate, '2025-06-10');
  app.confirms.push(true);
  await app.api.handleTableClick({ target: button });
  assert.equal(app.api.editingDate, null);
  assert.equal(app.api.entries.length, 1);
});

test('successful deletion focuses a re-enabled remaining Delete button', async () => {
  const app = makeApp();
  renderTableIntoMock(app);
  const button = app.buttons.find(candidate =>
    candidate.className === 'btn-delete' && candidate.dataset.date === '2025-06-11'
  );
  await app.api.handleTableClick({ target: button });

  const remainingDeleteButton = app.buttons.find(candidate => candidate.className === 'btn-delete');
  assert.equal(remainingDeleteButton.dataset.date, '2025-06-10');
  assert.equal(remainingDeleteButton.disabled, false);
  assert.equal(remainingDeleteButton.focused, true);
});

test('deleting the final entry focuses the Entry History heading after busy state clears', async () => {
  const app = makeApp();
  app.api.entries = [app.api.entries[0]];
  renderTableIntoMock(app);
  const button = app.buttons.find(candidate => candidate.className === 'btn-delete');
  await app.api.handleTableClick({ target: button });

  assert.equal(app.buttons.length, 0);
  assert.equal(app.elements.get('entries-heading').focused, true);
});

test('erase all exits edit mode only after a successful erase', async () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.confirms.push(false);
  await app.api.handleEraseAll();
  assert.equal(app.api.editingDate, '2025-06-10');
  app.confirms.push(true);
  await app.api.handleEraseAll();
  assert.equal(app.api.editingDate, null);
  assert.equal(app.api.entries.length, 0);
});

test('sleep and water start unselected and reject an incomplete submission', async () => {
  const app = makeApp();
  assert.equal(app.api.sleepSelected, false);
  assert.equal(app.api.waterSelected, false);
  app.elements.get('entry-date').value = '2025-06-12';
  app.radios[2].checked = true;
  await submit(app);
  assert.match(app.elements.get('form-error').textContent, /sleep/i);
});

test('explicitly selecting zero is valid for both sliders', async () => {
  const app = makeApp();
  app.api.setValueControlValues(0, 0);
  app.elements.get('entry-date').value = '2025-06-12';
  app.radios[2].checked = true;
  await submit(app);
  assert.equal(app.api.entries.length, 3);
  assert.equal(app.api.entries[2].sleep, 0);
  assert.equal(app.api.entries[2].water, 0);
});

test('moving sliders selects values and updates displayed values', () => {
  const app = makeApp();
  app.elements.get('entry-sleep').value = '6.5';
  app.elements.get('entry-water').value = '1.7';
  app.api.updateSleepControl();
  app.api.updateWaterControl();
  assert.equal(app.api.sleepSelected, false);
  assert.equal(app.elements.get('sleep-value').textContent, 'Choose a value');
  // The actual input listeners set the selected flags; this mirrors native input events.
  app.api.setValueControlValues(6.5, 1.7);
  assert.equal(app.elements.get('sleep-value').textContent, '6.5 h');
  assert.equal(app.elements.get('water-value').textContent, '1.7 L');
});

test('minus and plus buttons change each value by exactly one step', () => {
  const app = makeApp();
  app.api.setValueControlValues(6.5, 1.7);
  app.api.adjustValueControl('sleep', 1);
  app.api.adjustValueControl('water', -1);
  assert.equal(app.elements.get('entry-sleep').value, '7');
  assert.equal(app.elements.get('entry-water').value, '1.6');
});

test('unselected plus and minus choose initial step or minimum values', () => {
  const app = makeApp();
  app.api.adjustValueControl('sleep', 1);
  assert.equal(app.elements.get('entry-sleep').value, '0.5');
  app.api.resetValueControls();
  app.api.adjustValueControl('water', -1);
  assert.equal(app.elements.get('entry-water').value, '0');
});

test('slider values clamp at minimum and maximum and disable boundary buttons', () => {
  const app = makeApp();
  app.api.setValueControlValues(24, 3);
  app.api.adjustValueControl('sleep', 1);
  app.api.adjustValueControl('water', 1);
  assert.equal(app.elements.get('entry-sleep').value, '24');
  assert.equal(app.elements.get('entry-water').value, '3');
  assert.equal(app.elements.get('sleep-plus').disabled, true);
  assert.equal(app.elements.get('water-plus').disabled, true);
  app.api.adjustValueControl('sleep', -1);
  app.api.adjustValueControl('water', -1);
  app.api.adjustValueControl('sleep', -1);
  app.api.adjustValueControl('water', -1);
  app.api.setValueControlValues(0, 0);
  assert.equal(app.elements.get('sleep-minus').disabled, true);
  assert.equal(app.elements.get('water-minus').disabled, true);
});

test('water display rounds to one decimal place without floating-point artefacts', () => {
  const app = makeApp();
  app.api.setValueControlValues(6.5, 1.7);
  app.elements.get('entry-water').value = '1.7000000000000002';
  app.api.updateWaterControl();
  assert.equal(app.elements.get('water-value').textContent, '1.7 L');
});

test('editing loads selected slider values and reset clears them after cancel and save', async () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-11');
  assert.equal(app.api.sleepSelected, true);
  assert.equal(app.api.waterSelected, true);
  assert.equal(app.elements.get('sleep-value').textContent, '6 h');
  assert.equal(app.elements.get('water-value').textContent, '1.8 L');
  app.api.exitEditMode();
  assert.equal(app.api.sleepSelected, false);
  assert.equal(app.api.waterSelected, false);
  assert.equal(app.elements.get('sleep-value').textContent, 'Choose a value');
  app.api.enterEditMode('2025-06-10');
  await submit(app);
  assert.equal(app.api.sleepSelected, false);
  assert.equal(app.api.waterSelected, false);
});

test('locked applications disable slider and adjustment controls', () => {
  const app = makeApp();
  app.api.lockApp();
  assert.equal(app.elements.get('entry-sleep').disabled, true);
  assert.equal(app.elements.get('entry-water').disabled, true);
  assert.equal(app.elements.get('sleep-minus').disabled, true);
  assert.equal(app.elements.get('sleep-plus').disabled, true);
  assert.equal(app.elements.get('water-minus').disabled, true);
  assert.equal(app.elements.get('water-plus').disabled, true);
});

test('browser storage adapter wraps localStorage success and failure asynchronously', async () => {
  const app = makeApp();
  const adapter = app.api.getStorageAdapter();
  const emptyResult = await adapter.loadEntries();
  assert.equal(emptyResult.ok, true);
  assert.equal(emptyResult.state, 'present');
  assert.deepEqual(JSON.parse(JSON.stringify(emptyResult.entries)), []);
  app.storage.value = JSON.stringify([app.api.entries[0]]);
  const loadedResult = await adapter.loadEntries();
  assert.equal(loadedResult.ok, true);
  assert.equal(loadedResult.state, 'present');
  assert.deepEqual(JSON.parse(JSON.stringify(loadedResult.entries)), [app.api.entries[0]]);
  app.storage.setItem = () => { throw new Error('quota'); };
  const result = await adapter.saveEntries([app.api.entries[0]]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
});

test('export backup creates a formatted committed-data snapshot with a UTC-date filename', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.entries = [
    { date: '2025-06-10', mood: 1, sleep: 0, water: 0 },
    { date: '2025-06-11', mood: 5, sleep: 8, water: 2.3 },
  ];
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  const originalEntries = JSON.stringify(app.api.entries);

  app.api.handleExportBackup();

  assert.equal(app.downloads.blobs.length, 1);
  assert.equal(app.downloads.blobs[0].type, 'application/json');
  const content = app.downloads.blobs[0].parts.join('');
  assert.match(content, /\n$/);
  assert.match(content, /\n  "entries": \[/);
  const documentValue = JSON.parse(content);
  assert.equal(documentValue.application, 'wellness-tracker');
  assert.equal(documentValue.backupVersion, 1);
  assert.deepEqual(documentValue.entries, JSON.parse(originalEntries));
  assert.equal(documentValue.entries[0].sleep, 0);
  assert.equal(documentValue.entries[0].water, 0);
  const link = app.downloads.links[0];
  assert.equal(link.clicked, true);
  assert.equal(link.download, 'wellness-tracker-backup-' + documentValue.exportedAt.slice(0, 10) + '.json');
  assert.equal(link.href, app.downloads.urls[0].url);
  assert.deepEqual(app.downloads.revoked, [link.href]);
  assert.equal(link.parentNode, null);
  assert.equal(saveCalls, 0);
  assert.equal(JSON.stringify(app.api.entries), originalEntries);
});

test('export backup supports an empty healthy dataset without changing form or History and Trends state', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.api.entries = [];
  app.api.setTrendDayCount(7);
  app.api.selectedCalendarDate = '2025-06-11';
  const sleepBefore = app.elements.get('entry-sleep').value;

  app.api.handleExportBackup();

  const documentValue = JSON.parse(app.downloads.blobs[0].parts.join(''));
  assert.deepEqual(documentValue.entries, []);
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-sleep').value, sleepBefore);
  assert.equal(app.api.trendDayCount, 7);
  assert.equal(app.api.selectedCalendarDate, '2025-06-11');
});

test('export backup is disabled and guarded while busy or locked', () => {
  const app = makeApp();
  app.api.setBusyState(true);
  assert.equal(app.elements.get('export-backup-btn').disabled, true);
  app.api.handleExportBackup();
  assert.equal(app.downloads.blobs.length, 0);

  app.api.setBusyState(false);
  app.api.lockApp();
  assert.equal(app.elements.get('export-backup-btn').disabled, true);
  app.api.handleExportBackup();
  assert.equal(app.downloads.blobs.length, 0);
});

test('export backup reports setup failures and cleans up created object URLs and links', () => {
  const app = makeApp();
  const createElement = app.sandbox.document.createElement;
  app.sandbox.document.createElement = tag => {
    const element = createElement(tag);
    if (tag === 'a') {
      element.click = () => { throw new Error('blocked download'); };
    }
    return element;
  };

  app.api.handleExportBackup();

  assert.equal(app.downloads.urls.length, 1);
  assert.deepEqual(app.downloads.revoked, [app.downloads.urls[0].url]);
  assert.equal(app.downloads.links[0].parentNode, null);
  assert.equal(app.sandbox.document.body.children.length, 0);
  assert.equal(app.elements.get('backup-error').textContent,
    'Could not prepare the backup download. Your saved entries have not changed.');
  assert.equal(app.api.entries.length, 2);
});

test('import preview validates a backup and reports its date range without changing entries', async () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  const original = JSON.stringify(app.api.entries);
  await selectImport(app, importFile(backupText([
    { date: '2025-04-10', mood: 1, sleep: 0, water: 0 },
    { date: '2025-06-12', mood: 5, sleep: 8, water: 2.3 },
  ])));

  assert.equal(app.api.pendingImport.entries.length, 2);
  assert.equal(app.elements.get('import-preview').hidden, false);
  assert.match(app.elements.get('import-preview-summary').textContent, /2 entries, from 2025-04-10 to 2025-06-12/);
  assert.match(app.elements.get('import-preview-summary').textContent, /2 saved entries/);
  assert.match(app.elements.get('import-preview-warning').textContent, /REPLACE ALL/);
  assert.match(app.elements.get('import-preview-exported-at').textContent, /2026-10-12T14:30:00.000Z/);
  assert.equal(app.elements.get('import-backup-input').value, '');
  assert.equal(JSON.stringify(app.api.entries), original);
  assert.equal(saveCalls, 0);
});

test('import preview handles a valid empty backup explicitly', async () => {
  const app = makeApp();
  await selectImport(app, importFile(backupText([])));

  assert.equal(app.api.pendingImport.entries.length, 0);
  assert.match(app.elements.get('import-preview-summary').textContent, /0 entries\. No entries in backup/);
  assert.match(app.elements.get('import-preview-warning').textContent, /empty backup would remove all existing entries/);
  assert.equal(app.api.entries.length, 2);
});

test('import validation failures, file read failures, and picker cancellation preserve current state and allow retry', async () => {
  const app = makeApp();
  const original = JSON.stringify(app.api.entries);
  await selectImport(app, importFile('{invalid json'));
  assert.equal(app.api.pendingImport, null);
  assert.match(app.elements.get('backup-error').textContent, /Could not validate the backup file/);
  assert.equal(app.elements.get('import-backup-input').value, '');

  await selectImport(app, importFile(JSON.stringify({ application: 'wellness-tracker' })));
  assert.equal(app.api.pendingImport, null);
  assert.match(app.elements.get('backup-error').textContent, /unexpected structure/);

  await selectImport(app, importFile(backupText([]), { readError: new Error('unreadable') }));
  assert.equal(app.api.pendingImport, null);
  assert.match(app.elements.get('backup-error').textContent, /Could not read the selected backup file/);

  await selectImport(app, null);
  assert.equal(app.api.pendingImport, null);
  assert.equal(JSON.stringify(app.api.entries), original);

  await selectImport(app, importFile(backupText([])));
  assert.equal(app.api.pendingImport.entries.length, 0);
});

test('pending import blocks existing mutations and export but retains read-only History and Trends state', async () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.selectedCalendarDate = '2025-06-11';
  app.api.setTrendDayCount(7);
  await selectImport(app, importFile(backupText([])));
  const deleteButton = new Element('delete');
  deleteButton.className = 'btn-delete';
  deleteButton.dataset.date = '2025-06-10';
  deleteButton.closest = selector => selector === '.btn-delete' ? deleteButton : null;

  assert.equal(app.elements.get('save-btn').disabled, true);
  assert.equal(app.elements.get('erase-all-btn').disabled, true);
  assert.equal(app.elements.get('export-backup-btn').disabled, true);
  assert.equal(app.elements.get('import-backup-btn').disabled, true);
  assert.equal(app.elements.get('cancel-import-btn').disabled, false);
  await submit(app);
  await app.api.handleTableClick({ target: deleteButton });
  await app.api.handleEraseAll();
  app.api.handleExportBackup();
  app.api.setTrendDayCount(30);

  assert.equal(saveCalls, 0);
  assert.equal(app.api.entries.length, 2);
  assert.equal(app.api.selectedCalendarDate, '2025-06-11');
  assert.equal(app.api.trendDayCount, 30);
  assert.equal(app.downloads.blobs.length, 0);
});

test('import is guarded while busy or locked and cancellation clears the preview and restores controls', async () => {
  const app = makeApp();
  const file = importFile(backupText([]));
  app.api.setBusyState(true);
  await selectImport(app, file);
  assert.equal(app.api.pendingImport, null);
  assert.equal(app.elements.get('import-backup-btn').disabled, true);

  app.api.setBusyState(false);
  await selectImport(app, file);
  assert.ok(app.api.pendingImport);
  app.api.handleCancelImport();
  assert.equal(app.api.pendingImport, null);
  assert.equal(app.elements.get('import-preview').hidden, true);
  assert.equal(app.elements.get('import-backup-btn').disabled, false);
  assert.equal(app.elements.get('import-backup-btn').focused, true);

  await selectImport(app, file);
  assert.ok(app.api.pendingImport);
  app.api.handleCancelImport();
  assert.equal(app.api.pendingImport, null);

  app.api.lockApp();
  await selectImport(app, file);
  assert.equal(app.api.pendingImport, null);
  assert.equal(app.elements.get('import-backup-btn').disabled, true);
});

test('oversized import files are rejected before reading', async () => {
  const app = makeApp();
  let read = false;
  const file = {
    size: 5 * 1024 * 1024 + 1,
    async text() { read = true; return backupText([]); },
  };

  await selectImport(app, file);

  assert.equal(read, false);
  assert.equal(app.api.pendingImport, null);
  assert.match(app.elements.get('backup-error').textContent, /smaller than 5 MiB/);
});

test('replacing an import requires confirmation and preserves pending data and unsaved form changes when cancelled', async () => {
  const app = makeApp();
  const originalEntries = JSON.stringify(app.api.entries);
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  const imported = [{ date: '2025-06-12', mood: 1, sleep: 0, water: 0 }];
  await selectImport(app, importFile(backupText(imported)));
  const pendingBefore = JSON.stringify(app.api.pendingImport);
  app.confirms.push(false);

  await app.api.handleReplaceImport();

  assert.equal(JSON.stringify(app.api.entries), originalEntries);
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-sleep').value, '8');
  assert.equal(JSON.stringify(app.api.pendingImport), pendingBefore);
  assert.match(app.confirmationMessages[0], /2 currently saved entries/);
  assert.match(app.confirmationMessages[0], /1 backup entry/);
  assert.match(app.confirmationMessages[0], /not merged/);
  assert.match(app.confirmationMessages[0], /unsaved form changes/);
});

test('confirmed replacement waits for save, blocks repeated restores, and refreshes committed views after success', async () => {
  const app = makeApp();
  const today = localDateKey();
  const imported = [{ date: today, mood: 2, sleep: 0, water: 0 }];
  await selectImport(app, importFile(backupText(imported)));
  const pendingEntries = app.api.pendingImport.entries;
  let resolveSave;
  let saveCalls = 0;
  let savedCandidate;
  app.api.storageAdapter = {
    saveEntries(candidate) {
      saveCalls += 1;
      savedCandidate = candidate;
      return new Promise(resolve => { resolveSave = resolve; });
    },
  };
  app.sandbox.render = app.realRender;
  app.api.calendarYear = new Date().getFullYear();
  app.api.calendarMonthIndex = new Date().getMonth();
  app.confirms.push(true);
  const restoring = app.api.handleReplaceImport();

  assert.equal(saveCalls, 1);
  assert.equal(app.api.busy, true);
  assert.equal(JSON.stringify(app.api.entries), JSON.stringify([
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 },
  ]));
  assert.equal(app.elements.get('replace-import-btn').disabled, true);
  assert.equal(app.elements.get('cancel-import-btn').disabled, true);
  await app.api.handleReplaceImport();
  assert.equal(saveCalls, 1);

  resolveSave({ ok: true });
  await restoring;

  assert.deepEqual(JSON.parse(JSON.stringify(savedCandidate)), imported);
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.entries)), imported);
  assert.notEqual(savedCandidate, pendingEntries);
  assert.notEqual(app.api.entries, pendingEntries);
  assert.equal(app.api.pendingImport, null);
  assert.equal(app.api.editingDate, null);
  assert.equal(app.api.busy, false);
  assert.equal(app.elements.get('import-preview').hidden, true);
  assert.match(app.elements.get('backup-status').textContent, /Backup restored\. 1 entry is now saved/);
  assert.equal(app.elements.get('import-backup-btn').focused, true);
  assert.equal(app.elements.get('stat-count').textContent, 1);
  assert.equal(findCalendarDateButton(app, today).className.includes('has-entry'), true);
  assert.ok(trendCard(app, 'mood'));
  assert.equal(app.elements.get('entries-container').children.length, 1);
});

test('a failed replacement preserves entries, form state, and the validated preview for retry', async () => {
  const app = makeApp();
  const originalEntries = JSON.stringify(app.api.entries);
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-water').value = '2.5';
  await selectImport(app, importFile(backupText([
    { date: '2025-06-12', mood: 5, sleep: 8, water: 2.3 },
  ])));
  const pendingBefore = JSON.stringify(app.api.pendingImport);
  app.api.storageAdapter = { async saveEntries() { return { ok: false, code: 'WRITE_FAILED' }; } };
  app.confirms.push(true);

  await app.api.handleReplaceImport();

  assert.equal(JSON.stringify(app.api.entries), originalEntries);
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-water').value, '2.5');
  assert.equal(JSON.stringify(app.api.pendingImport), pendingBefore);
  assert.equal(app.elements.get('import-preview').hidden, false);
  assert.match(app.elements.get('backup-error').textContent, /Could not replace saved entries/);
  assert.equal(app.api.busy, false);
  assert.equal(app.elements.get('replace-import-btn').disabled, false);
});

test('replacement accepts an empty validated backup and is guarded when unavailable', async () => {
  const app = makeApp();
  app.api.entries = [];
  await selectImport(app, importFile(backupText([])));
  let saved;
  app.api.storageAdapter = { async saveEntries(candidate) { saved = candidate; return { ok: true }; } };
  app.confirms.push(true);
  await app.api.handleReplaceImport();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), []);
  assert.equal(app.api.entries.length, 0);
  assert.match(app.confirmationMessages[0], /empty.*delete all/i);

  await app.api.handleReplaceImport();
  assert.equal(saved.length, 0);
  app.api.lockApp();
  await app.api.handleReplaceImport();
  assert.equal(saved.length, 0);
});

test('Electron storage adapter uses only the exposed bridge and preserves results', async () => {
  const app = makeApp();
  const expected = { ok: true, state: 'present', entries: [app.api.entries[0]] };
  app.window.wellnessStorage = {
    async loadEntries() { return expected; },
    async saveEntries() { return { ok: false, code: 'WRITE_FAILED', error: 'disk full' }; },
  };
  const adapter = app.api.getStorageAdapter();
  assert.equal(await adapter.loadEntries(), expected);
  assert.deepEqual(await adapter.saveEntries([app.api.entries[0]]), {
    ok: false, code: 'WRITE_FAILED', error: 'disk full',
  });
});

test('initialization treats a missing Electron file as an empty dataset without importing localStorage', async () => {
  const app = makeApp();
  app.storage.value = JSON.stringify([app.api.entries[0]]);
  app.window.wellnessStorage = {
    async loadEntries() { return { ok: true, state: 'missing', entries: [] }; },
    async saveEntries() { return { ok: true }; },
  };
  await app.api.init();
  assert.equal(app.api.entries.length, 0);
  assert.equal(app.api.locked, false);
});

test('initialization locks the application when Electron loading fails or data is invalid', async () => {
  const app = makeApp();
  app.window.wellnessStorage = {
    async loadEntries() { return { ok: false, code: 'INVALID_JSON', error: 'bad data' }; },
    async saveEntries() { return { ok: true }; },
  };
  await app.api.init();
  assert.equal(app.api.locked, true);
  assert.equal(app.elements.get('save-btn').disabled, true);

  const invalid = makeApp();
  invalid.window.wellnessStorage = {
    async loadEntries() { return { ok: true, state: 'present', entries: [{ date: 'bad' }] }; },
    async saveEntries() { return { ok: true }; },
  };
  await invalid.api.init();
  assert.equal(invalid.api.locked, true);
});

test('pending saves disable controls and reject overlapping submissions', async () => {
  const app = makeApp();
  let resolveSave;
  let saveCalls = 0;
  app.api.storageAdapter = {
    async saveEntries() {
      saveCalls += 1;
      return new Promise(resolve => { resolveSave = resolve; });
    },
  };
  app.elements.get('entry-date').value = '2025-06-12';
  app.radios[2].checked = true;
  app.api.setValueControlValues(7, 2);
  const first = submit(app);
  assert.equal(app.api.busy, true);
  assert.equal(app.elements.get('save-btn').disabled, true);
  assert.equal(app.elements.get('entry-sleep').disabled, true);
  const second = submit(app);
  resolveSave({ ok: true });
  await Promise.all([first, second]);
  assert.equal(saveCalls, 1);
  assert.equal(app.api.busy, false);
});

test('History and Trends initially displays the current local month in Calendar view', () => {
  const app = makeApp();
  renderHistoryTrendsForApp(app);
  const now = new Date();

  assert.equal(app.api.historyView, 'calendar');
  assert.equal(app.api.calendarYear, now.getFullYear());
  assert.equal(app.api.calendarMonthIndex, now.getMonth());
  assert.equal(app.elements.get('history-calendar-panel').hidden, false);
  assert.equal(app.elements.get('history-charts-panel').hidden, true);
  assert.equal(app.elements.get('history-view-calendar').attributes['aria-pressed'], 'true');
});

test('calendar navigation crosses year boundaries, announces the month, and clears selection', () => {
  const app = makeApp();
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 11;
  app.api.selectedCalendarDate = '2025-12-10';
  renderHistoryTrendsForApp(app);
  app.api.changeCalendarMonth(1);

  assert.equal(app.api.calendarYear, 2026);
  assert.equal(app.api.calendarMonthIndex, 0);
  assert.equal(app.api.selectedCalendarDate, null);
  assert.match(app.elements.get('calendar-month-heading').textContent, /January 2026/);
  assert.match(app.elements.get('calendar-month-status').textContent, /Showing January 2026/);
  assert.match(app.elements.get('calendar-details').textContent, /Select a date/);

  app.api.changeCalendarMonth(-1);
  assert.equal(app.api.calendarYear, 2025);
  assert.equal(app.api.calendarMonthIndex, 11);
});

test('calendar marks saved entries and date selection shows read-only saved or empty details without saving', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = {
    async saveEntries() { saveCalls += 1; return { ok: true }; },
  };
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  renderHistoryTrendsForApp(app);

  const savedDate = findCalendarDateButton(app, '2025-06-10');
  assert.match(savedDate.className, /has-entry/);
  assert.match(savedDate.attributes['aria-label'], /entry recorded/);
  assert.equal(savedDate.children.at(-1).textContent, 'Entry');

  app.api.handleHistoryTrendsClick({ target: savedDate });
  assert.equal(app.api.selectedCalendarDate, '2025-06-10');
  assert.match(app.elements.get('calendar-details').textContent, /Mood 4, Sleep 7.5 h, Water 2.1 L/);

  const emptyDate = findCalendarDateButton(app, '2025-06-12');
  assert.match(emptyDate.attributes['aria-label'], /no entry recorded/);
  app.api.handleHistoryTrendsClick({ target: emptyDate });
  assert.equal(app.api.selectedCalendarDate, '2025-06-12');
  assert.match(app.elements.get('calendar-details').textContent, /No entry recorded/);
  assert.equal(saveCalls, 0);
});

test('History and Trends view switch shows the rendered charts and returns to Calendar', () => {
  const app = makeApp();
  renderHistoryTrendsForApp(app);
  const chartsButton = app.elements.get('history-view-charts');
  chartsButton.className = 'history-view-btn';
  chartsButton.dataset.historyView = 'charts';
  app.api.handleHistoryTrendsClick({ target: chartsButton });

  assert.equal(app.api.historyView, 'charts');
  assert.equal(app.elements.get('history-charts-panel').hidden, false);
  assert.equal(app.elements.get('history-calendar-panel').hidden, true);
  assert.equal(app.elements.get('trend-chart-list').children.length, 3);

  const calendarButton = app.elements.get('history-view-calendar');
  calendarButton.className = 'history-view-btn';
  calendarButton.dataset.historyView = 'calendar';
  app.api.handleHistoryTrendsClick({ target: calendarButton });
  assert.equal(app.api.historyView, 'calendar');
  assert.equal(app.elements.get('history-calendar-panel').hidden, false);
});

test('charts default to 30 inclusive calendar days with fixed metric scales', () => {
  const app = makeApp();
  renderChartsForApp(app);

  assert.equal(app.api.trendDayCount, 30);
  assert.equal(app.elements.get('trend-period-30').attributes['aria-pressed'], 'true');
  assert.equal(app.elements.get('trend-chart-list').children.length, 3);

  const expectedScales = {
    mood: ['5', '1'],
    sleep: ['24 h', '0 h'],
    water: ['3 L', '0 L'],
  };
  Object.entries(expectedScales).forEach(([metric, labels]) => {
    const chart = trendCard(app, metric);
    assert.ok(chart);
    const svg = chart.children.find(child => child.tagName === 'SVG');
    const axisLabels = findDescendants(svg, node => node.className === 'trend-axis-label')
      .map(node => node.textContent);
    labels.forEach(label => assert.ok(axisLabels.includes(label)));
  });

  const table = trendDataTable(app);
  const tbody = table.children.find(child => child.tagName === 'TBODY');
  assert.equal(tbody.children.length, 30);
});

test('chart endpoint date labels use inward-facing anchors', () => {
  const app = makeApp();
  renderChartsForApp(app);
  const svg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  const dateLabels = findDescendants(svg, node => node.className === 'trend-axis-label')
    .filter(node => !/^(5|1)$/.test(node.textContent));
  assert.equal(dateLabels[0].attributes['text-anchor'], 'start');
  assert.equal(dateLabels[1].attributes['text-anchor'], 'middle');
  assert.equal(dateLabels[2].attributes['text-anchor'], 'end');
});

test('chart renderer uses its explicit entries, period, and end date', () => {
  const app = makeApp();
  app.api.entries = [];
  const explicitEntries = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 1.8 },
  ];

  app.api.renderCharts(explicitEntries, 7, '2025-06-12');

  assert.equal(app.api.trendDayCount, 30);
  assert.equal(app.elements.get('trend-period-7').attributes['aria-pressed'], 'true');
  const moodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  const point = findDescendants(moodSvg, node => node.className === 'trend-point')[0];
  assert.equal(point.attributes['data-date'], '2025-06-10');
  const table = trendDataTable(app);
  const tbody = table.children.find(child => child.tagName === 'TBODY');
  assert.equal(tbody.children.length, 7);
  assert.equal(tbody.children.at(-1).children[0].textContent, '2025-06-12');
});

test('single-day custom charts keep isolated points inside the SVG', () => {
  const app = makeApp();
  app.api.renderCharts(
    [{ date: '2025-06-12', mood: 4, sleep: 7.5, water: 1.8 }],
    7,
    '2025-06-12',
    { type: 'date-range', startDate: '2025-06-12', endDate: '2025-06-12' },
    'custom'
  );
  const svg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  const point = findDescendants(svg, node => node.className === 'trend-point')[0];
  assert.equal(point.attributes.cx, '171');
  assert.equal(point.attributes['data-date'], '2025-06-12');
});

test('chart period selection is read-only and preserves calendar selection and edit mode', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.selectedCalendarDate = '2025-06-11';
  app.api.enterEditMode('2025-06-10');
  const periodButton = app.elements.get('trend-period-7');

  app.api.handleHistoryTrendsClick({ target: periodButton });

  assert.equal(app.api.trendDayCount, 7);
  assert.equal(app.elements.get('trend-period-7').attributes['aria-pressed'], 'true');
  assert.equal(app.api.selectedCalendarDate, '2025-06-11');
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(saveCalls, 0);
});

test('custom chart ranges validate inclusively and use explicit historical data without saving', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.entries = [
    { date: '2020-02-28', mood: 2, sleep: 6, water: 0 },
    { date: '2020-03-01', mood: 5, sleep: 8, water: 2.4 },
  ];
  app.api.setTrendDayCount(30);
  assert.equal(app.elements.get('trend-custom-form').hidden, true);
  const customButton = app.elements.get('trend-period-custom');
  app.api.handleHistoryTrendsClick({ target: customButton });
  assert.equal(app.elements.get('trend-custom-form').hidden, false);
  const type = app.elements.get('trend-custom-type');
  type.value = 'date-range';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-start').value = '2020-02-28';
  app.elements.get('trend-custom-end').value = '2020-03-01';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });

  assert.equal(app.api.trendMode, 'custom');
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedCustomTrendRange)), {
    type: 'date-range',
    startDate: '2020-02-28',
    endDate: '2020-03-01',
  });
  assert.equal(app.elements.get('trend-custom-error').textContent, '');
  assert.match(app.elements.get('trend-range-status').textContent, /2020-02-28 to 2020-03-01/);
  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(app.elements.get('trend-custom-type').value, 'date-range');
  assert.equal(app.elements.get('trend-custom-start').value, '2020-02-28');
  assert.equal(app.elements.get('trend-custom-end').value, '2020-03-01');
  assert.equal(saveCalls, 0);
  assert.equal(app.api.entries[0].water, 0);
});

test('custom calendar month and year periods resolve complete inclusive ranges', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });

  const type = app.elements.get('trend-custom-type');
  type.value = 'month';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-month').value = '2024-02';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });

  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedCustomTrendRange)), {
    type: 'month', month: '2024-02', startDate: '2024-02-01', endDate: '2024-02-29',
  });
  assert.equal(app.elements.get('trend-custom-date-range-controls').hidden, true);
  assert.equal(app.elements.get('trend-custom-month-controls').hidden, false);
  assert.equal(app.elements.get('trend-custom-year-controls').hidden, true);
  assert.match(app.elements.get('trend-range-status').textContent, /2024-02-01 to 2024-02-29/);
  assert.equal(trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children.length, 29);

  app.api.setTrendDayCount(7);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(app.elements.get('trend-custom-type').value, 'month');
  assert.equal(app.elements.get('trend-custom-month').value, '2024-02');

  type.value = 'year';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-year').value = '2024';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedCustomTrendRange)), {
    type: 'year', year: '2024', startDate: '2024-01-01', endDate: '2024-12-31',
  });
  assert.match(app.elements.get('trend-range-status').textContent, /2024-01-01 to 2024-12-31/);
  assert.equal(trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children.length, 366);
  app.api.setTrendDayCount(7);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(app.elements.get('trend-custom-type').value, 'year');
  assert.equal(app.elements.get('trend-custom-year').value, '2024');
  assert.equal(saveCalls, 0);
});

test('invalid custom month and year drafts show accessible errors without changing charts', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  const initialStatus = app.elements.get('trend-range-status').textContent;

  const type = app.elements.get('trend-custom-type');
  type.value = 'month';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-month').value = '';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /valid calendar month/);
  assert.equal(app.elements.get('trend-custom-month').attributes['aria-invalid'], 'true');
  assert.equal(app.elements.get('trend-range-status').textContent, initialStatus);
  assert.equal(app.api.appliedCustomTrendRange, null);

  type.value = 'year';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-year').value = '20x4';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /0000 through 9999/);
  assert.equal(app.elements.get('trend-custom-year').attributes['aria-invalid'], 'true');
  assert.equal(app.elements.get('trend-range-status').textContent, initialStatus);
});

test('fresh custom mode restores the current calendar year after an invalid period attempt', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  app.elements.get('trend-custom-year').value = '20x4';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });

  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  const defaults = app.api.getChartPeriodDefaults();
  assert.equal(app.elements.get('trend-custom-type').value, 'year');
  assert.equal(app.elements.get('trend-custom-start').value, '');
  assert.equal(app.elements.get('trend-custom-end').value, '');
  assert.equal(app.elements.get('trend-custom-month').value, defaults.customMonth);
  assert.equal(app.elements.get('trend-custom-year').value, defaults.customYear);
  assert.equal(app.elements.get('trend-custom-error').textContent, '');
  assert.equal(app.elements.get('trend-custom-year').attributes['aria-invalid'], undefined);
});

test('chart period defaults use local calendar dates and keep supported boundary years valid', () => {
  const app = makeApp();

  assert.deepEqual(JSON.parse(JSON.stringify(app.api.getChartPeriodDefaults('2026-11-16'))), {
    customMonth: '2026-11',
    customYear: '2026',
    comparisonFirstMonth: '2026-10',
    comparisonSecondMonth: '2026-11',
    comparisonFirstYear: '2025',
    comparisonSecondYear: '2026',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.getChartPeriodDefaults('2027-01-04'))), {
    customMonth: '2027-01',
    customYear: '2027',
    comparisonFirstMonth: '2026-12',
    comparisonSecondMonth: '2027-01',
    comparisonFirstYear: '2026',
    comparisonSecondYear: '2027',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.getChartPeriodDefaults('0000-01-15'))), {
    customMonth: '0000-01',
    customYear: '0000',
    comparisonFirstMonth: '0000-01',
    comparisonSecondMonth: '0000-01',
    comparisonFirstYear: '0000',
    comparisonSecondYear: '0000',
  });
});

test('unapplied Custom mode defaults to the current calendar year without replacing displayed charts or saving', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.setTrendDayCount(30);
  const previousRows = trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children;
  const previousDates = previousRows.map(row => row.children[0].textContent);
  const defaults = app.api.getChartPeriodDefaults();

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(app.elements.get('trend-custom-type').value, 'year');
  assert.equal(app.elements.get('trend-custom-year').value, defaults.customYear);
  assert.equal(app.elements.get('trend-custom-start').value, '');
  assert.equal(app.elements.get('trend-custom-end').value, '');
  assert.match(app.elements.get('trend-range-status').textContent, /Choose a custom period/);
  assert.deepEqual(
    trendDataTable(app).children.find(child => child.tagName === 'TBODY').children
      .map(row => row.children[0].textContent),
    previousDates
  );

  const type = app.elements.get('trend-custom-type');
  type.value = 'month';
  app.api.handleCustomTrendTypeChange({ target: type });
  assert.equal(app.elements.get('trend-custom-month').value, defaults.customMonth);
  assert.equal(app.api.appliedCustomTrendRange, null);
  assert.match(app.elements.get('trend-range-status').textContent, /Choose a custom period/);

  type.value = 'year';
  app.api.handleCustomTrendTypeChange({ target: type });
  assert.equal(app.elements.get('trend-custom-year').value, defaults.customYear);
  assert.equal(app.api.appliedCustomTrendRange, null);
  assert.equal(saveCalls, 0);
});

test('custom calendar-month navigation changes only drafts, handles invalid input, and respects boundaries', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  const type = app.elements.get('trend-custom-type');
  type.value = 'month';
  app.api.handleCustomTrendTypeChange({ target: type });
  const month = app.elements.get('trend-custom-month');

  month.value = '2026-12';
  app.api.handleCustomTrendDraftInput({ target: month });
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-month-next') });
  assert.equal(month.value, '2027-01');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-month-prev') });
  assert.equal(month.value, '2026-12');
  assert.equal(app.api.appliedCustomTrendRange, null);

  month.value = '0000-01';
  app.api.handleCustomTrendDraftInput({ target: month });
  assert.equal(app.elements.get('trend-custom-month-prev').disabled, true);
  assert.equal(app.elements.get('trend-custom-month-next').disabled, false);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-month-prev') });
  assert.equal(month.value, '0000-01');

  month.value = '9999-12';
  app.api.handleCustomTrendDraftInput({ target: month });
  assert.equal(app.elements.get('trend-custom-month-prev').disabled, false);
  assert.equal(app.elements.get('trend-custom-month-next').disabled, true);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-month-next') });
  assert.equal(month.value, '9999-12');

  month.value = '';
  app.api.handleCustomTrendDraftInput({ target: month });
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /valid calendar month/);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-month-next') });
  assert.match(month.value, /^\d{4}-\d{2}$/);
  assert.equal(app.elements.get('trend-custom-error').textContent, '');
  assert.equal(app.api.appliedCustomTrendRange, null);
  assert.equal(saveCalls, 0);
});

test('custom calendar-year navigation preserves direct entry, drafts, and supported boundaries', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  const type = app.elements.get('trend-custom-type');
  type.value = 'year';
  app.api.handleCustomTrendTypeChange({ target: type });
  const year = app.elements.get('trend-custom-year');

  year.value = '0099';
  app.api.handleCustomTrendDraftInput({ target: year });
  assert.equal(year.value, '0099');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-year-next') });
  assert.equal(year.value, '0100');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-year-prev') });
  assert.equal(year.value, '0099');
  assert.equal(app.api.appliedCustomTrendRange, null);

  year.value = '0000';
  app.api.handleCustomTrendDraftInput({ target: year });
  assert.equal(app.elements.get('trend-custom-year-prev').disabled, true);
  assert.equal(app.elements.get('trend-custom-year-next').disabled, false);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-year-prev') });
  assert.equal(year.value, '0000');

  year.value = '9999';
  app.api.handleCustomTrendDraftInput({ target: year });
  assert.equal(app.elements.get('trend-custom-year-prev').disabled, false);
  assert.equal(app.elements.get('trend-custom-year-next').disabled, true);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-year-next') });
  assert.equal(year.value, '9999');

  year.value = '20x4';
  app.api.handleCustomTrendDraftInput({ target: year });
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /0000 through 9999/);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-year-next') });
  assert.match(year.value, /^\d{4}$/);
  assert.equal(app.elements.get('trend-custom-error').textContent, '');
  assert.equal(app.api.appliedCustomTrendRange, null);

  year.value = '2024';
  app.api.handleCustomTrendDraftInput({ target: year });
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-custom-year-next') });
  assert.equal(year.value, '2025');
  assert.equal(app.api.appliedCustomTrendRange.year, '2024');
  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(year.value, '2024');
  assert.equal(saveCalls, 0);
});

test('invalid custom chart drafts do not replace the last applied range', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  const type = app.elements.get('trend-custom-type');
  type.value = 'date-range';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-start').value = '2020-01-01';
  app.elements.get('trend-custom-end').value = '2020-01-03';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  app.elements.get('trend-custom-start').value = '2020-01-05';
  app.elements.get('trend-custom-end').value = '2020-01-01';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });

  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedCustomTrendRange)), {
    type: 'date-range',
    startDate: '2020-01-01',
    endDate: '2020-01-03',
  });
  assert.match(app.elements.get('trend-custom-error').textContent, /on or after/);
  assert.equal(app.elements.get('trend-custom-form').hidden, false);
  assert.equal(app.elements.get('trend-custom-start').attributes['aria-invalid'], 'true');
  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(app.elements.get('trend-custom-error').textContent, '');
  assert.equal(app.elements.get('trend-custom-start').attributes['aria-invalid'], undefined);
  assert.equal(app.elements.get('trend-custom-end').attributes['aria-invalid'], undefined);
  app.elements.get('trend-custom-start').value = '2020-01-05';
  app.elements.get('trend-custom-end').value = '2020-01-01';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /on or after/);
});

test('a fresh custom mode clears invalid drafts when no custom range was applied', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  const type = app.elements.get('trend-custom-type');
  type.value = 'date-range';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-start').value = '2026-10-20';
  app.elements.get('trend-custom-end').value = '2026-10-10';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /on or after/);

  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });

  assert.equal(app.elements.get('trend-custom-type').value, 'year');
  assert.equal(app.elements.get('trend-custom-start').value, '');
  assert.equal(app.elements.get('trend-custom-end').value, '');
  assert.equal(app.elements.get('trend-custom-error').textContent, '');
  assert.equal(app.elements.get('trend-custom-start').attributes['aria-invalid'], undefined);
  assert.equal(app.elements.get('trend-custom-end').attributes['aria-invalid'], undefined);

  type.value = 'date-range';
  app.api.handleCustomTrendTypeChange({ target: type });
  app.elements.get('trend-custom-start').value = '2026-10-20';
  app.elements.get('trend-custom-end').value = '2026-10-10';
  app.api.handleCustomTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-custom-error').textContent, /on or after/);
});

test('Compare periods starts with previous/current month drafts and renders only after Apply', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  const comparisonButton = app.elements.get('trend-period-compare');
  app.api.handleHistoryTrendsClick({ target: comparisonButton });
  const defaults = app.api.getChartPeriodDefaults();

  assert.equal(app.api.trendMode, 'compare');
  assert.equal(app.elements.get('trend-comparison-form').hidden, false);
  assert.equal(app.elements.get('trend-custom-form').hidden, true);
  assert.equal(app.elements.get('trend-comparison-first-month').value, defaults.comparisonFirstMonth);
  assert.equal(app.elements.get('trend-comparison-second-month').value, defaults.comparisonSecondMonth);
  assert.match(app.elements.get('trend-range-status').textContent, /Choose two periods/);

  app.elements.get('trend-comparison-first-month').value = '2024-02';
  app.elements.get('trend-comparison-second-month').value = '2024-03';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });

  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedTrendComparison)), {
    type: 'month',
    resolution: 'daily',
    firstPeriod: '2024-02',
    secondPeriod: '2024-03',
    first: { year: 2024, monthIndex: 1 },
    second: { year: 2024, monthIndex: 2 },
  });
  assert.match(app.elements.get('trend-range-status').textContent, /Comparing February 2024 with March 2024/);
  assert.equal(app.elements.get('trend-period-compare').attributes['aria-pressed'], 'true');
  assert.equal(saveCalls, 0);
});

test('unapplied comparison types use local defaults without changing charts or saving', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.setTrendDayCount(30);
  const previousDates = trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children
    .map(row => row.children[0].textContent);
  const defaults = app.api.getChartPeriodDefaults();

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  assert.equal(app.elements.get('trend-comparison-first-month').value, defaults.comparisonFirstMonth);
  assert.equal(app.elements.get('trend-comparison-second-month').value, defaults.comparisonSecondMonth);
  assert.match(app.elements.get('trend-range-status').textContent, /Choose two periods/);

  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  assert.equal(app.elements.get('trend-comparison-first-year').value, defaults.comparisonFirstYear);
  assert.equal(app.elements.get('trend-comparison-second-year').value, defaults.comparisonSecondYear);
  assert.equal(app.elements.get('trend-comparison-resolution').value, 'weekly');
  assert.equal(app.api.appliedTrendComparison, null);

  type.value = 'month';
  app.api.handleComparisonTrendTypeChange({ target: type });
  assert.equal(app.elements.get('trend-comparison-first-month').value, defaults.comparisonFirstMonth);
  assert.equal(app.elements.get('trend-comparison-second-month').value, defaults.comparisonSecondMonth);
  assert.deepEqual(
    trendDataTable(app).children.find(child => child.tagName === 'TBODY').children
      .map(row => row.children[0].textContent),
    previousDates
  );
  assert.equal(saveCalls, 0);
});

test('comparison month navigation keeps drafts independent and preserves applied comparisons', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const first = app.elements.get('trend-comparison-first-month');
  const second = app.elements.get('trend-comparison-second-month');

  first.value = '2027-01';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '2026-12';
  app.api.handleComparisonTrendDraftInput({ target: second });
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-first-month-prev') });
  assert.equal(first.value, '2026-12');
  assert.equal(second.value, '2026-12');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-second-month-next') });
  assert.equal(first.value, '2026-12');
  assert.equal(second.value, '2027-01');

  first.value = '0000-01';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '9999-12';
  app.api.handleComparisonTrendDraftInput({ target: second });
  assert.equal(app.elements.get('trend-comparison-first-month-prev').disabled, true);
  assert.equal(app.elements.get('trend-comparison-second-month-next').disabled, true);

  first.value = '2024-02';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '2024-03';
  app.api.handleComparisonTrendDraftInput({ target: second });
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-first-month-next') });
  assert.equal(first.value, '2024-03');
  assert.equal(app.api.appliedTrendComparison.firstPeriod, '2024-02');
  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  assert.equal(first.value, '2024-02');
  assert.equal(second.value, '2024-03');
  assert.equal(saveCalls, 0);
});

test('comparison year navigation keeps drafts independent and restores an applied comparison', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  const first = app.elements.get('trend-comparison-first-year');
  const second = app.elements.get('trend-comparison-second-year');

  first.value = '2024';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '2025';
  app.api.handleComparisonTrendDraftInput({ target: second });
  assert.equal(app.elements.get('trend-comparison-resolution').value, 'weekly');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-first-year-prev') });
  assert.equal(first.value, '2023');
  assert.equal(second.value, '2025');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-second-year-next') });
  assert.equal(first.value, '2023');
  assert.equal(second.value, '2026');
  assert.equal(app.elements.get('trend-comparison-resolution').value, 'weekly');
  assert.equal(app.api.appliedTrendComparison, null);

  first.value = '0000';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '9999';
  app.api.handleComparisonTrendDraftInput({ target: second });
  assert.equal(app.elements.get('trend-comparison-first-year-prev').disabled, true);
  assert.equal(app.elements.get('trend-comparison-second-year-next').disabled, true);

  first.value = '2024';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '2025';
  app.api.handleComparisonTrendDraftInput({ target: second });
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-first-year-next') });
  assert.equal(first.value, '2025');
  assert.equal(app.api.appliedTrendComparison.firstPeriod, '2024');
  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  assert.equal(first.value, '2024');
  assert.equal(second.value, '2025');
  assert.equal(saveCalls, 0);
});

test('month comparison shortcuts swap drafts, use the prior January month, and stay unapplied', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const first = app.elements.get('trend-comparison-first-month');
  const second = app.elements.get('trend-comparison-second-month');
  first.value = '2024-01';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '2024-02';
  app.api.handleComparisonTrendDraftInput({ target: second });
  const previousStatus = app.elements.get('trend-range-status').textContent;

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-swap-btn') });
  assert.equal(first.value, '2024-02');
  assert.equal(second.value, '2024-01');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-swap-btn') });
  assert.equal(first.value, '2024-01');
  assert.equal(second.value, '2024-02');

  second.value = '2024-01';
  app.api.handleComparisonTrendDraftInput({ target: second });
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-previous-btn') });
  assert.equal(first.value, '2023-12');
  assert.equal(second.value, '2024-01');
  assert.equal(app.api.comparisonTrendDraftResolution, 'daily');
  assert.equal(app.api.appliedTrendComparison, null);
  assert.equal(app.elements.get('trend-range-status').textContent, previousStatus);

  const defaults = app.api.getChartPeriodDefaults();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-current-btn') });
  assert.equal(first.value, defaults.comparisonFirstMonth);
  assert.equal(second.value, defaults.comparisonSecondMonth);

  second.value = '';
  app.api.handleComparisonTrendDraftInput({ target: second });
  assert.equal(app.elements.get('trend-comparison-previous-btn').disabled, false);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-previous-btn') });
  assert.match(app.elements.get('trend-comparison-error').textContent, /valid second calendar month/);
  assert.equal(second.attributes['aria-invalid'], 'true');

  second.value = '0000-01';
  app.api.handleComparisonTrendDraftInput({ target: second });
  assert.equal(app.elements.get('trend-comparison-previous-btn').disabled, true);
  assert.equal(saveCalls, 0);
});

test('year comparison shortcuts preserve resolution and applied selections without storage writes', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  const first = app.elements.get('trend-comparison-first-year');
  const second = app.elements.get('trend-comparison-second-year');
  first.value = '2024';
  app.api.handleComparisonTrendDraftInput({ target: first });
  second.value = '2025';
  app.api.handleComparisonTrendDraftInput({ target: second });
  app.elements.get('trend-comparison-resolution').value = 'monthly';
  app.api.handleComparisonTrendResolutionChange();

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-swap-btn') });
  assert.equal(first.value, '2025');
  assert.equal(second.value, '2024');
  assert.equal(app.api.comparisonTrendDraftResolution, 'monthly');
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-swap-btn') });
  assert.equal(first.value, '2024');
  assert.equal(second.value, '2025');

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-previous-btn') });
  assert.equal(first.value, '2024');
  assert.equal(second.value, '2025');
  assert.equal(app.api.comparisonTrendDraftResolution, 'monthly');
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.equal(app.api.appliedTrendComparison.firstPeriod, '2024');

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-comparison-current-btn') });
  const defaults = app.api.getChartPeriodDefaults();
  assert.equal(first.value, defaults.comparisonFirstYear);
  assert.equal(second.value, defaults.comparisonSecondYear);
  assert.equal(app.api.appliedTrendComparison.firstPeriod, '2024');
  assert.equal(app.api.comparisonTrendDraftResolution, 'monthly');

  second.value = '0000';
  app.api.handleComparisonTrendDraftInput({ target: second });
  assert.equal(app.elements.get('trend-comparison-previous-btn').disabled, true);
  app.api.compareWithPreviousTrendDraft();
  assert.match(app.elements.get('trend-comparison-error').textContent, /no earlier calendar year/);
  assert.equal(saveCalls, 0);
});

test('Compare periods validates drafts accessibly without replacing the rendered chart state', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const initialStatus = app.elements.get('trend-range-status').textContent;
  app.elements.get('trend-comparison-first-month').value = '';
  app.elements.get('trend-comparison-second-month').value = '';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });

  assert.match(app.elements.get('trend-comparison-error').textContent, /valid calendar months/);
  assert.equal(app.elements.get('trend-comparison-first-month').attributes['aria-invalid'], 'true');
  assert.equal(app.elements.get('trend-comparison-second-month').attributes['aria-invalid'], 'true');
  assert.equal(app.elements.get('trend-range-status').textContent, initialStatus);

  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  app.elements.get('trend-comparison-first-year').value = '20x4';
  app.elements.get('trend-comparison-second-year').value = '2024';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-comparison-error').textContent, /0000 through 9999/);
  assert.equal(app.elements.get('trend-comparison-first-year').attributes['aria-invalid'], 'true');

  app.api.setTrendDayCount(30);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const defaults = app.api.getChartPeriodDefaults();
  assert.equal(app.elements.get('trend-comparison-type').value, 'month');
  assert.equal(app.elements.get('trend-comparison-first-month').value, defaults.comparisonFirstMonth);
  assert.equal(app.elements.get('trend-comparison-second-month').value, defaults.comparisonSecondMonth);
  assert.equal(app.elements.get('trend-comparison-error').textContent, '');
  assert.equal(app.elements.get('trend-comparison-first-year').attributes['aria-invalid'], undefined);
});

test('Compare periods applies valid calendar years without storage writes', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  app.elements.get('trend-comparison-first-year').value = '2024';
  app.elements.get('trend-comparison-second-year').value = '2025';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });

  assert.deepEqual(JSON.parse(JSON.stringify(app.api.appliedTrendComparison)), {
    type: 'year',
    resolution: 'weekly',
    firstPeriod: '2024',
    secondPeriod: '2025',
    first: 2024,
    second: 2025,
  });
  assert.equal(app.elements.get('trend-comparison-month-controls').hidden, true);
  assert.equal(app.elements.get('trend-comparison-year-controls').hidden, false);
  assert.match(app.elements.get('trend-range-status').textContent, /Comparing 2024 with 2025/);
  assert.equal(saveCalls, 0);
});

test('year comparisons default to weekly and apply daily, weekly, and monthly resolutions', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = { async saveEntries() { saveCalls += 1; return { ok: true }; } };
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  assert.equal(app.elements.get('trend-comparison-resolution-controls').hidden, false);
  assert.equal(app.elements.get('trend-comparison-resolution').value, 'weekly');
  app.elements.get('trend-comparison-first-year').value = '2024';
  app.elements.get('trend-comparison-second-year').value = '2025';

  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.equal(trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children.length, 53);
  assert.match(app.elements.get('trend-range-status').textContent, /Weekly averages/);

  app.elements.get('trend-comparison-resolution').value = 'monthly';
  app.api.handleComparisonTrendResolutionChange();
  assert.equal(trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children.length, 53);
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.equal(trendDataTable(app).children
    .find(child => child.tagName === 'TBODY').children.length, 12);
  assert.match(app.elements.get('trend-range-status').textContent, /Monthly averages/);

  app.elements.get('trend-comparison-resolution').value = 'daily';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.equal(trendDataTable(app)
    .children.find(child => child.tagName === 'TBODY').children.length, 366);
  assert.match(app.elements.get('trend-range-status').textContent, /Daily values/);
  assert.equal(saveCalls, 0);
});

test('year comparison resolution drafts restore after presets while month comparisons stay daily', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  app.elements.get('trend-comparison-first-year').value = '2024';
  app.elements.get('trend-comparison-second-year').value = '2025';
  app.elements.get('trend-comparison-resolution').value = 'monthly';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  app.api.setTrendDayCount(7);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  assert.equal(app.elements.get('trend-comparison-type').value, 'year');
  assert.equal(app.elements.get('trend-comparison-resolution').value, 'monthly');
  assert.equal(app.elements.get('trend-comparison-first-year').value, '2024');
  assert.equal(app.elements.get('trend-comparison-second-year').value, '2025');

  type.value = 'month';
  app.api.handleComparisonTrendTypeChange({ target: type });
  assert.equal(app.elements.get('trend-comparison-resolution-controls').hidden, true);
  app.elements.get('trend-comparison-first-month').value = '2024-02';
  app.elements.get('trend-comparison-second-month').value = '2025-02';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.equal(app.api.appliedTrendComparison.resolution, 'daily');
  assert.match(app.elements.get('trend-range-status').textContent, /Daily values/);
});

test('invalid comparison resolution preserves the previously rendered comparison', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  const type = app.elements.get('trend-comparison-type');
  type.value = 'year';
  app.api.handleComparisonTrendTypeChange({ target: type });
  app.elements.get('trend-comparison-first-year').value = '2024';
  app.elements.get('trend-comparison-second-year').value = '2025';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  const previousStatus = app.elements.get('trend-range-status').textContent;
  app.elements.get('trend-comparison-resolution').value = 'unsupported';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  assert.match(app.elements.get('trend-comparison-error').textContent, /valid display resolution/);
  assert.equal(app.elements.get('trend-range-status').textContent, previousStatus);
  assert.equal(app.api.appliedTrendComparison.resolution, 'weekly');
});

test('Compare periods restores its last applied comparison after preset and Custom mode changes', () => {
  const app = makeApp();
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  app.elements.get('trend-comparison-first-month').value = '2024-02';
  app.elements.get('trend-comparison-second-month').value = '2025-02';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  app.api.setTrendDayCount(7);
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-custom') });
  assert.equal(app.elements.get('trend-custom-form').hidden, false);
  assert.equal(app.elements.get('trend-comparison-form').hidden, true);

  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  assert.equal(app.elements.get('trend-comparison-type').value, 'month');
  assert.equal(app.elements.get('trend-comparison-first-month').value, '2024-02');
  assert.equal(app.elements.get('trend-comparison-second-month').value, '2025-02');
  assert.match(app.elements.get('trend-range-status').textContent, /Comparing February 2024 with February 2025/);
});

test('active comparisons refresh from committed entries without changing History or Calendar state', () => {
  const app = makeApp();
  app.api.entries = [{ date: '2024-02-01', mood: 2, sleep: 6, water: 0 }];
  app.api.handleHistoryTrendsClick({ target: app.elements.get('trend-period-compare') });
  app.elements.get('trend-comparison-first-month').value = '2024-02';
  app.elements.get('trend-comparison-second-month').value = '2024-03';
  app.api.handleComparisonTrendSubmit({ preventDefault() {} });
  const selectedDate = '2024-02-01';
  app.api.calendarYear = 2024;
  app.api.calendarMonthIndex = 1;
  app.api.selectedCalendarDate = selectedDate;
  app.api.setHistoryView('calendar');
  app.api.entries = [{ date: '2024-02-01', mood: 5, sleep: 8, water: 1.2 }];
  renderHistoryTrendsForApp(app);

  assert.equal(app.api.selectedCalendarDate, selectedDate);
  assert.equal(app.api.appliedHistoryRange, null);
  assert.match(app.elements.get('trend-range-status').textContent, /Comparing February 2024 with March 2024/);
  const table = trendDataTable(app);
  const tbody = table.children.find(child => child.tagName === 'TBODY');
  assert.equal(tbody.children[0].children[1].textContent, '5');
});

test('charts preserve zero values and break line segments across missing dates', () => {
  const app = makeApp();
  const today = localDateKey();
  const day = offset => app.sandbox.addCalendarDays(today, offset);
  app.api.entries = [
    { date: day(-6), mood: 1, sleep: 0, water: 0 },
    { date: day(-5), mood: 2, sleep: 1, water: 0.1 },
    { date: day(-3), mood: 4, sleep: 3, water: 0.3 },
    { date: day(-2), mood: 5, sleep: 4, water: 0.4 },
  ];
  app.api.setTrendDayCount(7);

  const moodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-line').length, 2);
  const waterSvg = trendCard(app, 'water').children.find(child => child.tagName === 'SVG');
  const zeroPoint = findDescendants(waterSvg, node => node.className === 'trend-point')
    .find(point => point.attributes['data-date'] === day(-6));
  assert.equal(zeroPoint.attributes['data-value'], '0');

  const table = trendDataTable(app);
  const tbody = table.children.find(child => child.tagName === 'TBODY');
  const missingRow = tbody.children.find(row => row.children[0].textContent === day(-4));
  assert.equal(missingRow.children[1].textContent, '— Missing');
  assert.equal(missingRow.children[3].textContent, '— Missing');
});

test('charts show isolated observations and empty periods without joining missing dates', () => {
  const app = makeApp();
  const today = localDateKey();
  app.api.entries = [{ date: today, mood: 3, sleep: 7, water: 1.5 }];
  app.api.setTrendDayCount(7);

  const moodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-point').length, 1);
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-line').length, 0);

  app.api.entries = [];
  renderChartsForApp(app);
  const emptyMoodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(emptyMoodSvg, node => node.className === 'trend-empty-label').length, 1);
  assert.equal(findDescendants(emptyMoodSvg, node => node.className === 'trend-point').length, 0);
});

test('charts refresh after a successful save but retain committed data after a failed save', async () => {
  const app = makeApp();
  const today = localDateKey();
  app.sandbox.render = app.realRender;
  app.api.setTrendDayCount(7);
  app.elements.get('entry-date').value = today;
  app.radios[3].checked = true;
  app.api.setValueControlValues(8, 2.2);
  app.api.storageAdapter = { async saveEntries() { return { ok: false, error: 'disk unavailable' }; } };

  await submit(app);

  assert.equal(app.api.entries.some(entry => entry.date === today), false);
  let moodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-point').length, 0);

  app.api.storageAdapter = { async saveEntries() { return { ok: true }; } };
  await submit(app);

  assert.equal(app.api.entries.some(entry => entry.date === today), true);
  moodSvg = trendCard(app, 'mood').children.find(child => child.tagName === 'SVG');
  assert.equal(findDescendants(moodSvg, node => node.className === 'trend-point').length, 1);
});

test('calendar refreshes after a successful entry save through the existing render flow', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.elements.get('entry-date').value = '2025-06-12';
  app.radios[2].checked = true;
  app.api.setValueControlValues(7, 2);

  await submit(app);

  const savedDate = findCalendarDateButton(app, '2025-06-12');
  assert.ok(savedDate);
  assert.match(savedDate.className, /has-entry/);
  assert.equal(app.api.entries.length, 3);
});

test('calendar details refresh after a successful edit through the existing render flow', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-10';
  app.api.enterEditMode('2025-06-10');
  app.radios.forEach(radio => { radio.checked = false; });
  app.radios[4].checked = true;

  await submit(app);

  assert.match(app.elements.get('calendar-details').textContent, /Mood 5/);
  assert.match(findCalendarDateButton(app, '2025-06-10').className, /has-entry/);
});

test('calendar removes an entry indicator after a successful deletion', async () => {
  const app = makeApp();
  app.sandbox.render = () => {
    app.realRender();
    app.buttons.length = 0;
  };
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-11';
  const deleteButton = new Element('delete');
  deleteButton.className = 'btn-delete';
  deleteButton.dataset.date = '2025-06-11';
  app.buttons.push(deleteButton);

  await app.api.handleTableClick({ target: deleteButton });

  assert.doesNotMatch(findCalendarDateButton(app, '2025-06-11').className, /has-entry/);
  assert.match(app.elements.get('calendar-details').textContent, /No entry recorded/);
});

test('calendar delete keeps the selected date, shows Create entry, and restores focus', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-10';
  app.api.renderCalendarDetails(app.api.entries, app.api.selectedCalendarDate, false);
  const deleteButton = app.elements.get('calendar-details').children.find(button =>
    button.dataset.calendarAction === 'delete'
  );
  assert.ok(deleteButton);
  assert.equal(deleteButton.disabled, false);

  app.api.handleHistoryTrendsClick({ target: deleteButton });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(app.api.entries.some(entry => entry.date === '2025-06-10'), false);
  assert.equal(app.api.selectedCalendarDate, '2025-06-10');
  const createButton = app.elements.get('calendar-details').children.find(button =>
    button.dataset.calendarAction === 'create'
  );
  assert.ok(createButton);
  assert.equal(createButton.disabled, false);
  assert.equal(createButton.focused, true);
});

test('calendar delete cancellation and storage failure preserve the entry and selection', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  app.api.selectedCalendarDate = '2025-06-10';
  app.api.renderCalendarDetails(app.api.entries, app.api.selectedCalendarDate, false);
  const deleteButton = app.elements.get('calendar-details').children.find(button =>
    button.dataset.calendarAction === 'delete'
  );

  app.confirms.push(false);
  app.api.handleHistoryTrendsClick({ target: deleteButton });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.api.entries.length, 2);
  assert.equal(app.api.selectedCalendarDate, '2025-06-10');

  app.confirms.push(true);
  app.api.storageAdapter = { async saveEntries() { return { ok: false }; } };
  app.api.handleHistoryTrendsClick({ target: deleteButton });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.api.entries.length, 2);
  assert.equal(app.api.selectedCalendarDate, '2025-06-10');
});

test('calendar removes all entry indicators after a successful erase-all', async () => {
  const app = makeApp();
  app.sandbox.render = app.realRender;
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-10';

  await app.api.handleEraseAll();

  const dateButtons = app.elements.get('calendar-grid').children.filter(node =>
    node.dataset && node.dataset.calendarDate
  );
  assert.equal(app.api.entries.length, 0);
  assert.ok(dateButtons.every(button => !button.className.includes('has-entry')));
  assert.match(app.elements.get('calendar-details').textContent, /No entry recorded/);
});

test('calendar Edit entry action reuses edit mode, scrolls to the form, and does not save', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = {
    async saveEntries() { saveCalls += 1; return { ok: true }; },
  };
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-10';
  renderHistoryTrendsForApp(app);
  const action = findCalendarDetailAction(app);

  assert.equal(action.textContent, 'Edit entry');
  app.api.handleHistoryTrendsClick({ target: action });

  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-date').value, '2025-06-10');
  assert.equal(app.elements.get('entry-date').readOnly, true);
  assert.equal(app.elements.get('entry-sleep').value, 7.5);
  assert.equal(app.elements.get('entry-form-section').scrolled, true);
  assert.equal(app.radios[0].focused, true);
  assert.equal(saveCalls, 0);
});

test('calendar Create entry action sets the chosen date with normal new-entry defaults and no confirmation when untouched', () => {
  const app = makeApp();
  let saveCalls = 0;
  app.api.storageAdapter = {
    async saveEntries() { saveCalls += 1; return { ok: true }; },
  };
  app.confirms.push(false); // Must remain unused for an untouched new-entry form.
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-12';
  renderHistoryTrendsForApp(app);
  const action = findCalendarDetailAction(app);

  assert.equal(action.textContent, 'Create entry');
  app.api.handleHistoryTrendsClick({ target: action });

  assert.equal(app.api.editingDate, null);
  assert.equal(app.elements.get('entry-date').value, '2025-06-12');
  assert.equal(app.elements.get('entry-date').readOnly, false);
  assert.equal(app.api.sleepSelected, false);
  assert.equal(app.api.waterSelected, false);
  assert.equal(app.radios.some(radio => radio.checked), false);
  assert.equal(app.elements.get('entry-form-section').scrolled, true);
  assert.equal(app.radios[0].focused, true);
  assert.equal(saveCalls, 0);
  assert.equal(app.confirms.length, 1);
});

test('calendar actions preserve unsaved edits when discard confirmation is cancelled', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-11';
  renderHistoryTrendsForApp(app);
  const action = findCalendarDetailAction(app);
  app.confirms.push(false);

  app.api.handleHistoryTrendsClick({ target: action });

  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-sleep').value, '8');
  assert.equal(app.api.selectedCalendarDate, '2025-06-11');
});

test('calendar Create entry action protects a partially completed new form', () => {
  const app = makeApp();
  app.radios[2].checked = true;
  app.api.setValueControlValues(7, 2);
  const originalDate = app.elements.get('entry-date').value;
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-12';
  renderHistoryTrendsForApp(app);
  const action = findCalendarDetailAction(app);
  app.confirms.push(false);

  app.api.handleHistoryTrendsClick({ target: action });

  assert.equal(app.elements.get('entry-date').value, originalDate);
  assert.equal(app.radios[2].checked, true);
  assert.equal(app.elements.get('entry-sleep').value, 7);
  assert.equal(app.api.sleepSelected, true);
  assert.equal(app.api.selectedCalendarDate, '2025-06-12');
});

test('calendar action buttons are disabled and guarded while busy or locked', () => {
  const app = makeApp();
  app.api.calendarYear = 2025;
  app.api.calendarMonthIndex = 5;
  app.api.selectedCalendarDate = '2025-06-10';
  renderHistoryTrendsForApp(app);
  const busyAction = findCalendarDetailAction(app);

  app.api.setBusyState(true);
  assert.equal(busyAction.disabled, true);
  app.api.handleHistoryTrendsClick({ target: busyAction });
  assert.equal(app.api.editingDate, null);

  app.api.setBusyState(false);
  renderHistoryTrendsForApp(app);
  app.api.lockApp();
  const lockedAction = findCalendarDetailAction(app);
  assert.equal(lockedAction.disabled, true);
  app.api.handleHistoryTrendsClick({ target: lockedAction });
  assert.equal(app.api.editingDate, null);
});
