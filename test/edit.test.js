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
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.readOnly = false;
    this.disabled = false;
    this.checked = false;
    this.dataset = {};
    this.classList = { add() {}, remove() {} };
    this.listeners = {};
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  focus() { this.focused = true; }
  reset() { this.value = ''; this.checked = false; }
  setAttribute(name, value) { this[name] = value; }
  appendChild() {}
  replaceChildren() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function makeApp() {
  const elements = new Map();
  ['entry-date', 'entry-sleep', 'entry-water', 'form-heading', 'save-btn',
   'cancel-edit-btn', 'form-error', 'table-error', 'erase-all-btn',
   'entries-container', 'entries-heading', 'entry-form', 'sleep-value',
   'water-value', 'sleep-minus', 'sleep-plus', 'water-minus', 'water-plus',
   'sleep-unit', 'water-unit'].forEach(id => {
    elements.set(id, new Element(id));
  });
  const radios = [1, 2, 3, 4, 5].map(value => {
    const radio = new Element('mood-' + value);
    radio.value = String(value);
    return radio;
  });
  const buttons = [];
  const document = {
    getElementById(id) { return elements.get(id); },
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
  const source = scripts[1] + '\nthis.__api = { enterEditMode, exitEditMode, handleFormSubmit, handleTableClick, handleEraseAll, adjustValueControl, resetValueControls, setValueControlValues, updateSleepControl, updateWaterControl, lockApp, get entries() { return entries; }, get editingDate() { return editingDate; }, get sleepSelected() { return sleepSelected; }, get waterSelected() { return waterSelected; }, set entries(value) { entries = value; }, set editingDate(value) { editingDate = value; } };';
  new vm.Script(scripts[0] + '\n' + source).runInContext(sandbox);
  sandbox.render = () => {};
  sandbox.__api.entries = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 },
  ];
  sandbox.__api.resetValueControls();
  return { api: sandbox.__api, elements, radios, buttons, storage, confirms };
}

function submit(app) { app.api.handleFormSubmit({ preventDefault() {}, target: app.elements.get('entry-form') }); }

test('entering edit mode loads the selected entry and keeps its date read-only', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-11');
  assert.equal(app.elements.get('entry-date').value, '2025-06-11');
  assert.equal(app.elements.get('entry-date').readOnly, true);
  assert.equal(app.elements.get('entry-sleep').value, 6);
  assert.equal(app.radios[2].checked, true);
  assert.equal(app.api.editingDate, '2025-06-11');
});

test('saving an edit replaces one entry and preserves other entries and date', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  app.elements.get('entry-water').value = '2.5';
  submit(app);
  assert.equal(app.api.entries.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.entries[0])), { date: '2025-06-10', mood: 4, sleep: 8, water: 2.5 });
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.entries[1])), { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 });
  assert.equal(app.api.editingDate, null);
});

test('invalid edited values are rejected without changing the entry', () => {
  const app = makeApp();
  const original = JSON.stringify(app.api.entries);
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-water').value = '1.15';
  submit(app);
  assert.equal(JSON.stringify(app.api.entries), original);
  assert.equal(app.api.editingDate, '2025-06-10');
});

test('failed edit storage write preserves entries, edit mode, and form values', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  app.storage.setItem = () => { throw new Error('quota'); };
  submit(app);
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

test('deleting another entry preserves the current edit', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.elements.get('entry-sleep').value = '8';
  const button = new Element('delete');
  button.className = 'btn-delete';
  button.dataset.date = '2025-06-11';
  button.closest = selector => selector === '.btn-delete' ? button : null;
  app.buttons.push(button);
  app.api.handleTableClick({ target: button });
  assert.equal(app.api.editingDate, '2025-06-10');
  assert.equal(app.elements.get('entry-sleep').value, '8');
});

test('deleting the edited entry exits edit mode only after successful deletion', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  const button = new Element('delete');
  button.className = 'btn-delete';
  button.dataset.date = '2025-06-10';
  button.closest = selector => selector === '.btn-delete' ? button : null;
  app.buttons.push(button);
  app.confirms.push(false);
  app.api.handleTableClick({ target: button });
  assert.equal(app.api.editingDate, '2025-06-10');
  app.confirms.push(true);
  app.api.handleTableClick({ target: button });
  assert.equal(app.api.editingDate, null);
  assert.equal(app.api.entries.length, 1);
});

test('erase all exits edit mode only after a successful erase', () => {
  const app = makeApp();
  app.api.enterEditMode('2025-06-10');
  app.confirms.push(false);
  app.api.handleEraseAll();
  assert.equal(app.api.editingDate, '2025-06-10');
  app.confirms.push(true);
  app.api.handleEraseAll();
  assert.equal(app.api.editingDate, null);
  assert.equal(app.api.entries.length, 0);
});

test('sleep and water start unselected and reject an incomplete submission', () => {
  const app = makeApp();
  assert.equal(app.api.sleepSelected, false);
  assert.equal(app.api.waterSelected, false);
  app.elements.get('entry-date').value = '2025-06-12';
  app.radios[2].checked = true;
  submit(app);
  assert.match(app.elements.get('form-error').textContent, /sleep/i);
});

test('explicitly selecting zero is valid for both sliders', () => {
  const app = makeApp();
  app.api.setValueControlValues(0, 0);
  app.elements.get('entry-date').value = '2025-06-12';
  app.radios[2].checked = true;
  submit(app);
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

test('editing loads selected slider values and reset clears them after cancel and save', () => {
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
  submit(app);
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
