# Wellness Tracker

Wellness Tracker is a private, offline-first application for recording daily Mood, Sleep, and Water values and reviewing them through a calendar, charts, statistics, a recent-activity dashboard, and filtered Entry History.

It runs in a browser with `localStorage` or as an Electron desktop application with a local JSON data file. It is a personal record-keeping tool, not a medical device, diagnostic tool, or source of medical advice.

## Features

### Daily entry management

- Record one entry per calendar date: Mood (integer 1–5), Sleep (0–24 hours in 0.5-hour increments), and Water (0–3 litres in 0.1-litre increments).
- Create entries and explicitly edit or delete existing entries.
- Move the native date picker backward or forward by one day while creating an entry. Direct date entry remains available.
- Copy values from the nearest earlier saved entry without copying its date or saving automatically.
- See when the selected date already has an entry and choose **Edit existing entry** rather than accidentally creating a duplicate.
- Preserve form values while navigating to History or changing History & Trends views.

The summary near the entry form describes up to the seven most recently saved entries. This is separate from the Dashboard's seven-calendar-day reporting period.

### History & Trends

History & Trends contains three views:

- **Calendar** — the initial view. It shows saved dates for a selected month, supports month navigation, and provides Edit and Delete actions.
- **Detailed Charts** — configurable single-period and comparison charts with statistics, exact-data tables, and point exploration.
- **Dashboard** — a compact view of the most recent seven calendar days ending on the current local date.

Switching views does not save data, change Entry History filters, discard unsaved entry-form values, or apply pending chart controls.

### Detailed Charts

Single-period charts support:

- Seven-, 30-, and 90-day presets.
- A custom date range of up to 366 inclusive calendar days.
- A calendar month.
- A calendar year displayed as Daily values, Weekly averages, or Monthly averages. Daily is the initial Custom-year display.

Custom mode initially selects the current local calendar year. Calendar-month and calendar-year controls support direct entry plus Previous/Next navigation. A changed draft year, month, range, or display resolution does not affect the displayed charts until **Apply custom period** is selected. Returning to Custom restores the last successfully applied Custom selection.

Comparison charts support:

- Two calendar months aligned by day of month and displayed as daily values.
- Two calendar years displayed as Daily values, Weekly averages, or Monthly averages. Weekly is the initial year-comparison display.
- Previous/Next period navigation, **Swap periods**, **Compare with previous**, and **Previous & current** shortcuts.

Comparison controls are also drafts: charts change only after **Apply comparison**. Comparison differences are always second period minus first period; the application does not interpret a positive or negative difference as a health improvement or deterioration.

Aggregation and missing-data rules:

- Weekly calendar-year periods are consecutive seven-day blocks beginning January 1. There are 53 blocks; the final block contains one day in a common year or two in a leap year.
- Monthly periods use actual calendar-month boundaries.
- Averages use recorded entries only. Missing dates are not treated as zero.
- Genuine recorded zero values for Sleep or Water remain observations.
- Missing observations remain gaps and chart lines are not drawn across them.
- Year-chart axes use January, April, July, October, and December reference labels where applicable.

Each applied period has a collapsed **Period statistics** or **Comparison statistics** disclosure. Statistics include recorded-day and calendar-day coverage, averages, minima, and maxima. Comparisons additionally include second-minus-first average and recorded-day differences. Statistics use committed entries and the entire applied period, independent of whether a year chart is displayed daily, weekly, or monthly.

Interactive chart points provide:

- A compact hover tooltip for quick mouse inspection.
- A pinned tooltip after click or touch, with full details and dismissal by Escape or an outside click.
- One keyboard exploration entry point per metric chart; Left and Right move through recorded observations without creating hundreds of tab stops.
- An explicit First/Second series selector for comparison charts.
- **Show entry in History** for daily observations. Aggregated points describe their date range and coverage instead of navigating to an arbitrary entry.

Exact chart data remains available in semantic, expandable tables. The tables have bounded two-axis scrolling, sticky headings and first columns, and stationary scroll instructions outside their scroll regions.

### Personal Dashboard

The Dashboard covers the most recent seven calendar days ending on the current local date, not the last seven saved entries. Near the lower supported calendar boundary it uses the shorter available range.

It includes:

- Four summary cards: recorded days, Average Mood, Average Sleep, and Average Water.
- Compact daily Mood, Sleep, and Water trends with accessible exact-value disclosures.
- Today's saved-entry status.
- Recent entries from the reporting period, newest first.
- Shortcuts to Detailed Charts and Entry History, plus date-specific **Show in History** actions.

Dashboard averages use recorded days only. Missing dates remain missing and recorded zero values remain zero. The model refreshes after successful committed-data changes. There is no midnight timer: if the Dashboard remains open across midnight without another rendering event, reopen it to rebuild the report for the new local date.

### Entry History

- Filter by inclusive From and To dates using **Show entries**.
- After entries load, initial draft dates cover the earliest through latest saved dates. With no entries they cover the first day of the current local month through today.
- Draft changes do not replace displayed results until **Show entries** is selected. **Clear filters** clears both inputs and applied results.
- Matching entries are ordered newest first and paginated at 25 entries per page. All matches remain accessible, including result sets larger than 100.
- The table scrolls within its own bounded region. Its header row and Date column remain sticky, while summaries and pagination stay outside the scroll region.
- Edit and Delete target entries by saved date, including on later pages.
- Chart tooltips and Dashboard actions can reveal an exact saved date through the same filtering and focus workflow without entering Edit mode automatically.

### Undo deletion

After a successful individual deletion from Calendar or Entry History, a session-only Undo action can restore that entry.

- Only the most recent successful individual deletion is available; another successful deletion replaces it.
- Restoration is built from the current committed collection, so unrelated entries created or edited afterward are preserved.
- Undo never overwrites a newer entry with the same date. A same-date conflict makes that Undo unavailable.
- A failed restoration save keeps Undo available for retry and leaves committed data unchanged.
- Successful **Erase all**, **Replace all from backup**, or a changed backup merge invalidates pending Undo. Successful Undo and ending the session also clear it.
- Previewing or cancelling a merge, a failed merge, and a no-op merge do not invalidate a safe pending Undo.

Undo state is not persisted or restored after restarting the application.

### Backup and Restore

Wellness Tracker exports and imports its version-1 JSON backup format. Backup files contain complete entry values and should be treated as sensitive personal data.

#### Export

**Export JSON backup** downloads a version-1 backup containing the current entries.

#### Replace all from backup

Replace all validates a selected backup, asks for confirmation, and replaces the complete saved collection. Existing entries absent from the backup are removed. This is intentionally separate from merging.

#### Preview and merge a backup

**Preview merge from backup** validates a version-1 backup without modifying saved entries. It classifies imported entries as:

- **New** — the date is not currently saved and would be added.
- **Identical** — the date and all values already match.
- **Conflicting** — the date exists with one or more different values.

The preview shows imported date coverage, paginates new entries at 25 per page, and displays both complete versions of every conflict. Each conflict begins unresolved. Select **Keep existing** or **Use backup** for every date. **Keep all existing** and **Use all backup** set all current draft choices, but do not save or merge; individual choices can still be changed.

**Merge backup** remains unavailable until every conflict is resolved and always requires an explicit action. Before saving, the application rechecks the imported data and choices against current committed entries. A stale preview is invalidated or refreshed rather than applying old decisions unexpectedly.

A changed merge adds genuinely new entries, keeps unrelated current entries, and replaces only conflicts explicitly marked **Use backup**. It saves the complete candidate once and updates the interface only after persistence succeeds. If the result already matches saved data, it reports that no changes are needed and avoids a save. Cancelling never changes entries; a failed merge leaves committed entries unchanged and preserves still-valid choices for retry.

## Technology and architecture

- HTML, CSS, and vanilla JavaScript.
- Electron for the desktop shell.
- Node's built-in test runner and Playwright Core connected to Electron.
- Electron Builder for Linux AppImage packaging.
- No charting framework or runtime web service.

Responsibilities are separated across `js/core.js` (pure calculations and validation), `js/views.js` (DOM/SVG rendering), `js/app.js` (controller state, events, storage-first mutations, and focus), and `electron/` (desktop shell, preload bridge, persistence, and E2E profile checks).

## Running the application

### Prerequisites

- Node.js and npm. Node.js 24 is used by current CI.
- A graphical Linux environment for Electron, or Xvfb for headless E2E testing.

```bash
npm install
npm start
```

The static browser version can also be served or opened in a modern browser. Browser and Electron storage are separate; there is no automatic migration.

### Tests

```bash
npm test
npm run test:e2e
```

The E2E runner creates verified isolated Electron `userData` profiles, keeps Chromium sandboxing enabled, and refuses unsafe profile paths before data mutations.

### Linux package and installation

Build the x64 Linux AppImage:

```bash
npm run dist
```

Artifacts are written under ignored `dist/`. For a user-local installation of a built AppImage, the repository provides:

```bash
bash scripts/install-linux.sh
```

The installer uses user-owned locations and does not require `sudo`. Review its usage output before replacing an installation.

## Data storage and privacy

### Browser

The browser build stores entries in `localStorage` for the page origin.

### Electron

Electron stores entries in `entries.json` under its application `userData` directory. Writes use a temporary file followed by rename and are serialized. The renderer receives only the narrow `loadEntries` and `saveEntries` preload API.

Electron uses context isolation, renderer sandboxing, disabled Node integration, restricted navigation/window creation, and IPC sender validation.

### Privacy notes

- Saved entries and exported backups are local and are not encrypted by the application.
- Anyone with access to the operating-system account, data directory, or backup file may be able to read them.
- Keep backups in a location appropriate for personal wellness information.
- There is no online account or sync service. Normal tracking, charting, History, Dashboard, and backup workflows work offline after installation.
- Browser storage can be cleared by settings, private-browsing behavior, or origin changes. Keep independent backups of important data.

## Backup format and validation

Current exports use backup version 1 and include an ISO timestamp plus validated entries. Imports reject malformed JSON, unsupported versions, invalid values or dates, and duplicate dates. Merge candidates preserve date uniqueness and newest-first ordering; merging does not introduce a second format.

Validation rules:

- Dates use `YYYY-MM-DD` and support years `0000`–`9999` where native controls permit entry.
- Entry dates must be unique.
- Mood is an integer from 1 to 5.
- Sleep is 0–24 hours in 0.5-hour increments.
- Water is 0–3 litres in 0.1-litre increments.
- Custom manual chart ranges allow at most 366 inclusive days.
- Invalid or reversed ranges are rejected rather than silently swapped.

Calendar calculations preserve leap-day behavior and avoid JavaScript's special remapping of years 0–99.

## Testing and verification

At completion of `feature/wellness-experience`, the repository declares:

- 374 individual Node tests.
- 32 Electron E2E scenarios.

Coverage includes validation and calendar arithmetic, charts and statistics, point interaction, logging helpers, History pagination, Undo, backup replacement and merging, Dashboard behavior, storage failures, accessibility markup, responsive geometry, and isolated persistence.

E2E includes rendered checks at 320, 375, 420, and 1024 CSS pixels, keyboard navigation, Chromium accessibility-tree inspection, and cleanup/profile safety. Exact totals should be reconfirmed whenever tests change.

Linux verification also included `git diff --check`, a successful AppImage build, launching it with an isolated profile, opening all three History & Trends views and Entry History, and confirming fictional-entry persistence after restart.

Known verification limitations:

- Chromium accessibility metadata and keyboard behavior were inspected, but no actual screen-reader application was used.
- Physical touch and trackpad gestures were not tested.
- Linux packaging emits a non-blocking warning because `package.json` has no author metadata.

### Suggested manual regression checks

1. Create, edit, delete, and Undo entries; confirm restart persistence.
2. Navigate dates and copy previous values without an automatic save.
3. Exercise Calendar, Detailed Charts, and Dashboard with keyboard-only navigation.
4. Confirm draft chart controls do not change charts before Apply.
5. Explore daily and aggregated chart points with mouse, keyboard, and touch-capable input where available.
6. Inspect statistics and exact-data scrolling at 320, 375, 420, and desktop widths.
7. Filter more than 25 History entries and edit/delete on a later page.
8. Test backup export, Replace all, and a merge containing new, identical, and conflicting entries.
9. Confirm individual and bulk conflict choices still require **Merge backup**.
10. For release accessibility assurance, repeat major workflows with the target screen reader and platform.

## Platform support

The Electron application and AppImage have been built and exercised on Linux. Electron E2E runs on Linux with Chromium sandboxing, including an Ubuntu/Xvfb CI environment.

macOS and Windows desktop packages are not configured or verified, so support for them should not be assumed. The browser build uses standards-based HTML, CSS, and JavaScript, but browser/platform combinations outside the tested Chromium environment should be verified before making compatibility claims.

## Maintenance guide

1. Keep calculations and validation pure in `js/core.js` where practical.
2. Keep `js/views.js` rendering-only and controller state in `js/app.js`.
3. Preserve storage-first mutations: save candidates before changing committed memory.
4. Preserve draft/applied separation for chart and History controls.
5. Treat missing observations differently from recorded zeroes.
6. Keep backup Replace all and Merge workflows separate.
7. Maintain Electron sandboxing, context isolation, navigation restrictions, and isolated E2E profiles.
8. Add focused Node coverage and proportional Electron coverage.
9. Run `npm test`, `npm run test:e2e`, and `git diff --check` before handoff.
10. Rebuild with `npm run dist` when package metadata, Electron configuration, preload, storage, or packaged assets change.

## File structure

```text
.
├── index.html
├── styles/app.css
├── js/
│   ├── core.js
│   ├── views.js
│   └── app.js
├── electron/
│   ├── main.js
│   ├── preload.js
│   ├── storage.js
│   └── e2e-config.js
├── scripts/install-linux.sh
├── test/
├── e2e/
├── package.json
└── README.md
```

`dist/`, `node_modules/`, and the local `backups/` working directory are ignored by Git.
