    /* ═══════════════════════════════════════════════════════════════
       DOM RENDERING
       (Read entries array → update the page. No persistence access.)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * renderSummary(entries)
     *
     * Reads the four statistic <dd> elements by ID and sets their textContent.
     *
     * When entries is empty, calcSummary returns null and each cell shows
     * "No entries yet" — never misleading zeros.
     *
     * When entries is non-empty, averages are shown to one decimal place with
     * their units appended as plain text (e.g. "7.5 h", "1.8 L").
     *
     * Does NOT sort the entries — that is calcSummary's responsibility
     * (it sorts internally before slicing to the 7-entry window).
     *
     * @param {Array} entries  The current entries array (not modified).
     */
    function renderSummary(entries) {
      const summary = calcSummary(entries);

      const statCount = document.getElementById('stat-count');
      const statMood  = document.getElementById('stat-mood');
      const statSleep = document.getElementById('stat-sleep');
      const statWater = document.getElementById('stat-water');

      if (summary === null) {
        // Empty state: "No entries yet" in the count cell; em dash in the
        // three average cells so they don't overflow on narrow viewports.
        statCount.textContent = 'No entries yet';
        statMood.textContent  = '—';
        statSleep.textContent = '—';
        statWater.textContent = '—';
      } else {
        // Non-empty: averages formatted to exactly one decimal place via
        // toFixed(1) so "7" displays as "7.0" rather than just "7".
        statCount.textContent = summary.count;
        statMood.textContent  = summary.avgMood.toFixed(1);
        statSleep.textContent = summary.avgSleep.toFixed(1) + ' h';
        statWater.textContent = summary.avgWater.toFixed(1) + ' L';
      }
    }

    function formatMergeMetricValue(metric, value) {
      if (metric === 'sleep') return String(value) + ' h';
      if (metric === 'water') return String(value) + ' L';
      return String(value);
    }

    /**
     * renderMergePreview(analysis, exportedAt, conflictResolutions, candidate, newEntriesPagination)
     *
     * Renders only the supplied, read-only backup merge analysis. It does not
     * choose conflict values, construct a merged collection, or access state.
     */
    function renderMergePreview(analysis, exportedAt, conflictResolutions, candidate, newEntriesPagination) {
      const preview = document.getElementById('merge-preview');
      if (!preview) return;
      conflictResolutions = conflictResolutions || {};
      const summary = document.getElementById('merge-preview-summary');
      const dateRange = document.getElementById('merge-preview-date-range');
      const exportedAtElement = document.getElementById('merge-preview-exported-at');
      const newEmpty = document.getElementById('merge-preview-new-empty');
      const newScroll = document.getElementById('merge-preview-new-scroll');
      const newBody = document.querySelector('#merge-preview-new-table tbody');
      const newPagination = document.getElementById('merge-preview-new-pagination');
      const newPageSummary = document.getElementById('merge-preview-new-page-summary');
      const newPageStatus = document.getElementById('merge-preview-new-page-status');
      const newPrevious = document.getElementById('merge-preview-new-prev');
      const newNext = document.getElementById('merge-preview-new-next');
      const identicalHeading = document.getElementById('merge-preview-identical-heading');
      const identicalList = document.getElementById('merge-preview-identical-list');
      const conflictsEmpty = document.getElementById('merge-preview-conflicts-empty');
      const conflictScroll = document.getElementById('merge-preview-conflicts-scroll');
      const conflictBody = document.querySelector('#merge-preview-conflicts-table tbody');
      const bulkControls = document.getElementById('merge-preview-bulk-controls');
      const conflictControls = document.getElementById('merge-preview-conflict-controls');
      const resolutionStatus = document.getElementById('merge-preview-resolution-status');
      const finalSummary = document.getElementById('merge-preview-final-summary');
      const mergeButton = document.getElementById('merge-backup-btn');

      if (!analysis) {
        preview.hidden = true;
        summary.textContent = '';
        dateRange.textContent = '';
        exportedAtElement.textContent = '';
        newBody.replaceChildren();
        conflictBody.replaceChildren();
        bulkControls.hidden = true;
        conflictControls.replaceChildren();
        resolutionStatus.textContent = '';
        finalSummary.textContent = '';
        mergeButton.disabled = true;
        newPagination.hidden = true;
        newPageSummary.textContent = '';
        newPageStatus.textContent = '';
        return;
      }

      preview.hidden = false;
      summary.textContent = 'Backup contains ' + analysis.totalImportedCount + ' ' +
        (analysis.totalImportedCount === 1 ? 'entry' : 'entries') + ': ' +
        analysis.counts.new + ' new, ' + analysis.counts.identical + ' identical, and ' +
        analysis.counts.conflicting + ' conflicting.';
      dateRange.textContent = analysis.importedDateRange
        ? 'Imported date range: ' + analysis.importedDateRange.startDate + ' to ' + analysis.importedDateRange.endDate + '.'
        : 'The backup contains no dates.';
      exportedAtElement.textContent = exportedAt ? 'Backup exported at ' + exportedAt + '.' : '';

      newBody.replaceChildren();
      const page = newEntriesPagination || paginateEntries(analysis.newEntries, 1, 25);
      const visibleNewEntries = page.entries;
      visibleNewEntries.forEach(function (entry) {
        const row = document.createElement('tr');
        [entry.date, String(entry.mood), formatMergeMetricValue('sleep', entry.sleep),
          formatMergeMetricValue('water', entry.water)].forEach(function (value) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        });
        newBody.appendChild(row);
      });
      newScroll.hidden = analysis.newEntries.length === 0;
      newEmpty.textContent = analysis.newEntries.length === 0
        ? 'No new entries would be added.'
        : '';
      newPagination.hidden = page.totalPages <= 1;
      if (page.totalEntries > 0) {
        const firstItem = ((page.page - 1) * page.pageSize) + 1;
        const lastItem = firstItem + page.entries.length - 1;
        newPageSummary.textContent = 'Showing ' + firstItem + '–' + lastItem +
          ' of ' + page.totalEntries + ' new entries.';
      } else {
        newPageSummary.textContent = '';
      }
      newPageStatus.textContent = page.totalPages > 1
        ? 'Page ' + page.page + ' of ' + page.totalPages
        : '';
      newPrevious.disabled = !page.hasPreviousPage;
      newNext.disabled = !page.hasNextPage;

      identicalHeading.textContent = 'Identical entries (' + analysis.counts.identical + ')';
      identicalList.textContent = analysis.identicalEntries.length === 0
        ? 'No identical entries.'
        : analysis.identicalEntries.map(function (entry) { return entry.date; }).join(', ');

      conflictBody.replaceChildren();
      analysis.conflicts.forEach(function (conflict) {
        ['mood', 'sleep', 'water'].forEach(function (metric) {
          const row = document.createElement('tr');
          const values = [
            conflict.date,
            metric.charAt(0).toUpperCase() + metric.slice(1),
            formatMergeMetricValue(metric, conflict.existingEntry[metric]),
            formatMergeMetricValue(metric, conflict.importedEntry[metric]),
          ];
          values.forEach(function (value) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
          });
          conflictBody.appendChild(row);
        });
      });
      conflictScroll.hidden = analysis.conflicts.length === 0;
      bulkControls.hidden = analysis.conflicts.length === 0;
      conflictsEmpty.textContent = analysis.conflicts.length === 0
        ? 'No conflicting entries require a decision.'
        : 'Both saved and backup values are shown. No version has been selected.';

      conflictControls.replaceChildren();
      analysis.conflicts.forEach(function (conflict) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'merge-conflict-choice';
        const legend = document.createElement('legend');
        legend.textContent = 'Resolution for ' + conflict.date;
        fieldset.appendChild(legend);

        [['keep-existing', 'Keep existing saved values'], ['use-backup', 'Use backup values']]
          .forEach(function (choice, index) {
            const id = 'merge-conflict-' + conflict.date + '-' + index;
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'merge-conflict-' + conflict.date;
            input.id = id;
            input.value = choice[0];
            input.dataset.mergeConflictDate = conflict.date;
            input.checked = conflictResolutions[conflict.date] === choice[0];
            label.htmlFor = id;
            label.appendChild(input);
            const text = document.createElement('span');
            text.textContent = choice[1];
            label.appendChild(text);
            fieldset.appendChild(label);
          });
        conflictControls.appendChild(fieldset);
      });

      const resolvedCount = analysis.conflicts.filter(function (conflict) {
        return conflictResolutions[conflict.date] === 'keep-existing' ||
          conflictResolutions[conflict.date] === 'use-backup';
      }).length;
      resolutionStatus.textContent = analysis.conflicts.length === 0
        ? 'No conflicts need resolution.'
        : resolvedCount + ' of ' + analysis.conflicts.length + ' conflicts resolved.';
      if (!candidate || !candidate.ok) {
        finalSummary.textContent = analysis.conflicts.length === 0
          ? 'The merge is ready to review.'
          : 'Resolve every conflict before confirming the merge.';
        mergeButton.disabled = true;
      } else {
        finalSummary.textContent = 'Merge summary: add ' + candidate.counts.added +
          ' new entries, leave ' + candidate.counts.identical + ' identical entries unchanged, keep ' +
          candidate.counts.keptExisting + ' conflicting entries, and replace ' +
          candidate.counts.replaced + ' conflicting entries, for ' + candidate.entries.length +
          ' entries total. Unrelated existing entries remain.';
        mergeButton.disabled = false;
      }
    }

    /**
     * renderTable(historyState)
     *
     * Clears #entries-container and replaces its content with either:
     *   • an instruction until a range is applied,
     *   • a fully built table containing supplied newest-first results, or
     *   • an empty-range message.
     *
     * All entry values are written via textContent, never concatenated
     * into innerHTML, so user-supplied strings cannot inject HTML.
     *
     * Each Delete button carries:
     *   • class="btn-delete"      — matched by the CSS danger style
     *   • data-date="YYYY-MM-DD"  — used by the delegated click handler
     *                               in the delegated click handler to identify which entry
     *                               to remove
     *   • aria-label              — describes the action to screen readers
     *                               without relying on visible text alone
     *
     * No event listeners are attached here; the app uses a single
     * delegated listener on #entries-container instead.
     *
     * @param {{totalEntryCount: number, appliedRange: Object|null,
     *           matchingCount: number, visibleEntries: Array,
     *           page: number, totalPages: number,
     *           hasPreviousPage: boolean, hasNextPage: boolean}} historyState
     */
    function renderTable(historyState) {
      const container = document.getElementById('entries-container');
      const status = document.getElementById('history-status');
      const totalEntryCount = historyState.totalEntryCount;
      const appliedRange = historyState.appliedRange;
      const matchingCount = historyState.matchingCount;
      const visibleEntries = historyState.visibleEntries;

      // Always start with an empty container so stale content is never
      // left behind after a deletion or erase-all.
      // replaceChildren() with no arguments removes all child nodes without
      // touching innerHTML — it avoids any parse-and-serialise round-trip.
      container.replaceChildren();

      if (!appliedRange) {
        const empty = document.createElement('p');
        empty.className   = 'empty-state';
        empty.textContent = 'Select both dates and choose Show entries to view history.';
        container.appendChild(empty);
        status.textContent = totalEntryCount + ' saved ' +
          (totalEntryCount === 1 ? 'entry.' : 'entries.');
        return;
      }

      status.textContent = 'Showing ' + matchingCount + ' matching ' +
        (matchingCount === 1 ? 'entry' : 'entries') + ' from ' + appliedRange.startDate +
        ' to ' + appliedRange.endDate + '. ' + totalEntryCount + ' saved ' +
        (totalEntryCount === 1 ? 'entry total.' : 'entries total.');

      if (matchingCount === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'No entries match this date range.';
        container.appendChild(empty);
        return;
      }

      // ── Build the table ───────────────────────────────────────────
      // <table>
      const table = document.createElement('table');
      table.className = 'history-table';
      table.setAttribute('aria-label', 'Wellness entry history');

      // ── <thead> ───────────────────────────────────────────────────
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const columns = ['Date', 'Mood', 'Sleep (h)', 'Water (L)', 'Actions'];
      columns.forEach(function (label) {
        const th = document.createElement('th');
        th.setAttribute('scope', 'col');
        if (label === 'Date') th.className = 'history-date-column';
        th.textContent = label;
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // ── <tbody> ───────────────────────────────────────────────────
      const tbody = document.createElement('tbody');

      visibleEntries.forEach(function (entry) {
        const row = document.createElement('tr');

        // Date cell
        const tdDate = document.createElement('td');
        tdDate.className = 'history-date-column';
        tdDate.textContent = entry.date;
        row.appendChild(tdDate);

        // Mood cell
        const tdMood = document.createElement('td');
        tdMood.textContent = entry.mood;
        row.appendChild(tdMood);

        // Sleep cell
        const tdSleep = document.createElement('td');
        tdSleep.textContent = entry.sleep;
        row.appendChild(tdSleep);

        // Water cell
        const tdWater = document.createElement('td');
        tdWater.textContent = entry.water;
        row.appendChild(tdWater);

        // Actions cell — Edit and Delete buttons
        const tdActions = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.type          = 'button';
        editBtn.className     = 'btn-edit';
        editBtn.dataset.date  = entry.date;
        editBtn.textContent   = 'Edit';
        editBtn.setAttribute('aria-label', 'Edit entry for ' + entry.date);
        tdActions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type          = 'button';
        deleteBtn.className     = 'btn-delete';
        deleteBtn.dataset.date  = entry.date;
        deleteBtn.textContent   = 'Delete';
        // aria-label gives screen readers a full description of the action.
        deleteBtn.setAttribute('aria-label', 'Delete entry for ' + entry.date);
        tdActions.appendChild(deleteBtn);
        row.appendChild(tdActions);

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      const tableScroll = document.createElement('div');
      tableScroll.className = 'history-table-scroll';
      tableScroll.appendChild(table);
      container.appendChild(tableScroll);

      const firstDisplayed = (historyState.page - 1) * historyState.pageSize + 1;
      const lastDisplayed = firstDisplayed + visibleEntries.length - 1;
      const pagination = document.createElement('nav');
      pagination.className = 'history-pagination' +
        (historyState.totalPages > 1 ? '' : ' history-pagination-single');
      pagination.setAttribute('aria-label', 'Entry History pagination');
      const pageStatus = document.createElement('span');
      pageStatus.id = 'history-page-status';
      pageStatus.className = 'history-page-status';
      pageStatus.tabIndex = -1;
      pageStatus.setAttribute('aria-live', 'polite');
      pageStatus.textContent = 'Showing ' + firstDisplayed + '–' + lastDisplayed + ' of ' +
        matchingCount + ' matching entries. Page ' + historyState.page + ' of ' + historyState.totalPages + '.';
      if (historyState.totalPages > 1) {
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.id = 'history-previous-page-btn';
        previous.className = 'btn-neutral history-page-btn';
        previous.dataset.historyPageOffset = '-1';
        previous.textContent = 'Previous page';
        previous.disabled = !historyState.hasPreviousPage;
        previous.setAttribute('aria-label', 'Show previous Entry History page');
        pagination.appendChild(previous);
      }
      pagination.appendChild(pageStatus);
      if (historyState.totalPages > 1) {
        const next = document.createElement('button');
        next.type = 'button';
        next.id = 'history-next-page-btn';
        next.className = 'btn-neutral history-page-btn';
        next.dataset.historyPageOffset = '1';
        next.textContent = 'Next page';
        next.disabled = !historyState.hasNextPage;
        next.setAttribute('aria-label', 'Show next Entry History page');
        pagination.appendChild(next);
      }
      container.appendChild(pagination);
    }

    /* ── History and Trends ──────────────────────────────────────── */

    const TREND_CONFIGS = [
      { metric: 'mood', title: 'Mood', min: 1, max: 5, unit: '' },
      { metric: 'sleep', title: 'Sleep', min: 0, max: 24, unit: 'h' },
      { metric: 'water', title: 'Water', min: 0, max: 3, unit: 'L' },
    ];
    const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

    function createSvgElement(name, attributes) {
      const element = document.createElementNS(SVG_NAMESPACE, name);
      Object.keys(attributes || {}).forEach(function (name) {
        element.setAttribute(name, attributes[name]);
      });
      return element;
    }

    function formatTrendDate(dateKey) {
      const date = new Date(0);
      date.setHours(12, 0, 0, 0);
      date.setFullYear(
        Number(dateKey.slice(0, 4)),
        Number(dateKey.slice(5, 7)) - 1,
        Number(dateKey.slice(8, 10))
      );
      return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
    }

    function formatTrendValue(value, unit) {
      if (value === null) return '— Missing';
      return String(value) + (unit ? ' ' + unit : '');
    }

    function appendTrendPointDetailRow(list, label, value) {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      list.appendChild(term);
      list.appendChild(description);
    }

    /**
     * renderTrendPointDetails(metric, detail)
     *
     * Renders one explicitly supplied chart-point selection.  The controller
     * owns the selection and supplies either a daily observation or an
     * aggregated period; this function never reads chart or application state.
     */
    function renderTrendPointDetails(metric, detail, pinned) {
      const panel = document.getElementById('trend-point-details-' + metric);
      if (!panel) return;
      panel.replaceChildren();
      if (!detail) {
        panel.hidden = true;
        panel.removeAttribute('data-pinned');
        return;
      }

      const config = TREND_CONFIGS.find(function (candidate) {
        return candidate.metric === metric;
      });
      if (!config) return;
      panel.dataset.pinned = pinned !== false ? 'true' : 'false';

      const heading = document.createElement('h4');
      heading.textContent = detail.type === 'aggregated'
        ? config.title + ' period average'
        : config.title + ' observation';
      panel.appendChild(heading);

      const list = document.createElement('dl');
      list.className = 'trend-point-details-list';
      if (detail.series) {
        appendTrendPointDetailRow(
          list,
          'Comparison period',
          (detail.series === 'first' ? 'First period: ' : 'Second period: ') +
            (detail.seriesLabel || detail.periodLabel)
        );
      }
      if (detail.type === 'aggregated') {
        appendTrendPointDetailRow(list, 'Period', detail.label || detail.key);
        appendTrendPointDetailRow(list, 'Date range', detail.startDate + ' to ' + detail.endDate);
        appendTrendPointDetailRow(
          list, 'Average', formatAggregatedTrendValue(detail.value, config.unit)
        );
        appendTrendPointDetailRow(list, 'Recorded days', String(detail.recordedDayCount));
        if (pinned !== false) {
          appendTrendPointDetailRow(list, 'Calendar days', String(detail.calendarDayCount));
        }
        panel.appendChild(list);
        if (pinned !== false) {
          const note = document.createElement('p');
          note.textContent = 'This value is an average of the recorded days in the period.';
          panel.appendChild(note);
        }
      } else {
        appendTrendPointDetailRow(list, 'Date', detail.date);
        appendTrendPointDetailRow(list, 'Value', formatTrendValue(detail.value, config.unit));
        panel.appendChild(list);
        if (pinned !== false) {
          const historyButton = document.createElement('button');
          historyButton.type = 'button';
          historyButton.className = 'trend-point-history-action btn-neutral';
          historyButton.dataset.historyDate = detail.date;
          historyButton.textContent = 'Show entry in History';
          historyButton.setAttribute('aria-label', 'Show entry for ' + detail.date + ' in History');
          panel.appendChild(historyButton);
        }
      }
      panel.hidden = false;
    }

    function appendTrendPointExplorer(card, config, populatedCount, pointType, periodLabels) {
      if (periodLabels) {
        const seriesField = document.createElement('div');
        seriesField.className = 'trend-comparison-series-field';
        const seriesLabel = document.createElement('label');
        seriesLabel.setAttribute('for', 'trend-comparison-series-' + config.metric);
        seriesLabel.textContent = 'Explore series';
        const seriesSelect = document.createElement('select');
        seriesSelect.id = 'trend-comparison-series-' + config.metric;
        seriesSelect.className = 'trend-comparison-series-select';
        seriesSelect.dataset.chartExplorerMetric = config.metric;
        [
          ['first', 'First period — ' + comparisonPeriodLabel(periodLabels, 'firstPeriodLabel')],
          ['second', 'Second period — ' + comparisonPeriodLabel(periodLabels, 'secondPeriodLabel')],
        ].forEach(function (optionData) {
          const option = document.createElement('option');
          option.value = optionData[0];
          option.textContent = optionData[1];
          seriesSelect.appendChild(option);
        });
        seriesField.appendChild(seriesLabel);
        seriesField.appendChild(seriesSelect);
        card.appendChild(seriesField);
      }

      const explorer = document.createElement('button');
      explorer.type = 'button';
      explorer.className = 'trend-chart-explorer btn-neutral';
      explorer.dataset.chartExplorerMetric = config.metric;
      explorer.setAttribute('aria-controls', 'trend-point-details-' + config.metric);
      explorer.setAttribute(
        'aria-label',
        'Explore ' + config.title + (periodLabels ? ' comparison ' : ' ') +
        'observations. Use Left and Right arrow keys to move between recorded points.'
      );
      explorer.textContent = populatedCount > 0 ? 'Explore' : 'No points';
      explorer.disabled = populatedCount === 0;
      card.appendChild(explorer);

      const details = document.createElement('section');
      details.className = 'trend-point-tooltip';
      details.id = 'trend-point-details-' + config.metric;
      details.hidden = true;
      details.setAttribute('aria-live', 'polite');
      details.dataset.metric = config.metric;
      details.dataset.pointType = pointType;
      card.appendChild(details);
    }

    function renderTrendChart(container, config, series) {
      const card = document.createElement('section');
      card.className = 'trend-chart-card';
      card.dataset.metric = config.metric;

      const heading = document.createElement('h3');
      heading.textContent = config.title + (config.unit ? ' (' + config.unit + ')' : ' (1–5)');
      card.appendChild(heading);

      const svg = createSvgElement('svg', {
        class: 'trend-chart',
        viewBox: '0 0 320 180',
        role: 'img',
        'aria-labelledby': 'trend-' + config.metric + '-title trend-' + config.metric + '-description',
        'data-metric': config.metric,
      });
      const title = createSvgElement('title', { id: 'trend-' + config.metric + '-title' });
      title.textContent = config.title + ' trend';
      svg.appendChild(title);
      const description = createSvgElement('desc', { id: 'trend-' + config.metric + '-description' });
      const populatedPoints = series.points.filter(function (point) { return point.value !== null; });
      description.textContent = populatedPoints.length === 0
        ? 'No recorded ' + config.title.toLowerCase() + ' values from ' + series.startDate +
          ' to ' + series.endDate + '.'
        : config.title + ' values from ' + series.startDate + ' to ' + series.endDate +
          '. Missing dates are shown as gaps.';
      svg.appendChild(description);

      const left = 38;
      const top = 18;
      const width = 266;
      const height = 118;
      const bottom = top + height;
      const xFor = function (index) {
        return series.points.length <= 1
          ? left + width / 2
          : left + (index / (series.points.length - 1)) * width;
      };
      const yFor = function (value) {
        return top + ((config.max - value) / (config.max - config.min)) * height;
      };

      [config.max, config.min].forEach(function (value) {
        const y = yFor(value);
        svg.appendChild(createSvgElement('line', {
          class: 'trend-grid-line', x1: left, y1: y, x2: left + width, y2: y,
        }));
        const label = createSvgElement('text', {
          class: 'trend-axis-label', x: left - 5, y: y + 3, 'text-anchor': 'end',
        });
        label.textContent = String(value) + (config.unit ? ' ' + config.unit : '');
        svg.appendChild(label);
      });
      svg.appendChild(createSvgElement('line', {
        class: 'trend-axis', x1: left, y1: top, x2: left, y2: bottom,
      }));
      svg.appendChild(createSvgElement('line', {
        class: 'trend-axis', x1: left, y1: bottom, x2: left + width, y2: bottom,
      }));

      const labelIndexes = [0, Math.floor((series.points.length - 1) / 2), series.points.length - 1];
      labelIndexes.filter(function (index, position, all) {
        return all.indexOf(index) === position;
      }).forEach(function (index) {
        const isFirst = index === labelIndexes[0];
        const isLast = index === labelIndexes[labelIndexes.length - 1];
        const label = createSvgElement('text', {
          class: 'trend-axis-label', x: xFor(index), y: bottom + 17,
          'text-anchor': isFirst ? 'start' : (isLast ? 'end' : 'middle'),
        });
        label.textContent = formatTrendDate(series.points[index].date);
        svg.appendChild(label);
      });

      if (populatedPoints.length === 0) {
        const emptyLabel = createSvgElement('text', {
          class: 'trend-empty-label', x: left + width / 2, y: top + height / 2,
        });
        emptyLabel.textContent = 'No recorded values in this period';
        svg.appendChild(emptyLabel);
      } else {
        let segment = [];
        const appendSegment = function () {
          if (segment.length > 1) {
            const path = createSvgElement('path', {
              class: 'trend-line',
              d: segment.map(function (point, index) {
                return (index === 0 ? 'M ' : 'L ') + xFor(point.index) + ' ' + yFor(point.value);
              }).join(' '),
              'data-trend-segment': String(segment.length),
            });
            svg.appendChild(path);
          }
          segment = [];
        };

        series.points.forEach(function (point, index) {
          if (point.value === null) {
            appendSegment();
            return;
          }
          segment.push({ index, value: point.value });
        });
        appendSegment();

        series.points.forEach(function (point, index) {
          if (point.value === null) return;
          svg.appendChild(createSvgElement('circle', {
            class: 'trend-point',
            cx: xFor(index), cy: yFor(point.value), r: 3,
            'data-date': point.date, 'data-value': point.value,
            'data-point-index': index, 'data-point-type': 'daily',
            'data-metric': config.metric,
            'data-interactive-point': 'true',
          }));
        });
      }

      card.appendChild(svg);
      appendTrendPointExplorer(card, config, populatedPoints.length, 'daily');
      container.appendChild(card);
    }

    function comparisonPeriodLabel(periodLabels, key) {
      const label = periodLabels && periodLabels[key];
      return typeof label === 'string' && label ? label : (key === 'firstPeriodLabel' ? 'First period' : 'Second period');
    }

    function appendComparisonLegend(card, config, periodLabels, firstCount, secondCount) {
      const legend = document.createElement('ul');
      legend.className = 'trend-comparison-legend';
      legend.setAttribute('aria-label', config.title + ' comparison legend');
      [
        ['first', comparisonPeriodLabel(periodLabels, 'firstPeriodLabel'), firstCount],
        ['second', comparisonPeriodLabel(periodLabels, 'secondPeriodLabel'), secondCount],
      ].forEach(function (series) {
        const item = document.createElement('li');
        const indicator = document.createElement('span');
        indicator.className = 'trend-comparison-legend-line trend-comparison-legend-line-' + series[0];
        indicator.setAttribute('aria-hidden', 'true');
        const description = document.createElement('span');
        description.textContent = series[1] + ' — ' +
          (series[0] === 'first' ? 'solid line' : 'dashed line') +
          (series[2] === 0 ? ' (no recorded values)' : '');
        item.appendChild(indicator);
        item.appendChild(description);
        legend.appendChild(item);
      });
      card.appendChild(legend);
    }

    function appendComparisonSeries(svg, points, xFor, yFor, seriesName, periodLabels, resolution) {
      let segment = [];
      const valueKey = seriesName === 'first' ? 'firstValue' : 'secondValue';
      const dateKey = seriesName === 'first' ? 'firstDate' : 'secondDate';
      const startDateKey = seriesName === 'first' ? 'firstStartDate' : 'secondStartDate';
      const endDateKey = seriesName === 'first' ? 'firstEndDate' : 'secondEndDate';
      const recordedCountKey = seriesName === 'first'
        ? 'firstRecordedDayCount' : 'secondRecordedDayCount';
      const calendarCountKey = seriesName === 'first'
        ? 'firstCalendarDayCount' : 'secondCalendarDayCount';
      const pointType = resolution === 'weekly' || resolution === 'monthly'
        ? 'aggregated' : 'daily';
      const hasSourceDate = function (point) {
        const date = point[dateKey];
        const startDate = point[startDateKey];
        return date !== null && date !== undefined || startDate !== null && startDate !== undefined;
      };
      const appendSegment = function () {
        if (segment.length > 1) {
          const path = createSvgElement('path', {
            class: 'trend-comparison-line trend-comparison-line-' + seriesName,
            d: segment.map(function (point, index) {
              return (index === 0 ? 'M ' : 'L ') + xFor(point.index) + ' ' + yFor(point.value);
            }).join(' '),
            'data-comparison-series': seriesName,
            'data-trend-segment': String(segment.length),
          });
          svg.appendChild(path);
        }
        segment = [];
      };

      points.forEach(function (point, index) {
        if (!hasSourceDate(point) || point[valueKey] === null) {
          appendSegment();
          return;
        }
        segment.push({ index, value: point[valueKey] });
      });
      appendSegment();

      points.forEach(function (point, index) {
        if (!hasSourceDate(point) || point[valueKey] === null) return;
        const sourceDate = point[dateKey] === undefined ? point[startDateKey] : point[dateKey];
        svg.appendChild(createSvgElement('circle', {
          class: 'trend-comparison-point trend-comparison-point-' + seriesName,
          cx: xFor(index), cy: yFor(point[valueKey]), r: 3,
          'data-comparison-series': seriesName,
          'data-alignment-key': point.key,
          'data-date': sourceDate || '',
          'data-start-date': point[startDateKey] || sourceDate || '',
          'data-end-date': point[endDateKey] || sourceDate || '',
          'data-value': point[valueKey],
          'data-recorded-day-count': point[recordedCountKey] === undefined
            ? '' : point[recordedCountKey],
          'data-calendar-day-count': point[calendarCountKey] === undefined
            ? '' : point[calendarCountKey],
          'data-point-index': index,
          'data-point-type': pointType,
          'data-interactive-point': 'true',
          'data-metric': svg.dataset.metric,
          'data-period-label': point.label || point.key,
          'data-series-label': comparisonPeriodLabel(
            periodLabels, seriesName === 'first' ? 'firstPeriodLabel' : 'secondPeriodLabel'
          ),
        }));
      });
    }

    function comparisonAxisTicks(series, resolution) {
      if (resolution === 'monthly') {
        return ['01', '04', '07', '10', '12'].map(function (key) {
          return {
            index: series.points.findIndex(function (point) { return point.key === key; }),
            label: { '01': 'Jan', '04': 'Apr', '07': 'Jul', '10': 'Oct', '12': 'Dec' }[key],
          };
        }).filter(function (tick) { return tick.index >= 0; });
      }
      if (resolution === 'weekly') {
        const firstStartDate = series.points.length > 0 ? series.points[0].firstStartDate : null;
        const firstYear = firstStartDate ? firstStartDate.slice(0, 4) : null;
        return [
          ['01-01', 'Jan'], ['04-01', 'Apr'], ['07-01', 'Jul'],
          ['10-01', 'Oct'], ['12-01', 'Dec'],
        ].map(function (tick) {
          const targetDate = firstYear ? firstYear + '-' + tick[0] : null;
          return {
            index: targetDate
              ? series.points.findIndex(function (point) {
                return point.firstStartDate <= targetDate && point.firstEndDate >= targetDate;
              })
              : -1,
            label: tick[1],
          };
        }).filter(function (tick) { return tick.index >= 0; });
      }
      if (series.alignment === 'month-day') {
        const yearTicks = [
          ['01-01', 'Jan'],
          ['04-01', 'Apr'],
          ['07-01', 'Jul'],
          ['10-01', 'Oct'],
          ['12-01', 'Dec'],
        ].map(function (tick) {
          return {
            index: series.points.findIndex(function (point) { return point.key === tick[0]; }),
            label: tick[1],
          };
        }).filter(function (tick) { return tick.index >= 0; });
        if (yearTicks.length === 5) return yearTicks;
      }

      const indexes = series.points.length === 0
        ? []
        : [0, Math.floor((series.points.length - 1) / 2), series.points.length - 1];
      return indexes.filter(function (index, position, all) {
        return index >= 0 && all.indexOf(index) === position;
      }).map(function (index) {
        return { index, label: series.points[index].label || series.points[index].key };
      });
    }

    function renderComparisonTrendChart(container, config, series, periodLabels, resolution) {
      const card = document.createElement('section');
      card.className = 'trend-chart-card';
      card.dataset.metric = config.metric;

      const heading = document.createElement('h3');
      const resolutionLabel = resolution === 'weekly' ? ' — Weekly averages'
        : resolution === 'monthly' ? ' — Monthly averages' : '';
      heading.textContent = config.title + (config.unit ? ' (' + config.unit + ')' : ' (1–5)') + resolutionLabel;
      card.appendChild(heading);

      const firstCount = series.points.filter(function (point) {
        const sourceDate = point.firstDate === undefined ? point.firstStartDate : point.firstDate;
        return sourceDate !== null && sourceDate !== undefined && point.firstValue !== null;
      }).length;
      const secondCount = series.points.filter(function (point) {
        const sourceDate = point.secondDate === undefined ? point.secondStartDate : point.secondDate;
        return sourceDate !== null && sourceDate !== undefined && point.secondValue !== null;
      }).length;
      appendComparisonLegend(card, config, periodLabels, firstCount, secondCount);

      const svg = createSvgElement('svg', {
        class: 'trend-chart',
        viewBox: '0 0 320 180',
        role: 'img',
        'aria-labelledby': 'trend-comparison-' + config.metric + '-title trend-comparison-' + config.metric + '-description',
        'data-metric': config.metric,
      });
      const title = createSvgElement('title', { id: 'trend-comparison-' + config.metric + '-title' });
      title.textContent = config.title + ' comparison trend';
      svg.appendChild(title);
      const description = createSvgElement('desc', { id: 'trend-comparison-' + config.metric + '-description' });
      const firstLabel = comparisonPeriodLabel(periodLabels, 'firstPeriodLabel');
      const secondLabel = comparisonPeriodLabel(periodLabels, 'secondPeriodLabel');
      description.textContent = firstCount === 0 && secondCount === 0
        ? 'No recorded ' + config.title.toLowerCase() + ' values in either period.'
        : firstCount === 0
          ? 'Only ' + secondLabel + ' has recorded ' + config.title.toLowerCase() + ' values.'
          : secondCount === 0
            ? 'Only ' + firstLabel + ' has recorded ' + config.title.toLowerCase() + ' values.'
            : 'Comparing ' + firstLabel + ' and ' + secondLabel + '. Missing dates are shown as gaps.';
      svg.appendChild(description);

      const left = 38;
      const top = 18;
      const width = 266;
      const height = 118;
      const bottom = top + height;
      const xFor = function (index) {
        return series.points.length <= 1
          ? left + width / 2
          : left + (index / (series.points.length - 1)) * width;
      };
      const yFor = function (value) {
        return top + ((config.max - value) / (config.max - config.min)) * height;
      };

      [config.max, config.min].forEach(function (value) {
        const y = yFor(value);
        svg.appendChild(createSvgElement('line', {
          class: 'trend-grid-line', x1: left, y1: y, x2: left + width, y2: y,
        }));
        const label = createSvgElement('text', {
          class: 'trend-axis-label', x: left - 5, y: y + 3, 'text-anchor': 'end',
        });
        label.textContent = String(value) + (config.unit ? ' ' + config.unit : '');
        svg.appendChild(label);
      });
      svg.appendChild(createSvgElement('line', {
        class: 'trend-axis', x1: left, y1: top, x2: left, y2: bottom,
      }));
      svg.appendChild(createSvgElement('line', {
        class: 'trend-axis', x1: left, y1: bottom, x2: left + width, y2: bottom,
      }));

      const axisTicks = comparisonAxisTicks(series, resolution);
      axisTicks.forEach(function (tick, position) {
        const isFirst = position === 0;
        const isLast = position === axisTicks.length - 1;
        const label = createSvgElement('text', {
          class: 'trend-axis-label', x: xFor(tick.index), y: bottom + 17,
          'text-anchor': isFirst ? 'start' : (isLast ? 'end' : 'middle'),
        });
        label.textContent = tick.label;
        svg.appendChild(label);
      });

      if (firstCount === 0 && secondCount === 0) {
        const emptyLabel = createSvgElement('text', {
          class: 'trend-empty-label', x: left + width / 2, y: top + height / 2,
        });
        emptyLabel.textContent = 'No recorded values in either period';
        svg.appendChild(emptyLabel);
      } else {
        appendComparisonSeries(svg, series.points, xFor, yFor, 'first', periodLabels, resolution);
        appendComparisonSeries(svg, series.points, xFor, yFor, 'second', periodLabels, resolution);
      }

      card.appendChild(svg);
      appendTrendPointExplorer(card, config, firstCount + secondCount,
        resolution === 'weekly' || resolution === 'monthly' ? 'aggregated' : 'daily', periodLabels);
      container.appendChild(card);
    }

    function formatComparisonTrendValue(date, value, unit) {
      if (date === null) return 'Not in period';
      if (value === null) return 'Missing';
      return String(value) + (unit ? ' ' + unit : '');
    }

    function prepareTrendDataTableContainer(container) {
      if (container.classList) {
        container.classList.add('trend-data-table-host');
      }
      container.replaceChildren();
    }

    function appendTrendDataTableFrame(container, table, hintText, hintId) {
      const scrollRegion = document.createElement('div');
      scrollRegion.className = 'trend-data-table-scroll-region';
      scrollRegion.setAttribute('aria-describedby', hintId);
      scrollRegion.appendChild(table);
      container.appendChild(scrollRegion);

      const scrollHint = document.createElement('p');
      scrollHint.id = hintId;
      scrollHint.className = 'trend-table-scroll-hint';
      scrollHint.setAttribute('role', 'note');
      scrollHint.textContent = hintText;
      table.setAttribute('aria-describedby', hintId);
      container.appendChild(scrollHint);
    }

    function renderComparisonTrendDataTable(seriesByMetric, periodLabels) {
      const container = document.getElementById('trend-data-table-container');
      prepareTrendDataTableContainer(container);
      const firstLabel = comparisonPeriodLabel(periodLabels, 'firstPeriodLabel');
      const secondLabel = comparisonPeriodLabel(periodLabels, 'secondPeriodLabel');
      const table = document.createElement('table');
      table.className = 'trend-data-table trend-comparison-data-table';
      table.setAttribute('aria-label', 'Exact comparison chart data');
      const caption = document.createElement('caption');
      caption.textContent = 'Exact comparison values. “Missing” means no entry was saved for a valid date. “Not in period” means that date does not exist in that period.';
      table.appendChild(caption);
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Alignment', firstLabel + ' Mood', secondLabel + ' Mood', firstLabel + ' Sleep (h)',
        secondLabel + ' Sleep (h)', firstLabel + ' Water (L)', secondLabel + ' Water (L)']
        .forEach(function (label) {
          const heading = document.createElement('th');
          heading.setAttribute('scope', 'col');
          heading.textContent = label;
          headerRow.appendChild(heading);
        });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      const pointsByMetric = {};
      TREND_CONFIGS.forEach(function (config) {
        pointsByMetric[config.metric] = new Map(
          seriesByMetric[config.metric].points.map(function (point) { return [point.key, point]; })
        );
      });
      seriesByMetric.mood.points.forEach(function (moodPoint) {
        const sleepPoint = pointsByMetric.sleep.get(moodPoint.key);
        const waterPoint = pointsByMetric.water.get(moodPoint.key);
        const row = document.createElement('tr');
        const alignment = document.createElement('td');
        alignment.textContent = moodPoint.label || moodPoint.key;
        row.appendChild(alignment);
        [
          [moodPoint.firstDate, moodPoint.firstValue, ''],
          [moodPoint.secondDate, moodPoint.secondValue, ''],
          [sleepPoint.firstDate, sleepPoint.firstValue, 'h'],
          [sleepPoint.secondDate, sleepPoint.secondValue, 'h'],
          [waterPoint.firstDate, waterPoint.firstValue, 'L'],
          [waterPoint.secondDate, waterPoint.secondValue, 'L'],
        ].forEach(function (valueAndUnit) {
          const cell = document.createElement('td');
          cell.textContent = formatComparisonTrendValue(valueAndUnit[0], valueAndUnit[1], valueAndUnit[2]);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      appendTrendDataTableFrame(
        container,
        table,
        'Scroll horizontally or vertically to view all comparison columns and rows. The Alignment column stays visible.',
        'trend-comparison-table-hint'
      );
    }

    function formatAggregatedTrendValue(value, unit) {
      if (value === null) return 'Missing';
      const formatted = Number(value.toFixed(1)).toString();
      return formatted + (unit ? ' ' + unit : '');
    }

    function aggregatedYearAxisTicks(series, resolution) {
      const ticks = [
        ['01-01', '01', 'Jan'],
        ['04-01', '04', 'Apr'],
        ['07-01', '07', 'Jul'],
        ['10-01', '10', 'Oct'],
        ['12-01', '12', 'Dec'],
      ];
      return ticks.map(function (tick) {
        const index = resolution === 'monthly'
          ? series.points.findIndex(function (point) { return point.key === tick[1]; })
          : series.points.findIndex(function (point) {
            const targetDate = String(series.year).padStart(4, '0') + '-' + tick[0];
            return point.startDate <= targetDate && point.endDate >= targetDate;
          });
        return { index, label: tick[2] };
      }).filter(function (tick) { return tick.index >= 0; });
    }

    function renderAggregatedYearTrendChart(container, config, series, year, resolution) {
      const card = document.createElement('section');
      card.className = 'trend-chart-card';
      card.dataset.metric = config.metric;

      const heading = document.createElement('h3');
      const resolutionLabel = resolution === 'weekly' ? 'Weekly averages' : 'Monthly averages';
      heading.textContent = config.title +
        (config.unit ? ' (' + config.unit + ')' : ' (1–5)') + ' — ' + resolutionLabel;
      card.appendChild(heading);

      const svg = createSvgElement('svg', {
        class: 'trend-chart',
        viewBox: '0 0 320 180',
        role: 'img',
        'aria-labelledby': 'trend-year-' + config.metric + '-title trend-year-' + config.metric + '-description',
        'data-metric': config.metric,
        'data-resolution': resolution,
        'data-year': String(year).padStart(4, '0'),
      });
      const title = createSvgElement('title', { id: 'trend-year-' + config.metric + '-title' });
      title.textContent = config.title + ' ' + resolutionLabel.toLowerCase() + ' for ' +
        String(year).padStart(4, '0');
      svg.appendChild(title);
      const description = createSvgElement('desc', {
        id: 'trend-year-' + config.metric + '-description',
      });
      const populatedPoints = series.points.filter(function (point) {
        return point.value !== null;
      });
      description.textContent = populatedPoints.length === 0
        ? 'No recorded ' + config.title.toLowerCase() + ' values in ' +
          String(year).padStart(4, '0') + '.'
        : resolutionLabel + ' for ' + config.title.toLowerCase() + ' in ' +
          String(year).padStart(4, '0') + '. Missing periods are shown as gaps.';
      svg.appendChild(description);

      const left = 38;
      const top = 18;
      const width = 266;
      const height = 118;
      const bottom = top + height;
      const xFor = function (index) {
        return series.points.length <= 1
          ? left + width / 2
          : left + (index / (series.points.length - 1)) * width;
      };
      const yFor = function (value) {
        return top + ((config.max - value) / (config.max - config.min)) * height;
      };

      [config.max, config.min].forEach(function (value) {
        const y = yFor(value);
        svg.appendChild(createSvgElement('line', {
          class: 'trend-grid-line', x1: left, y1: y, x2: left + width, y2: y,
        }));
        const label = createSvgElement('text', {
          class: 'trend-axis-label', x: left - 5, y: y + 3, 'text-anchor': 'end',
        });
        label.textContent = String(value) + (config.unit ? ' ' + config.unit : '');
        svg.appendChild(label);
      });
      svg.appendChild(createSvgElement('line', {
        class: 'trend-axis', x1: left, y1: top, x2: left, y2: bottom,
      }));
      svg.appendChild(createSvgElement('line', {
        class: 'trend-axis', x1: left, y1: bottom, x2: left + width, y2: bottom,
      }));

      const axisTicks = aggregatedYearAxisTicks(series, resolution);
      axisTicks.forEach(function (tick, position) {
        const label = createSvgElement('text', {
          class: 'trend-axis-label',
          x: xFor(tick.index),
          y: bottom + 17,
          'text-anchor': position === 0 ? 'start' :
            (position === axisTicks.length - 1 ? 'end' : 'middle'),
        });
        label.textContent = tick.label;
        svg.appendChild(label);
      });

      if (populatedPoints.length === 0) {
        const emptyLabel = createSvgElement('text', {
          class: 'trend-empty-label', x: left + width / 2, y: top + height / 2,
        });
        emptyLabel.textContent = 'No recorded values in this year';
        svg.appendChild(emptyLabel);
      } else {
        let segment = [];
        const appendSegment = function () {
          if (segment.length > 1) {
            svg.appendChild(createSvgElement('path', {
              class: 'trend-line trend-aggregated-year-line',
              d: segment.map(function (point, index) {
                return (index === 0 ? 'M ' : 'L ') +
                  xFor(point.index) + ' ' + yFor(point.value);
              }).join(' '),
              'data-trend-segment': String(segment.length),
            }));
          }
          segment = [];
        };

        series.points.forEach(function (point, index) {
          if (point.value === null) {
            appendSegment();
            return;
          }
          segment.push({ index, value: point.value });
        });
        appendSegment();

        series.points.forEach(function (point, index) {
          if (point.value === null) return;
          svg.appendChild(createSvgElement('circle', {
            class: 'trend-point trend-aggregated-year-point',
            cx: xFor(index),
            cy: yFor(point.value),
            r: 3,
            'data-period-key': point.key,
            'data-period-label': point.label || point.key,
            'data-start-date': point.startDate,
            'data-end-date': point.endDate,
            'data-value': point.value,
            'data-recorded-day-count': point.recordedDayCount,
            'data-calendar-day-count': point.calendarDayCount,
            'data-point-index': index,
            'data-point-type': 'aggregated',
            'data-metric': config.metric,
            'data-interactive-point': 'true',
          }));
        });
      }

      card.appendChild(svg);
      appendTrendPointExplorer(card, config, populatedPoints.length, 'aggregated');
      container.appendChild(card);
    }

    function renderAggregatedYearDataTable(seriesByMetric, year, resolution) {
      const container = document.getElementById('trend-data-table-container');
      prepareTrendDataTableContainer(container);
      const table = document.createElement('table');
      table.className = 'trend-data-table trend-aggregated-data-table';
      table.setAttribute(
        'aria-label',
        'Exact ' + resolution + ' aggregated chart data for ' + String(year).padStart(4, '0')
      );
      const caption = document.createElement('caption');
      caption.textContent = (resolution === 'weekly' ? 'Weekly' : 'Monthly') +
        ' averages for ' + String(year).padStart(4, '0') +
        '. Missing means no entries were recorded in that period.';
      table.appendChild(caption);
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      [
        'Period', 'Date range', 'Recorded days', 'Calendar days',
        'Mood average', 'Sleep average (h)', 'Water average (L)',
      ].forEach(function (label) {
        const heading = document.createElement('th');
        heading.setAttribute('scope', 'col');
        heading.textContent = label;
        headerRow.appendChild(heading);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      seriesByMetric.mood.points.forEach(function (moodPoint, index) {
        const sleepPoint = seriesByMetric.sleep.points[index];
        const waterPoint = seriesByMetric.water.points[index];
        const row = document.createElement('tr');
        const period = document.createElement('th');
        period.setAttribute('scope', 'row');
        period.textContent = moodPoint.label || moodPoint.key;
        row.appendChild(period);
        [
          moodPoint.startDate + ' to ' + moodPoint.endDate,
          moodPoint.recordedDayCount,
          moodPoint.calendarDayCount,
          formatAggregatedTrendValue(moodPoint.value, ''),
          formatAggregatedTrendValue(sleepPoint.value, 'h'),
          formatAggregatedTrendValue(waterPoint.value, 'L'),
        ].forEach(function (value) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      appendTrendDataTableFrame(
        container,
        table,
        'Scroll horizontally or vertically to view all columns and rows. The headings and Period column stay visible.',
        'trend-aggregated-year-table-hint'
      );
    }

    function renderAggregatedComparisonDataTable(seriesByMetric, periodLabels, resolution) {
      const container = document.getElementById('trend-data-table-container');
      prepareTrendDataTableContainer(container);
      const firstLabel = comparisonPeriodLabel(periodLabels, 'firstPeriodLabel');
      const secondLabel = comparisonPeriodLabel(periodLabels, 'secondPeriodLabel');
      const table = document.createElement('table');
      table.className = 'trend-data-table trend-comparison-data-table trend-aggregated-data-table';
      table.setAttribute('aria-label', 'Exact aggregated comparison chart data');
      const caption = document.createElement('caption');
      caption.textContent = (resolution === 'weekly' ? 'Weekly' : 'Monthly') +
        ' averages. Missing means no entries were recorded in that period.';
      table.appendChild(caption);
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      [
        'Period', firstLabel + ' dates', secondLabel + ' dates',
        firstLabel + ' recorded days', secondLabel + ' recorded days',
        firstLabel + ' calendar days', secondLabel + ' calendar days',
        firstLabel + ' Mood', secondLabel + ' Mood',
        firstLabel + ' Sleep (h)', secondLabel + ' Sleep (h)',
        firstLabel + ' Water (L)', secondLabel + ' Water (L)',
      ].forEach(function (label) {
        const heading = document.createElement('th');
        heading.setAttribute('scope', 'col');
        heading.textContent = label;
        headerRow.appendChild(heading);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      seriesByMetric.mood.points.forEach(function (moodPoint, index) {
        const sleepPoint = seriesByMetric.sleep.points[index];
        const waterPoint = seriesByMetric.water.points[index];
        const row = document.createElement('tr');
        const cells = [
          moodPoint.label || moodPoint.key,
          moodPoint.firstStartDate + ' to ' + moodPoint.firstEndDate,
          moodPoint.secondStartDate + ' to ' + moodPoint.secondEndDate,
          moodPoint.firstRecordedDayCount,
          moodPoint.secondRecordedDayCount,
          moodPoint.firstCalendarDayCount,
          moodPoint.secondCalendarDayCount,
          formatAggregatedTrendValue(moodPoint.firstValue, ''),
          formatAggregatedTrendValue(moodPoint.secondValue, ''),
          formatAggregatedTrendValue(sleepPoint.firstValue, 'h'),
          formatAggregatedTrendValue(sleepPoint.secondValue, 'h'),
          formatAggregatedTrendValue(waterPoint.firstValue, 'L'),
          formatAggregatedTrendValue(waterPoint.secondValue, 'L'),
        ];
        cells.forEach(function (value) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      appendTrendDataTableFrame(
        container,
        table,
        'Scroll horizontally or vertically to view all columns and rows. The headings and Period column stay visible.',
        'trend-aggregated-table-hint'
      );
    }

    /**
     * renderComparisonCharts(seriesByMetric, periodLabels)
     *
     * Renders pure month/year comparison series supplied by the controller.
     * It has no access to controller state, storage, or comparison controls.
     *
     * @param {{mood: Object, sleep: Object, water: Object}} seriesByMetric
     * @param {{firstPeriodLabel: string, secondPeriodLabel: string}} periodLabels
     */
    function renderComparisonCharts(seriesByMetric, periodLabels) {
      const chartList = document.getElementById('trend-chart-list');
      chartList.replaceChildren();
      TREND_CONFIGS.forEach(function (config) {
        renderComparisonTrendChart(chartList, config, seriesByMetric[config.metric], periodLabels);
      });
      renderComparisonTrendDataTable(seriesByMetric, periodLabels);
    }

    /**
     * Renders weekly or monthly aggregated year comparisons supplied by the
     * controller. Calculations remain in core.js; this function only presents
     * the explicit series and their recorded/calendar-day metadata.
     */
    function renderAggregatedComparisonCharts(seriesByMetric, periodLabels, resolution) {
      if (resolution !== 'weekly' && resolution !== 'monthly') return;
      const chartList = document.getElementById('trend-chart-list');
      chartList.replaceChildren();
      TREND_CONFIGS.forEach(function (config) {
        renderComparisonTrendChart(
          chartList, config, seriesByMetric[config.metric], periodLabels, resolution
        );
      });
      renderAggregatedComparisonDataTable(seriesByMetric, periodLabels, resolution);
    }

    /**
     * Renders weekly or monthly aggregates for one complete calendar year.
     * The caller supplies prepared series; this function performs no data
     * aggregation and has no access to controller state or storage.
     */
    function renderAggregatedYearCharts(seriesByMetric, year, resolution) {
      if (resolution !== 'weekly' && resolution !== 'monthly') return;
      const chartList = document.getElementById('trend-chart-list');
      chartList.replaceChildren();
      TREND_CONFIGS.forEach(function (config) {
        renderAggregatedYearTrendChart(
          chartList, config, seriesByMetric[config.metric], year, resolution
        );
      });
      renderAggregatedYearDataTable(seriesByMetric, year, resolution);
    }

    function renderTrendDataTable(seriesByMetric) {
      const container = document.getElementById('trend-data-table-container');
      prepareTrendDataTableContainer(container);
      const table = document.createElement('table');
      table.className = 'trend-data-table';
      const caption = document.createElement('caption');
      caption.textContent = 'Exact daily values. “Missing” means no entry was saved for that date.';
      table.appendChild(caption);
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Date', 'Mood', 'Sleep (h)', 'Water (L)'].forEach(function (label) {
        const heading = document.createElement('th');
        heading.setAttribute('scope', 'col');
        heading.textContent = label;
        headerRow.appendChild(heading);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      seriesByMetric.mood.points.forEach(function (moodPoint, index) {
        const row = document.createElement('tr');
        const date = document.createElement('td');
        date.textContent = moodPoint.date;
        row.appendChild(date);
        [
          [moodPoint.value, ''],
          [seriesByMetric.sleep.points[index].value, 'h'],
          [seriesByMetric.water.points[index].value, 'L'],
        ].forEach(function (valueAndUnit) {
          const cell = document.createElement('td');
          cell.textContent = formatTrendValue(valueAndUnit[0], valueAndUnit[1]);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      appendTrendDataTableFrame(
        container,
        table,
        'Scroll vertically to view all exact chart data. The Date column stays visible when horizontal scrolling is needed.',
        'trend-single-table-hint'
      );
    }

    function renderCharts(entries, dayCount, endDate, customRange, chartMode) {
      chartMode = chartMode || 'preset';
      const chartList = document.getElementById('trend-chart-list');
      chartList.replaceChildren();
      const seriesByMetric = {};
      TREND_CONFIGS.forEach(function (config) {
        const series = customRange
          ? buildTrendSeriesForRange(entries, config.metric, customRange.startDate, customRange.endDate)
          : buildTrendSeries(entries, config.metric, dayCount, endDate);
        seriesByMetric[config.metric] = series;
        renderTrendChart(chartList, config, series);
      });
      renderTrendPeriodSelection(chartMode, dayCount);
      const rangeStatus = document.getElementById('trend-range-status');
      if (rangeStatus) {
        const customDescription = customRange && customRange.type === 'month'
          ? 'Showing calendar month ' + (customRange.month || customRange.startDate.slice(0, 7)) +
            ' from ' + customRange.startDate + ' to ' + customRange.endDate + '. Missing dates appear as gaps.'
          : customRange && customRange.type === 'year'
            ? 'Showing calendar year ' + (customRange.year || customRange.startDate.slice(0, 4)) +
              ' from ' + customRange.startDate + ' to ' + customRange.endDate + '. Missing dates appear as gaps.'
            : customRange
              ? 'Showing custom range from ' + customRange.startDate + ' to ' + customRange.endDate + '. Missing dates appear as gaps.'
          : chartMode === 'custom'
            ? 'Choose a custom period and apply it. Showing the previously applied chart data.'
            : chartMode === 'compare'
              ? 'Choose two periods and apply a comparison. Showing the previously applied chart data.'
            : 'Showing ' + dayCount + ' calendar days ending today. Missing dates appear as gaps.';
        rangeStatus.textContent = customDescription;
      }
      const customForm = document.getElementById('trend-custom-form');
      if (customForm) {
        const hideCustomForm = chartMode !== 'custom';
        customForm.hidden = hideCustomForm;
        if (hideCustomForm) customForm.setAttribute('hidden', '');
        else if (typeof customForm.removeAttribute === 'function') customForm.removeAttribute('hidden');
      }
      renderTrendDataTable(seriesByMetric);
    }

    function renderTrendPeriodSelection(chartMode, dayCount) {
      document.querySelectorAll('.trend-period-btn').forEach(function (button) {
        const selected = chartMode === 'preset'
          ? Number(button.dataset.trendDays) === dayCount
          : button.dataset.trendDays === chartMode;
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    function renderCustomTrendControls(viewState) {
      const customForm = document.getElementById('trend-custom-form');
      if (!customForm) return;
      customForm.hidden = viewState.trendMode !== 'custom';
      if (viewState.trendMode !== 'custom') {
        customForm.setAttribute('hidden', '');
        return;
      }
      customForm.removeAttribute('hidden');
      const type = viewState.customTrendType || 'year';
      const typeSelect = document.getElementById('trend-custom-type');
      const start = document.getElementById('trend-custom-start');
      const end = document.getElementById('trend-custom-end');
      const month = document.getElementById('trend-custom-month');
      const year = document.getElementById('trend-custom-year');
      const resolution = document.getElementById('trend-custom-resolution');
      const resolutionControls = document.getElementById('trend-custom-resolution-controls');
      const previousMonth = document.getElementById('trend-custom-month-prev');
      const nextMonth = document.getElementById('trend-custom-month-next');
      const previousYear = document.getElementById('trend-custom-year-prev');
      const nextYear = document.getElementById('trend-custom-year-next');
      const dateRangeControls = document.getElementById('trend-custom-date-range-controls');
      const monthControls = document.getElementById('trend-custom-month-controls');
      const yearControls = document.getElementById('trend-custom-year-controls');
      if (typeSelect) typeSelect.value = type;
      if (start && viewState.customTrendDraftStart !== undefined) start.value = viewState.customTrendDraftStart;
      if (end && viewState.customTrendDraftEnd !== undefined) end.value = viewState.customTrendDraftEnd;
      if (month && viewState.customTrendDraftMonth !== undefined) month.value = viewState.customTrendDraftMonth;
      if (year && viewState.customTrendDraftYear !== undefined) year.value = viewState.customTrendDraftYear;
      if (resolution) resolution.value = viewState.customTrendDraftResolution || 'daily';
      if (previousMonth) previousMonth.disabled = Boolean(
        viewState.customMonthNavigation && viewState.customMonthNavigation.previousDisabled
      );
      if (nextMonth) nextMonth.disabled = Boolean(
        viewState.customMonthNavigation && viewState.customMonthNavigation.nextDisabled
      );
      if (previousYear) previousYear.disabled = Boolean(
        viewState.customYearNavigation && viewState.customYearNavigation.previousDisabled
      );
      if (nextYear) nextYear.disabled = Boolean(
        viewState.customYearNavigation && viewState.customYearNavigation.nextDisabled
      );
      [
        [dateRangeControls, type !== 'date-range'],
        [monthControls, type !== 'month'],
        [yearControls, type !== 'year'],
        [resolutionControls, type !== 'year'],
      ].forEach(function (controlAndHidden) {
        const control = controlAndHidden[0];
        const hidden = controlAndHidden[1];
        if (!control) return;
        control.hidden = hidden;
        if (hidden) control.setAttribute('hidden', '');
        else control.removeAttribute('hidden');
      });
    }

    function renderComparisonTrendControls(viewState) {
      const comparisonForm = document.getElementById('trend-comparison-form');
      if (!comparisonForm) return;
      comparisonForm.hidden = viewState.trendMode !== 'compare';
      if (viewState.trendMode !== 'compare') {
        comparisonForm.setAttribute('hidden', '');
        return;
      }
      comparisonForm.removeAttribute('hidden');
      const type = viewState.comparisonTrendType || 'month';
      const typeSelect = document.getElementById('trend-comparison-type');
      const firstMonth = document.getElementById('trend-comparison-first-month');
      const secondMonth = document.getElementById('trend-comparison-second-month');
      const firstYear = document.getElementById('trend-comparison-first-year');
      const secondYear = document.getElementById('trend-comparison-second-year');
      const previousFirstMonth = document.getElementById('trend-comparison-first-month-prev');
      const nextFirstMonth = document.getElementById('trend-comparison-first-month-next');
      const previousSecondMonth = document.getElementById('trend-comparison-second-month-prev');
      const nextSecondMonth = document.getElementById('trend-comparison-second-month-next');
      const previousFirstYear = document.getElementById('trend-comparison-first-year-prev');
      const nextFirstYear = document.getElementById('trend-comparison-first-year-next');
      const previousSecondYear = document.getElementById('trend-comparison-second-year-prev');
      const nextSecondYear = document.getElementById('trend-comparison-second-year-next');
      const monthControls = document.getElementById('trend-comparison-month-controls');
      const yearControls = document.getElementById('trend-comparison-year-controls');
      const resolution = document.getElementById('trend-comparison-resolution');
      const resolutionControls = document.getElementById('trend-comparison-resolution-controls');
      const compareWithPrevious = document.getElementById('trend-comparison-previous-btn');
      if (typeSelect) typeSelect.value = type;
      if (firstMonth && type === 'month') firstMonth.value = viewState.comparisonTrendDraftFirst || '';
      if (secondMonth && type === 'month') secondMonth.value = viewState.comparisonTrendDraftSecond || '';
      if (firstYear && type === 'year') firstYear.value = viewState.comparisonTrendDraftFirst || '';
      if (secondYear && type === 'year') secondYear.value = viewState.comparisonTrendDraftSecond || '';
      if (resolution) resolution.value = viewState.comparisonTrendDraftResolution ||
        (type === 'year' ? 'weekly' : 'daily');
      if (previousFirstMonth) previousFirstMonth.disabled = Boolean(
        viewState.comparisonFirstMonthNavigation &&
        viewState.comparisonFirstMonthNavigation.previousDisabled
      );
      if (nextFirstMonth) nextFirstMonth.disabled = Boolean(
        viewState.comparisonFirstMonthNavigation &&
        viewState.comparisonFirstMonthNavigation.nextDisabled
      );
      if (previousSecondMonth) previousSecondMonth.disabled = Boolean(
        viewState.comparisonSecondMonthNavigation &&
        viewState.comparisonSecondMonthNavigation.previousDisabled
      );
      if (nextSecondMonth) nextSecondMonth.disabled = Boolean(
        viewState.comparisonSecondMonthNavigation &&
        viewState.comparisonSecondMonthNavigation.nextDisabled
      );
      if (previousFirstYear) previousFirstYear.disabled = Boolean(
        viewState.comparisonFirstYearNavigation &&
        viewState.comparisonFirstYearNavigation.previousDisabled
      );
      if (nextFirstYear) nextFirstYear.disabled = Boolean(
        viewState.comparisonFirstYearNavigation &&
        viewState.comparisonFirstYearNavigation.nextDisabled
      );
      if (previousSecondYear) previousSecondYear.disabled = Boolean(
        viewState.comparisonSecondYearNavigation &&
        viewState.comparisonSecondYearNavigation.previousDisabled
      );
      if (nextSecondYear) nextSecondYear.disabled = Boolean(
        viewState.comparisonSecondYearNavigation &&
        viewState.comparisonSecondYearNavigation.nextDisabled
      );
      if (compareWithPrevious) compareWithPrevious.disabled = Boolean(
        viewState.comparisonShortcuts && viewState.comparisonShortcuts.compareWithPreviousDisabled
      );
      [
        [monthControls, type !== 'month'],
        [yearControls, type !== 'year'],
        [resolutionControls, type !== 'year'],
      ].forEach(function (controlAndHidden) {
        const control = controlAndHidden[0];
        const hidden = controlAndHidden[1];
        if (!control) return;
        control.hidden = hidden;
        if (hidden) control.setAttribute('hidden', '');
        else control.removeAttribute('hidden');
      });
    }

    function renderComparisonStatus(periodLabels, chartMode, dayCount, resolution) {
      renderTrendPeriodSelection(chartMode, dayCount);
      const rangeStatus = document.getElementById('trend-range-status');
      if (!rangeStatus) return;
      if (chartMode === 'compare') {
        const resolutionLabel = resolution === 'weekly' ? 'Weekly averages: '
          : resolution === 'monthly' ? 'Monthly averages: ' : 'Daily values: ';
        rangeStatus.textContent = resolutionLabel + 'Comparing ' + comparisonPeriodLabel(periodLabels, 'firstPeriodLabel') +
          ' with ' + comparisonPeriodLabel(periodLabels, 'secondPeriodLabel') +
          '. Missing dates appear as gaps.';
      } else if (chartMode === 'custom') {
        rangeStatus.textContent = 'Choose a custom period and apply it. Showing the previously applied chart data.';
      } else {
        rangeStatus.textContent = 'Showing the previously applied comparison. Missing dates appear as gaps.';
      }
    }

    function formatStatisticValue(value, unit) {
      if (value === null) return '—';
      return value.toFixed(1) + (unit ? ' ' + unit : '');
    }

    function formatStatisticDifference(value, unit) {
      if (value === null) return '—';
      const rounded = Number(value.toFixed(1));
      if (rounded === 0) return '0' + (unit ? ' ' + unit : '');
      return (rounded > 0 ? '+' : '−') + Math.abs(rounded).toFixed(1) +
        (unit ? ' ' + unit : '');
    }

    function formatStatisticCountDifference(value) {
      if (value === 0) return '0';
      return (value > 0 ? '+' : '−') + String(Math.abs(value));
    }

    function appendStatisticsCell(row, text, header) {
      const cell = document.createElement(header ? 'th' : 'td');
      if (header) cell.setAttribute('scope', 'row');
      cell.textContent = text;
      row.appendChild(cell);
    }

    function appendStatisticsTable(container, className, captionText, headers, rows, headingText) {
      const heading = document.createElement('p');
      heading.className = 'trend-statistics-table-heading';
      heading.textContent = headingText || captionText;
      container.appendChild(heading);

      const frame = document.createElement('div');
      frame.className = 'trend-statistics-table-wrap';
      const table = document.createElement('table');
      table.className = 'trend-statistics-table ' + className;
      const caption = document.createElement('caption');
      caption.className = 'sr-only';
      caption.textContent = captionText;
      table.appendChild(caption);
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      headers.forEach(function (label) {
        const cell = document.createElement('th');
        cell.setAttribute('scope', 'col');
        cell.textContent = label;
        headerRow.appendChild(cell);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      rows.forEach(function (rowValues) {
        const row = document.createElement('tr');
        rowValues.forEach(function (value, index) {
          appendStatisticsCell(row, value, index === 0);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      frame.appendChild(table);
      container.appendChild(frame);
    }

    function renderPeriodStatistics(statisticsDisplay) {
      const container = document.getElementById('trend-statistics');
      if (!container) return;
      const wasOpen = Array.from(container.children || []).some(function (child) {
        return child.tagName === 'DETAILS' && child.className === 'trend-statistics-disclosure' && child.open;
      });
      container.replaceChildren();
      if (!statisticsDisplay) return;

      const statistics = statisticsDisplay.statistics;
      const details = document.createElement('details');
      details.className = 'trend-statistics-disclosure';
      details.open = wasOpen;
      const summary = document.createElement('summary');
      summary.textContent = 'Period statistics';
      details.appendChild(summary);
      container.appendChild(details);
      const description = document.createElement('p');
      description.textContent = statisticsDisplay.label + ': ' + statistics.startDate + ' to ' +
        statistics.endDate + '. Averages use recorded days only.';
      details.appendChild(description);
      const coverage = document.createElement('p');
      coverage.className = 'trend-statistics-coverage';
      coverage.textContent = statistics.recordedDayCount + ' recorded ' +
        (statistics.recordedDayCount === 1 ? 'day' : 'days') + ' out of ' +
        statistics.calendarDayCount + ' calendar ' +
        (statistics.calendarDayCount === 1 ? 'day.' : 'days.');
      details.appendChild(coverage);
      appendStatisticsTable(
        details,
        'trend-period-statistics-table',
        'Statistics for the applied chart period.',
        ['Metric', 'Average', 'Minimum', 'Maximum'],
        [
          ['Mood (score)', formatStatisticValue(statistics.metrics.mood.average, ''),
            formatStatisticValue(statistics.metrics.mood.minimum, ''),
            formatStatisticValue(statistics.metrics.mood.maximum, '')],
          ['Sleep', formatStatisticValue(statistics.metrics.sleep.average, 'h'),
            formatStatisticValue(statistics.metrics.sleep.minimum, 'h'),
            formatStatisticValue(statistics.metrics.sleep.maximum, 'h')],
          ['Water', formatStatisticValue(statistics.metrics.water.average, 'L'),
            formatStatisticValue(statistics.metrics.water.minimum, 'L'),
            formatStatisticValue(statistics.metrics.water.maximum, 'L')],
        ]
      );
    }

    function renderComparisonStatistics(statisticsDisplay) {
      const container = document.getElementById('trend-statistics');
      if (!container) return;
      const wasOpen = Array.from(container.children || []).some(function (child) {
        return child.tagName === 'DETAILS' && child.className === 'trend-statistics-disclosure' && child.open;
      });
      container.replaceChildren();
      if (!statisticsDisplay) return;

      const statistics = statisticsDisplay.statistics;
      const first = statistics.firstPeriod;
      const second = statistics.secondPeriod;
      const firstLabel = statisticsDisplay.firstPeriodLabel;
      const secondLabel = statisticsDisplay.secondPeriodLabel;
      const details = document.createElement('details');
      details.className = 'trend-statistics-disclosure';
      details.open = wasOpen;
      const disclosureSummary = document.createElement('summary');
      disclosureSummary.textContent = 'Comparison statistics';
      details.appendChild(disclosureSummary);
      container.appendChild(details);
      const description = document.createElement('p');
      description.textContent = 'Comparing ' + firstLabel + ' with ' + secondLabel +
        '. Differences are second period minus first period. Averages use recorded days only.';
      details.appendChild(description);
      appendStatisticsTable(
        details,
        'trend-comparison-statistics-coverage-table',
        'Recorded-day coverage for the comparison periods.',
        ['Period', 'Recorded days', 'Calendar days', 'Recorded-day difference (second − first)'],
        [
          [firstLabel, String(first.recordedDayCount), String(first.calendarDayCount), '—'],
          [secondLabel, String(second.recordedDayCount), String(second.calendarDayCount),
            formatStatisticCountDifference(statistics.differences.recordedDayCount)],
        ]
      );
      appendStatisticsTable(
        details,
        'trend-comparison-statistics-table',
        'Average values and differences for the comparison periods.',
        ['Metric', firstLabel + ' average', secondLabel + ' average', 'Difference (second − first)'],
        [
          ['Mood (score)', formatStatisticValue(first.metrics.mood.average, ''),
            formatStatisticValue(second.metrics.mood.average, ''),
            formatStatisticDifference(statistics.differences.metrics.mood.average, '')],
          ['Sleep', formatStatisticValue(first.metrics.sleep.average, 'h'),
            formatStatisticValue(second.metrics.sleep.average, 'h'),
            formatStatisticDifference(statistics.differences.metrics.sleep.average, 'h')],
          ['Water', formatStatisticValue(first.metrics.water.average, 'L'),
            formatStatisticValue(second.metrics.water.average, 'L'),
            formatStatisticDifference(statistics.differences.metrics.water.average, 'L')],
        ]
      );
      const extremes = document.createElement('details');
      extremes.className = 'trend-statistics-extremes';
      const summary = document.createElement('summary');
      summary.textContent = 'Show minimum and maximum values';
      extremes.appendChild(summary);
      appendStatisticsTable(
        extremes,
        'trend-comparison-statistics-extremes-table',
        'Minimum and maximum values for the comparison periods.',
        ['Metric', firstLabel + ' minimum', firstLabel + ' maximum', secondLabel + ' minimum', secondLabel + ' maximum'],
        [
          ['Mood (score)', formatStatisticValue(first.metrics.mood.minimum, ''),
            formatStatisticValue(first.metrics.mood.maximum, ''), formatStatisticValue(second.metrics.mood.minimum, ''),
            formatStatisticValue(second.metrics.mood.maximum, '')],
          ['Sleep', formatStatisticValue(first.metrics.sleep.minimum, 'h'),
            formatStatisticValue(first.metrics.sleep.maximum, 'h'), formatStatisticValue(second.metrics.sleep.minimum, 'h'),
            formatStatisticValue(second.metrics.sleep.maximum, 'h')],
          ['Water', formatStatisticValue(first.metrics.water.minimum, 'L'),
            formatStatisticValue(first.metrics.water.maximum, 'L'), formatStatisticValue(second.metrics.water.minimum, 'L'),
            formatStatisticValue(second.metrics.water.maximum, 'L')],
        ],
        'Minimum and maximum values'
      );
      details.appendChild(extremes);
    }

    /* ── Calendar ────────────────────────────────────────────────── */

    function formatCalendarMonth(year, monthIndex) {
      const date = new Date(0);
      date.setHours(12, 0, 0, 0);
      date.setFullYear(year, monthIndex, 1);
      return new Intl.DateTimeFormat('en', {
        month: 'long',
        year: 'numeric',
      }).format(date);
    }

    function formatCalendarDate(dateKey) {
      const date = new Date(0);
      date.setHours(12, 0, 0, 0);
      date.setFullYear(
        Number(dateKey.slice(0, 4)),
        Number(dateKey.slice(5, 7)) - 1,
        Number(dateKey.slice(8, 10))
      );
      return new Intl.DateTimeFormat('en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    }

    function renderCalendarDetails(entries, selectedDate, mutationsBlocked) {
      const details = document.getElementById('calendar-details');
      details.replaceChildren();
      if (!selectedDate) {
        details.textContent = 'Select a date to view its saved entry.';
        return;
      }

      const entry = entries.find(function (candidate) {
        return candidate.date === selectedDate;
      });
      const readableDate = formatCalendarDate(selectedDate);
      if (!entry) {
        details.textContent = 'No entry recorded for ' + readableDate + '.';
      } else {
        details.textContent = 'Entry for ' + readableDate + ': Mood ' + entry.mood +
          ', Sleep ' + entry.sleep + ' h, Water ' + entry.water + ' L.';
      }

      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'calendar-detail-action ' + (entry ? 'btn-primary' : 'btn-neutral');
      actionButton.dataset.calendarAction = entry ? 'edit' : 'create';
      actionButton.dataset.calendarDate = selectedDate;
      actionButton.textContent = entry ? 'Edit entry' : 'Create entry';
      actionButton.setAttribute(
        'aria-label',
        (entry ? 'Edit entry for ' : 'Create entry for ') + readableDate
      );
      actionButton.disabled = mutationsBlocked;
      details.appendChild(actionButton);
      if (entry) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'calendar-detail-action btn-delete';
        deleteButton.dataset.calendarAction = 'delete';
        deleteButton.dataset.calendarDate = selectedDate;
        deleteButton.textContent = 'Delete entry';
        deleteButton.setAttribute('aria-label', 'Delete entry for ' + readableDate);
        deleteButton.disabled = mutationsBlocked;
        details.appendChild(deleteButton);
      }
    }

    function renderCalendar(entries, calendarState) {
      const { year, monthIndex, selectedDate, announceMonth, mutationsBlocked } = calendarState;
      const month = buildCalendarMonth(entries, year, monthIndex);

      document.getElementById('calendar-month-heading').textContent =
        formatCalendarMonth(year, monthIndex);
      document.getElementById('calendar-month-status').textContent = announceMonth
        ? 'Showing ' + formatCalendarMonth(year, monthIndex) + '.'
        : '';

      const grid = document.getElementById('calendar-grid');
      grid.replaceChildren();
      for (let blank = 0; blank < month.weekdayOffset; blank++) {
        const blankCell = document.createElement('div');
        blankCell.className = 'calendar-day-blank';
        blankCell.setAttribute('aria-hidden', 'true');
        grid.appendChild(blankCell);
      }

      month.days.forEach(function (day) {
        const dateButton = document.createElement('button');
        const isSelected = day.date === selectedDate;
        dateButton.type = 'button';
        dateButton.className = 'calendar-day' +
          (day.hasEntry ? ' has-entry' : '') +
          (isSelected ? ' is-selected' : '');
        dateButton.dataset.calendarDate = day.date;
        dateButton.setAttribute('aria-pressed', String(isSelected));
        dateButton.setAttribute(
          'aria-label',
          formatCalendarDate(day.date) + (day.hasEntry ? ', entry recorded' : ', no entry recorded')
        );

        const number = document.createElement('span');
        number.className = 'calendar-day-number';
        number.textContent = day.day;
        dateButton.appendChild(number);
        if (day.hasEntry) {
          const entryLabel = document.createElement('span');
          entryLabel.className = 'calendar-entry-label';
          entryLabel.textContent = 'Entry';
          dateButton.appendChild(entryLabel);
        }
        grid.appendChild(dateButton);
      });

      renderCalendarDetails(entries, selectedDate, mutationsBlocked);
    }

    function renderHistoryTrends(entries, viewState) {
      const { activeView, trendDayCount, trendEndDate, trendMode, appliedCustomTrendRange, chartDisplay, statisticsDisplay, calendar } = viewState;
      const chartsPanel = document.getElementById('history-charts-panel');
      const calendarPanel = document.getElementById('history-calendar-panel');
      const chartsButton = document.getElementById('history-view-charts');
      const calendarButton = document.getElementById('history-view-calendar');
      const calendarVisible = activeView === 'calendar';

      chartsPanel.hidden = calendarVisible;
      calendarPanel.hidden = !calendarVisible;
      chartsButton.setAttribute('aria-pressed', String(!calendarVisible));
      calendarButton.setAttribute('aria-pressed', String(calendarVisible));
      const display = chartDisplay || {
        type: 'single',
        dayCount: trendDayCount,
        endDate: trendEndDate,
        customRange: trendMode === 'custom' ? appliedCustomTrendRange : null,
      };
      if (display.type === 'comparison') {
        if (display.resolution === 'weekly' || display.resolution === 'monthly') {
          renderAggregatedComparisonCharts(
            display.seriesByMetric, display.periodLabels, display.resolution
          );
        } else {
          renderComparisonCharts(display.seriesByMetric, display.periodLabels);
        }
        renderComparisonStatus(display.periodLabels, trendMode, trendDayCount, display.resolution);
      } else if (display.type === 'aggregated-year') {
        renderAggregatedYearCharts(display.seriesByMetric, display.year, display.resolution);
        renderTrendPeriodSelection(trendMode, trendDayCount);
        const rangeStatus = document.getElementById('trend-range-status');
        if (rangeStatus) {
          const resolutionLabel = display.resolution === 'weekly'
            ? 'Weekly averages' : 'Monthly averages';
          rangeStatus.textContent = 'Showing calendar year ' + String(display.year).padStart(4, '0') +
            ' as ' + resolutionLabel + ' from ' + display.customRange.startDate + ' to ' +
            display.customRange.endDate + '. Missing periods appear as gaps.';
        }
      } else {
        renderCharts(entries, display.dayCount, display.endDate, display.customRange, trendMode);
      }
      if (statisticsDisplay && statisticsDisplay.type === 'comparison') {
        renderComparisonStatistics(statisticsDisplay);
      } else {
        renderPeriodStatistics(statisticsDisplay);
      }
      renderCustomTrendControls(viewState);
      renderComparisonTrendControls(viewState);
      renderCalendar(entries, calendar);
    }
