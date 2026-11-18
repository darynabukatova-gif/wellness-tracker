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
    let trendMode = 'preset';
    let customTrendType = 'year';
    let customTrendDraftStart = '';
    let customTrendDraftEnd = '';
    let customTrendDraftMonth = '';
    let customTrendDraftYear = '';
    let customTrendDraftResolution = 'daily';
    let appliedCustomTrendRange = null;
    let comparisonTrendType = 'month';
    let comparisonTrendDraftFirst = '';
    let comparisonTrendDraftSecond = '';
    let comparisonTrendDraftResolution = 'weekly';
    let appliedTrendComparison = null;
    let activeTrendDisplay = { type: 'preset', dayCount: 30 };
    let appliedHistoryRange = null;
    let historyPage = 1;
    const HISTORY_PAGE_SIZE = 25;
    const selectedTrendPoints = { mood: null, sleep: null, water: null };
    let pendingImport = null;
    let pendingMergePreview = null;
    let importReading = false;
    let pendingUndoEntry = null;
    const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024;

    function clearTrendPointSelections() {
      selectedTrendPoints.mood = null;
      selectedTrendPoints.sleep = null;
      selectedTrendPoints.water = null;
    }

    function setTrendPointVisual(point, selected) {
      if (!point) return;
      if (selected) point.setAttribute('data-selected', 'true');
      else if (typeof point.removeAttribute === 'function') point.removeAttribute('data-selected');
    }

    function clearTrendPointVisuals(metric) {
      const card = document.querySelector(
        '.trend-chart-card[data-metric="' + metric + '"]'
      );
      if (!card || typeof card.querySelectorAll !== 'function') return;
      card.querySelectorAll('[data-interactive-point="true"]').forEach(function (point) {
        setTrendPointVisual(point, false);
      });
    }

    function getTrendPointDetail(point) {
      if (!point || !point.dataset || !point.dataset.metric) return null;
      const detail = {
        type: point.dataset.pointType === 'aggregated' ? 'aggregated' : 'daily',
        metric: point.dataset.metric,
        series: point.dataset.comparisonSeries || null,
        key: point.dataset.periodKey || null,
        date: point.dataset.date || null,
        label: point.dataset.periodLabel || point.dataset.periodKey || null,
        seriesLabel: point.dataset.seriesLabel || null,
        startDate: point.dataset.startDate || null,
        endDate: point.dataset.endDate || null,
        value: point.dataset.value === undefined ? null : Number(point.dataset.value),
        recordedDayCount: point.dataset.recordedDayCount === undefined
          ? null : Number(point.dataset.recordedDayCount),
        calendarDayCount: point.dataset.calendarDayCount === undefined
          ? null : Number(point.dataset.calendarDayCount),
      };
      return detail.type === 'daily' && !detail.date ? null : detail;
    }

    function positionTrendPointTooltip(point) {
      const tooltip = document.getElementById('trend-point-details-' + point.dataset.metric);
      const card = point.closest('.trend-chart-card');
      if (!tooltip || !card || typeof point.getBoundingClientRect !== 'function' ||
          typeof card.getBoundingClientRect !== 'function' ||
          typeof tooltip.getBoundingClientRect !== 'function') return;

      const pointRect = point.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const viewportWidth = (window.innerWidth || document.documentElement.clientWidth || cardRect.width);
      const viewportHeight = (window.innerHeight || document.documentElement.clientHeight || 0);
      const margin = 8;
      const pointX = pointRect.left - cardRect.left + pointRect.width / 2;
      const pointTop = pointRect.top - cardRect.top;
      const pointBottom = pointRect.bottom - cardRect.top;

      // Keep the tooltip's containing block local to the card, but use its
      // viewport rectangle to account for page and ancestor scrolling.
      tooltip.style.maxWidth = Math.max(160, viewportWidth - margin * 2) + 'px';
      tooltip.style.transform = 'none';
      tooltip.classList.remove('is-below');
      tooltip.style.left = pointX + 'px';
      tooltip.style.top = Math.max(margin, pointTop - margin) + 'px';
      let tooltipRect = tooltip.getBoundingClientRect();
      let left = pointX - tooltipRect.width / 2;
      let top = pointTop - tooltipRect.height - margin;
      const fitsAbove = cardRect.top + top >= margin;
      const belowTop = pointBottom + margin;
      const fitsBelow = viewportHeight === 0 || cardRect.top + belowTop + tooltipRect.height <= viewportHeight - margin;

      if (!fitsAbove && fitsBelow) {
        top = belowTop;
        tooltip.classList.add('is-below');
      }
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltipRect = tooltip.getBoundingClientRect();
      left += Math.max(margin - tooltipRect.left, 0);
      left -= Math.max(tooltipRect.right - (viewportWidth - margin), 0);
      if (viewportHeight > 0) {
        top += Math.max(margin - tooltipRect.top, 0);
        top -= Math.max(tooltipRect.bottom - (viewportHeight - margin), 0);
      }
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }

    function repositionOpenTrendTooltips() {
      ['mood', 'sleep', 'water'].forEach(function (metric) {
        const selection = selectedTrendPoints[metric];
        if (!selection) return;
        const points = getInteractiveTrendPoints(metric, selection.series);
        const point = points.find(function (candidate) {
          return candidate.dataset.pointIndex === selection.index;
        });
        if (point) positionTrendPointTooltip(point);
      });
    }

    function selectTrendPoint(point, pinned) {
      const detail = getTrendPointDetail(point);
      if (!detail) return { ok: false, reason: 'invalid-point' };
      clearTrendPointVisuals(detail.metric);
      selectedTrendPoints[detail.metric] = {
        series: detail.series,
        index: point.dataset.pointIndex,
        pinned: pinned !== false,
      };
      if (detail.series) {
        const seriesSelect = document.getElementById(
          'trend-comparison-series-' + detail.metric
        );
        if (seriesSelect) seriesSelect.value = detail.series;
      }
      renderTrendPointDetails(detail.metric, detail, pinned !== false);
      setTrendPointVisual(point, true);
      positionTrendPointTooltip(point);
      return { ok: true, detail };
    }

    function hideTrendPointTooltip(metric) {
      const selection = selectedTrendPoints[metric];
      if (selection && selection.pinned) return;
      clearTrendPointVisuals(metric);
      selectedTrendPoints[metric] = null;
      renderTrendPointDetails(metric, null);
    }

    function closePinnedTrendTooltips() {
      ['mood', 'sleep', 'water'].forEach(function (metric) {
        clearTrendPointVisuals(metric);
        selectedTrendPoints[metric] = null;
        renderTrendPointDetails(metric, null);
      });
    }

    function getInteractiveTrendPoints(metric, series) {
      const card = document.querySelector(
        '.trend-chart-card[data-metric="' + metric + '"]'
      );
      if (!card || typeof card.querySelectorAll !== 'function') return [];
      return Array.from(card.querySelectorAll('[data-interactive-point="true"]'))
        .filter(function (point) {
          return !series || point.dataset.comparisonSeries === series;
        });
    }

    function getTrendExplorerSeries(metric) {
      const seriesSelect = document.getElementById('trend-comparison-series-' + metric);
      return seriesSelect ? seriesSelect.value : null;
    }

    function moveTrendPointSelection(metric, offset, series) {
      const points = getInteractiveTrendPoints(metric, series);
      if (points.length === 0) return { ok: false, reason: 'no-recorded-points' };
      const current = selectedTrendPoints[metric];
      let currentIndex = points.findIndex(function (point) {
        return current && point.dataset.pointIndex === current.index &&
          (point.dataset.comparisonSeries || null) === current.series;
      });
      if (currentIndex < 0) currentIndex = offset > 0 ? -1 : points.length;
      const nextIndex = currentIndex + offset;
      if (nextIndex < 0 || nextIndex >= points.length) {
        return { ok: false, reason: 'boundary' };
      }
      return selectTrendPoint(points[nextIndex]);
    }

    function selectFirstTrendPoint(metric, series) {
      const points = getInteractiveTrendPoints(metric, series);
      return points.length > 0
        ? selectTrendPoint(points[0])
        : { ok: false, reason: 'no-recorded-points' };
    }

    function handleTrendPointKeydown(event) {
      if (event.key === 'Escape') {
        closePinnedTrendTooltips();
        return;
      }
      const explorer = event.target.closest('.trend-chart-explorer');
      if (!explorer || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      const metric = explorer.dataset.chartExplorerMetric;
      moveTrendPointSelection(
        metric,
        event.key === 'ArrowRight' ? 1 : -1,
        getTrendExplorerSeries(metric)
      );
    }

    function handleTrendPointSeriesChange(event) {
      const selector = event.target.closest('.trend-comparison-series-select');
      if (!selector) return;
      const metric = selector.dataset.chartExplorerMetric;
      clearTrendPointVisuals(metric);
      selectedTrendPoints[metric] = null;
      renderTrendPointDetails(metric, null);
    }

    function handleHistoryTrendsPointerOver(event) {
      const point = event.target.closest('[data-interactive-point="true"]');
      if (!point) return;
      const selection = selectedTrendPoints[point.dataset.metric];
      if (selection && selection.pinned) return;
      selectTrendPoint(point, false);
    }

    function isWithinTrendPointInteraction(target, metric) {
      if (!target || typeof target.closest !== 'function') return false;
      const point = target.closest('[data-interactive-point="true"]');
      if (point && point.dataset.metric === metric) return true;
      const tooltip = target.closest('.trend-point-tooltip');
      return Boolean(tooltip && tooltip.dataset.metric === metric);
    }

    function handleHistoryTrendsPointerOut(event) {
      const point = event.target.closest('[data-interactive-point="true"]');
      const tooltip = event.target.closest('.trend-point-tooltip');
      const metric = point
        ? point.dataset.metric
        : (tooltip ? tooltip.dataset.metric : null);
      if (!metric || isWithinTrendPointInteraction(event.relatedTarget, metric)) return;
      hideTrendPointTooltip(metric);
    }

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
        '#preview-merge-backup-btn', '#merge-backup-input', '#merge-backup-btn', '#cancel-merge-preview-btn',
        '#merge-keep-all-existing-btn', '#merge-use-all-backup-btn',
        '#entry-sleep', '#entry-water', '#sleep-minus', '#sleep-plus',
        '#water-minus', '#water-plus', '#copy-previous-values-btn',
        '#edit-existing-entry-btn', '#undo-delete-btn'
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
      const mergeButton = document.getElementById('merge-backup-btn');
      const cancelMergeButton = document.getElementById('cancel-merge-preview-btn');
      if (mergeButton) {
        let mergeCandidate = null;
        if (pendingMergePreview && !disabled) {
          try {
            mergeCandidate = buildBackupMergeCandidate(
              entries,
              pendingMergePreview.backup.entries,
              pendingMergePreview.conflictResolutions
            );
          } catch (error) {
            mergeCandidate = null;
          }
        }
        mergeButton.disabled = !mergeCandidate || !mergeCandidate.ok || disabled;
      }
      if (cancelMergeButton) {
        cancelMergeButton.disabled = !pendingMergePreview || busy || locked || importReading;
      }
      const previousMergePageButton = document.getElementById('merge-preview-new-prev');
      const nextMergePageButton = document.getElementById('merge-preview-new-next');
      if (pendingMergePreview && !disabled) {
        const pageState = paginateEntries(
          pendingMergePreview.analysis.newEntries,
          pendingMergePreview.newEntriesPage,
          25
        );
        if (previousMergePageButton) previousMergePageButton.disabled = !pageState.hasPreviousPage;
        if (nextMergePageButton) nextMergePageButton.disabled = !pageState.hasNextPage;
      } else {
        if (previousMergePageButton) previousMergePageButton.disabled = true;
        if (nextMergePageButton) nextMergePageButton.disabled = true;
      }
      if (!disabled) {
        updateSleepControl();
        updateWaterControl();
      }
      updateEraseAllBtn();
      updateEntryDateControls();
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

    function updateEntryDateControls() {
      const dateInput = document.getElementById('entry-date');
      const previousButton = document.getElementById('entry-date-prev');
      const nextButton = document.getElementById('entry-date-next');
      const copyButton = document.getElementById('copy-previous-values-btn');
      const editButton = document.getElementById('edit-existing-entry-btn');
      const status = document.getElementById('entry-date-status');
      if (!dateInput || !previousButton || !nextButton || !copyButton || !editButton || !status) return;

      let validDate = false;
      try {
        validDate = validateCalendarDateRange(dateInput.value, dateInput.value).ok;
      } catch (error) {
        validDate = false;
      }
      const navigationDate = validDate ? dateInput.value : localDateString(new Date());
      const atFirstDate = navigationDate === '0000-01-01';
      const atLastDate = navigationDate === '9999-12-31';
      const blocked = isMutationBlocked();
      const editing = editingDate !== null;

      previousButton.disabled = blocked || editing || atFirstDate;
      nextButton.disabled = blocked || editing || atLastDate;
      copyButton.disabled = true;
      editButton.hidden = true;

      if (!validDate) {
        status.textContent = 'Enter a valid calendar date to check for a saved entry.';
        return;
      }

      const existing = getEntryByDate(entries, dateInput.value);
      if (existing) {
        status.textContent = editing
          ? 'Editing the saved entry for ' + dateInput.value + '.'
          : 'An entry is already saved for ' + dateInput.value + '. Choose Edit existing entry to change it.';
        editButton.hidden = editing;
        editButton.setAttribute('aria-label', 'Edit existing entry for ' + dateInput.value);
        editButton.disabled = blocked;
      } else {
        status.textContent = 'No entry is saved for ' + dateInput.value + '. You can create one.';
      }

      if (!existing && !editing && !blocked) {
        const previous = findPreviousSavedEntry(entries, dateInput.value);
        copyButton.disabled = previous === null;
      }
    }

    function handleEntryDateInput() {
      if (editingDate !== null) {
        document.getElementById('entry-date').value = editingDate;
        return;
      }
      clearFormError();
      updateEntryDateControls();
    }

    function navigateEntryDate(offset) {
      if (!Number.isInteger(offset) || offset === 0 || isMutationBlocked() || editingDate !== null) {
        return { ok: false, reason: 'blocked' };
      }
      const dateInput = document.getElementById('entry-date');
      let currentDate;
      try {
        currentDate = validateCalendarDateRange(dateInput.value, dateInput.value).ok
          ? dateInput.value
          : localDateString(new Date());
      } catch (error) {
        currentDate = localDateString(new Date());
      }
      if (offset < 0 && currentDate === '0000-01-01') return { ok: false, reason: 'boundary' };
      if (offset > 0 && currentDate === '9999-12-31') return { ok: false, reason: 'boundary' };

      const nextDate = addCalendarDays(currentDate, offset);
      dateInput.value = nextDate;
      clearFormError();
      updateEntryDateControls();
      return { ok: true, date: nextDate };
    }

    function copyPreviousValues() {
      if (isMutationBlocked() || editingDate !== null) {
        return { ok: false, reason: 'blocked' };
      }
      const date = document.getElementById('entry-date').value;
      let previous;
      try {
        if (getEntryByDate(entries, date)) {
          return { ok: false, reason: 'existing-entry' };
        }
        previous = findPreviousSavedEntry(entries, date);
      } catch (error) {
        return { ok: false, reason: 'invalid-date' };
      }
      if (!previous) {
        const status = document.getElementById('entry-date-status');
        status.textContent = 'No earlier saved entry is available to copy.';
        return { ok: false, reason: 'no-previous-entry' };
      }

      document.querySelectorAll('input[name="mood"]').forEach(function (radio) {
        radio.checked = Number(radio.value) === previous.mood;
      });
      setValueControlValues(previous.sleep, previous.water);
      clearFormError();
      document.getElementById('entry-date-status').textContent =
        'Copied values from ' + previous.date + '. These values have not been saved.';
      return { ok: true, sourceDate: previous.date };
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

    function showUndoStatus(text, undoAvailable) {
      const status = document.getElementById('undo-delete-status');
      const message = document.getElementById('undo-delete-message');
      const button = document.getElementById('undo-delete-btn');
      if (!status || !message || !button) return;
      message.textContent = text;
      status.classList.add('is-visible');
      button.hidden = !undoAvailable;
      button.disabled = !undoAvailable || isMutationBlocked();
    }

    function clearUndoStatus() {
      const status = document.getElementById('undo-delete-status');
      const message = document.getElementById('undo-delete-message');
      const button = document.getElementById('undo-delete-btn');
      if (!status || !message || !button) return;
      message.textContent = '';
      status.classList.remove('is-visible');
      button.hidden = true;
    }

    async function handleUndoDeletion() {
      if (!pendingUndoEntry || isMutationBlocked() || !storageAdapter) return;

      let candidate;
      try {
        candidate = buildUndoDeletionCandidate(entries, pendingUndoEntry);
      } catch (error) {
        pendingUndoEntry = null;
        showUndoStatus('Undo is no longer available because the deleted entry is invalid.', false);
        return;
      }
      if (!candidate.ok) {
        pendingUndoEntry = null;
        showUndoStatus('Undo is no longer available because that date already contains an entry.', false);
        return;
      }

      const restoredDate = pendingUndoEntry.date;
      setBusyState(true);
      let restored = false;
      try {
        const saved = await storageAdapter.saveEntries(candidate.entries);
        if (!saved || !saved.ok) {
          showUndoStatus('Could not restore the entry — storage may be unavailable. Please try Undo again.', true);
          return;
        }
        entries = candidate.entries;
        pendingUndoEntry = null;
        invalidateMergePreview();
        render();
        showUndoStatus('Entry for ' + restoredDate + ' restored.', false);
        restored = true;
      } catch (error) {
        showUndoStatus('Could not restore the entry — storage may be unavailable. Please try Undo again.', true);
      } finally {
        setBusyState(false);
        if (restored) document.getElementById('entries-heading').focus();
      }
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

    function invalidateMergePreview() {
      if (!pendingMergePreview) return;
      pendingMergePreview = null;
      renderMergePreview(null);
      showBackupStatus('Merge preview closed because saved entries changed.');
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

    function readBackupFile(file) {
      if (typeof file.size === 'number' && file.size > MAX_BACKUP_FILE_BYTES) {
        return Promise.resolve({ ok: false, error: 'Backup file is too large. Choose a JSON backup smaller than 5 MiB.' });
      }
      if (typeof file.text !== 'function') {
        return Promise.resolve({ ok: false, error: 'This browser cannot read the selected backup file.' });
      }
      return file.text().then(function (text) {
        const result = parseBackupDocument(text);
        return result.ok ? result : { ok: false, error: 'Could not validate the backup file: ' + result.error };
      }).catch(function () {
        return { ok: false, error: 'Could not read the selected backup file. Your saved entries have not changed.' };
      });
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
      importReading = true;
      clearBackupError();
      clearBackupStatus();
      updateMutatingControls();
      try {
        const result = await readBackupFile(file);
        if (!result.ok) {
          showBackupError(result.error);
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

    function handlePreviewMergeBackup() {
      if (isMutationBlocked()) return;
      clearBackupError();
      clearBackupStatus();
      const input = document.getElementById('merge-backup-input');
      input.value = '';
      input.click();
    }

    function getCommittedEntriesSignature(sourceEntries) {
      return JSON.stringify(sortByDateDesc(copyImportedEntries(sourceEntries)));
    }

    function renderCurrentMergePreview() {
      if (!pendingMergePreview) {
        renderMergePreview(null);
        return;
      }
      let candidate = null;
      const newEntriesPagination = paginateEntries(
        pendingMergePreview.analysis.newEntries,
        pendingMergePreview.newEntriesPage,
        25
      );
      pendingMergePreview.newEntriesPage = newEntriesPagination.page;
      try {
        candidate = buildBackupMergeCandidate(
          entries,
          pendingMergePreview.backup.entries,
          pendingMergePreview.conflictResolutions
        );
      } catch (error) {
        candidate = null;
      }
      renderMergePreview(
        pendingMergePreview.analysis,
        pendingMergePreview.backup.exportedAt,
        pendingMergePreview.conflictResolutions,
        candidate,
        newEntriesPagination
      );
    }

    async function handleMergeBackupFileChange(event) {
      const input = event.target;
      const file = input && input.files ? input.files[0] : null;
      if (!file) return;
      if (isMutationBlocked()) {
        input.value = '';
        return;
      }

      importReading = true;
      clearBackupError();
      clearBackupStatus();
      updateMutatingControls();
      try {
        const result = await readBackupFile(file);
        if (!result.ok) {
          showBackupError(result.error);
          return;
        }
        if (locked || busy) return;
        pendingMergePreview = {
          backup: result.backup,
          analysis: analyzeBackupMerge(entries, result.backup.entries),
          conflictResolutions: {},
          currentEntriesSnapshot: copyImportedEntries(entries),
          newEntriesPage: 1,
        };
        renderCurrentMergePreview();
      } catch (error) {
        showBackupError('Could not prepare the merge preview. Your saved entries have not changed.');
      } finally {
        importReading = false;
        input.value = '';
        updateMutatingControls();
      }
    }

    function handleCancelMergePreview() {
      if (!pendingMergePreview || busy || locked || importReading) return;
      pendingMergePreview = null;
      renderMergePreview(null);
      clearBackupError();
      clearBackupStatus();
      document.getElementById('merge-backup-input').value = '';
      document.getElementById('preview-merge-backup-btn').focus();
    }

    function handleMergeResolutionChange(event) {
      if (!pendingMergePreview || isMutationBlocked()) return;
      const input = event.target.closest('input[data-merge-conflict-date]');
      if (!input || !input.dataset.mergeConflictDate) return;
      pendingMergePreview.conflictResolutions[input.dataset.mergeConflictDate] = input.value;
      renderCurrentMergePreview();
    }

    function handleMergeBulkResolution(event) {
      if (!pendingMergePreview || isMutationBlocked()) return false;
      const button = event.target.closest('button[data-merge-bulk-resolution]');
      if (!button) return false;
      const resolution = button.dataset.mergeBulkResolution;
      if (resolution !== 'keep-existing' && resolution !== 'use-backup') return false;
      pendingMergePreview.analysis.conflicts.forEach(function (conflict) {
        pendingMergePreview.conflictResolutions[conflict.date] = resolution;
      });
      renderCurrentMergePreview();
      return true;
    }

    function handleMergePreviewClick(event) {
      if (!pendingMergePreview || isMutationBlocked()) return;
      if (handleMergeBulkResolution(event)) return;
      const pageButton = event.target.closest('[data-merge-new-page]');
      if (!pageButton) return;
      const currentPage = pendingMergePreview.newEntriesPage;
      pendingMergePreview.newEntriesPage = pageButton.dataset.mergeNewPage === 'next'
        ? currentPage + 1 : currentPage - 1;
      renderCurrentMergePreview();
    }

    async function handleMergeBackup() {
      if (busy || locked || importReading || !pendingMergePreview || !storageAdapter) return;

      const previewAtConfirmation = pendingMergePreview;
      const currentSignature = getCommittedEntriesSignature(entries);
      const previewSignature = getCommittedEntriesSignature(previewAtConfirmation.currentEntriesSnapshot);
      if (currentSignature !== previewSignature) {
        previewAtConfirmation.analysis = analyzeBackupMerge(entries, previewAtConfirmation.backup.entries);
        previewAtConfirmation.conflictResolutions = {};
        previewAtConfirmation.currentEntriesSnapshot = copyImportedEntries(entries);
        renderCurrentMergePreview();
        showBackupError('Saved entries changed while this preview was open. Review the refreshed merge preview before continuing.');
        return;
      }

      setBusyState(true);
      let merged = false;
      try {
        let candidate = buildBackupMergeCandidate(
          entries,
          previewAtConfirmation.backup.entries,
          previewAtConfirmation.conflictResolutions
        );
        if (!candidate.ok) {
          showBackupError('Resolve every backup conflict before merging.');
          return;
        }
        const validationError = validateStoredEntries(candidate.entries);
        if (validationError) {
          showBackupError('The merge candidate is invalid: ' + validationError);
          return;
        }
        if (!candidate.hasChanges) {
          pendingMergePreview = null;
          renderMergePreview(null);
          clearBackupError();
          showBackupStatus('No changes needed. Your saved entries already match the selected merge choices.');
          return;
        }

        if (candidate.counts.replaced > 0 && !window.confirm(
          'Merge this backup and replace ' + candidate.counts.replaced +
          ' existing ' + (candidate.counts.replaced === 1 ? 'entry' : 'entries') +
          ' with the explicitly selected backup values? New entries will be added and unrelated entries will remain.'
        )) return;

        // Reconstruct immediately after confirmation so the persisted
        // candidate is still derived from the current committed collection.
        candidate = buildBackupMergeCandidate(
          entries,
          previewAtConfirmation.backup.entries,
          previewAtConfirmation.conflictResolutions
        );
        if (!candidate.ok) {
          showBackupError('Saved entries changed while this merge was being confirmed. Review the refreshed preview.');
          return;
        }

        const saved = await storageAdapter.saveEntries(candidate.entries);
        if (!saved || !saved.ok) {
          showBackupError('Could not merge the backup — storage may be unavailable. Your saved entries have not changed.');
          return;
        }

        entries = candidate.entries;
        pendingUndoEntry = null;
        pendingMergePreview = null;
        renderMergePreview(null);
        clearUndoStatus();
        clearBackupError();
        render();
        showBackupStatus('Backup merged. Added ' + candidate.counts.added + ', replaced ' +
          candidate.counts.replaced + ', and kept ' + candidate.counts.unchanged + ' unchanged.');
        merged = true;
      } catch (error) {
        showBackupError('Could not merge the backup — storage may be unavailable. Your saved entries have not changed.');
      } finally {
        setBusyState(false);
        if (merged) document.getElementById('preview-merge-backup-btn').focus();
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
        pendingUndoEntry = null;
        invalidateMergePreview();
        clearUndoStatus();
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

    function ensureCalendarMonth() {
      if (calendarYear !== null && calendarMonthIndex !== null) return;
      const today = new Date();
      calendarYear = today.getFullYear();
      calendarMonthIndex = today.getMonth();
    }

    function calendarMonthKey(year, monthIndex) {
      return String(year).padStart(4, '0') + '-' + String(monthIndex + 1).padStart(2, '0');
    }

    function normalizeCalendarSelection() {
      ensureCalendarMonth();
      if (selectedCalendarDate &&
          selectedCalendarDate.slice(0, 7) !== calendarMonthKey(calendarYear, calendarMonthIndex)) {
        selectedCalendarDate = null;
      }
    }

    function getCalendarRenderState(announceMonth) {
      ensureCalendarMonth();
      normalizeCalendarSelection();
      return {
        year: calendarYear,
        monthIndex: calendarMonthIndex,
        selectedDate: selectedCalendarDate,
        announceMonth,
        mutationsBlocked: isMutationBlocked(),
      };
    }

    function renderCalendarForCurrentState(announceMonth) {
      renderCalendar(entries, getCalendarRenderState(announceMonth));
    }

    function getHistoryRenderState() {
      if (!appliedHistoryRange) {
        return {
          totalEntryCount: entries.length,
          appliedRange: null,
          matchingCount: 0,
          visibleEntries: [],
          page: 1,
          pageSize: HISTORY_PAGE_SIZE,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        };
      }

      const matchingEntries = filterEntriesByDateRange(
        entries, appliedHistoryRange.startDate, appliedHistoryRange.endDate
      );
      const pagination = paginateEntries(matchingEntries, historyPage, HISTORY_PAGE_SIZE);
      return {
        totalEntryCount: entries.length,
        appliedRange: appliedHistoryRange,
        matchingCount: matchingEntries.length,
        visibleEntries: pagination.entries,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: pagination.totalPages,
        hasPreviousPage: pagination.hasPreviousPage,
        hasNextPage: pagination.hasNextPage,
      };
    }

    function renderHistoryTable() {
      const state = getHistoryRenderState();
      historyPage = state.page;
      renderTable(state);
    }

    function initializeHistoryDateDefaults() {
      const fromInput = document.getElementById('history-from-date');
      const toInput = document.getElementById('history-to-date');
      if (!fromInput || !toInput) return;

      let earliest;
      let latest;
      if (entries.length > 0) {
        entries.forEach(function (entry) {
          if (!earliest || entry.date < earliest) earliest = entry.date;
          if (!latest || entry.date > latest) latest = entry.date;
        });
      } else {
        const today = new Date();
        earliest = localDateString(new Date(today.getFullYear(), today.getMonth(), 1));
        latest = localDateString(today);
      }

      if (!fromInput.value) fromInput.value = earliest;
      if (!toInput.value) toInput.value = latest;
    }

    function showHistoryFilterError(message) {
      const error = document.getElementById('history-filter-error');
      error.classList.add('is-visible');
      error.textContent = message;
    }

    function clearHistoryFilterError() {
      const error = document.getElementById('history-filter-error');
      error.textContent = '';
      error.classList.remove('is-visible');
    }

    function applyHistoryDateRange(startDate, endDate) {
      const result = validateCalendarDateRange(startDate, endDate);
      if (!result.ok) {
        renderHistoryTable();
        showHistoryFilterError(result.error);
        return result;
      }

      appliedHistoryRange = { startDate: result.startDate, endDate: result.endDate };
      historyPage = 1;
      clearHistoryFilterError();
      renderHistoryTable();
      return result;
    }

    function handleHistoryFilterSubmit(event) {
      event.preventDefault();
      const startDate = document.getElementById('history-from-date').value;
      const endDate = document.getElementById('history-to-date').value;
      applyHistoryDateRange(startDate, endDate);
    }

    function showEntryInHistory(date) {
      let entry;
      try {
        entry = getEntryByDate(entries, date);
      } catch (error) {
        return { ok: false, reason: 'invalid-date' };
      }
      if (!entry) return { ok: false, reason: 'missing-entry' };

      const fromInput = document.getElementById('history-from-date');
      const toInput = document.getElementById('history-to-date');
      fromInput.value = date;
      toInput.value = date;
      const result = applyHistoryDateRange(date, date);
      if (!result.ok) return result;

      const buttons = Array.from(document.querySelectorAll('#entries-container .btn-edit'));
      const target = buttons.find(function (button) {
        return button.dataset.date === date;
      });
      if (target) {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        target.focus();
      }
      return { ok: true, entry };
    }

    function invalidateAppliedHistoryRange() {
      if (!appliedHistoryRange) return;
      appliedHistoryRange = null;
      historyPage = 1;
      renderHistoryTable();
    }

    function handleHistoryFilterInput() {
      clearHistoryFilterError();
      invalidateAppliedHistoryRange();
    }

    function handleClearHistoryFilters() {
      document.getElementById('history-from-date').value = '';
      document.getElementById('history-to-date').value = '';
      appliedHistoryRange = null;
      historyPage = 1;
      clearHistoryFilterError();
      renderHistoryTable();
      document.getElementById('history-from-date').focus();
    }

    function changeHistoryPage(offset) {
      if (!appliedHistoryRange || !Number.isInteger(offset) || offset === 0) return;
      const state = getHistoryRenderState();
      const nextPage = state.page + offset;
      if (nextPage < 1 || nextPage > state.totalPages) return;
      historyPage = nextPage;
      renderHistoryTable();
      const targetId = offset < 0 ? 'history-next-page-btn' : 'history-previous-page-btn';
      const target = document.getElementById(targetId);
      if (target && !target.disabled) target.focus();
      else {
        const current = document.getElementById('history-page-status');
        if (current && typeof current.focus === 'function') current.focus();
      }
    }

    function renderHistoryTrendsForCurrentState() {
      clearTrendPointSelections();
      const chartDisplay = getActiveTrendDisplay();
      const today = localDateString(new Date());
      renderHistoryTrends(entries, {
        activeView: historyView,
        trendDayCount,
        trendEndDate: today,
        trendMode,
        customTrendType,
        customTrendDraftStart,
        customTrendDraftEnd,
        customTrendDraftMonth,
        customTrendDraftYear,
        customTrendDraftResolution,
        customMonthNavigation: getMonthNavigationState(customTrendDraftMonth),
        customYearNavigation: getYearNavigationState(customTrendDraftYear),
        appliedCustomTrendRange,
        comparisonTrendType,
        comparisonTrendDraftFirst,
        comparisonTrendDraftSecond,
        comparisonTrendDraftResolution,
        comparisonFirstMonthNavigation: getMonthNavigationState(comparisonTrendDraftFirst),
        comparisonSecondMonthNavigation: getMonthNavigationState(comparisonTrendDraftSecond),
        comparisonFirstYearNavigation: getYearNavigationState(comparisonTrendDraftFirst),
        comparisonSecondYearNavigation: getYearNavigationState(comparisonTrendDraftSecond),
        comparisonShortcuts: getComparisonShortcutState(),
        appliedTrendComparison,
        chartDisplay,
        statisticsDisplay: getActiveTrendStatistics(chartDisplay),
        calendar: getCalendarRenderState(false),
        dashboardModel: historyView === 'dashboard'
          ? buildDashboardModel(entries, today)
          : null,
      });
    }

    function setHistoryView(view) {
      if (view !== 'charts' && view !== 'calendar' && view !== 'dashboard') return;
      historyView = view;
      renderHistoryTrendsForCurrentState();
    }

    function showEntryHistorySection() {
      const section = document.getElementById('entries-section');
      const heading = document.getElementById('entries-heading');
      if (section && typeof section.scrollIntoView === 'function') {
        section.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      if (heading && typeof heading.focus === 'function') heading.focus();
    }

    function setTrendDayCount(dayCount) {
      if ([7, 30, 90].indexOf(dayCount) === -1) return;
      clearCustomTrendError();
      clearComparisonTrendError();
      trendMode = 'preset';
      trendDayCount = dayCount;
      activeTrendDisplay = { type: 'preset', dayCount };
      const chartDisplay = getActiveTrendDisplay();
      renderCharts(entries, trendDayCount, localDateString(new Date()), null, trendMode);
      renderActiveTrendStatistics(chartDisplay);
      renderComparisonTrendControls({ trendMode });
    }

    function getChartPeriodDefaults(todayDate) {
      const currentDate = todayDate || localDateString(new Date());
      localCalendarDate(currentDate);
      const currentYear = Number(currentDate.slice(0, 4));
      const currentMonth = currentDate.slice(0, 7);
      const previousMonth = currentYear === 0 && currentMonth === '0000-01'
        ? currentMonth
        : addCalendarDays(currentMonth + '-01', -1).slice(0, 7);
      const previousYear = String(Math.max(0, currentYear - 1)).padStart(4, '0');

      return {
        customMonth: currentMonth,
        customYear: currentDate.slice(0, 4),
        comparisonFirstMonth: previousMonth,
        comparisonSecondMonth: currentMonth,
        comparisonFirstYear: previousYear,
        comparisonSecondYear: currentDate.slice(0, 4),
      };
    }

    function getUsableMonthDraft(month) {
      try {
        return shiftCalendarMonth(month, 0) || getChartPeriodDefaults().customMonth;
      } catch (error) {
        return getChartPeriodDefaults().customMonth;
      }
    }

    function getMonthNavigationState(month) {
      const usableMonth = getUsableMonthDraft(month);
      return {
        previousDisabled: shiftCalendarMonth(usableMonth, -1) === null,
        nextDisabled: shiftCalendarMonth(usableMonth, 1) === null,
      };
    }

    function getUsableYearDraft(year) {
      try {
        return shiftCalendarYear(year, 0) || getChartPeriodDefaults().customYear;
      } catch (error) {
        return getChartPeriodDefaults().customYear;
      }
    }

    function getYearNavigationState(year) {
      const usableYear = getUsableYearDraft(year);
      return {
        previousDisabled: shiftCalendarYear(usableYear, -1) === null,
        nextDisabled: shiftCalendarYear(usableYear, 1) === null,
      };
    }

    function navigateTrendMonthDraft(target, offset) {
      if (isMutationBlocked() || (offset !== -1 && offset !== 1)) return;
      let currentMonth;
      if (target === 'custom') currentMonth = customTrendDraftMonth;
      else if (target === 'comparison-first') currentMonth = comparisonTrendDraftFirst;
      else if (target === 'comparison-second') currentMonth = comparisonTrendDraftSecond;
      else return;

      const nextMonth = shiftCalendarMonth(getUsableMonthDraft(currentMonth), offset);
      if (!nextMonth) return;

      if (target === 'custom') customTrendDraftMonth = nextMonth;
      else if (target === 'comparison-first') comparisonTrendDraftFirst = nextMonth;
      else comparisonTrendDraftSecond = nextMonth;
      if (target === 'custom') clearCustomTrendError();
      else clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function navigateTrendYearDraft(target, offset) {
      if (isMutationBlocked() || (offset !== -1 && offset !== 1)) return;
      let currentYear;
      if (target === 'custom') currentYear = customTrendDraftYear;
      else if (target === 'comparison-first') currentYear = comparisonTrendDraftFirst;
      else if (target === 'comparison-second') currentYear = comparisonTrendDraftSecond;
      else return;

      const nextYear = shiftCalendarYear(getUsableYearDraft(currentYear), offset);
      if (!nextYear) return;

      if (target === 'custom') customTrendDraftYear = nextYear;
      else if (target === 'comparison-first') comparisonTrendDraftFirst = nextYear;
      else comparisonTrendDraftSecond = nextYear;
      if (target === 'custom') clearCustomTrendError();
      else clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function getComparisonReferenceInputId() {
      return comparisonTrendType === 'year'
        ? 'trend-comparison-second-year'
        : 'trend-comparison-second-month';
    }

    function getComparisonShortcutState() {
      const shiftPeriod = comparisonTrendType === 'year'
        ? shiftCalendarYear
        : shiftCalendarMonth;
      try {
        return {
          compareWithPreviousDisabled: shiftPeriod(comparisonTrendDraftSecond, -1) === null,
        };
      } catch (error) {
        return { compareWithPreviousDisabled: false };
      }
    }

    function showComparisonTrendError(message, invalidIds) {
      const error = document.getElementById('trend-comparison-error');
      error.textContent = message;
      error.classList.add('is-visible');
      (invalidIds || []).forEach(function (id) {
        document.getElementById(id).setAttribute('aria-invalid', 'true');
      });
    }

    function swapComparisonTrendDrafts() {
      if (isMutationBlocked()) return;
      const firstPeriod = comparisonTrendDraftFirst;
      comparisonTrendDraftFirst = comparisonTrendDraftSecond;
      comparisonTrendDraftSecond = firstPeriod;
      clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function compareWithPreviousTrendDraft() {
      if (isMutationBlocked()) return;
      const shiftPeriod = comparisonTrendType === 'year'
        ? shiftCalendarYear
        : shiftCalendarMonth;
      const periodName = comparisonTrendType === 'year' ? 'calendar year' : 'calendar month';
      let previousPeriod;
      try {
        previousPeriod = shiftPeriod(comparisonTrendDraftSecond, -1);
      } catch (error) {
        showComparisonTrendError(
          'Enter a valid second ' + periodName + ' before comparing with the previous period.',
          [getComparisonReferenceInputId()]
        );
        return;
      }
      if (previousPeriod === null) {
        showComparisonTrendError(
          'There is no earlier ' + periodName + ' available for the selected second period.'
        );
        return;
      }
      comparisonTrendDraftFirst = previousPeriod;
      clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function setComparisonToPreviousAndCurrent() {
      if (isMutationBlocked()) return;
      const defaults = getChartPeriodDefaults();
      if (comparisonTrendType === 'year') {
        comparisonTrendDraftFirst = defaults.comparisonFirstYear;
        comparisonTrendDraftSecond = defaults.comparisonSecondYear;
      } else {
        comparisonTrendDraftFirst = defaults.comparisonFirstMonth;
        comparisonTrendDraftSecond = defaults.comparisonSecondMonth;
      }
      clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function restoreCustomTrendDrafts(type) {
      const defaults = getChartPeriodDefaults();
      const applied = appliedCustomTrendRange && appliedCustomTrendRange.type === type
        ? appliedCustomTrendRange
        : null;

      if (type === 'date-range') {
        customTrendDraftStart = applied ? applied.startDate : '';
        customTrendDraftEnd = applied ? applied.endDate : '';
      } else if (type === 'month') {
        customTrendDraftMonth = applied ? applied.month : defaults.customMonth;
      } else if (type === 'year') {
        customTrendDraftYear = applied ? applied.year : defaults.customYear;
        customTrendDraftResolution = applied ? applied.resolution || 'daily' : 'daily';
      }
    }

    function restoreComparisonTrendDrafts(type) {
      const defaults = getChartPeriodDefaults();
      const applied = appliedTrendComparison && appliedTrendComparison.type === type
        ? appliedTrendComparison
        : null;

      if (applied) {
        comparisonTrendDraftFirst = applied.firstPeriod;
        comparisonTrendDraftSecond = applied.secondPeriod;
        comparisonTrendDraftResolution = applied.resolution ||
          (type === 'year' ? 'weekly' : 'daily');
      } else if (type === 'month') {
        comparisonTrendDraftFirst = defaults.comparisonFirstMonth;
        comparisonTrendDraftSecond = defaults.comparisonSecondMonth;
        comparisonTrendDraftResolution = 'daily';
      } else {
        comparisonTrendDraftFirst = defaults.comparisonFirstYear;
        comparisonTrendDraftSecond = defaults.comparisonSecondYear;
        comparisonTrendDraftResolution = 'weekly';
      }
    }

    function selectCustomTrendRange() {
      clearCustomTrendError();
      clearComparisonTrendError();
      trendMode = 'custom';
      if (appliedCustomTrendRange) {
        customTrendType = appliedCustomTrendRange.type || 'year';
        restoreCustomTrendDrafts(customTrendType);
        activeTrendDisplay = { type: 'custom', range: appliedCustomTrendRange };
      } else {
        customTrendType = 'year';
        customTrendDraftStart = '';
        customTrendDraftEnd = '';
        const defaults = getChartPeriodDefaults();
        customTrendDraftMonth = defaults.customMonth;
        customTrendDraftYear = defaults.customYear;
        customTrendDraftResolution = 'daily';
      }
      renderHistoryTrendsForCurrentState();
    }

    function selectTrendComparison() {
      clearCustomTrendError();
      clearComparisonTrendError();
      trendMode = 'compare';
      if (appliedTrendComparison) {
        comparisonTrendType = appliedTrendComparison.type;
        restoreComparisonTrendDrafts(comparisonTrendType);
        activeTrendDisplay = { type: 'comparison' };
      } else {
        comparisonTrendType = 'month';
        restoreComparisonTrendDrafts(comparisonTrendType);
      }
      renderHistoryTrendsForCurrentState();
    }

    function resolveComparisonPeriod(type, firstPeriod, secondPeriod, resolution) {
      const isMonth = type === 'month';
      const pattern = isMonth ? /^\d{4}-\d{2}$/ : /^\d{4}$/;
      const invalidMessage = isMonth
        ? 'Select valid calendar months for both periods.'
        : 'Enter calendar years from 0000 through 9999 for both periods.';
      if (!pattern.test(firstPeriod) || !pattern.test(secondPeriod)) {
        return { ok: false, error: invalidMessage };
      }
      try {
        if (isMonth) {
          const firstMonth = Number(firstPeriod.slice(5, 7));
          const secondMonth = Number(secondPeriod.slice(5, 7));
          if (firstMonth < 1 || firstMonth > 12 || secondMonth < 1 || secondMonth > 12) {
            return { ok: false, error: invalidMessage };
          }
          const first = { year: Number(firstPeriod.slice(0, 4)), monthIndex: firstMonth - 1 };
          const second = { year: Number(secondPeriod.slice(0, 4)), monthIndex: secondMonth - 1 };
          getCalendarMonthRange(first.year, first.monthIndex);
          getCalendarMonthRange(second.year, second.monthIndex);
          return {
            ok: true,
            type,
            resolution: 'daily',
            firstPeriod,
            secondPeriod,
            first,
            second,
          };
        }
        if (type === 'year') {
          if (['daily', 'weekly', 'monthly'].indexOf(resolution) === -1) {
            return { ok: false, error: 'Choose a valid display resolution.' };
          }
          const first = Number(firstPeriod);
          const second = Number(secondPeriod);
          getCalendarYearRange(first);
          getCalendarYearRange(second);
          return { ok: true, type, resolution, firstPeriod, secondPeriod, first, second };
        }
      } catch (error) {
        return { ok: false, error: invalidMessage };
      }
      return { ok: false, error: 'Choose a comparison type.' };
    }

    function formatComparisonPeriodLabel(type, period) {
      if (type === 'year') return period;
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return monthNames[Number(period.slice(5, 7)) - 1] + ' ' + period.slice(0, 4);
    }

    function getActiveTrendDisplay() {
      if (activeTrendDisplay.type === 'comparison' && appliedTrendComparison) {
        const comparison = appliedTrendComparison;
        const resolution = comparison.resolution || 'daily';
        const seriesBuilder = comparison.type === 'month' || resolution === 'daily'
          ? function (metric) {
            return comparison.type === 'month'
              ? buildMonthComparisonSeries(entries, metric, comparison.first, comparison.second)
              : buildYearComparisonSeries(entries, metric, comparison.first, comparison.second);
          }
          : function (metric) {
            return buildAggregatedYearComparisonSeries(
              entries, metric, comparison.first, comparison.second, resolution
            );
          };
        return {
          type: 'comparison',
          seriesByMetric: {
            mood: seriesBuilder('mood'),
            sleep: seriesBuilder('sleep'),
            water: seriesBuilder('water'),
          },
          periodLabels: {
            firstPeriodLabel: formatComparisonPeriodLabel(comparison.type, comparison.firstPeriod),
            secondPeriodLabel: formatComparisonPeriodLabel(comparison.type, comparison.secondPeriod),
          },
          resolution,
        };
      }
      if (activeTrendDisplay.type === 'custom' && activeTrendDisplay.range) {
        const range = activeTrendDisplay.range;
        const resolution = range.type === 'year' ? range.resolution || 'daily' : 'daily';
        if (range.type === 'year' && (resolution === 'weekly' || resolution === 'monthly')) {
          const year = Number(range.year);
          return {
            type: 'aggregated-year',
            seriesByMetric: {
              mood: buildAggregatedYearSeries(entries, 'mood', year, resolution),
              sleep: buildAggregatedYearSeries(entries, 'sleep', year, resolution),
              water: buildAggregatedYearSeries(entries, 'water', year, resolution),
            },
            year,
            resolution,
            customRange: range,
          };
        }
        return {
          type: 'single',
          dayCount: trendDayCount,
          endDate: localDateString(new Date()),
          customRange: range,
        };
      }
      return {
        type: 'single',
        dayCount: activeTrendDisplay.dayCount || trendDayCount,
        endDate: localDateString(new Date()),
        customRange: null,
      };
    }

    function getActiveTrendStatistics(display) {
      if (display.type === 'comparison' && appliedTrendComparison) {
        const comparison = appliedTrendComparison;
        const firstRange = comparison.type === 'month'
          ? getCalendarMonthRange(comparison.first.year, comparison.first.monthIndex)
          : getCalendarYearRange(comparison.first);
        const secondRange = comparison.type === 'month'
          ? getCalendarMonthRange(comparison.second.year, comparison.second.monthIndex)
          : getCalendarYearRange(comparison.second);
        return {
          type: 'comparison',
          firstPeriodLabel: display.periodLabels.firstPeriodLabel,
          secondPeriodLabel: display.periodLabels.secondPeriodLabel,
          statistics: comparePeriodStatistics(entries, firstRange, secondRange),
        };
      }

      let startDate;
      let endDate;
      let label;
      if (display.customRange) {
        startDate = display.customRange.startDate;
        endDate = display.customRange.endDate;
        if (display.customRange.type === 'month') {
          label = 'Calendar month ' + formatComparisonPeriodLabel(
            'month', display.customRange.month || startDate.slice(0, 7)
          );
        } else if (display.customRange.type === 'year') {
          label = 'Calendar year ' + String(display.customRange.year).padStart(4, '0');
        } else {
          label = 'Custom date range';
        }
      } else {
        endDate = display.endDate;
        startDate = addCalendarDays(endDate, 1 - display.dayCount);
        label = 'Last ' + display.dayCount + ' calendar days';
      }
      return {
        type: 'period',
        label,
        statistics: calculatePeriodStatistics(entries, startDate, endDate),
      };
    }

    function renderActiveTrendStatistics(display) {
      const statisticsDisplay = getActiveTrendStatistics(display);
      if (statisticsDisplay.type === 'comparison') {
        renderComparisonStatistics(statisticsDisplay);
      } else {
        renderPeriodStatistics(statisticsDisplay);
      }
    }

    function resolveCustomTrendPeriod(type, startDate, endDate, month, year, resolution) {
      if (type === 'date-range') {
        const result = validateCalendarDateRange(startDate, endDate, { maximumDays: 366 });
        return result.ok
          ? { ok: true, type, startDate: result.startDate, endDate: result.endDate }
          : result;
      }

      if (type === 'month') {
        if (!/^\d{4}-\d{2}$/.test(month)) {
          return { ok: false, error: 'Please select a valid calendar month.' };
        }
        const monthNumber = Number(month.slice(5, 7));
        if (monthNumber < 1 || monthNumber > 12) {
          return { ok: false, error: 'Please select a valid calendar month.' };
        }
        try {
          const range = getCalendarMonthRange(Number(month.slice(0, 4)), monthNumber - 1);
          return {
            ok: true,
            type,
            month,
            startDate: range.startDate,
            endDate: range.endDate,
          };
        } catch (error) {
          return { ok: false, error: 'Please select a valid calendar month.' };
        }
      }

      if (type === 'year') {
        if (!/^\d{4}$/.test(year)) {
          return { ok: false, error: 'Enter a calendar year from 0000 through 9999.' };
        }
        const yearResolution = resolution || 'daily';
        if (['daily', 'weekly', 'monthly'].indexOf(yearResolution) === -1) {
          return { ok: false, error: 'Choose a valid display resolution.' };
        }
        try {
          const range = getCalendarYearRange(Number(year));
          return {
            ok: true,
            type,
            year,
            resolution: yearResolution,
            startDate: range.startDate,
            endDate: range.endDate,
          };
        } catch (error) {
          return { ok: false, error: 'Enter a calendar year from 0000 through 9999.' };
        }
      }

      return { ok: false, error: 'Choose a custom period type.' };
    }

    function handleCustomTrendTypeChange() {
      if (isMutationBlocked()) return;
      const type = document.getElementById('trend-custom-type').value;
      if (['date-range', 'month', 'year'].indexOf(type) === -1) return;
      customTrendType = type;
      restoreCustomTrendDrafts(type);
      clearCustomTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function handleCustomTrendDraftInput(event) {
      if (isMutationBlocked()) return;
      const id = event.target.id;
      if (id === 'trend-custom-start') customTrendDraftStart = event.target.value;
      if (id === 'trend-custom-end') customTrendDraftEnd = event.target.value;
      if (id === 'trend-custom-month') customTrendDraftMonth = event.target.value;
      if (id === 'trend-custom-year') customTrendDraftYear = event.target.value;
      clearCustomTrendError();
      if (id === 'trend-custom-month' || id === 'trend-custom-year') {
        renderHistoryTrendsForCurrentState();
      }
    }

    function handleCustomTrendResolutionChange() {
      if (isMutationBlocked()) return;
      const resolution = document.getElementById('trend-custom-resolution').value;
      if (['daily', 'weekly', 'monthly'].indexOf(resolution) === -1) return;
      customTrendDraftResolution = resolution;
      clearCustomTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function handleCustomTrendSubmit(event) {
      event.preventDefault();
      if (isMutationBlocked()) return;
      trendMode = 'custom';
      customTrendType = document.getElementById('trend-custom-type').value;
      customTrendDraftStart = document.getElementById('trend-custom-start').value;
      customTrendDraftEnd = document.getElementById('trend-custom-end').value;
      customTrendDraftMonth = document.getElementById('trend-custom-month').value;
      customTrendDraftYear = document.getElementById('trend-custom-year').value;
      customTrendDraftResolution = document.getElementById('trend-custom-resolution').value;
      const result = resolveCustomTrendPeriod(
        customTrendType,
        customTrendDraftStart,
        customTrendDraftEnd,
        customTrendDraftMonth,
        customTrendDraftYear,
        customTrendDraftResolution
      );
      const error = document.getElementById('trend-custom-error');
      if (!result.ok) {
        error.textContent = result.error;
        error.classList.add('is-visible');
        const invalidIds = customTrendType === 'date-range'
          ? ['trend-custom-start', 'trend-custom-end']
          : customTrendType === 'month'
            ? ['trend-custom-month']
            : /^\d{4}$/.test(customTrendDraftYear) &&
                ['daily', 'weekly', 'monthly'].indexOf(customTrendDraftResolution) === -1
              ? ['trend-custom-resolution']
              : ['trend-custom-year'];
        invalidIds.forEach(function (id) {
          document.getElementById(id).setAttribute('aria-invalid', 'true');
        });
        return;
      }
      clearCustomTrendError();
      appliedCustomTrendRange = {
        type: result.type,
        startDate: result.startDate,
        endDate: result.endDate,
      };
      if (result.month !== undefined) appliedCustomTrendRange.month = result.month;
      if (result.year !== undefined) {
        appliedCustomTrendRange.year = result.year;
        appliedCustomTrendRange.resolution = result.resolution;
      }
      activeTrendDisplay = { type: 'custom', range: appliedCustomTrendRange };
      renderHistoryTrendsForCurrentState();
    }

    function clearCustomTrendError() {
      const error = document.getElementById('trend-custom-error');
      if (error) {
        error.textContent = '';
        error.classList.remove('is-visible');
      }
      ['trend-custom-start', 'trend-custom-end'].forEach(function (id) {
        const input = document.getElementById(id);
        if (input && typeof input.removeAttribute === 'function') input.removeAttribute('aria-invalid');
      });
      ['trend-custom-month', 'trend-custom-year', 'trend-custom-resolution'].forEach(function (id) {
        const input = document.getElementById(id);
        if (input && typeof input.removeAttribute === 'function') input.removeAttribute('aria-invalid');
      });
    }

    function handleComparisonTrendTypeChange() {
      if (isMutationBlocked()) return;
      const type = document.getElementById('trend-comparison-type').value;
      if (type !== 'month' && type !== 'year') return;
      comparisonTrendType = type;
      restoreComparisonTrendDrafts(type);
      clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function handleComparisonTrendDraftInput(event) {
      if (isMutationBlocked()) return;
      const id = event.target.id;
      if (id === 'trend-comparison-first-month' || id === 'trend-comparison-first-year') {
        comparisonTrendDraftFirst = event.target.value;
      }
      if (id === 'trend-comparison-second-month' || id === 'trend-comparison-second-year') {
        comparisonTrendDraftSecond = event.target.value;
      }
      clearComparisonTrendError();
      if (
        id === 'trend-comparison-first-month' || id === 'trend-comparison-second-month' ||
        id === 'trend-comparison-first-year' || id === 'trend-comparison-second-year'
      ) {
        renderHistoryTrendsForCurrentState();
      }
    }

    function handleComparisonTrendResolutionChange() {
      if (isMutationBlocked()) return;
      const resolution = document.getElementById('trend-comparison-resolution').value;
      if (['daily', 'weekly', 'monthly'].indexOf(resolution) === -1) return;
      comparisonTrendDraftResolution = resolution;
      clearComparisonTrendError();
      renderHistoryTrendsForCurrentState();
    }

    function handleComparisonTrendSubmit(event) {
      event.preventDefault();
      if (isMutationBlocked()) return;
      trendMode = 'compare';
      comparisonTrendType = document.getElementById('trend-comparison-type').value;
      const firstId = comparisonTrendType === 'month'
        ? 'trend-comparison-first-month' : 'trend-comparison-first-year';
      const secondId = comparisonTrendType === 'month'
        ? 'trend-comparison-second-month' : 'trend-comparison-second-year';
      comparisonTrendDraftFirst = document.getElementById(firstId).value;
      comparisonTrendDraftSecond = document.getElementById(secondId).value;
      comparisonTrendDraftResolution = comparisonTrendType === 'year'
        ? document.getElementById('trend-comparison-resolution').value
        : 'daily';
      const result = resolveComparisonPeriod(
        comparisonTrendType,
        comparisonTrendDraftFirst,
        comparisonTrendDraftSecond,
        comparisonTrendDraftResolution
      );
      if (!result.ok) {
        const error = document.getElementById('trend-comparison-error');
        error.textContent = result.error;
        error.classList.add('is-visible');
        [firstId, secondId].forEach(function (id) {
          document.getElementById(id).setAttribute('aria-invalid', 'true');
        });
        return;
      }
      clearComparisonTrendError();
      appliedTrendComparison = {
        type: result.type,
        resolution: result.resolution,
        firstPeriod: result.firstPeriod,
        secondPeriod: result.secondPeriod,
        first: result.first,
        second: result.second,
      };
      activeTrendDisplay = { type: 'comparison' };
      renderHistoryTrendsForCurrentState();
    }

    function clearComparisonTrendError() {
      const error = document.getElementById('trend-comparison-error');
      if (error) {
        error.textContent = '';
        error.classList.remove('is-visible');
      }
      [
        'trend-comparison-first-month', 'trend-comparison-second-month',
        'trend-comparison-first-year', 'trend-comparison-second-year'
      ].forEach(function (id) {
        const input = document.getElementById(id);
        if (input && typeof input.removeAttribute === 'function') input.removeAttribute('aria-invalid');
      });
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
      renderCalendarForCurrentState(true);
    }

    function handleHistoryTrendsClick(event) {
      const point = event.target.closest('[data-interactive-point="true"]');
      const explorer = event.target.closest('.trend-chart-explorer');
      const historyAction = event.target.closest('.trend-point-history-action');
      const dashboardHistoryAction = event.target.closest('.dashboard-history-action');
      const dashboardShortcut = event.target.closest('.dashboard-shortcut');
      const tooltip = event.target.closest('.trend-point-tooltip');
      const seriesSelect = event.target.closest('.trend-comparison-series-select');
      if (!point && !explorer && !historyAction && !dashboardHistoryAction &&
          !dashboardShortcut && !tooltip && !seriesSelect) {
        closePinnedTrendTooltips();
      }

      if (point) {
        selectTrendPoint(point, true);
        return;
      }

      if (explorer) {
        const metric = explorer.dataset.chartExplorerMetric;
        selectFirstTrendPoint(metric, getTrendExplorerSeries(metric));
        return;
      }

      if (historyAction) {
        const result = showEntryInHistory(historyAction.dataset.historyDate);
        if (!result.ok && typeof showAppError === 'function') {
          showAppError('That entry is no longer available in Entry History.');
        }
        return;
      }

      if (dashboardHistoryAction) {
        const result = showEntryInHistory(dashboardHistoryAction.dataset.historyDate);
        if (!result.ok && typeof showAppError === 'function') {
          showAppError('That entry is no longer available in Entry History.');
        }
        return;
      }

      if (dashboardShortcut) {
        if (dashboardShortcut.dataset.dashboardAction === 'charts') {
          setHistoryView('charts');
        } else if (dashboardShortcut.dataset.dashboardAction === 'history') {
          showEntryHistorySection();
        }
        return;
      }

      const viewButton = event.target.closest('.history-view-btn');
      if (viewButton) {
        setHistoryView(viewButton.dataset.historyView);
        return;
      }

      const periodButton = event.target.closest('.trend-period-btn');
      if (periodButton) {
        if (periodButton.dataset.trendDays === 'custom') selectCustomTrendRange();
        else if (periodButton.dataset.trendDays === 'compare') selectTrendComparison();
        else setTrendDayCount(Number(periodButton.dataset.trendDays));
        return;
      }

      const monthNavigationButton = event.target.closest('.trend-month-nav-btn');
      if (monthNavigationButton) {
        navigateTrendMonthDraft(
          monthNavigationButton.dataset.monthDraft,
          Number(monthNavigationButton.dataset.monthOffset)
        );
        return;
      }

      const yearNavigationButton = event.target.closest('.trend-year-nav-btn');
      if (yearNavigationButton) {
        navigateTrendYearDraft(
          yearNavigationButton.dataset.yearDraft,
          Number(yearNavigationButton.dataset.yearOffset)
        );
        return;
      }

      const comparisonShortcutButton = event.target.closest('.trend-comparison-shortcut-btn');
      if (comparisonShortcutButton) {
        if (comparisonShortcutButton.dataset.comparisonShortcut === 'swap') {
          swapComparisonTrendDrafts();
        } else if (comparisonShortcutButton.dataset.comparisonShortcut === 'previous') {
          compareWithPreviousTrendDraft();
        } else if (comparisonShortcutButton.dataset.comparisonShortcut === 'current') {
          setComparisonToPreviousAndCurrent();
        }
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
        if (actionButton.dataset.calendarAction === 'delete') {
          deleteEntry(date, { source: 'calendar' });
          return;
        }
        const changed = actionButton.dataset.calendarAction === 'edit'
          ? enterEditMode(date)
          : enterNewEntryModeForDate(date);
        if (changed) focusEntryFormAfterCalendarAction();
        return;
      }

      const dateButton = event.target.closest('.calendar-day');
      if (!dateButton || !dateButton.dataset.calendarDate) return;
      selectedCalendarDate = dateButton.dataset.calendarDate;
      renderCalendarForCurrentState(false);
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
      renderHistoryTrendsForCurrentState();
      renderHistoryTable();
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
      updateEntryDateControls();
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
      updateEntryDateControls();
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
      updateEntryDateControls();
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
     *      • failed result → lock the app, show an error, and render the
     *        unapplied-history instruction.
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
        initializeHistoryDateDefaults();
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

      document.getElementById('entry-date')
        .addEventListener('input', handleEntryDateInput);
      document.getElementById('entry-date-prev')
        .addEventListener('click', function () { navigateEntryDate(-1); });
      document.getElementById('entry-date-next')
        .addEventListener('click', function () { navigateEntryDate(1); });
      document.getElementById('copy-previous-values-btn')
        .addEventListener('click', copyPreviousValues);
      document.getElementById('edit-existing-entry-btn')
        .addEventListener('click', function () {
          enterEditMode(document.getElementById('entry-date').value);
        });

      document.getElementById('entries-container')
        .addEventListener('click', handleTableClick);

      document.getElementById('history-filter-form')
        .addEventListener('submit', handleHistoryFilterSubmit);

      document.getElementById('clear-history-filters-btn')
        .addEventListener('click', handleClearHistoryFilters);

      document.getElementById('undo-delete-btn')
        .addEventListener('click', handleUndoDeletion);

      ['history-from-date', 'history-to-date'].forEach(function (id) {
        document.getElementById(id).addEventListener('input', handleHistoryFilterInput);
      });

      document.getElementById('history-trends-section')
        .addEventListener('click', handleHistoryTrendsClick);
      document.getElementById('history-trends-section')
        .addEventListener('pointerover', handleHistoryTrendsPointerOver);
      document.getElementById('history-trends-section')
        .addEventListener('pointerout', handleHistoryTrendsPointerOut);
      document.getElementById('history-trends-section')
        .addEventListener('keydown', handleTrendPointKeydown);
      document.getElementById('history-trends-section')
        .addEventListener('change', handleTrendPointSeriesChange);
      if (window && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', repositionOpenTrendTooltips);
        window.addEventListener('scroll', repositionOpenTrendTooltips, true);
      }

      document.getElementById('trend-custom-form')
        .addEventListener('submit', handleCustomTrendSubmit);
      document.getElementById('trend-custom-type')
        .addEventListener('change', handleCustomTrendTypeChange);
      document.getElementById('trend-custom-resolution')
        .addEventListener('change', handleCustomTrendResolutionChange);
      ['trend-custom-start', 'trend-custom-end', 'trend-custom-month', 'trend-custom-year']
        .forEach(function (id) {
          document.getElementById(id).addEventListener('input', handleCustomTrendDraftInput);
        });

      document.getElementById('trend-comparison-form')
        .addEventListener('submit', handleComparisonTrendSubmit);
      document.getElementById('trend-comparison-type')
        .addEventListener('change', handleComparisonTrendTypeChange);
      document.getElementById('trend-comparison-resolution')
        .addEventListener('change', handleComparisonTrendResolutionChange);
      [
        'trend-comparison-first-month', 'trend-comparison-second-month',
        'trend-comparison-first-year', 'trend-comparison-second-year'
      ].forEach(function (id) {
        document.getElementById(id).addEventListener('input', handleComparisonTrendDraftInput);
      });

      document.getElementById('erase-all-btn')
        .addEventListener('click', handleEraseAll);

      document.getElementById('export-backup-btn')
        .addEventListener('click', handleExportBackup);

      document.getElementById('import-backup-btn')
        .addEventListener('click', handleImportBackup);

      document.getElementById('import-backup-input')
        .addEventListener('change', handleImportFileChange);

      document.getElementById('preview-merge-backup-btn')
        .addEventListener('click', handlePreviewMergeBackup);

      document.getElementById('merge-backup-input')
        .addEventListener('change', handleMergeBackupFileChange);

      document.getElementById('merge-preview')
        .addEventListener('change', handleMergeResolutionChange);
      document.getElementById('merge-preview')
        .addEventListener('click', handleMergePreviewClick);

      document.getElementById('cancel-import-btn')
        .addEventListener('click', handleCancelImport);

      document.getElementById('replace-import-btn')
        .addEventListener('click', handleReplaceImport);

      document.getElementById('cancel-merge-preview-btn')
        .addEventListener('click', handleCancelMergePreview);

      document.getElementById('merge-backup-btn')
        .addEventListener('click', handleMergeBackup);

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
          invalidateMergePreview();
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
        invalidateMergePreview();
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
      const pageButton = event.target.closest('.history-page-btn');
      if (pageButton) {
        changeHistoryPage(Number(pageButton.dataset.historyPageOffset));
        return;
      }
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

      // Record the deleted row's position before the table is rebuilt so
      // focus can be restored to the equivalent row (or heading) afterwards.
      const allBtns     = Array.from(
        document.querySelectorAll('#entries-container .btn-delete')
      );
      const deletedIndex = allBtns.findIndex(function (b) {
        return b.dataset.date === dateToDelete;
      });
      await deleteEntry(dateToDelete, { source: 'history', deletedIndex });
    }

    async function deleteEntry(dateToDelete, options = {}) {
      if (isMutationBlocked() || !storageAdapter || !entries.some(entry => entry.date === dateToDelete)) return;

      let confirmation = 'Delete entry for ' + dateToDelete + '?';
      if (editingDate === dateToDelete && hasUnsavedFormChanges()) {
        confirmation += ' Any unsaved changes to this entry will be lost if deletion succeeds.';
      }
      if (!window.confirm(confirmation)) return;

      const updated = entries.filter(entry => entry.date !== dateToDelete);
      const deletedEntry = getEntryByDate(entries, dateToDelete);
      const source = options.source || 'history';
      const deletedIndex = options.deletedIndex ?? -1;
      let restored = false;
      setBusyState(true);
      try {
        const saved = await storageAdapter.saveEntries(updated);
        if (!saved || !saved.ok) {
          showTableError('Could not delete the entry — storage may be unavailable. Please try again.');
          return;
        }
        entries = updated;
        pendingUndoEntry = deletedEntry;
        invalidateMergePreview();
        clearTableError();
        if (editingDate === dateToDelete) exitEditMode();
        render();
        showUndoStatus('Entry for ' + dateToDelete + ' deleted.', true);
        restored = true;
      } catch (error) {
        showTableError('Could not delete the entry — storage may be unavailable. Please try again.');
      } finally {
        setBusyState(false);
        if (!restored) return;
        if (source === 'calendar') {
          const createButton = document.querySelector('#calendar-details .calendar-detail-action[data-calendar-action="create"]');
          if (createButton && !createButton.disabled) createButton.focus();
          return;
        }
        const newBtns = Array.from(document.querySelectorAll('#entries-container .btn-delete'));
        if (newBtns.length > 0) {
          const focusIndex = Math.min(Math.max(deletedIndex, 0), newBtns.length - 1);
          newBtns[focusIndex].focus();
        } else {
          document.getElementById('entries-heading').focus();
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
        'This will permanently delete ALL saved entries, not only displayed history results. Continue?'
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
        pendingUndoEntry = null;
        invalidateMergePreview();
        clearUndoStatus();
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
