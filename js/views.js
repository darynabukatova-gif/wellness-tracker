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
     *           matchingCount: number, visibleEntries: Array}} historyState
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

      if (matchingCount > visibleEntries.length) {
        const notice = document.createElement('p');
        notice.className = 'history-status';
        notice.textContent = 'Showing the newest ' + visibleEntries.length + ' of ' +
          matchingCount + ' matching entries. Narrow the date range to view older entries.';
        container.appendChild(notice);
      }

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

      visibleEntries.forEach(function (entry) {
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
          }));
        });
      }

      card.appendChild(svg);
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

    function appendComparisonSeries(svg, points, xFor, yFor, seriesName) {
      let segment = [];
      const valueKey = seriesName === 'first' ? 'firstValue' : 'secondValue';
      const dateKey = seriesName === 'first' ? 'firstDate' : 'secondDate';
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
        if (point[dateKey] === null || point[valueKey] === null) {
          appendSegment();
          return;
        }
        segment.push({ index, value: point[valueKey] });
      });
      appendSegment();

      points.forEach(function (point, index) {
        if (point[dateKey] === null || point[valueKey] === null) return;
        svg.appendChild(createSvgElement('circle', {
          class: 'trend-comparison-point trend-comparison-point-' + seriesName,
          cx: xFor(index), cy: yFor(point[valueKey]), r: 3,
          'data-comparison-series': seriesName,
          'data-alignment-key': point.key,
          'data-date': point[dateKey],
          'data-value': point[valueKey],
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
        return point.firstDate !== null && point.firstValue !== null;
      }).length;
      const secondCount = series.points.filter(function (point) {
        return point.secondDate !== null && point.secondValue !== null;
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
        appendComparisonSeries(svg, series.points, xFor, yFor, 'first');
        appendComparisonSeries(svg, series.points, xFor, yFor, 'second');
      }

      card.appendChild(svg);
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
      const type = viewState.customTrendType || 'date-range';
      const typeSelect = document.getElementById('trend-custom-type');
      const start = document.getElementById('trend-custom-start');
      const end = document.getElementById('trend-custom-end');
      const month = document.getElementById('trend-custom-month');
      const year = document.getElementById('trend-custom-year');
      const dateRangeControls = document.getElementById('trend-custom-date-range-controls');
      const monthControls = document.getElementById('trend-custom-month-controls');
      const yearControls = document.getElementById('trend-custom-year-controls');
      if (typeSelect) typeSelect.value = type;
      if (start && viewState.customTrendDraftStart !== undefined) start.value = viewState.customTrendDraftStart;
      if (end && viewState.customTrendDraftEnd !== undefined) end.value = viewState.customTrendDraftEnd;
      if (month && viewState.customTrendDraftMonth !== undefined) month.value = viewState.customTrendDraftMonth;
      if (year && viewState.customTrendDraftYear !== undefined) year.value = viewState.customTrendDraftYear;
      [
        [dateRangeControls, type !== 'date-range'],
        [monthControls, type !== 'month'],
        [yearControls, type !== 'year'],
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
      const monthControls = document.getElementById('trend-comparison-month-controls');
      const yearControls = document.getElementById('trend-comparison-year-controls');
      const resolution = document.getElementById('trend-comparison-resolution');
      const resolutionControls = document.getElementById('trend-comparison-resolution-controls');
      if (typeSelect) typeSelect.value = type;
      if (firstMonth && type === 'month') firstMonth.value = viewState.comparisonTrendDraftFirst || '';
      if (secondMonth && type === 'month') secondMonth.value = viewState.comparisonTrendDraftSecond || '';
      if (firstYear && type === 'year') firstYear.value = viewState.comparisonTrendDraftFirst || '';
      if (secondYear && type === 'year') secondYear.value = viewState.comparisonTrendDraftSecond || '';
      if (resolution) resolution.value = viewState.comparisonTrendDraftResolution ||
        (type === 'year' ? 'weekly' : 'daily');
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
      const { activeView, trendDayCount, trendEndDate, trendMode, appliedCustomTrendRange, chartDisplay, calendar } = viewState;
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
      } else {
        renderCharts(entries, display.dayCount, display.endDate, display.customRange, trendMode);
      }
      renderCustomTrendControls(viewState);
      renderComparisonTrendControls(viewState);
      renderCalendar(entries, calendar);
    }
