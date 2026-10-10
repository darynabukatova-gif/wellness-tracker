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
   'entries-container', 'entries-heading', 'entry-form'].forEach(id => {
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
  const source = scripts[1] + '\nthis.__api = { enterEditMode, exitEditMode, handleFormSubmit, handleTableClick, handleEraseAll, get entries() { return entries; }, get editingDate() { return editingDate; }, set entries(value) { entries = value; }, set editingDate(value) { editingDate = value; } };';
  new vm.Script(scripts[0] + '\n' + source).runInContext(sandbox);
  sandbox.render = () => {};
  sandbox.__api.entries = [
    { date: '2025-06-10', mood: 4, sleep: 7.5, water: 2.1 },
    { date: '2025-06-11', mood: 3, sleep: 6, water: 1.8 },
  ];
  return { api: sandbox.__api, elements, radios, buttons, storage, confirms };
}

function submit(app) { app.api.handleFormSubmit({ preventDefault() {} }); }

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
