    /* ═══════════════════════════════════════════════════════════════
       EVENT HANDLERS AND INITIALISATION

       Module-level state
       ──────────────────
       entries  The single source of truth for the current entry list.
                Always a plain Array.  Mutated only on successful save
                or delete — never on a failed storage operation.

       locked   Set to true when the active storage backend cannot be read or its
                content is corrupted.  Prevents any write to storage
                so the original data is preserved for manual recovery.
       ═══════════════════════════════════════════════════════════════ */

    let entries = [];
    let locked  = false;
    let editingDate = null;
    let sleepSelected = false;
    let waterSelected = false;
    let storageAdapter = null;
    let busy = false;
    let listenersAttached = false;
    let historyView = 'calendar';
    let calendarYear = null;
    let calendarMonthIndex = null;
    let selectedCalendarDate = null;
    let trendDayCount = 30;
    let pendingImport = null;
    let importReading = false;
    const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024;

    function getStorageAdapter() {
      if (window.wellnessStorage &&
          typeof window.wellnessStorage.loadEntries === 'function' &&
          typeof window.wellnessStorage.saveEntries === 'function') {
        return window.wellnessStorage;
      }

      return {
        async loadEntries() {
          const loaded = loadEntries();
          return loaded === null
            ? { ok: false, code: 'READ_FAILED', error: 'Could not read localStorage.' }
            : { ok: true, state: 'present', entries: loaded };
        },
        async saveEntries(nextEntries) {
          return saveEntries(nextEntries)
            ? { ok: true }
            : { ok: false, code: 'WRITE_FAILED', error: 'Could not save localStorage.' };
        },
      };
    }

    function setBusyState(value) {
      busy = value;
      updateMutatingControls();
    }

    function isMutationBlocked() {
      return busy || locked || importReading || pendingImport !== null;
    }

    function updateMutatingControls() {
      const disabled = isMutationBlocked();
      [
        '#entry-date', '#save-btn', '#cancel-edit-btn', '#erase-all-btn',
        '#export-backup-btn', '#import-backup-btn', '#import-backup-input',
        '#entry-sleep', '#entry-water', '#sleep-minus', '#sleep-plus',
        '#water-minus', '#water-plus'
      ].forEach(function (selector) {
        const control = document.querySelector(selector);
        if (control) control.disabled = disabled;
      });
      document.querySelectorAll('input[name="mood"]').forEach(function (radio) {
        radio.disabled = disabled;
      });
      document.querySelectorAll('#entries-container .btn-edit, #entries-container .btn-delete')
        .forEach(function (button) { button.disabled = disabled; });
      document.querySelectorAll('#calendar-details .calendar-detail-action')
        .forEach(function (button) { button.disabled = disabled; });
      const cancelImportButton = document.getElementById('cancel-import-btn');
      if (cancelImportButton) cancelImportButton.disabled = !pendingImport || busy || locked;
      const replaceImportButton = document.getElementById('replace-import-btn');
      if (replaceImportButton) {
        replaceImportButton.disabled = !pendingImport || busy || locked || importReading;
      }
      if (!disabled) {
        updateSleepControl();
        updateWaterControl();
      }
      updateEraseAllBtn();
    }

    function roundWater(value) {
      return Math.round(Number(value) * 10) / 10;
    }

    function updateSleepControl() {
      const slider = document.getElementById('entry-sleep');
      const display = document.getElementById('sleep-value');
      const minus = document.getElementById('sleep-minus');
      const plus = document.getElementById('sleep-plus');
      const value = Number(slider.value);
      if (display) display.textContent = sleepSelected ? value.toFixed(1).replace(/\.0$/, '') + ' h' : 'Choose a value';
      if (minus) minus.disabled = isMutationBlocked() || (sleepSelected && value <= 0);
      if (plus) plus.disabled = isMutationBlocked() || (sleepSelected && value >= 24);
    }

    function updateWaterControl() {
      const slider = document.getElementById('entry-water');
      const display = document.getElementById('water-value');
      const minus = document.getElementById('water-minus');
      const plus = document.getElementById('water-plus');
      const value = roundWater(slider.value);
      if (display) display.textContent = waterSelected ? value.toFixed(1) + ' L' : 'Choose a value';
      if (minus) minus.disabled = isMutationBlocked() || (waterSelected && value <= 0);
      if (plus) plus.disabled = isMutationBlocked() || (waterSelected && value >= 3);
    }

    function resetValueControls() {
      const sleep = document.getElementById('entry-sleep');
      const water = document.getElementById('entry-water');
      sleep.value = '0';
      water.value = '0';
      sleepSelected = false;
      waterSelected = false;
      updateSleepControl();
      updateWaterControl();
    }

    function setValueControlValues(sleepValue, waterValue) {
      document.getElementById('entry-sleep').value = sleepValue;
      document.getElementById('entry-water').value = waterValue;
      sleepSelected = true;
      waterSelected = true;
      updateSleepControl();
      updateWaterControl();
    }

    function adjustValueControl(kind, direction) {
      if (isMutationBlocked()) return;
      const isSleep = kind === 'sleep';
      const slider = document.getElementById(isSleep ? 'entry-sleep' : 'entry-water');
      const selected = isSleep ? sleepSelected : waterSelected;
      const step = isSleep ? 0.5 : 0.1;
      const min = 0;
      const max = isSleep ? 24 : 3;
      let value = selected ? Number(slider.value) + direction * step : (direction > 0 ? step : min);
      value = isSleep ? Math.round(value * 2) / 2 : roundWater(value);
      slider.value = String(Math.max(min, Math.min(max, value)));
      if (isSleep) {
        sleepSelected = true;
        updateSleepControl();
      } else {
        waterSelected = true;
        updateWaterControl();
      }
    }

    /* ── App-level error helpers ──────────────────────────────────── */

    /**
     * showAppError(message)
     *
     * Injects a persistent error banner above <main> and disables all
     * destructive controls (Save, Delete buttons, Erase all).
     *
     * Used only for unrecoverable startup errors (localStorage unreadable
     * or corrupt).  Form validation errors use #form-error instead.
     *
     * @param {string} message  Human-readable description of the problem.
     */
    function showAppError(message) {
      const container = document.getElementById('app-error');
      const banner = document.createElement('div');
      banner.className = 'app-error-banner';
      banner.setAttribute('role', 'alert');

      const heading = document.createElement('strong');
      heading.textContent = 'Storage error — entries cannot be modified';
      banner.appendChild(heading);

      const body = document.createElement('p');
      body.textContent = message;
      banner.appendChild(body);

      container.replaceChildren(banner);
    }


    /**
     * lockApp()
     *
     * Sets the locked flag and disables Save, Erase-all, and any existing
     * Delete buttons so no writes can reach localStorage.
     */
    function lockApp() {
      locked = true;
      document.getElementById('save-btn').disabled      = true;
      document.getElementById('erase-all-btn').disabled = true;
      // Delete buttons inside the table (if any were rendered) are also
      // disabled.  Future renders via renderTable will call lockDeleteBtns().
      lockDeleteBtns();
      lockEditBtns();
      lockValueControls();
      updateMutatingControls();
    }

    /**
     * lockDeleteBtns()
     *
     * Disables every Delete button currently in #entries-container.
     * Called after renderTable() when the app is in the locked state.
     */
    function lockDeleteBtns() {
      document
        .querySelectorAll('#entries-container .btn-delete')
        .forEach(function (btn) { btn.disabled = true; });
    }

    function lockEditBtns() {
      document
        .querySelectorAll('#entries-container .btn-edit')
        .forEach(function (btn) { btn.disabled = true; });
    }

    function lockValueControls() {
      [
        '#entry-sleep', '#entry-water', '#sleep-minus', '#sleep-plus',
        '#water-minus', '#water-plus'
      ].forEach(function (selector) {
        const control = document.querySelector(selector);
        if (control) control.disabled = true;
      });
    }

    /* ── Form error helpers ───────────────────────────────────────── */

    /**
     * showFormError(message)
     *
     * Makes #form-error visible before setting its text so that the
     * role="alert" fires for a rendered (non-display:none) element.
     * Screen readers monitor live regions only when they are in the
     * render tree; making the element visible first ensures the content
     * change is announced reliably.
     */
    function showFormError(message) {
      const el = document.getElementById('form-error');
      el.classList.add('is-visible'); // visible first
      el.textContent = message;       // then set text
    }

    /**
     * clearFormError()
     *
     * Hides #form-error and empties its text.
     */
    function clearFormError() {
      const el = document.getElementById('form-error');
      el.textContent = '';
      el.classList.remove('is-visible');
    }

    /* ── Table-error helpers (Delete / Erase all storage failures) ── */

    /**
     * showTableError(message)
     *
     * Displays a storage-failure message in #table-error, which lives
     * near the Entry History controls rather than in the form section.
     * role="alert" on the element triggers screen reader announcement.
     */
    function showTableError(message) {
      const el = document.getElementById('table-error');
      el.classList.add('is-visible'); // visible first (same pattern as showFormError)
      el.textContent = message;
    }

    /**
     * clearTableError()
     *
     * Hides #table-error and empties its text.
     */
    function clearTableError() {
      const el = document.getElementById('table-error');
      el.textContent = '';
      el.classList.remove('is-visible');
    }

    function showBackupError(message) {
      const el = document.getElementById('backup-error');
      el.classList.add('is-visible');
      el.textContent = message;
    }

    function clearBackupError() {
      const el = document.getElementById('backup-error');
      el.textContent = '';
      el.classList.remove('is-visible');
    }

    function showBackupStatus(message) {
      document.getElementById('backup-status').textContent = message;
    }

    function clearBackupStatus() {
      document.getElementById('backup-status').textContent = '';
    }

    function handleExportBackup() {
      if (isMutationBlocked()) return;

      let objectUrl = null;
      let downloadLink = null;
      try {
        const exportedAt = new Date().toISOString();
        const backup = createBackupDocument(entries, exportedAt);
        const content = JSON.stringify(backup, null, 2) + '\n';
        const fileName = 'wellness-tracker-backup-' + exportedAt.slice(0, 10) + '.json';
        const blob = new Blob([content], { type: 'application/json' });
        objectUrl = URL.createObjectURL(blob);
        downloadLink = document.createElement('a');
        downloadLink.href = objectUrl;
        downloadLink.download = fileName;
        downloadLink.hidden = true;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        clearBackupError();
      } catch (error) {
        showBackupError('Could not prepare the backup download. Your saved entries have not changed.');
      } finally {
        if (downloadLink && downloadLink.parentNode) {
          downloadLink.parentNode.removeChild(downloadLink);
        }
        if (objectUrl) {
          const revokeObjectUrl = function () { URL.revokeObjectURL(objectUrl); };
          if (typeof window.setTimeout === 'function') {
            window.setTimeout(revokeObjectUrl, 0);
          } else {
            revokeObjectUrl();
          }
        }
      }
    }

    function resetImportFileInput() {
      const input = document.getElementById('import-backup-input');
      if (input) input.value = '';
    }

    function renderImportPreview() {
      const preview = document.getElementById('import-preview');
      const summary = document.getElementById('import-preview-summary');
      const warning = document.getElementById('import-preview-warning');
      const exportedAt = document.getElementById('import-preview-exported-at');
      if (!pendingImport) {
        preview.hidden = true;
        summary.textContent = '';
        warning.textContent = '';
        exportedAt.textContent = '';
        return;
      }

      const importedEntries = pendingImport.entries;
      if (importedEntries.length === 0) {
        summary.textContent = 'Backup contains 0 entries. No entries in backup. You currently have ' +
          entries.length + ' saved entries. No data has been changed.';
        warning.textContent = 'Replacing entries with this empty backup would remove all existing entries.';
      } else {
        const dates = importedEntries.map(function (entry) { return entry.date; }).sort();
        summary.textContent = 'Backup contains ' + importedEntries.length + ' entries, from ' +
          dates[0] + ' to ' + dates[dates.length - 1] + '. You currently have ' +
          entries.length + ' saved entries. No data has been changed.';
        warning.textContent = 'Replacing entries would REPLACE ALL existing entries.';
      }
      exportedAt.textContent = 'Backup exported at ' + pendingImport.exportedAt + '.';
      preview.hidden = false;
    }

    function handleImportBackup() {
      if (isMutationBlocked()) return;
      clearBackupError();
      clearBackupStatus();
      const input = document.getElementById('import-backup-input');
      resetImportFileInput();
      input.click();
    }

    async function handleImportFileChange(event) {
      const input = event.target;
      const file = input && input.files ? input.files[0] : null;
      if (!file) {
        resetImportFileInput();
        return;
      }
      if (isMutationBlocked()) {
        resetImportFileInput();
        return;
      }
      if (typeof file.size === 'number' && file.size > MAX_BACKUP_FILE_BYTES) {
        showBackupError('Backup file is too large. Choose a JSON backup smaller than 5 MiB.');
        resetImportFileInput();
        return;
      }
      if (typeof file.text !== 'function') {
        showBackupError('This browser cannot read the selected backup file.');
        resetImportFileInput();
        return;
      }

      importReading = true;
      clearBackupError();
      clearBackupStatus();
      updateMutatingControls();
      try {
        const text = await file.text();
        const result = parseBackupDocument(text);
        if (!result.ok) {
          showBackupError('Could not validate the backup file: ' + result.error);
          return;
        }
        if (locked || busy || pendingImport !== null) return;
        pendingImport = result.backup;
        renderImportPreview();
      } catch (error) {
        showBackupError('Could not read the selected backup file. Your saved entries have not changed.');
      } finally {
        importReading = false;
        resetImportFileInput();
        updateMutatingControls();
      }
    }

    function handleCancelImport() {
      if (!pendingImport || busy || locked) return;
      pendingImport = null;
      renderImportPreview();
      clearBackupError();
      clearBackupStatus();
      resetImportFileInput();
      updateMutatingControls();
      document.getElementById('import-backup-btn').focus();
    }

    function copyImportedEntries(importedEntries) {
      return importedEntries.map(function (entry) {
        return {
          date: entry.date,
          mood: entry.mood,
          sleep: entry.sleep,
          water: entry.water,
        };
      });
    }

    async function handleReplaceImport() {
      if (busy || locked || importReading || !pendingImport || !storageAdapter) return;

      const importToReplace = pendingImport;
      const candidate = copyImportedEntries(importToReplace.entries);
      const validationError = validateStoredEntries(candidate);
      if (validationError) {
        showBackupError('The selected backup is no longer valid. Cancel the import and select it again.');
        return;
      }

      const currentCount = entries.length;
      const importedCount = candidate.length;
      let confirmation = 'Replace all ' + currentCount + ' currently saved ' +
        (currentCount === 1 ? 'entry' : 'entries') + ' with ' + importedCount + ' backup ' +
        (importedCount === 1 ? 'entry' : 'entries') + '?\n\n' +
        'All currently saved entries will be replaced, not merged. Export a backup of your current entries first if you want to preserve them.';
      if (importedCount === 0) {
        confirmation += '\n\nThis backup is empty, so replacing entries will delete all currently saved entries.';
      }
      if (hasUnsavedFormChanges()) {
        confirmation += '\n\nYou also have unsaved form changes. They will be discarded only after a successful replacement.';
      }
      if (!window.confirm(confirmation)) return;

      if (busy || locked || importReading || pendingImport !== importToReplace || !storageAdapter) return;

      let restored = false;
      setBusyState(true);
      try {
        const result = await storageAdapter.saveEntries(candidate);
        if (!result || !result.ok) {
          showBackupError('Could not replace saved entries. Your current entries have not changed.');
          return;
        }

        entries = candidate;
        pendingImport = null;
        resetImportFileInput();
        exitEditMode();
        renderImportPreview();
        clearBackupError();
        showBackupStatus('Backup restored. ' + candidate.length + ' ' +
          (candidate.length === 1 ? 'entry is' : 'entries are') + ' now saved.');
        render();
        restored = true;
      } catch (error) {
        showBackupError('Could not replace saved entries. Your current entries have not changed.');
      } finally {
        setBusyState(false);
        if (restored) document.getElementById('import-backup-btn').focus();
      }
    }

    /* ── Erase-all button state helper ───────────────────────────── */

    /**
     * updateEraseAllBtn()
     *
     * Disables "Erase all demo entries" when there are no entries and the
     * app is not locked.  Prevents a redundant confirm dialog on an empty
     * list.
     */
    function updateEraseAllBtn() {
      const btn = document.getElementById('erase-all-btn');
      btn.disabled = isMutationBlocked() || entries.length === 0;
    }

    function setHistoryView(view) {
      if (view !== 'charts' && view !== 'calendar') return;
      historyView = view;
      renderHistoryTrends();
    }

    function changeCalendarMonth(offset) {
      if (!Number.isInteger(offset) || offset === 0) return;
      ensureCalendarMonth();
      calendarMonthIndex += offset;
      while (calendarMonthIndex < 0) {
        calendarMonthIndex += 12;
        calendarYear -= 1;
      }
      while (calendarMonthIndex > 11) {
        calendarMonthIndex -= 12;
        calendarYear += 1;
      }
      selectedCalendarDate = null;
      renderCalendar(true);
    }

    function handleHistoryTrendsClick(event) {
      const viewButton = event.target.closest('.history-view-btn');
      if (viewButton) {
        setHistoryView(viewButton.dataset.historyView);
        return;
      }

      const periodButton = event.target.closest('.trend-period-btn');
      if (periodButton) {
        setTrendDayCount(Number(periodButton.dataset.trendDays));
        return;
      }

      const previousButton = event.target.closest('#calendar-prev-btn');
      if (previousButton) {
        changeCalendarMonth(-1);
        return;
      }

      const nextButton = event.target.closest('#calendar-next-btn');
      if (nextButton) {
        changeCalendarMonth(1);
        return;
      }

      const actionButton = event.target.closest('.calendar-detail-action');
      if (actionButton) {
        if (isMutationBlocked()) return;
        const date = actionButton.dataset.calendarDate;
        if (!date) return;
        const changed = actionButton.dataset.calendarAction === 'edit'
          ? enterEditMode(date)
          : enterNewEntryModeForDate(date);
        if (changed) focusEntryFormAfterCalendarAction();
        return;
      }

      const dateButton = event.target.closest('.calendar-day');
      if (!dateButton || !dateButton.dataset.calendarDate) return;
      selectedCalendarDate = dateButton.dataset.calendarDate;
      renderCalendar(false);
    }

    /* ── Render helpers (thin wrappers that also update the views) ── */

    /**
     * render()
     *
     * Re-renders the summary, History & Trends views, and entry table, then
     * updates the Erase-all button state. Calling a single function keeps all
     * derived views synchronised after successful storage writes.
     */
    function render() {
      renderSummary(entries);
      renderHistoryTrends();
      renderTable(entries);
      updateEraseAllBtn();
      if (locked) {
        lockDeleteBtns();
        lockEditBtns();
        lockValueControls();
      }
      updateMutatingControls();
    }

    function hasUnsavedFormChanges() {
      const date = document.getElementById('entry-date').value;
      const mood = document.querySelector('input[name="mood"]:checked');
      const sleep = document.getElementById('entry-sleep').value;
      const water = document.getElementById('entry-water').value;

      if (editingDate === null) {
        return date !== localDateString(new Date()) || Boolean(mood) ||
          sleepSelected || waterSelected;
      }

      const original = entries.find(function (entry) {
        return entry.date === editingDate;
      });
      if (!original) return true;
      return date !== original.date || !mood || Number(mood.value) !== original.mood ||
        !sleepSelected || !waterSelected || Number(sleep) !== original.sleep ||
        Number(water) !== original.water;
    }

    function confirmDiscardUnsavedFormChanges() {
      return !hasUnsavedFormChanges() || window.confirm(
        'Discard unsaved form changes and continue?'
      );
    }

    function focusEntryFormAfterCalendarAction() {
      const formSection = document.getElementById('entry-form-section');
      if (formSection && typeof formSection.scrollIntoView === 'function') {
        formSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      const mood = document.querySelector('input[name="mood"]');
      if (mood && !mood.disabled) mood.focus();
    }

    function enterNewEntryModeForDate(date) {
      if (isMutationBlocked()) return false;
      if (!confirmDiscardUnsavedFormChanges()) return false;
      exitEditMode();
      document.getElementById('entry-date').value = date;
      return true;
    }

    function enterEditMode(date) {
      if (isMutationBlocked()) return false;
      const entry = entries.find(function (candidate) {
        return candidate.date === date;
      });
      if (!entry) return false;

      if (editingDate === date) return true;
      if (!confirmDiscardUnsavedFormChanges()) {
        return false;
      }

      editingDate = date;
      document.getElementById('entry-date').value = entry.date;
      document.getElementById('entry-date').readOnly = true;
      document.querySelectorAll('input[name="mood"]').forEach(function (radio) {
        radio.checked = Number(radio.value) === entry.mood;
      });
      setValueControlValues(entry.sleep, entry.water);
      document.getElementById('form-heading').textContent = 'Edit Wellness Entry';
      document.getElementById('save-btn').textContent = 'Save changes';
      document.getElementById('cancel-edit-btn').hidden = false;
      clearFormError();
      document.querySelector('input[name="mood"]').focus();
      return true;
    }

    function exitEditMode() {
      editingDate = null;
      document.getElementById('entry-form').reset();
      document.getElementById('entry-date').readOnly = false;
      document.getElementById('entry-date').value = localDateString(new Date());
      resetValueControls();
      document.getElementById('form-heading').textContent = 'Log a Wellness Entry';
      document.getElementById('save-btn').textContent = 'Save entry';
      document.getElementById('cancel-edit-btn').hidden = true;
      clearFormError();
    }

    /* ── Initialisation ──────────────────────────────────────────── */

    /**
     * init()
     *
     * Called once on DOMContentLoaded.
     *
     * Steps:
     *   1. Set the date input to today using localDateString(new Date()).
     *      This uses the local date helpers already defined, keeping the
     *      timezone handling consistent across the whole app.
     *   2. Await the selected storage adapter.
     *      • failed result → lock the app, show an error, and render an empty table.
     *      • successful result → validate shape and duplicate dates with
     *                validateStoredEntries().  If validation fails, lock
     *                the app and show the integrity error.
     *   3. On success, assign to entries and call render().
     *   4. Attach all event listeners.
     */
    async function init() {
      if (listenersAttached) return;
      attachEventListeners();
      document.getElementById('entry-date').value = localDateString(new Date());
      resetValueControls();
      setBusyState(true);

      try {
        storageAdapter = getStorageAdapter();
        const result = await storageAdapter.loadEntries();

        if (!result || !result.ok) {
          showAppError(
            'The stored data could not be read. Existing data has been preserved. ' +
            'Please check the storage and try again.'
          );
          lockApp();
          render();
          return;
        }

        const integrityError = validateStoredEntries(result.entries);
        if (integrityError) {
          showAppError(
            'The stored entries failed an integrity check: ' + integrityError +
            ' Your data has been preserved. Please open the browser console for details.'
          );
          lockApp();
          render();
          return;
        }

        entries = result.entries;
        render();
      } catch (error) {
        showAppError('The stored data could not be read. Existing data has been preserved.');
        lockApp();
        render();
      } finally {
        setBusyState(false);
        if (locked) updateMutatingControls();
      }
    }

    /* ── Event listeners ─────────────────────────────────────────── */

    /**
     * attachEventListeners()
     *
     * Attaches all three listeners exactly once, after the DOM is ready
     * and the initial state is known.  Kept separate from init() so the
     * locked path can still attach listeners (the handlers check `locked`
     * themselves before doing anything destructive).
     */
    function attachEventListeners() {
      if (listenersAttached) return;
      listenersAttached = true;
      document.getElementById('entry-form')
        .addEventListener('submit', handleFormSubmit);

      document.getElementById('entries-container')
        .addEventListener('click', handleTableClick);

      document.getElementById('history-trends-section')
        .addEventListener('click', handleHistoryTrendsClick);

      document.getElementById('erase-all-btn')
        .addEventListener('click', handleEraseAll);

      document.getElementById('export-backup-btn')
        .addEventListener('click', handleExportBackup);

      document.getElementById('import-backup-btn')
        .addEventListener('click', handleImportBackup);

      document.getElementById('import-backup-input')
        .addEventListener('change', handleImportFileChange);

      document.getElementById('cancel-import-btn')
        .addEventListener('click', handleCancelImport);

      document.getElementById('replace-import-btn')
        .addEventListener('click', handleReplaceImport);

      document.getElementById('entry-sleep').addEventListener('input', function () {
        if (isMutationBlocked()) return;
        sleepSelected = true;
        updateSleepControl();
      });
      document.getElementById('entry-water').addEventListener('input', function () {
        if (isMutationBlocked()) return;
        waterSelected = true;
        updateWaterControl();
      });
      document.getElementById('sleep-minus').addEventListener('click', function () {
        adjustValueControl('sleep', -1);
      });
      document.getElementById('sleep-plus').addEventListener('click', function () {
        adjustValueControl('sleep', 1);
      });
      document.getElementById('water-minus').addEventListener('click', function () {
        adjustValueControl('water', -1);
      });
      document.getElementById('water-plus').addEventListener('click', function () {
        adjustValueControl('water', 1);
      });

      document.getElementById('cancel-edit-btn')
        .addEventListener('click', function () {
          if (isMutationBlocked()) return;
          exitEditMode();
          document.getElementById('entry-date').focus();
        });
    }

    /**
     * handleFormSubmit(event)
     *
     * Handles the form's submit event.
     *
     * Flow:
     *   1. Prevent the browser's default form submission (page reload).
     *   2. Bail out silently if the app is locked (belt-and-braces check;
     *      the Save button is also disabled).
     *   3. Read the four field values from the DOM.
     *   4. Run validateEntry().  If it returns an error string, show it
     *      in #form-error and stop.
     *   5. Build the new entry object, converting sleep and water to
     *      numbers with Number().  Mood is also coerced to a number so
     *      the stored type is always number, not string.
     *   6. Construct the updated array (spread so we never mutate `entries`
     *      before the save succeeds).
     *   7. Await the storage adapter. If saving fails, show
     *      an error and leave `entries` unchanged.
     *   8. On success: update `entries`, reset the form, re-set today's
     *      date (form.reset() clears it), clear the error, re-render.
     */
    async function handleFormSubmit(event) {
      event.preventDefault();

      if (isMutationBlocked() || !storageAdapter) return;

      // Read raw values from the DOM
      const dateVal  = document.getElementById('entry-date').value;
      const moodEl   = document.querySelector('input[name="mood"]:checked');
      const moodVal  = moodEl ? moodEl.value : '';
      const sleepVal = sleepSelected ? document.getElementById('entry-sleep').value : '';
      const waterVal = waterSelected ? document.getElementById('entry-water').value : '';

      if (editingDate !== null) {
        const editedEntry = entries.find(function (entry) {
          return entry.date === editingDate;
        });

        if (!editedEntry) {
          showFormError(
            'The entry being edited no longer exists. Please cancel editing and try again.'
          );
          return;
        }

        const existingEntries = entries.filter(function (entry) {
          return entry.date !== editingDate;
        });
        const error = validateEntry(
          editingDate, moodVal, sleepVal, waterVal, existingEntries
        );
        if (error) {
          showFormError(error);
          if (error.includes('mood') || error.includes('Mood')) {
            document.querySelector('input[name="mood"]').focus();
          } else if (error.includes('sleep') || error.includes('Sleep')) {
            document.getElementById('entry-sleep').focus();
          } else if (error.includes('water') || error.includes('Water')) {
            document.getElementById('entry-water').focus();
          }
          return;
        }

        const updatedEntry = {
          date:  editingDate,
          mood:  Number(moodVal),
          sleep: Number(sleepVal),
          water: Number(waterVal),
        };
        const updated = entries.map(function (entry) {
          return entry.date === editingDate ? updatedEntry : entry;
        });
        let focusEditedEntry = false;
        setBusyState(true);
        try {
          const saved = await storageAdapter.saveEntries(updated);
          if (!saved || !saved.ok) {
            showFormError('Could not save the changes — storage may be unavailable. Please try again.');
            return;
          }

          entries = updated;
          exitEditMode();
          render();
          focusEditedEntry = true;
        } catch (error) {
          showFormError('Could not save the changes — storage may be unavailable. Please try again.');
        } finally {
          setBusyState(false);
          if (focusEditedEntry) {
            const editButtons = Array.from(document.querySelectorAll('#entries-container .btn-edit'));
            const updatedEditButton = editButtons.find(function (button) {
              return button.dataset.date === updatedEntry.date;
            });
            if (updatedEditButton) updatedEditButton.focus();
          }
        }
        return;
      }

      // Validate — show error and move focus to the relevant field
      const error = validateEntry(dateVal, moodVal, sleepVal, waterVal, entries);
      if (error) {
        showFormError(error);
        // Move focus to the first offending field so keyboard users land on it.
        // The error message already announced via role="alert"; we do not need
        // aria-describedby on every input for this to be useful.
        if (error.includes('date') || error.includes('Date')) {
          document.getElementById('entry-date').focus();
        } else if (error.includes('mood') || error.includes('Mood')) {
          // Focus the first radio — arrow keys then navigate within the group.
          document.querySelector('input[name="mood"]').focus();
        } else if (error.includes('sleep') || error.includes('Sleep')) {
          document.getElementById('entry-sleep').focus();
        } else if (error.includes('water') || error.includes('Water')) {
          document.getElementById('entry-water').focus();
        }
        return;
      }

      // Build the new entry — all numeric fields stored as numbers
      const newEntry = {
        date:  dateVal,
        mood:  Number(moodVal),
        sleep: Number(sleepVal),
        water: Number(waterVal),
      };

      // Attempt to save before mutating any state
      const updated = entries.concat([newEntry]);
      setBusyState(true);
      try {
        const saved = await storageAdapter.saveEntries(updated);
        if (!saved || !saved.ok) {
          showFormError('Could not save the entry — storage may be unavailable. Please try again.');
          return;
        }

        entries = updated;
        clearFormError();
        event.target.reset();
        document.getElementById('entry-date').value = localDateString(new Date());
        resetValueControls();
        render();
      } catch (error) {
        showFormError('Could not save the entry — storage may be unavailable. Please try again.');
      } finally {
        setBusyState(false);
      }
    }

    /**
     * handleTableClick(event)
     *
     * Delegated click handler on #entries-container.
     *
     * Why event delegation?
     *   renderTable() re-creates the entire table on every state change.
     *   Attaching individual listeners to each Delete button would require
     *   re-attaching them after every render.  A single listener on the
     *   stable parent container fires for any click inside it, regardless
     *   of re-renders.
     *
     * closest('.btn-delete') walks up the DOM from the actual click target
     * to find the nearest ancestor (or the element itself) matching the
     * selector.  This handles the case where the user clicks on a child
     * element of the button (e.g. the text node or a hypothetical icon).
     *
     * Flow:
     *   1. Find the Delete button using closest('.btn-delete').
     *   2. Read entry.dataset.date.
     *   3. Show a confirm() dialog.
     *   4. Filter the entry out and attempt to save.
     *   5. Only update state and re-render on success.
     */
    async function handleTableClick(event) {
      if (isMutationBlocked() || !storageAdapter) return;

      const editBtn = event.target.closest('.btn-edit');
      if (editBtn) {
        enterEditMode(editBtn.dataset.date);
        return;
      }

      const btn = event.target.closest('.btn-delete');
      if (!btn) return; // click was not on or inside a Delete button

      const dateToDelete = btn.dataset.date;
      if (!dateToDelete) return;

      const confirmed = window.confirm(
        'Delete entry for ' + dateToDelete + '?'
      );
      if (!confirmed) return;

      const updated = entries.filter(function (e) {
        return e.date !== dateToDelete;
      });

      // Record the deleted row's position before the table is rebuilt so
      // focus can be restored to the equivalent row (or heading) afterwards.
      const allBtns     = Array.from(
        document.querySelectorAll('#entries-container .btn-delete')
      );
      const deletedIndex = allBtns.findIndex(function (b) {
        return b.dataset.date === dateToDelete;
      });

      let restoreDeleteFocus = false;
      setBusyState(true);
      try {
        const saved = await storageAdapter.saveEntries(updated);
        if (!saved || !saved.ok) {
          showTableError('Could not delete the entry — storage may be unavailable. Please try again.');
          return;
        }

        entries = updated;
        clearTableError();
        if (editingDate === dateToDelete) exitEditMode();
        render();
        restoreDeleteFocus = true;
      } catch (error) {
        showTableError('Could not delete the entry — storage may be unavailable. Please try again.');
      } finally {
        setBusyState(false);
        if (restoreDeleteFocus) {
          const newBtns = Array.from(document.querySelectorAll('#entries-container .btn-delete'));
          if (newBtns.length > 0) {
            const focusIndex = Math.min(deletedIndex, newBtns.length - 1);
            newBtns[focusIndex].focus();
          } else {
            document.getElementById('entries-heading').focus();
          }
        }
      }
    }

    /**
     * handleEraseAll(event)
     *
     * Handles the "Erase all demo entries" button.
     *
     * Uses the storage adapter to save an empty array so every backend uses
     * the same write path and error handling.
     */
    async function handleEraseAll() {
      if (isMutationBlocked() || !storageAdapter) return;

      const confirmed = window.confirm(
        'This will permanently delete all entries. Continue?'
      );
      if (!confirmed) return;

      setBusyState(true);
      try {
        const saved = await storageAdapter.saveEntries([]);
        if (!saved || !saved.ok) {
          showTableError('Could not erase entries — storage may be unavailable. Please try again.');
          return;
        }

        entries = [];
        clearTableError();
        exitEditMode();
        render();
      } catch (error) {
        showTableError('Could not erase entries — storage may be unavailable. Please try again.');
      } finally {
        setBusyState(false);
      }
    }

    /* ── Boot ────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', init);
