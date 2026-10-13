# Wellness Tracker

A browser application and Linux Electron desktop application for recording daily
wellness data. The renderer remains a single `index.html` file built with plain
HTML, embedded CSS, and vanilla JavaScript; Electron and electron-builder provide
the optional desktop shell and AppImage packaging.

> **Demo only: use fictional data. Not for medical use.**

---

## Contents

- [Features](#features)
- [Technology and architecture](#technology-and-architecture)
- [How to run](#how-to-run)
- [Data storage](#data-storage)
- [Backup & Restore](#backup--restore)
- [Validation rules](#validation-rules)
- [Testing](#testing)
- [Maintenance guide](#maintenance-guide)

---

## Features

| Feature | Detail |
|---|---|
| **Log an entry** | Record mood, sleep duration, and water intake for any date using accessible sliders |
| **Slider controls** | Adjust sleep in 0.5-hour steps and water in 0.1-litre steps with range sliders or minus/plus buttons |
| **Unselected values** | Sleep and water begin with "Choose a value"; explicitly selected zero is valid |
| **One entry per day** | Each calendar date can hold exactly one entry |
| **Entry history** | All entries displayed in a table, newest first |
| **Edit an entry** | Load an existing entry and save updated mood, sleep, or water values |
| **Cancel editing** | Leave edit mode without changing stored data |
| **Delete an entry** | Remove any row with a confirmation prompt |
| **Erase all** | Remove every entry with a confirmation prompt |
| **7-entry summary** | Rolling averages for mood, sleep, and water across the seven most recent entries |
| **History & Trends** | Switch between a monthly calendar and three read-only trend charts |
| **Monthly calendar** | Monday-first month navigation, saved-entry indicators, and selectable date details |
| **Calendar actions** | Create an entry for an empty date or edit its saved entry without leaving the calendar context |
| **Trend charts** | Responsive SVG charts for mood, sleep, and water over 7, 30, or 90 calendar days ending today |
| **Exact chart data** | A keyboard-accessible expandable table gives the precise date and value behind each chart point |
| **Backup & Restore** | Export committed entries, preview a strictly validated JSON backup, then explicitly replace all entries if desired |
| **Persistence** | Browser entries use `localStorage`; Electron entries use a JSON file in the app data directory |
| **Offline desktop app** | The Electron version runs locally without a network connection |
| **Responsive layout** | Usable at desktop widths and at narrow mobile viewports (≥ 320 px) |
| **Keyboard accessible** | All controls reachable and operable by keyboard alone |

### Mood scale

| Value | Label |
|---|---|
| 1 | Very poor |
| 2 | Poor |
| 3 | Fair |
| 4 | Good |
| 5 | Excellent |

---

## Technology and architecture

The shared renderer lives in **`index.html`**. It contains an embedded `<style>`
block, an embedded `<script>` block for browser storage, data processing, and
validation functions, and a second `<script>` block for event handlers and
initialisation. The Electron desktop shell is deliberately small: its main
process, restricted preload bridge, and JSON-file storage backend live under
`electron/`.

### Dependencies

- No JavaScript frameworks or libraries
- No CSS frameworks
- Electron and electron-builder are development dependencies
- No backend, accounts, or network calls are required at runtime
- No cookies

### Code organisation

The JavaScript is split into clearly separated layers.  Each layer has a single
responsibility and does not reach into another layer's domain.

```
Browser localStorage ─┐
                      ├─ async storage adapter ─→ entry arrays
Electron IPC/JSON ────┘                              │
                                                     ▼
sortByDateDesc() / calcSummary()       ← pure data processing (no DOM, no storage)
localDateString() / addCalendarDays() / buildTrendSeries() / buildCalendarMonth()
                                       ← pure local-calendar helpers
isValidEntryShape() / validateStoredEntries() / validateEntry()  ← pure validation
createBackupDocument() / parseBackupDocument()                  ← pure backup envelope handling
    │
    ▼
renderSummary() / renderTable() / renderCalendar() / renderCharts()
                                       ← DOM rendering (reads entries array, writes DOM)
    │
    ▼
handleFormSubmit() / handleTableClick() / handleEraseAll() / init()
                                       ← event handlers (orchestrate the layers above)
```

### Data flow on key events

**Page load**
1. `init()` sets the date input to today's local date.
2. The asynchronous storage adapter loads browser `localStorage` or Electron's
   `entries.json`. A missing Electron file starts as an empty dataset.
3. On a read, parse, or integrity failure: the app locks — Save, Delete, and Erase all are
   disabled — and a prominent error banner is shown above the form.
4. On success: `render()` populates the summary, History & Trends views, and entry table.

**Saving an entry**
1. `validateEntry()` checks all four fields.  On error the relevant field receives
   focus and the message appears inline.
2. A candidate array is built with `entries.concat([newEntry])`.
3. The storage adapter writes **before** the in-memory state is
   updated.  If the write fails the existing state is preserved.
4. On success: state updated, form reset, summary and table re-rendered.

**Editing an entry**
1. Click **Edit** in the entry history to load that entry into the form.
2. The date remains read-only while editing; mood, sleep, and water can be changed
   with the sliders or their minus/plus buttons.
3. Click **Save changes** to replace the existing entry without creating a second
   entry. Click **Cancel editing** to discard form changes without modifying storage.

**Deleting an entry**
1. `window.confirm()` asks for confirmation.
2. `entries.filter()` builds the candidate array without mutating `entries`.
3. The storage adapter writes first.  On failure, state is unchanged.
4. On success: focus is restored to the Delete button at the same row position
   (or the previous row, or the Entry History heading if the table is now empty).

**Restoring a backup**
1. The selected file is read and fully validated before the app creates an import preview.
2. **Replace all entries** asks for an explicit confirmation, including the current
   and backup entry counts and any unsaved form changes.
3. A detached replacement array is written through the active storage adapter before
   `entries` changes. If the write fails, the current data, form, and preview remain intact.
4. On success, the preview is cleared, the form returns to new-entry mode, and all
   derived views are re-rendered.

### History & Trends

The **History & Trends** section sits between the recent summary and entry
history. Its two view buttons use a pressed-state indicator; they are ordinary
buttons rather than ARIA tabs, so normal Tab and Enter/Space behaviour applies.

**Calendar** is the default view. It shows a Monday-first monthly grid with
previous/next-month controls. Each date is a button with an accessible label;
dates with saved entries have both a visible **Entry** label and an accessible
entry-recorded description. Selecting a date only shows read-only details—it
does not save or change the form. The detail panel offers:

- **Edit entry** for a date that has an entry. It reuses edit mode, preserves
  the entry date, scrolls to the form, and focuses the mood control.
- **Create entry** for an empty date. It returns the form to new-entry mode,
  pre-fills that date, and leaves mood, sleep, and water unselected.

If either action would discard a changed form, the app asks for confirmation.
Cancelling preserves both the form and calendar selection. Calendar actions are
disabled during a save and when storage has locked the application; selecting a
date and month navigation remain read-only operations.

**Charts** contains separate responsive SVG line charts for Mood (1–5), Sleep
(0–24 h), and Water (0–3 L). Select **7 days**, **30 days** (the default), or
**90 days** to show that inclusive number of local calendar days ending today.
Charts use saved data only: they refresh after a successful create, edit, delete,
or erase operation, never after a failed write or from unsaved form values.

A date with no saved entry is represented as a gap, never as zero; lines are not
drawn across that gap. A recorded zero is retained as a plotted point. Use
**Show exact chart data** to open the accompanying accessible table, which lists
each date and marks absent entries as **Missing**. The SVG charts have titles
and descriptions for assistive technology; the exact-data table is the best way
to inspect individual values with a screen reader or keyboard.

### CSS design tokens

All colours, spacing values, font sizes, and border radii are defined as CSS custom
properties in `:root`.  To restyle the application, edit the token values at the top
of the `<style>` block — no other selectors need changing.

---

## How to run

1. Download or clone this repository.
2. Install the Electron development dependency:

```bash
npm install
```

3. To use the browser version, open `index.html` in any modern browser (Chrome 105+, Firefox 121+, Safari 15.4+,
   Edge 105+).
4. To run the Electron desktop version from source on Linux:

```bash
npm start
```

The desktop application is self-contained and works offline after dependencies
have been installed.

```
# macOS
open index.html

# Linux
xdg-open index.html

# Windows
start index.html
```

Or drag the file into an open browser window.

### Build a Linux AppImage

Build the x86_64 Linux package with:

```bash
npm run dist
```

The generated AppImage is written to `dist/`, using a name similar to
`Wellness Tracker-1.0.0.AppImage`. Make it executable and launch it:

```bash
chmod +x "dist/Wellness Tracker-1.0.0.AppImage"
"dist/Wellness Tracker-1.0.0.AppImage"
```

Running from source uses `npm start`; running the AppImage does not require
Node.js or the repository checkout. The AppImage needs a compatible x86_64
Linux system with glibc 2.25 or later (Ubuntu 20.04 provides glibc 2.31) and FUSE 2 support
(`libfuse2` on Ubuntu) to mount the image. The AppImage uses the custom
512×512 Linux icon at `assets/wellness-tracker-512.png`.

### Install the Ubuntu desktop launcher

After building the AppImage, install it for the current user and add its desktop
launcher with:

```bash
./scripts/install-linux.sh
```

The script does not use `sudo`. It installs the AppImage as
`~/Applications/WellnessTracker.AppImage`, copies the icon into
`~/.local/share/icons/`, and creates
`~/.local/share/applications/wellness-tracker.desktop`. The generated launcher
uses absolute paths and sets `StartupWMClass=wellness-tracker` so Ubuntu can
associate the launcher with the application window.

After rebuilding with `npm run dist`, rerun the same script to refresh the
installed AppImage, icon, and launcher. It replaces only those three files and
does not access or modify Wellness Tracker data.

If the launcher was installed by the older script that predates ownership
markers, verify and adopt it once before refreshing it:

```bash
./scripts/install-linux.sh --adopt-legacy
```

This option verifies the existing launcher, AppImage, and icon before creating
the marker. It refuses unrelated files; later refreshes use the normal command.

### Desktop storage

Electron stores entries in an unencrypted `entries.json` file under Electron's
`app.getPath('userData')` directory. The browser version continues to use the
`wellness-tracker-demo-v1` `localStorage` key. Browser and desktop data are
separate, and no automatic migration is performed between them. Use fictional
demo data only.

### `file://` URL behaviour

`localStorage` behaviour when a page is opened via a `file://` URL is
browser-dependent and not guaranteed by any specification.  Most major browsers
do support `localStorage` for local files, but some apply stricter quotas, isolate
storage per directory, or restrict it in private / incognito windows.  If storage
is unavailable the app will show an error banner above the form and lock all write
operations to protect any existing data.  For the most predictable behaviour,
serve the file from a local web server (e.g. `npx serve .` or VS Code Live Server).

---

## Data storage

### Browser key

Entries are stored under a single `localStorage` key:

```
wellness-tracker-demo-v1
```

To wipe browser data manually, open browser DevTools → Application → Local Storage →
find the key → delete it. The browser app will start fresh on the next page load.

### Desktop file

The Electron application stores the same entry-array format in `entries.json`
under its user-data directory. It does not read, modify, or migrate the browser's
`localStorage` data.

### Entry object

Each entry is a plain JavaScript object with exactly four fields:

```json
{
  "date":  "2025-06-12",
  "mood":  4,
  "sleep": 7.5,
  "water": 1.8
}
```

| Field | Type | Stored as |
|---|---|---|
| `date` | ISO 8601 string (`YYYY-MM-DD`) | string |
| `mood` | Integer 1–5 | number |
| `sleep` | Number, multiples of 0.5 | number |
| `water` | Number, multiples of 0.1 | number |

In the browser, entries are serialised to a JSON array and written as a single
`localStorage` string. In Electron, the same array-of-entry-objects format is
stored in `entries.json` under the application's user-data directory.

### Storage operations

| Operation | What happens in storage |
|---|---|
| Save entry | Existing array read, new entry appended, whole array rewritten |
| Delete entry | Entry filtered out, whole array rewritten |
| Erase all | Empty array `[]` written (key is not removed) |
| Load on start | JSON is parsed; storage failures lock the application and preserve existing data |

### Privacy note

Browser `localStorage` and Electron's `entries.json` are both unencrypted and
are not intended for personal health information. Electron data is a regular
user-data file, not an encrypted vault. **Use fictional demo data only.**

---

## Backup & Restore

The **Backup & Restore** section works offline in both the browser and Electron
desktop application. It uses browser-standard download and file-selection APIs;
no Electron IPC, network service, or separate storage format is required.

### Export a backup

Select **Export backup** to download every committed entry as a readable JSON file
named `wellness-tracker-backup-YYYY-MM-DD.json`, where the date is the UTC export
date. Unsaved form values are never included, and exporting never writes to the
application's normal storage. A healthy empty dataset can also be exported.

Backup files are **unencrypted**. Store them appropriately and use fictional demo
data only.

### Import and preview a backup

Select **Import backup** and choose a JSON file. The file's name and MIME type are
not trusted: its complete contents must be valid JSON and pass strict backup and
entry validation. Files larger than 5 MiB are rejected before reading. Invalid or
unreadable files show an error and leave the current entries and form untouched.

For a valid file, the app displays a read-only preview with the backup entry count,
current saved-entry count, exported timestamp, and date range. A valid empty backup
is shown as **No entries in backup**. While a preview is active, ordinary data
mutations, export, and another import are disabled; chart and calendar browsing
remain available. **Cancel import** clears only the preview and does not change
saved data.

### Replace all entries

The initial import mode is deliberately **replace all**, not merge. Choose
**Replace all entries** in the preview and confirm the dialog to overwrite the
currently saved dataset with the validated backup. The dialog states both entry
counts, warns that replacement is not a merge, advises exporting current data first,
and explains that an empty backup deletes all current entries. If the form has
unsaved changes, the dialog also warns that those values are discarded only after a
successful save.

The app saves through the same browser `localStorage` or Electron `entries.json`
adapter used by normal entry changes. It does not update in-memory entries, clear
the form, or remove the preview until that write succeeds. A failed write preserves
the existing entries, unsaved form values, and validated preview so the user can
retry or cancel.

### Version 1 backup format

Backups are separate from Electron's internal `entries.json` array. Version 1 has
exactly these top-level fields:

```json
{
  "application": "wellness-tracker",
  "backupVersion": 1,
  "exportedAt": "2026-10-13T12:34:56.789Z",
  "entries": [
    { "date": "2026-10-12", "mood": 4, "sleep": 7.5, "water": 1.8 }
  ]
}
```

`exportedAt` must be a canonical ISO 8601 UTC timestamp. Each entry must have
exactly `date`, `mood`, `sleep`, and `water`, and must meet the normal date, range,
step, and unique-date rules. Unsupported versions, unexpected fields, malformed
JSON, invalid entries, and duplicate dates are rejected as a whole; records are
never repaired, skipped, or partially imported.

---

## Validation rules

All four fields are required.  The form uses `novalidate` so the browser's
built-in popups are suppressed and all messages are displayed inline.

| Field | Rule |
|---|---|
| Date | Must be a real calendar date in `YYYY-MM-DD` format |
| Mood | Integer, 1–5 (selected via radio buttons) |
| Sleep | Number, 0–24 hours, in increments of **0.5 h** (e.g. `6`, `6.5`, `7`) |
| Water | Number, 0–3 litres, in increments of **0.1 L** (e.g. `1.0`, `1.5`, `2.3`) |
| Date uniqueness | Only one entry is allowed per calendar date |

Step increments are validated in JavaScript using a floating-point–safe tolerance
check (`Math.abs(value/step - Math.round(value/step)) < 1e-9`).  This is necessary
because `0.1` cannot be represented exactly in IEEE 754 binary floating point
(unlike `0.5`, which is exactly representable), so a naive modulo check such as
`value % 0.1 === 0` produces unreliable results for values like `1.1` or `2.3`.

When validation fails, focus moves to the first field with an error so keyboard
users do not have to search for it.

### Stored-data integrity

On startup, `validateStoredEntries()` checks every loaded entry for correct types,
field ranges, valid calendar dates, and step increments.  It also checks for
duplicate dates in the stored array.  Any failure locks the application to prevent
accidental data loss.

---

## Testing

### Automated tests (Node.js)

The `test/` directory contains a permanent automated test suite using Node.js 24's
built-in `node:test` runner (no external test-framework dependency).

```
test/
├── helpers.js                 — vm extraction helper and in-memory localStorage stub
├── backup.test.js              — Backup envelope creation and strict parsing tests
├── pure.test.js               — 91 tests covering the pure functions
├── storage.test.js            — 20 localStorage tests
├── file-storage.test.js       — JSON-file storage tests using temporary directories
├── electron-security.test.js  — Electron URL/frame and window-focus policy tests
├── install-script.test.js     — Linux installer syntax and ownership tests
├── edit.test.js               — DOM-mock integration tests for the renderer workflow
└── trends-calendar.test.js    — Local-calendar and trend-series helper tests
```

**Run all tests:**

```bash
npm test
```

Expected output: **205 individual tests, 205 pass, 0 fail, 0 skipped.**

**How it works:**  `helpers.js` extracts the first `<script>` block from
`index.html` using a regex, evaluates it in an isolated `vm` context (no
`eval()`, no code copying), and returns the named functions.  This means
the tests always exercise the exact code that runs in the browser.

**Coverage:**

| File | Functions tested |
|------|-----------------|
| `pure.test.js` | `localDateString`, `isValidStep`, `isValidEntryShape`, `validateStoredEntries`, `validateEntry`, `sortByDateDesc`, `calcSummary` |
| `trends-calendar.test.js` | Local-calendar date arithmetic, inclusive 7/30/90-day series, gaps versus zeroes, and Monday-first calendar months |
| `backup.test.js` | Version-1 backup envelope creation, strict parsing, timestamps, detached copies, empty backups, zeroes, and invalid records |
| `storage.test.js` | `loadEntries`, `saveEntries` (round-trip, corrupt data, write failure, read failure) |
| `file-storage.test.js` | JSON-file load/save behavior, atomic replacement, failures, and serialized writes |
| `electron-security.test.js` | Expected local URL/main-frame policy and single-instance window restoration helpers |
| `install-script.test.js` | Shell syntax, atomic replacement safeguards, and legacy-installation adoption checks |
| `edit.test.js` | Browser/Electron adapters, async startup, edit-mode loading, saving, validation, failed writes, cancellation, deletion conflicts, erase-all mode handling, sliders, busy/locked controls, calendar actions, charts, and backup export/import/replace workflow |

The edit tests use a small DOM mock to exercise the event-handler workflow in Node.js
without adding a dependency. Full browser rendering, responsive layout, native
focus behavior, keyboard activation, and real localStorage behavior still require
manual browser testing.

### Manual browser tests

These behaviours require a live browser and cannot be checked with Node.js:

#### Normal workflow
1. Open `index.html` — date field pre-fills with today's date.
2. Fill in all four fields and click **Save entry** — entry appears at the top of
   the table; summary updates.
3. Close and reopen the tab — entries persist.

#### Slider controls
4. Open a new form — Sleep and Water both show **Choose a value**.
5. Move each slider with the mouse and keyboard arrows — the displayed value updates.
6. Use minus/plus — Sleep changes by 0.5 hours and Water by 0.1 litres; buttons
   disable at the minimum and maximum.
7. Explicitly select zero and save — zero is accepted as a valid value.
8. Submit without selecting Sleep or Water — the appropriate required-field error
   appears.

#### Editing
9. Click **Edit** on an entry — its values load into the sliders and the date becomes
   read-only.
10. Change mood, sleep, or water and click **Save changes** — the same row updates
   without increasing the entry count.
11. Click **Cancel editing** after changing a value — stored data remains unchanged
   and the form returns to new-entry mode.
12. While editing, delete another entry and confirm — the edit form remains intact.
   Delete the entry being edited or use **Erase all demo entries** — edit mode ends
   only after the storage write succeeds.

#### Validation
13. Submit the form with one field empty — an inline error appears and focus moves to
   the empty field.
14. Enter `6.3` for sleep — step-increment error shown, focus on sleep field.
15. Enter `1.15` for water — step-increment error shown, focus on water field.
16. Save an entry, then try to save another for the same date — duplicate-date error
   shown, focus on date field.

#### Deletion and erase
17. Click **Delete** on a row, then **Cancel** — entry remains; focus unchanged.
18. Click **Delete**, then **OK** — entry removed; focus moves to the Delete button
   at the same row position (or the previous row if the deleted row was last; or the
   **Entry History** heading if the table is now empty).
19. Click **Erase all demo entries**, then **OK** — table shows "No entries yet";
    summary shows "No entries yet" and "—" dashes.

#### Storage error simulation
20. Open DevTools → Application → Local Storage → set `wellness-tracker-demo-v1`
    to an invalid value (e.g. `not json`).
21. Reload the page — a red error banner appears above the form; Save, Delete, and
    Erase all are disabled; existing storage is not overwritten.

#### Summary window
22. Save 8 entries on consecutive dates.  The summary shows count = 7 and averages
    computed from the 7 most recent dates only.

#### Keyboard navigation
23. Tab through the form — date → mood radios (then arrow keys within the group) →
    sleep → water → Save entry.
24. Tab into the entry table — Delete buttons are reachable.
25. Activate a Delete button with **Space** or **Enter** — confirmation dialog
    appears.
26. All interactive elements show a visible blue focus outline when focused by
    keyboard.

#### History & Trends
27. In **Calendar**, use previous/next month across a year boundary. Select both
    a saved date and an empty date; confirm the detail text and **Entry** marker
    are correct.
28. Use **Edit entry** and **Create entry** from the calendar. With a changed form,
    cancel the discard confirmation and verify the form and selected date remain
    unchanged. Confirm once and verify focus moves to the form.
29. In **Charts**, switch among 7, 30, and 90 days. Verify the range ends on
    today, a deliberately missing date creates a visible line gap, and a saved
    zero appears as a point at the baseline rather than as a gap.
30. Open **Show exact chart data** and navigate the table with a keyboard and a
    screen reader. Verify it distinguishes **Missing** from zero values.

#### Responsive layout
31. Resize the browser window below 600 px, including 320 CSS pixels — form,
    calendar, and charts fit without page-level horizontal overflow; the table
    scrolls only within its own data wrapper.

#### Backup & Restore
32. Export a populated dataset and an empty dataset. Verify the downloaded JSON is
    readable, has backup version 1, preserves zero values, and does not change the
    form, calendar selection, charts, or saved entries.
33. Select a valid backup and verify its preview count, date range, and explicit
    replace-all warning. Cancel the preview and verify no data changes.
34. Try malformed JSON, a backup with an unsupported version, duplicate dates, and
    an invalid field value. Verify each is rejected without changing saved data.
35. Restore a populated backup, then an empty backup. Check the confirmation text,
    refreshed history/summary/calendar/charts, form reset, and keyboard focus.
36. With an edited or partially filled form, begin a restore and cancel the
    confirmation; verify both the form and import preview remain unchanged. Where
    practical, simulate a failed write and verify retry/cancel remain available.

---

## Maintenance guide

### Changing a field range or step

If you want to change, for example, the maximum water intake from 3 L to 5 L:

1. **HTML** — update `max="3"` on `#entry-water`.
2. **`validateEntry()`** — update the range check: `waterNum > 3`.
3. **`isValidEntryShape()`** — update the range check: `entry.water > 3`.
4. **Error messages** — update the user-facing string in `validateEntry()`.

### Adding a new field

1. Add the input to the HTML form with an appropriate `<label>`.
2. Add a CSS style for the new field group if needed.
3. Extend `validateEntry()` with a required-field check and range/step checks.
4. Extend `isValidEntryShape()` to check the new field on stored entries.
5. Read the value in `handleFormSubmit()` and include it in `newEntry`.
6. Add a column to `renderTable()` using `createElement` + `textContent`.
7. Update `calcSummary()` if the new field should appear in the summary panel.
8. Update `renderSummary()` and add a `<dd>` in the summary HTML.
9. Update tests to cover the new field's validation logic.

### Changing the localStorage key

The key is defined as a single constant at the top of the first `<script>` block:

```js
const STORAGE_KEY = 'wellness-tracker-demo-v1';
```

Changing this value means existing entries stored under the old key will no longer
be found.  If you need to migrate data, do so before changing the key.

### Regression checklist after any change

- [ ] All automated tests pass (`npm test`)
- [ ] Form submits a valid entry and it appears in the table
- [ ] Summary averages recalculate correctly
- [ ] Entry persists after page reload
- [ ] Invalid values in every modified field produce the expected error messages
- [ ] Duplicate-date submission is rejected
- [ ] Delete removes the correct entry and restores focus correctly
- [ ] Erase all clears the table and shows the empty state
- [ ] Calendar month navigation and date details stay in sync with saved entries
- [ ] Calendar Create/Edit actions preserve unsaved form changes when confirmation is cancelled
- [ ] Charts show the selected inclusive local-calendar range, with gaps for missing dates and points for zeroes
- [ ] Charts and calendar refresh only after successful storage writes
- [ ] Export contains committed entries only and does not write storage
- [ ] Invalid backups and cancelled imports leave entries and form values unchanged
- [ ] Restore replaces data only after successful storage persistence; empty backups are confirmed explicitly
- [ ] App locks and shows the error banner when localStorage contains invalid JSON
- [ ] All form controls are reachable and operable by keyboard alone
- [ ] Layout is usable at 320 px viewport width

---

## File structure

```
Wellness tracker/
├── .github/workflows/tests.yml # Automated test workflow
├── .gitignore                  # Generated dependency and build-output exclusions
├── assets/
│   └── wellness-tracker-512.png # Linux application icon
├── electron/
│   ├── main.js              # Electron main process and IPC handlers
│   ├── preload.js           # Restricted renderer storage bridge
│   ├── security.js          # Trusted renderer/navigation and IPC checks
│   └── storage.js           # JSON-file storage backend
├── index.html               # Browser and Electron renderer application
├── package.json             # npm scripts and Electron dependency
├── package-lock.json        # Locked npm dependency versions
├── scripts/
│   └── install-linux.sh     # User-local Ubuntu launcher installer
├── test/                    # Node.js automated tests and lightweight mocks
├── README.md                # This file
└── wellness-tracker-plan.md # Original incremental development plan
```

---

*This project was built incrementally as a learning exercise.
It is not intended for clinical, medical, or production use.*
