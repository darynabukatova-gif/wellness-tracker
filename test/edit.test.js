'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

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
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
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
   'cancel-edit-btn', 'form-error', 'table-error', 'erase-all-btn',
   'entries-container', 'entries-heading', 'entry-form', 'app-error', 'sleep-value',
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
  [7, 30, 90].forEach(dayCount => {
    const button = elements.get('trend-period-' + dayCount);
    button.className = 'trend-period-btn';
    button.dataset.trendDays = String(dayCount);
  });
  const radios = [1, 2, 3, 4, 5].map(value => {
    const radio = new Element('mood-' + value);
    radio.value = String(value);
    return radio;
  });
  const buttons = [];
  const document = {
    getElementById(id) { return elements.get(id); },
    createElement(tag) { return new Element(tag); },
    createElementNS(_, tag) { return new Element(tag); },
    querySelector(selector) {
      if (selector === 'input[name="mood"]:checked') return radios.find(r => r.checked) || null;
      if (selector === 'input[name="mood"]') return radios[0];
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="mood"]') return radios;
      if (selector === '#entries-container .btn-edit') return buttons.filter(b => b.className === 'btn-edit');
      if (selector === '#entries-container .btn-delete') return buttons.filter(b => b.className === 'btn-delete');
      if (selector === '#entries-container .btn-edit, #entries-container .btn-delete') return buttons;
      if (selector === '.trend-period-btn') {
        return [7, 30, 90].map(dayCount => elements.get('trend-period-' + dayCount));
      }
      if (selector === '#calendar-details .calendar-detail-action') {
        return elements.get('calendar-details').children.filter(button =>
          button.className && button.className.includes('calendar-detail-action')
        );
      }
      return [];
    },
    addEventListener() {},
  };
  const storage = { value: null, getItem() { return this.value; }, setItem(_, value) { this.value = String(value); } };
  const confirms = [];
  const sandbox = {
    document,
    localStorage: storage,
    console,
    window: { confirm: () => confirms.shift() ?? true },
    Date,
  };
  vm.createContext(sandbox);
  const source = scripts[1] + '\nthis.__api = { init, render, renderHistoryTrends, renderCharts, renderCalendar, setHistoryView, setTrendDayCount, changeCalendarMonth, handleHistoryTrendsClick, hasUnsavedFormChanges, enterNewEntryModeForDate, enterEditMode, exitEditMode, handleFormSubmit, handleTableClick, handleEraseAll, adjustValueControl, resetValueControls, setValueControlValues, updateSleepControl, updateWaterControl, setBusyState, lockApp, getStorageAdapter, get entries() { return entries; }, get editingDate() { return editingDate; }, get sleepSelected() { return sleepSelected; }, get waterSelected() { return waterSelected; }, get busy() { return busy; }, get locked() { return locked; }, get historyView() { return historyView; }, get trendDayCount() { return trendDayCount; }, get calendarYear() { return calendarYear; }, get calendarMonthIndex() { return calendarMonthIndex; }, get selectedCalendarDate() { return selectedCalendarDate; }, set entries(value) { entries = value; }, set editingDate(value) { editingDate = value; }, set storageAdapter(value) { storageAdapter = value; }, set calendarYear(value) { calendarYear = value; }, set calendarMonthIndex(value) { calendarMonthIndex = value; }, set selectedCalendarDate(value) { selectedCalendarDate = value; } };';
  new vm.Script(scripts[0] + '\n' + source).runInContext(sandbox);
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
  return { api: sandbox.__api, elements, radios, buttons, storage, confirms, window: sandbox.window, sandbox, realRender };
}

async function submit(app) { await app.api.handleFormSubmit({ preventDefault() {}, target: app.elements.get('entry-form') }); }

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

test('calendar detail container permits its interactive action button', () => {
  assert.match(html, /<div id="calendar-details" class="calendar-details" aria-live="polite"><\/div>/);
  assert.doesNotMatch(html, /<p id="calendar-details"/);
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
  app.api.renderHistoryTrends();
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
  app.api.renderHistoryTrends();
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
  app.api.renderHistoryTrends();

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
  app.api.renderHistoryTrends();
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
  app.api.renderCharts();

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

  const table = app.elements.get('trend-data-table-container').children[0];
  const tbody = table.children.find(child => child.tagName === 'TBODY');
  assert.equal(tbody.children.length, 30);
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

  const table = app.elements.get('trend-data-table-container').children[0];
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
  app.api.renderCharts();
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
  app.api.renderHistoryTrends();
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
  app.api.renderHistoryTrends();
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
  app.api.renderHistoryTrends();
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
  app.api.renderHistoryTrends();
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
  app.api.renderHistoryTrends();
  const busyAction = findCalendarDetailAction(app);

  app.api.setBusyState(true);
  assert.equal(busyAction.disabled, true);
  app.api.handleHistoryTrendsClick({ target: busyAction });
  assert.equal(app.api.editingDate, null);

  app.api.setBusyState(false);
  app.api.renderHistoryTrends();
  app.api.lockApp();
  const lockedAction = findCalendarDetailAction(app);
  assert.equal(lockedAction.disabled, true);
  app.api.handleHistoryTrendsClick({ target: lockedAction });
  assert.equal(app.api.editingDate, null);
});
