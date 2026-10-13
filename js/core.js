    /* ═══════════════════════════════════════════════════════════════
       STORAGE KEY
       ═══════════════════════════════════════════════════════════════ */
    const STORAGE_KEY = 'wellness-tracker-demo-v1';
    const BACKUP_FORMAT_VERSION = 1;
    const BACKUP_APPLICATION = 'wellness-tracker';

    /* ═══════════════════════════════════════════════════════════════
       STORAGE OPERATIONS
       (Browser-only localStorage functions; Electron uses the async bridge.)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * loadEntries()
     *
     * Reads the raw JSON string from localStorage and parses it into
     * an array of entry objects.
     *
     * Return values — three distinct cases:
     *
     *   []   (empty array)
     *        The key is absent (first visit, or after a successful erase-all).
     *        There is nothing wrong; the app should start fresh.
     *
     *   Array of entry objects
     *        The key exists and its value is a valid JSON array.
     *        The caller may use the array directly.
     *
     *   null
     *        Something went wrong during reading or parsing:
     *          • localStorage.getItem() threw (e.g. private-browsing quota)
     *          • The stored string is not valid JSON (SyntaxError from JSON.parse)
     *          • The parsed value exists but is not an array
     *        In all these cases the raw stored value is left untouched.
     *        null is the signal to the browser storage adapter that it must
     *        NOT overwrite storage and should show the user an error message.
     *
     * Why JSON.parse()?
     *   localStorage stores everything as plain strings. JSON.parse()
     *   converts "[{\"date\":\"2025-06-10\",\"mood\":4,...}]" back into
     *   the JavaScript array we originally saved. If the string is not
     *   valid JSON, JSON.parse() throws a SyntaxError — hence the try/catch.
     *
     * @returns {Array|null} Parsed array (possibly empty), or null on failure.
     */
    function loadEntries() {
      let raw;

      // Step 1 — read the raw string (can throw in some private-browsing modes)
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (readError) {
        console.error('Wellness Tracker: could not read from localStorage.', readError);
        return null;
      }

      // Step 2 — key was not set at all (first visit or after erase-all)
      if (raw === null) {
        return [];
      }

      // Step 3 — key exists; try to parse it
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        // The stored value is not valid JSON — report it, do NOT overwrite.
        console.error(
          'Wellness Tracker: stored data is corrupted and could not be parsed. ' +
          'Raw value preserved in localStorage.',
          parseError
        );
        return null;
      }

      // Step 4 — parsed successfully, but guard against non-array values
      // (e.g. if someone manually set the key to a JSON object or number)
      if (!Array.isArray(parsed)) {
        console.error(
          'Wellness Tracker: stored data is not an array. ' +
          'Raw value preserved in localStorage.',
          parsed
        );
        return null;
      }

      return parsed;
    }

    /**
     * saveEntries(entries)
     *
     * Serialises the entries array to a JSON string and writes it to
     * localStorage.
     *
     * Why JSON.stringify()?
     *   localStorage only accepts strings. JSON.stringify() converts the
     *   JavaScript array — e.g. [{date:"2025-06-10", mood:4, sleep:7.5,
     *   water:2.1}] — into the text representation that can be stored and
     *   later parsed back by loadEntries().
     *
     * Failures (e.g. storage quota exceeded, private-browsing restrictions)
     * are caught and reported. The caller can check the return value to know
     * whether the save succeeded.
     *
     * @param  {Array}   entries  The current array of entry objects.
     * @returns {boolean}         true on success, false on failure.
     */
    function saveEntries(entries) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        return true;
      } catch (writeError) {
        console.error('Wellness Tracker: could not save entries to localStorage.', writeError);
        return false;
      }
    }

    /* ═══════════════════════════════════════════════════════════════
       PURE DATA-PROCESSING FUNCTIONS
       (No persistence or DOM access. Input → output only.)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * sortByDateDesc(entries)
     *
     * Returns a new array of entries sorted by date, newest first.
     * The original array is not modified.
     *
     * How the sort works:
     *   Dates are stored as ISO 8601 strings ("YYYY-MM-DD"). This format
     *   sorts correctly as plain text: "2025-06-12" > "2025-06-10" because
     *   string comparison works left-to-right and the year, month, and day
     *   fields are all zero-padded to fixed widths. No Date objects are
     *   needed.
     *
     *   Array.prototype.slice() creates a shallow copy first so the sort
     *   does not mutate the caller's array. The comparator (b.date - a.date
     *   in string terms) is written as b.date > a.date ? 1 : -1, which
     *   places larger (newer) dates first.
     *
     * @param  {Array} entries
     * @returns {Array} New sorted array.
     */
    function sortByDateDesc(entries) {
      return entries.slice().sort(function (a, b) {
        if (b.date > a.date) return  1;
        if (b.date < a.date) return -1;
        return 0;
      });
    }

    /**
     * calcSummary(entries)
     *
     * Calculates statistics for the seven most recent entries.
     *
     * Steps:
     *   1. If the array is empty, return null — the UI will show
     *      "No entries yet" rather than zeros.
     *   2. Sort by date descending and take the first seven items.
     *      Sorting here (not relying on insertion order) ensures the
     *      window is always the seven newest dates regardless of the
     *      order entries were added.
     *   3. Compute the mean of mood, sleep, and water across the window.
     *      Mean = sum of all values ÷ number of values.
     *   4. Round each average to one decimal place using Math.round().
     *      Multiplying by 10, rounding, then dividing by 10 avoids the
     *      floating-point drift that can occur with toFixed() alone.
     *
     * @param  {Array}       entries  All stored entries (any order).
     * @returns {Object|null}         { count, avgMood, avgSleep, avgWater }
     *                                or null when entries is empty.
     */
    function calcSummary(entries) {
      if (entries.length === 0) {
        return null;
      }

      // Take the seven most recent entries (sorted, then sliced).
      // Named recentEntries to avoid shadowing the browser global `window`.
      const recentEntries = sortByDateDesc(entries).slice(0, 7);
      const count         = recentEntries.length;

      // Sum each field across the window
      let totalMood  = 0;
      let totalSleep = 0;
      let totalWater = 0;

      for (let i = 0; i < count; i++) {
        totalMood  += recentEntries[i].mood;
        totalSleep += recentEntries[i].sleep;
        totalWater += recentEntries[i].water;
      }

      // Round to one decimal place:
      //   Math.round(value * 10) / 10  is more reliable than toFixed(1)
      //   because it avoids representing the result as a string and sidesteps
      //   cases like (1.005).toFixed(2) === "1.00" in some JS engines.
      return {
        count:    count,
        avgMood:  Math.round((totalMood  / count) * 10) / 10,
        avgSleep: Math.round((totalSleep / count) * 10) / 10,
        avgWater: Math.round((totalWater / count) * 10) / 10,
      };
    }

    /* ═══════════════════════════════════════════════════════════════
       DATE HELPER
       ═══════════════════════════════════════════════════════════════ */

    /**
     * localDateString(d)
     *
     * Formats a Date object as "YYYY-MM-DD" using the browser's local
     * calendar, not UTC.
     *
     * Why not d.toISOString().slice(0, 10)?
     *   toISOString() always returns the UTC representation. In a timezone
     *   east of UTC, local midnight on any date is already the previous day
     *   in UTC, so toISOString() would return yesterday's date string for a
     *   Date constructed with 'T00:00:00'. Using local getFullYear /
     *   getMonth / getDate avoids that shift entirely.
     *
     * @param  {Date}   d
     * @returns {string} "YYYY-MM-DD"
     */
    function localDateString(d) {
      const y   = d.getFullYear();
      const m   = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }

    /* ═══════════════════════════════════════════════════════════════
       HISTORY & TRENDS DATA HELPERS
       (Pure local-calendar calculations; no DOM or persistence access.)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * localCalendarDate(dateKey)
     *
     * Parses a YYYY-MM-DD key as a local calendar date at noon. A bare
     * `new Date('YYYY-MM-DD')` is deliberately avoided because JavaScript
     * interprets that form as UTC. Noon also avoids normal daylight-saving
     * changes that can make a local midnight ambiguous.
     *
     * @param  {string} dateKey
     * @returns {Date} Local Date object representing local noon on dateKey.
     * @throws {RangeError} When dateKey is not a real YYYY-MM-DD date.
     */
    function localCalendarDate(dateKey) {
      if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throw new RangeError('Date must use YYYY-MM-DD format.');
      }

      const year = Number(dateKey.slice(0, 4));
      const monthIndex = Number(dateKey.slice(5, 7)) - 1;
      const day = Number(dateKey.slice(8, 10));
      const date = new Date(0);
      date.setHours(12, 0, 0, 0);
      // setFullYear avoids Date's special 1900 offset for years 0–99.
      date.setFullYear(year, monthIndex, day);

      if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
        throw new RangeError('Date must be a real calendar date.');
      }
      return date;
    }

    /**
     * addCalendarDays(dateKey, offset)
     *
     * Returns the local calendar date `offset` days from dateKey. The input
     * string is never modified, and Date#setDate handles month/year rollover.
     *
     * @param  {string} dateKey YYYY-MM-DD local calendar date.
     * @param  {number} offset  Whole number of calendar days, positive or negative.
     * @returns {string} YYYY-MM-DD local calendar date.
     */
    function addCalendarDays(dateKey, offset) {
      if (!Number.isInteger(offset)) {
        throw new RangeError('Calendar-day offset must be an integer.');
      }
      const date = localCalendarDate(dateKey);
      date.setDate(date.getDate() + offset);
      return localDateString(date);
    }

    /**
     * buildTrendSeries(entries, metric, dayCount, endDate)
     *
     * Builds an inclusive, chronological calendar-day series ending on
     * endDate. Missing entries deliberately become null rather than zero so
     * a chart can render a visible gap. Stored zero values remain zero.
     *
     * @param  {Array}  entries  Valid Wellness Tracker entries (not modified).
     * @param  {string} metric   One of mood, sleep, or water.
     * @param  {number} dayCount One of 7, 30, or 90.
     * @param  {string} endDate  Inclusive YYYY-MM-DD end date.
     * @returns {{ metric: string, dayCount: number, startDate: string,
     *             endDate: string, points: Array<{date: string, value: number|null}> }}
     */
    function buildTrendSeries(entries, metric, dayCount, endDate) {
      const allowedMetrics = ['mood', 'sleep', 'water'];
      const allowedDayCounts = [7, 30, 90];
      if (allowedMetrics.indexOf(metric) === -1) {
        throw new RangeError('Unsupported trend metric.');
      }
      if (allowedDayCounts.indexOf(dayCount) === -1) {
        throw new RangeError('Trend day count must be 7, 30, or 90.');
      }

      // Validate the end date before calculating the range.
      localCalendarDate(endDate);
      const entriesByDate = new Map();
      entries.forEach(function (entry) {
        entriesByDate.set(entry.date, entry);
      });

      const startDate = addCalendarDays(endDate, 1 - dayCount);
      const points = [];
      for (let offset = 0; offset < dayCount; offset++) {
        const date = addCalendarDays(startDate, offset);
        const entry = entriesByDate.get(date);
        points.push({
          date,
          value: entry ? entry[metric] : null,
        });
      }

      return { metric, dayCount, startDate, endDate, points };
    }

    /**
     * buildCalendarMonth(entries, year, monthIndex)
     *
     * Returns local-calendar information for every date in one month. Monday
     * has weekdayOffset 0 and Sunday has weekdayOffset 6. Each day retains a
     * reference to its matching entry, if one exists, without changing the
     * entries array or any entry object.
     *
     * @param  {Array} entries    Valid Wellness Tracker entries (not modified).
     * @param  {number} year      Four-digit calendar year.
     * @param  {number} monthIndex JavaScript month index, 0 (January) to 11.
     * @returns {{ year: number, monthIndex: number, weekdayOffset: number,
     *             days: Array<{day: number, date: string, hasEntry: boolean, entry: Object|null}> }}
     */
    function buildCalendarMonth(entries, year, monthIndex) {
      if (!Number.isInteger(year) || !Number.isInteger(monthIndex) ||
          monthIndex < 0 || monthIndex > 11) {
        throw new RangeError('Calendar month requires an integer year and month index from 0 to 11.');
      }

      const firstDate = new Date(0);
      firstDate.setHours(12, 0, 0, 0);
      firstDate.setFullYear(year, monthIndex, 1);
      const lastDate = new Date(firstDate);
      lastDate.setMonth(lastDate.getMonth() + 1, 0);
      const daysInMonth = lastDate.getDate();
      const weekdayOffset = (firstDate.getDay() + 6) % 7;
      const entriesByDate = new Map();
      entries.forEach(function (entry) {
        entriesByDate.set(entry.date, entry);
      });

      const days = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const date = addCalendarDays(localDateString(firstDate), day - 1);
        const entry = entriesByDate.get(date) || null;
        days.push({ date, day, hasEntry: entry !== null, entry });
      }

      return { year, monthIndex, weekdayOffset, days };
    }

    /* ═══════════════════════════════════════════════════════════════
       STEP HELPER
       ═══════════════════════════════════════════════════════════════ */

    /**
     * isValidStep(value, step)
     *
     * Returns true when value is an exact multiple of step, within a
     * floating-point tolerance of 1e-9.
     *
     * Why not (value % step === 0)?
     *   0.5 and 0.1 have no exact binary representation in IEEE 754.
     *   Direct modulo gives results like (1.1 % 0.1) === 0.09999…, which
     *   would wrongly reject valid inputs.
     *
     * The approach used here:
     *   Divide value by step to find "how many steps does value represent?"
     *   If value is a valid multiple, that quotient is very close to an
     *   integer. Math.abs(scaled - Math.round(scaled)) measures the
     *   distance from the nearest integer; if it is smaller than 1e-9
     *   the value is considered valid.
     *
     *   1e-9 is tight enough to reject 1.15/0.1 = 11.499999… (distance ≈ 0.5)
     *   while accepting 1.1/0.1 = 10.999999… (distance ≈ 1e-15).
     *
     * @param  {number}  value
     * @param  {number}  step   e.g. 0.5 or 0.1
     * @returns {boolean}
     */
    function isValidStep(value, step) {
      const scaled = value / step;
      return Math.abs(scaled - Math.round(scaled)) < 1e-9;
    }

    /* ═══════════════════════════════════════════════════════════════
       STORED-DATA INTEGRITY HELPERS
       ═══════════════════════════════════════════════════════════════ */

    /**
     * isValidEntryShape(entry)
     *
     * Checks that a single value has the expected shape and that all fields
     * are within their valid ranges, including a date round-trip check to
     * reject impossible calendar dates such as 2025-02-30.
     *
     * Also checks that sleep is a multiple of 0.5 h and water is a multiple
     * of 0.1 L using isValidStep(), since entries failing these constraints
     * could never have been saved through the form.
     *
     * Does NOT check duplicate dates — that rule applies only to new form
     * submissions, not to data already accepted and stored.
     *
     * @param  {*}       entry
     * @returns {boolean}
     */
    function isValidEntryShape(entry) {
      if (entry === null || typeof entry !== 'object') return false;
      if (typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return false;
      const d = new Date(entry.date + 'T00:00:00');
      if (isNaN(d.getTime()) || localDateString(d) !== entry.date) return false;
      if (typeof entry.mood  !== 'number' || !Number.isInteger(entry.mood)
          || entry.mood < 1 || entry.mood > 5) return false;
      if (typeof entry.sleep !== 'number' || !isFinite(entry.sleep)
          || entry.sleep < 0 || entry.sleep > 24
          || !isValidStep(entry.sleep, 0.5)) return false;
      if (typeof entry.water !== 'number' || !isFinite(entry.water)
          || entry.water < 0 || entry.water > 3
          || !isValidStep(entry.water, 0.1)) return false;
      return true;
    }

    /**
     * validateStoredEntries(arr)
     *
     * Validates the entire array loaded from the active storage backend.
     * Returns null when the array is clean, or an error string describing
     * the first problem found.
     *
     * Two checks are run:
     *   1. Every element must pass isValidEntryShape().
     *   2. No two elements may share the same date.
     *
     * A non-null return tells initialisation that the stored
     * data is corrupt.  The caller must NOT overwrite storage and should
     * show the user an error message so they can investigate.
     *
     * @param  {Array}        arr
     * @returns {string|null} Error message, or null when valid.
     */
    function validateStoredEntries(arr) {
      for (let i = 0; i < arr.length; i++) {
        if (!isValidEntryShape(arr[i])) {
          return 'Stored entry at position ' + (i + 1) + ' is malformed. ' +
                 'The saved data may be corrupted.';
        }
      }
      const seen = {};
      for (let j = 0; j < arr.length; j++) {
        const date = arr[j].date;
        if (seen[date]) {
          return 'Duplicate date found in stored data: ' + date + '. ' +
                 'The saved data may be corrupted.';
        }
        seen[date] = true;
      }
      return null;
    }

    /* ═══════════════════════════════════════════════════════════════
       BACKUP FORMAT HELPERS
       (Pure validation and copying; no DOM, storage, or network access.)
       ═══════════════════════════════════════════════════════════════ */

    function hasExactlyKeys(value, expectedKeys) {
      if (value === null || Array.isArray(value) || typeof value !== 'object') return false;
      const actualKeys = Object.keys(value);
      return actualKeys.length === expectedKeys.length && expectedKeys.every(function (key) {
        return Object.prototype.hasOwnProperty.call(value, key);
      });
    }

    function isCanonicalUtcTimestamp(value) {
      if (typeof value !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
        return false;
      }
      const date = new Date(value);
      return !isNaN(date.getTime()) && date.toISOString() === value;
    }

    function validateBackupEntries(entries) {
      if (!Array.isArray(entries)) return 'Backup entries must be an array.';
      const expectedEntryKeys = ['date', 'mood', 'sleep', 'water'];
      for (let index = 0; index < entries.length; index++) {
        if (!hasExactlyKeys(entries[index], expectedEntryKeys)) {
          return 'Backup entry at position ' + (index + 1) + ' has an unexpected structure.';
        }
      }
      return validateStoredEntries(entries);
    }

    function copyEntries(entries) {
      return entries.map(function (entry) {
        return {
          date: entry.date,
          mood: entry.mood,
          sleep: entry.sleep,
          water: entry.water,
        };
      });
    }

    /**
     * createBackupDocument(entries, exportedAt)
     *
     * Creates a detached version-1 backup envelope from an already saved entry
     * array. Invalid data is rejected rather than being silently exported.
     *
     * @throws {TypeError|RangeError} When entries or exportedAt are invalid.
     * @returns {{application: string, backupVersion: number, exportedAt: string, entries: Array}}
     */
    function createBackupDocument(entries, exportedAt) {
      const entriesError = validateBackupEntries(entries);
      if (entriesError) {
        throw new TypeError('Cannot create backup: ' + entriesError);
      }
      if (!isCanonicalUtcTimestamp(exportedAt)) {
        throw new RangeError('Cannot create backup: exportedAt must be a canonical UTC timestamp.');
      }
      return {
        application: BACKUP_APPLICATION,
        backupVersion: BACKUP_FORMAT_VERSION,
        exportedAt,
        entries: copyEntries(entries),
      };
    }

    /**
     * parseBackupDocument(jsonText)
     *
     * Parses and validates a complete version-1 backup. It never accepts a
     * partial backup or coerces values, and returns a detached copy on success.
     *
     * @returns {{ok: true, backup: Object}|{ok: false, code: string, error: string}}
     */
    function parseBackupDocument(jsonText) {
      if (typeof jsonText !== 'string') {
        return { ok: false, code: 'INVALID_JSON', error: 'Backup data must be JSON text.' };
      }

      let documentValue;
      try {
        documentValue = JSON.parse(jsonText);
      } catch (error) {
        return { ok: false, code: 'INVALID_JSON', error: 'Backup file is not valid JSON.' };
      }

      const expectedDocumentKeys = ['application', 'backupVersion', 'exportedAt', 'entries'];
      if (!hasExactlyKeys(documentValue, expectedDocumentKeys)) {
        return { ok: false, code: 'INVALID_ENVELOPE', error: 'Backup file has an unexpected structure.' };
      }
      if (documentValue.application !== BACKUP_APPLICATION) {
        return { ok: false, code: 'UNSUPPORTED_APPLICATION', error: 'Backup file is not for Wellness Tracker.' };
      }
      if (documentValue.backupVersion !== BACKUP_FORMAT_VERSION) {
        return { ok: false, code: 'UNSUPPORTED_VERSION', error: 'Backup file version is not supported.' };
      }
      if (!isCanonicalUtcTimestamp(documentValue.exportedAt)) {
        return { ok: false, code: 'INVALID_TIMESTAMP', error: 'Backup export timestamp is invalid.' };
      }

      const entriesError = validateBackupEntries(documentValue.entries);
      if (entriesError) {
        return { ok: false, code: 'INVALID_ENTRIES', error: 'Backup entries are invalid: ' + entriesError };
      }

      return {
        ok: true,
        backup: {
          application: BACKUP_APPLICATION,
          backupVersion: BACKUP_FORMAT_VERSION,
          exportedAt: documentValue.exportedAt,
          entries: copyEntries(documentValue.entries),
        },
      };
    }

    /* ═══════════════════════════════════════════════════════════════
       VALIDATION
       (Pure function — no DOM or persistence access.)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * validateEntry(date, mood, sleep, water, existingEntries)
     *
     * Validates the raw values read from the form before a new entry is saved.
     *
     * Rules checked in order:
     *   1. All fields present (non-empty string / finite number / selected radio)
     *   2. Date is a real calendar date in YYYY-MM-DD format
     *   3. Mood is an integer in [1, 5]
     *   4. Sleep is a finite number in [0, 24] and a valid 0.5-hour increment
     *   5. Water is a finite number in [0, 3] and a valid 0.1-litre increment
     *   6. The date does not already exist in existingEntries
     *
     * Step checking uses isValidStep() rather than modulo arithmetic because
     * 0.5 and 0.1 cannot be represented exactly in IEEE 754 binary floating
     * point — see isValidStep() for a full explanation.
     *
     * Date calendar validity uses localDateString() for the round-trip
     * comparison rather than toISOString() — see localDateString() for why.
     *
     * @param  {string} date            YYYY-MM-DD string from the date input.
     * @param  {*}      mood            Value of the checked radio button (string "1"–"5").
     * @param  {*}      sleep           Value of the sleep input (may be string or number).
     * @param  {*}      water           Value of the water input (may be string or number).
     * @param  {Array}  existingEntries The current entries array (not modified).
     * @returns {string|null}           Error message string, or null when valid.
     */
    function validateEntry(date, mood, sleep, water, existingEntries) {

      // ── 1. Required fields ────────────────────────────────────────
      if (!date || String(date).trim() === '') {
        return 'Please select a date.';
      }
      if (mood === null || mood === undefined || mood === '') {
        return 'Please select a mood (1–5).';
      }
      if (sleep === null || sleep === undefined || String(sleep).trim() === '') {
        return 'Please enter sleep hours (0–24).';
      }
      if (water === null || water === undefined || String(water).trim() === '') {
        return 'Please enter water intake (0–3 litres).';
      }

      // ── 2. Date format and calendar validity ──────────────────────
      // Regex confirms YYYY-MM-DD shape; localDateString round-trip confirms
      // the date exists on a real calendar (rejects e.g. 2025-02-30).
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return 'Date must be in YYYY-MM-DD format.';
      }
      const parsedDate = new Date(date + 'T00:00:00');
      if (isNaN(parsedDate.getTime()) || localDateString(parsedDate) !== date) {
        return 'Please enter a valid calendar date.';
      }

      // ── 3. Mood ───────────────────────────────────────────────────
      const moodNum = Number(mood);
      if (!Number.isInteger(moodNum) || moodNum < 1 || moodNum > 5) {
        return 'Mood must be a whole number between 1 and 5.';
      }

      // ── 4. Sleep ──────────────────────────────────────────────────
      const sleepNum = Number(sleep);
      if (!isFinite(sleepNum) || sleepNum < 0 || sleepNum > 24) {
        return 'Sleep must be a number between 0 and 24 hours.';
      }
      if (!isValidStep(sleepNum, 0.5)) {
        return 'Sleep must be entered in 0.5-hour increments (e.g. 6, 6.5, 7).';
      }

      // ── 5. Water ──────────────────────────────────────────────────
      const waterNum = Number(water);
      if (!isFinite(waterNum) || waterNum < 0 || waterNum > 3) {
        return 'Water must be a number between 0 and 3 litres.';
      }
      if (!isValidStep(waterNum, 0.1)) {
        return 'Water must be entered in 0.1-litre increments (e.g. 1, 1.5, 2.3).';
      }

      // ── 6. Duplicate date ─────────────────────────────────────────
      const duplicate = existingEntries.some(function (entry) {
        return entry.date === date;
      });
      if (duplicate) {
        return 'An entry for ' + date + ' already exists. Please choose a different date.';
      }

      // All checks passed
      return null;
    }

