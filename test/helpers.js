/**
 * test/helpers.js
 *
 * Reads js/core.js and evaluates it in an isolated vm context so the test
 * files can call the application functions directly without duplicating code.
 *
 * NODE VERSION COMPATIBILITY
 *   This file uses bare require() names ('fs', 'path', 'vm') which work on
 *   all Node.js versions.  The 'node:' prefix requires Node 14.18+.
 *   The built-in node:test runner requires Node 18+.  On older versions,
 *   test files should use a simple hand-rolled assertion harness.
 *
 * WHY vm AND NOT eval()?
 *   eval() runs in the current module's scope and can accidentally read or
 *   write variables in this file.  vm.Script with runInNewContext() runs in
 *   a completely separate object (the "sandbox"), so nothing leaks in either
 *   direction.  The code being evaluated is trusted local project code; vm is
 *   used here for scope isolation, not security.
 *
 * WHY NOT COPY THE FUNCTIONS?
 *   Copying would create two sources of truth.  If a function in js/core.js
 *   is changed, the tests would still use the old copy and might pass even
 *   though the real application behaviour broke.  Extracting from the file
 *   means the tests always exercise the code that actually runs in the browser.
 *
 * CROSS-REALM NOTE FOR TEST AUTHORS
 *   Objects and arrays created inside the vm context belong to the vm's
 *   JavaScript realm, not Node's outer realm.  This matters for a few checks:
 *
 *     × instanceof Array  ← FALSE for vm arrays (different Array constructor)
 *     ✓ Array.isArray()   ← TRUE  (works across realms)
 *     ✓ typeof value      ← works normally
 *     ✓ deepStrictEqual   ← works normally (compares structure, not identity)
 *
 *   Always use Array.isArray() rather than instanceof Array in test files.
 *
 * EXPORTED API
 *   loadContext(localStorageStub?)
 *     Returns an object containing:
 *       { localDateString, addCalendarDays, countCalendarDaysInclusive,
 *         validateCalendarDateRange, filterEntriesByDateRange,
 *         buildTrendSeries, buildTrendSeriesForRange,
 *         buildCalendarMonth, isValidStep, isValidEntryShape,
 *         validateStoredEntries, validateEntry, sortByDateDesc,
 *         calcSummary, createBackupDocument, parseBackupDocument,
 *         loadEntries, saveEntries, storage }
 *
 *     localStorageStub (optional)
 *       An object with getItem(key) and setItem(key, value) methods.
 *       If omitted, a fresh in-memory stub is created automatically.
 *       The same stub is returned as `storage` so tests can inspect it.
 */

'use strict';

// Use bare module names (without the 'node:' prefix) for compatibility with
// Node.js versions older than 14.18.  The 'node:' prefix is supported from
// Node 14.18 / 16+ onwards.  Bare names work on all Node versions.
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── Locate js/core.js relative to the project root ──────────────────────────
//
// __dirname is the test/ directory; the project root is one level up.
// Using path.resolve keeps this correct regardless of the working directory
// from which `node --test` is invoked.
const CORE_JS = path.resolve(__dirname, '..', 'js', 'core.js');

// ── Names of all functions that must be present after evaluation ─────────────
const REQUIRED_FUNCTIONS = [
  'localDateString',
  'addCalendarDays',
  'countCalendarDaysInclusive',
  'validateCalendarDateRange',
  'filterEntriesByDateRange',
  'buildTrendSeries',
  'buildTrendSeriesForRange',
  'buildCalendarMonth',
  'isValidStep',
  'isValidEntryShape',
  'validateStoredEntries',
  'validateEntry',
  'sortByDateDesc',
  'calcSummary',
  'createBackupDocument',
  'parseBackupDocument',
  'loadEntries',
  'saveEntries',
];

function readCoreSource() {
  const source = fs.readFileSync(CORE_JS, 'utf8');

  // Verify the sentinel: STORAGE_KEY must appear in the core source.
  if (!source.includes("const STORAGE_KEY = 'wellness-tracker-demo-v1'")) {
    throw new Error(
      'helpers.js: js/core.js does not contain\n' +
      "STORAGE_KEY = 'wellness-tracker-demo-v1'.\n" +
      'The core file may have been renamed or its structure changed. Update\n' +
      'test/helpers.js to match the new structure.'
    );
  }

  return source;
}

// ── Build a minimal in-memory localStorage stub ─────────────────────────────
//
// The real browser localStorage stores strings only and returns null for
// absent keys.  This stub replicates those semantics using a Map.
//
// Tests that exercise loadEntries / saveEntries populate this stub directly
// before calling the function under test.

/**
 * makeLocalStorageStub()
 *
 * Returns a minimal localStorage-compatible object backed by a Map.
 * Includes a `_data` property so tests can inspect or preset stored values
 * without going through the public API.
 *
 * @returns {{ getItem, setItem, removeItem, _data: Map }}
 */
function makeLocalStorageStub() {
  const _data = new Map();

  return {
    _data,

    getItem(key) {
      // Return null (not undefined) for absent keys — matches browser behaviour.
      return _data.has(key) ? _data.get(key) : null;
    },

    setItem(key, value) {
      // localStorage only stores strings; coerce, as the browser does.
      _data.set(key, String(value));
    },

    removeItem(key) {
      _data.delete(key);
    },
  };
}

// ── Cached script source (read once, reused across loadContext calls) ────────
let _cachedSource = null;

function getScriptSource() {
  if (_cachedSource === null) {
    _cachedSource = readCoreSource();
  }
  return _cachedSource;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * loadContext(localStorageStub?)
 *
 * Evaluates js/core.js in a fresh vm context
 * and returns the selected application functions plus the storage stub.
 *
 * A fresh context is created on every call, so each test (or describe block)
 * gets its own isolated scope with no shared state between tests.
 *
 * @param  {object} [localStorageStub]
 *         Optional localStorage-compatible object.  If omitted, a fresh
 *         in-memory stub is created and returned as `storage`.
 *
 * @returns {{
 *   localDateString:      function,
 *   addCalendarDays:      function,
 *   countCalendarDaysInclusive: function,
 *   validateCalendarDateRange: function,
 *   filterEntriesByDateRange: function,
 *   buildTrendSeries:     function,
 *   buildTrendSeriesForRange: function,
 *   buildCalendarMonth:   function,
 *   isValidStep:          function,
 *   isValidEntryShape:    function,
 *   validateStoredEntries:function,
 *   validateEntry:        function,
 *   sortByDateDesc:       function,
 *   calcSummary:          function,
 *   createBackupDocument: function,
 *   parseBackupDocument:  function,
 *   loadEntries:          function,
 *   saveEntries:          function,
 *   storage:              object,   ← the localStorage stub in use
 * }}
 */
function loadContext(localStorageStub) {
  const storage = localStorageStub || makeLocalStorageStub();

  // The sandbox is the global object seen by the evaluated script.
  // Only what is explicitly listed here is available inside the vm context;
  // Node.js built-ins such as require() are intentionally absent.
  const sandbox = {
    localStorage: storage,
    console:      console,  // pass through so existing console.error calls work
  };

  // vm.createContext() seals the sandbox object and makes it the global scope
  // for any scripts run in this context.
  vm.createContext(sandbox);

  // vm.Script compiles once; runInContext() executes in the given sandbox.
  // Using a filename in the options makes stack traces point at js/core.js
  // rather than showing "[vm]", which is helpful when a test fails.
  const script = new vm.Script(getScriptSource(), { filename: 'js/core.js' });
  script.runInContext(sandbox);

  // Verify that every expected function was actually defined by the script.
  // This catches renames or deletions in js/core.js before they produce
  // confusing "not a function" errors deep inside a test.
  const missing = REQUIRED_FUNCTIONS.filter(
    name => typeof sandbox[name] !== 'function'
  );
  if (missing.length > 0) {
    throw new Error(
      'helpers.js: the following functions were not found after evaluating\n' +
      'js/core.js:\n' +
      '  ' + missing.join(', ') + '\n' +
      'They may have been renamed or removed.  Update REQUIRED_FUNCTIONS in\n' +
      'test/helpers.js if this was intentional.'
    );
  }

  // Return only the named functions plus the storage reference.
  // Callers receive a plain object; the full sandbox is not exposed.
  return {
    localDateString:       sandbox.localDateString,
    addCalendarDays:       sandbox.addCalendarDays,
    countCalendarDaysInclusive: sandbox.countCalendarDaysInclusive,
    validateCalendarDateRange: sandbox.validateCalendarDateRange,
    filterEntriesByDateRange: sandbox.filterEntriesByDateRange,
    buildTrendSeries:      sandbox.buildTrendSeries,
    buildTrendSeriesForRange: sandbox.buildTrendSeriesForRange,
    buildCalendarMonth:    sandbox.buildCalendarMonth,
    isValidStep:           sandbox.isValidStep,
    isValidEntryShape:     sandbox.isValidEntryShape,
    validateStoredEntries: sandbox.validateStoredEntries,
    validateEntry:         sandbox.validateEntry,
    sortByDateDesc:        sandbox.sortByDateDesc,
    calcSummary:           sandbox.calcSummary,
    createBackupDocument:  sandbox.createBackupDocument,
    parseBackupDocument:   sandbox.parseBackupDocument,
    loadEntries:           sandbox.loadEntries,
    saveEntries:           sandbox.saveEntries,
    storage,
  };
}

module.exports = { loadContext, makeLocalStorageStub };
