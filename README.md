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
localDateString() / isValidStep()      ← pure helpers
isValidEntryShape() / validateStoredEntries() / validateEntry()  ← pure validation
    │
    ▼
renderSummary() / renderTable()        ← DOM rendering (reads entries array, writes DOM)
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
4. On success: `render()` populates the summary panel and entry table.

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
├── pure.test.js               — 91 tests covering the pure functions
├── storage.test.js            — 20 localStorage tests
├── file-storage.test.js       — JSON-file storage tests using temporary directories
├── electron-security.test.js  — Electron URL/frame and window-focus policy tests
├── install-script.test.js     — Linux installer syntax and ownership tests
└── edit.test.js               — DOM-mock integration tests for the renderer workflow
```

**Run all tests:**

```bash
npm test
```

Expected output: **150 tests, 150 pass, 0 fail.**

**How it works:**  `helpers.js` extracts the first `<script>` block from
`index.html` using a regex, evaluates it in an isolated `vm` context (no
`eval()`, no code copying), and returns the named functions.  This means
the tests always exercise the exact code that runs in the browser.

**Coverage:**

| File | Functions tested |
|------|-----------------|
| `pure.test.js` | `localDateString`, `isValidStep`, `isValidEntryShape`, `validateStoredEntries`, `validateEntry`, `sortByDateDesc`, `calcSummary` |
| `storage.test.js` | `loadEntries`, `saveEntries` (round-trip, corrupt data, write failure, read failure) |
| `file-storage.test.js` | JSON-file load/save behavior, atomic replacement, failures, and serialized writes |
| `electron-security.test.js` | Expected local URL/main-frame policy and single-instance window restoration helpers |
| `install-script.test.js` | Shell syntax, atomic replacement safeguards, and legacy-installation adoption checks |
| `edit.test.js` | Browser/Electron adapters, async startup, edit-mode loading, saving, validation, failed writes, cancellation, deletion conflicts, erase-all mode handling, slider selection, busy state, and locked controls |

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
8. Submit the form with one field empty — an inline error appears and focus moves to
   the empty field.
5. Enter `6.3` for sleep — step-increment error shown, focus on sleep field.
6. Enter `1.15` for water — step-increment error shown, focus on water field.
7. Save an entry, then try to save another for the same date — duplicate-date error
   shown, focus on date field.

#### Deletion and erase
8. Click **Delete** on a row, then **Cancel** — entry remains; focus unchanged.
9. Click **Delete**, then **OK** — entry removed; focus moves to the Delete button
   at the same row position (or the previous row if the deleted row was last; or the
   **Entry History** heading if the table is now empty).
10. Click **Erase all demo entries**, then **OK** — table shows "No entries yet";
    summary shows "No entries yet" and "—" dashes.

#### Storage error simulation
11. Open DevTools → Application → Local Storage → set `wellness-tracker-demo-v1`
    to an invalid value (e.g. `not json`).
12. Reload the page — a red error banner appears above the form; Save, Delete, and
    Erase all are disabled; existing storage is not overwritten.

#### Summary window
13. Save 8 entries on consecutive dates.  The summary shows count = 7 and averages
    computed from the 7 most recent dates only.

#### Keyboard navigation
14. Tab through the form — date → mood radios (then arrow keys within the group) →
    sleep → water → Save entry.
15. Tab into the entry table — Delete buttons are reachable.
16. Activate a Delete button with **Space** or **Enter** — confirmation dialog
    appears.
17. All interactive elements show a visible blue focus outline when focused by
    keyboard.

#### Responsive layout
18. Resize the browser window below 600 px — form and summary stack to a single
    column; summary tiles reflow to two columns; entry table scrolls horizontally
    without breaking the page layout.

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
