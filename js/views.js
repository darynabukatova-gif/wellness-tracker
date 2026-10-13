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

    /**
     * renderTable(entries)
     *
     * Clears #entries-container and replaces its content with either:
     *   • a fully built <table> containing one row per entry (sorted
     *     newest-first), or
     *   • a "No entries yet" paragraph when the array is empty.
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
     * @param {Array} entries  The current entries array (not modified).
     */
    function renderTable(entries) {
      const container = document.getElementById('entries-container');

      // Always start with an empty container so stale content is never
      // left behind after a deletion or erase-all.
      // replaceChildren() with no arguments removes all child nodes without
      // touching innerHTML — it avoids any parse-and-serialise round-trip.
      container.replaceChildren();

      if (entries.length === 0) {
        // ── Empty state ───────────────────────────────────────────
        const empty = document.createElement('p');
        empty.className   = 'empty-state';
        empty.textContent = 'No entries yet.';
        container.appendChild(empty);
        return;
      }

      // ── Build the table ───────────────────────────────────────────
      const sorted = sortByDateDesc(entries);

      // <table>
      const table = document.createElement('table');
      table.setAttribute('aria-label', 'Wellness entry history');

      // ── <thead> ───────────────────────────────────────────────────
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const columns = ['Date', 'Mood', 'Sleep (h)', 'Water (L)', 'Actions'];
      columns.forEach(function (label) {
        const th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = label;
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // ── <tbody> ───────────────────────────────────────────────────
      const tbody = document.createElement('tbody');

      sorted.forEach(function (entry) {
        const row = document.createElement('tr');

        // Date cell
        const tdDate = document.createElement('td');
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
      container.appendChild(table);
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
        return left + (index / (series.points.length - 1)) * width;
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
        const label = createSvgElement('text', {
          class: 'trend-axis-label', x: xFor(index), y: bottom + 17, 'text-anchor': 'middle',
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
          }));
        });
      }

      card.appendChild(svg);
      container.appendChild(card);
    }

    function renderTrendDataTable(seriesByMetric) {
      const container = document.getElementById('trend-data-table-container');
      container.replaceChildren();
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
      container.appendChild(table);
    }

    function renderCharts() {
      const chartList = document.getElementById('trend-chart-list');
      chartList.replaceChildren();
      const endDate = localDateString(new Date());
      const seriesByMetric = {};
      TREND_CONFIGS.forEach(function (config) {
        const series = buildTrendSeries(entries, config.metric, trendDayCount, endDate);
        seriesByMetric[config.metric] = series;
        renderTrendChart(chartList, config, series);
      });
      document.querySelectorAll('.trend-period-btn').forEach(function (button) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.trendDays) === trendDayCount));
      });
      renderTrendDataTable(seriesByMetric);
    }

    function setTrendDayCount(dayCount) {
      if ([7, 30, 90].indexOf(dayCount) === -1) return;
      trendDayCount = dayCount;
      renderCharts();
    }

    /* ── Calendar ────────────────────────────────────────────────── */

    function ensureCalendarMonth() {
      if (calendarYear !== null && calendarMonthIndex !== null) return;
      const today = new Date();
      calendarYear = today.getFullYear();
      calendarMonthIndex = today.getMonth();
    }

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

    function calendarMonthKey(year, monthIndex) {
      return String(year).padStart(4, '0') + '-' + String(monthIndex + 1).padStart(2, '0');
    }

    function renderCalendarDetails() {
      const details = document.getElementById('calendar-details');
      details.replaceChildren();
      if (!selectedCalendarDate) {
        details.textContent = 'Select a date to view its saved entry.';
        return;
      }

      const entry = entries.find(function (candidate) {
        return candidate.date === selectedCalendarDate;
      });
      const readableDate = formatCalendarDate(selectedCalendarDate);
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
      actionButton.dataset.calendarDate = selectedCalendarDate;
      actionButton.textContent = entry ? 'Edit entry' : 'Create entry';
      actionButton.setAttribute(
        'aria-label',
        (entry ? 'Edit entry for ' : 'Create entry for ') + readableDate
      );
      actionButton.disabled = isMutationBlocked();
      details.appendChild(actionButton);
    }

    function renderCalendar(announceMonth) {
      ensureCalendarMonth();
      const month = buildCalendarMonth(entries, calendarYear, calendarMonthIndex);
      const monthKey = calendarMonthKey(calendarYear, calendarMonthIndex);
      if (selectedCalendarDate && selectedCalendarDate.slice(0, 7) !== monthKey) {
        selectedCalendarDate = null;
      }

      document.getElementById('calendar-month-heading').textContent =
        formatCalendarMonth(calendarYear, calendarMonthIndex);
      document.getElementById('calendar-month-status').textContent = announceMonth
        ? 'Showing ' + formatCalendarMonth(calendarYear, calendarMonthIndex) + '.'
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
        const isSelected = day.date === selectedCalendarDate;
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

      renderCalendarDetails();
    }

    function renderHistoryTrends() {
      const chartsPanel = document.getElementById('history-charts-panel');
      const calendarPanel = document.getElementById('history-calendar-panel');
      const chartsButton = document.getElementById('history-view-charts');
      const calendarButton = document.getElementById('history-view-calendar');
      const calendarVisible = historyView === 'calendar';

      chartsPanel.hidden = calendarVisible;
      calendarPanel.hidden = !calendarVisible;
      chartsButton.setAttribute('aria-pressed', String(!calendarVisible));
      calendarButton.setAttribute('aria-pressed', String(calendarVisible));
      renderCharts();
      renderCalendar(false);
    }
