# Wellness Tracker MVP — Implementation Plan

## Top-Level Overview

Build a single `index.html` file containing semantic HTML, embedded CSS, and vanilla JavaScript.  
The app lets a user record daily wellness data (mood, sleep, water), persist entries in `localStorage`,
view them in a sorted table, see a 7-entry rolling summary, and delete individual or all entries.  
No external dependencies, backend, or network calls.  
localStorage key: `wellness-tracker-demo-v1`

---

## Sub-Tasks

---

### Sub-Task 1 — HTML Skeleton

**Intent**  
Establish the full page structure with semantic, accessible markup. All sections that JavaScript will
later populate must already exist as empty containers. Getting the structure right first means CSS and
JS can be added without touching the HTML again.

**Expected Outcomes**
- Page renders in a browser with no JS or CSS and is readable in document order.
- Every form control has an associated `<label>` (or `<legend>` for the radio group).
- Radio buttons for mood (1–5) are inside a `<fieldset>` with a `<legend>`.
- The disclaimer is visible as static text.
- Empty containers exist for: summary panel, validation messages, and the entry table.

**Todo List**
1. Add `<header>` with app title and disclaimer banner.
2. Add `<main>` containing:
   a. `<section id="entry-form-section">` — form with fields: date, mood (radio group), sleep, water, and a "Save entry" submit button; include an empty `<p id="form-error">` for inline validation messages.
   b. `<section id="summary-section">` — heading "Recent Summary" and four `<span>` placeholders (entry count, avg mood, avg sleep, avg water) inside a description list or simple grid.
   c. `<section id="entries-section">` — heading "Entry History", an "Erase all demo entries" button, and an empty `<div id="entries-container">` where the table (or "No entries yet" message) will be injected by JS.
3. Add `<footer>` repeating the disclaimer text.
4. Set `lang="en"` on `<html>`, include a `<meta charset>` and `<meta name="viewport">`.

**Relevant Context**
- Fields: date (YYYY-MM-DD), mood (1–5 radio), sleep (0–24, step 0.5 h), water (0–3, step 0.1 L).
- Mood radio labels must include a short description: 1 Very poor … 5 Excellent.
- "Save entry" is the submit button label.
- "Erase all demo entries" is the bulk-delete button label.

**Status:** [x] done

---

### Sub-Task 2 — Embedded CSS

**Intent**  
Provide a clean, readable, accessible visual design entirely inside a `<style>` block in `<head>`.
The layout must work on both wide desktop viewports and narrow mobile viewports.

**Expected Outcomes**
- Single-column layout on viewports narrower than 600 px; two-column (form + summary side-by-side) at wider widths, OR a clean stacked layout — whichever is simpler to implement and still readable.
- Mood radio buttons render as a horizontal group with visible hit targets.
- Focus indicators are visible on all interactive elements (outline not suppressed).
- Error messages are styled in a distinct colour (e.g. red/dark-red) and are not solely colour-differentiated (use an icon character or prefix word "Error:").
- Disclaimer banner is visually distinct (e.g. light-yellow background, border).
- Entry table is readable with alternating row shading or clear borders.
- Sufficient contrast ratio for all text (target WCAG AA).
- No external fonts, images, or resources are referenced.

**Todo List**
1. CSS reset / box-sizing.
2. Body typography: system font stack, comfortable line-height.
3. Header and disclaimer banner styles.
4. Form layout: stacked labels above inputs, consistent spacing.
5. Mood radio group: horizontal flex row, each option showing value + description.
6. Focus styles: visible `:focus-visible` outline on inputs, buttons, radios.
7. Button styles: primary (Save entry), secondary/danger (Delete, Erase all).
8. Summary panel: grid or flex layout for the four statistics.
9. Entry table: full-width, striped rows, action column right-aligned.
10. Responsive breakpoint: stack or adjust layout below 600 px.
11. Error message style: red text with "Error:" prefix class.
12. Empty-state message style ("No entries yet").

**Relevant Context**
- No external libraries — all styles in one `<style>` block.
- Keep selector specificity low; class-based styling preferred.

**Status:** [x] done

---

### Sub-Task 3 — JavaScript: Storage and Data Helpers

**Intent**  
Implement the lowest-level functions that read from and write to `localStorage`, and the pure data
helpers (sorting, statistics). These have no DOM side-effects, making them easy to reason about and test
mentally before the DOM-manipulation layer is added.

**Expected Outcomes**
- `loadEntries()` returns a parsed array of entry objects from `localStorage`, or `[]` if the key is
  absent or the stored value cannot be parsed as a JSON array.
- `saveEntries(entries)` serialises and writes the array to `localStorage`.
- `sortByDateDesc(entries)` returns a new array sorted newest-first without mutating the input.
- `calcSummary(entries)` takes up to the 7 most recent entries and returns an object with
  `{ count, avgMood, avgSleep, avgWater }` — all averages rounded to one decimal place. Returns `null`
  when the input array is empty.

**Todo List**
1. Declare `STORAGE_KEY = "wellness-tracker-demo-v1"` constant.
2. Implement `loadEntries()` with a try/catch around `JSON.parse`; return `[]` on any error.
3. Implement `saveEntries(entries)`.
4. Implement `sortByDateDesc(entries)` using `Array.prototype.slice().sort()`.
5. Implement `calcSummary(entries)` — slice to 7, compute means, round to 1 dp, return object or `null`.

**Relevant Context**
- Entry object shape: `{ date: "YYYY-MM-DD", mood: Number, sleep: Number, water: Number }`.
- Date string lexicographic sort is correct for ISO format — no Date parsing needed.
- `null` return from `calcSummary` is the signal used by the render layer to show "No entries yet".

**Status:** [x] done

---

### Sub-Task 4 — JavaScript: Validation

**Intent**  
Implement a single validation function that inspects raw form values and returns either a human-readable
error string or `null` (meaning valid). Keeping validation pure (no DOM reads/writes) makes the logic
easy to follow.

**Expected Outcomes**
- `validateEntry(date, mood, sleep, water)` returns a descriptive error string for each invalid case,
  or `null` when all values are valid.
- Errors covered:
  - Any field missing or empty.
  - Mood not in {1, 2, 3, 4, 5}.
  - Sleep outside [0, 24] or not a multiple of 0.5.
  - Water outside [0, 3].
  - Date is a duplicate of an existing entry — this requires the current entries array to be passed in, so the signature becomes `validateEntry(date, mood, sleep, water, existingEntries)`.

**Todo List**
1. Implement `validateEntry(date, mood, sleep, water, existingEntries)`.
2. Check for empty/missing fields first (return early).
3. Check mood is integer in range 1–5.
4. Check sleep is number in [0, 24] with step 0.5.
5. Check water is number in [0, 3].
6. Check `existingEntries` for a matching date (string equality on `entry.date`); return duplicate-date error message if found.
7. Return `null` when all checks pass.

**Relevant Context**
- The form's `step` attributes enforce 0.5 increments on sleep and 0.1 on water at the browser level,
  but validation should not rely solely on browser enforcement.
- Error messages should be plain English, e.g. "Sleep must be between 0 and 24 hours."

**Status:** [x] done

---

### Sub-Task 5 — JavaScript: DOM Rendering

**Intent**  
Implement functions that read the current entries array and update every visible part of the page:
the summary panel and the entry table (or empty-state message). These functions are always called with
the full, already-sorted entries array — they do not read from storage themselves.

**Expected Outcomes**
- `renderSummary(entries)` updates the four statistic spans; shows "No entries yet" state when entries is empty.
- `renderTable(entries)` clears `#entries-container` and either inserts a `<table>` with one row per entry
  (newest first) or a "No entries yet" `<p>`.
- Each table row has a Delete button with a `data-date` attribute set to the entry's date.
- The table is keyboard-navigable (Delete buttons are focusable).

**Todo List**
1. Implement `renderSummary(entries)` — call `calcSummary`, update each stat span; show placeholder text when `null`.
2. Implement `renderTable(entries)` — build and inject table markup, or inject empty-state paragraph.
3. Ensure the Delete button in each row carries `data-date` and an accessible `aria-label` like "Delete entry for YYYY-MM-DD".
4. Apply appropriate CSS classes to the rendered elements (reuse classes from Sub-Task 2).

**Relevant Context**
- `renderTable` should call `sortByDateDesc` before rendering, or the caller always passes a sorted array — decide and document the convention in a code comment.
- Avoid `innerHTML` with unsanitised user input; build elements with `createElement` or ensure date/number values are set via `textContent` / `.value`, not concatenated into HTML strings.

**Status:** [x] done

---

### Sub-Task 6 — JavaScript: Event Handlers and Initialisation

**Intent**  
Wire together all the pieces: form submission, per-row deletion, bulk erase, and the initial page load.
This is the only layer that both reads from the DOM and calls storage/render functions.

**Expected Outcomes**
- On **page load**: entries are loaded from storage, table and summary are rendered.
- On **form submit**: validation runs; if invalid, error message is shown in `#form-error` and nothing is saved; if valid, entry is added to the array, array is saved, form is reset, error is cleared, and table + summary re-render.
- On **Delete button click** (delegated from `#entries-container`): `confirm()` dialog shows "Delete entry for [date]?"; on confirm, entry is removed, storage updated, table + summary re-render.
- On **"Erase all demo entries" click**: `confirm()` dialog shows the agreed message; on confirm, storage is cleared, table + summary re-render.
- Form date field is programmatically set to today's date on load.

**Todo List**
1. Implement `init()` — set today's date on the date input, call `loadEntries`, `renderTable`, `renderSummary`.
2. Attach submit handler to the form:
   a. Read field values.
   b. Call `validateEntry`; if error string returned, display it in `#form-error` and return.
   c. Build entry object, push to entries array, call `saveEntries`, reset form, re-set today's date, clear error, call render functions.
3. Attach click handler to `#entries-container` (event delegation):
   a. Check `event.target` has `data-date`.
   b. Show `confirm()`.
   c. On confirm: filter entry out, `saveEntries`, re-render.
4. Attach click handler to "Erase all demo entries" button:
   a. Show `confirm()` with agreed text.
   b. On confirm: call `saveEntries([])`, re-render.
5. Call `init()` at the bottom of the script (or on `DOMContentLoaded`).

**Relevant Context**
- Event delegation on `#entries-container` avoids re-attaching listeners after every re-render.
- After form reset, the date field must be re-set to today because `form.reset()` clears it.
- `#form-error` must be cleared (empty string) on a successful submission.

**Status:** [x] done

---

## Data Flow Summary

### Page load
```
DOMContentLoaded
  → init()
    → set date input to today
    → loadEntries() → parse localStorage → []  or  [entry, ...]
    → renderTable(entries)
    → renderSummary(entries)
```

### Save entry
```
form "submit" event
  → read date, mood, sleep, water from DOM
  → validateEntry(..., existingEntries)
      → error string  → display in #form-error, stop
      → null          → continue
  → push new entry to entries array
  → saveEntries(entries)
  → form.reset() + re-set today's date + clear #form-error
  → renderTable(entries)
  → renderSummary(entries)
```

### Delete one entry
```
click on Delete button inside #entries-container
  → read data-date from button
  → confirm("Delete entry for [date]?")
      → cancelled  → do nothing
      → confirmed  → filter entries array
                   → saveEntries(entries)
                   → renderTable(entries)
                   → renderSummary(entries)
```

### Erase all
```
click on "Erase all demo entries"
  → confirm("This will permanently delete all entries. Continue?")
      → cancelled  → do nothing
      → confirmed  → saveEntries([])
                   → renderTable([])
                   → renderSummary([])
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Any field empty on submit | `validateEntry` returns error; shown in `#form-error`; form not submitted |
| Mood not selected | Same as above — treated as empty field |
| Sleep or water out of range | `validateEntry` returns specific range error message |
| Duplicate date | `validateEntry` returns "An entry for this date already exists." |
| `localStorage` absent or unparseable | `loadEntries` catches the exception and returns `[]`; app starts fresh |
| `localStorage` contains non-array JSON | Same — checked with `Array.isArray`; falls back to `[]` |

---

## Test Checklist

### Normal usage
- [ ] Enter all fields and click "Save entry" — entry appears at top of table
- [ ] Summary updates to reflect the new entry
- [ ] Enter three fictional entries; confirm newest appears first

### Boundary values
- [ ] Mood = 1 (Very poor) and Mood = 5 (Excellent) both save correctly
- [ ] Sleep = 0 and Sleep = 24 both save correctly
- [ ] Sleep = 0.5 saves correctly; sleep = 0.3 is rejected
- [ ] Water = 0 and Water = 3.0 both save correctly
- [ ] Water = 3.1 is rejected

### Duplicate date
- [ ] Submit two entries for the same date — second attempt shows inline error, first entry unchanged

### Persistence
- [ ] Save an entry, reload the page — entry is still present
- [ ] Summary is correct after reload

### Deletion
- [ ] Click Delete on a row, cancel the dialog — entry remains
- [ ] Click Delete, confirm — entry removed, table and summary update
- [ ] Click "Erase all demo entries", cancel — entries remain
- [ ] Click "Erase all demo entries", confirm — table shows "No entries yet", summary shows empty state

### Empty state
- [ ] On first load with no entries: table shows "No entries yet"
- [ ] Summary shows "No entries yet" (not zero averages)

### Summary window
- [ ] With exactly 7 entries, all 7 are included in averages
- [ ] With 8 entries, only the 7 most recent are included (verify by checking the oldest entry is excluded)

### Keyboard accessibility
- [ ] Tab through all form fields in logical order
- [ ] Mood radio buttons navigable with arrow keys within the group
- [ ] "Save entry" reachable and activatable with Enter/Space
- [ ] Delete buttons in table reachable by Tab and activatable with Enter/Space
- [ ] "Erase all demo entries" reachable and activatable by keyboard
- [ ] Focus indicator visible on every focused element
