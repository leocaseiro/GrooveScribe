# Save Grooves — Local Storage Feature

**Date:** 2026-06-13
**Branch:** save-grooves-import-export
**Status:** Approved — ready for implementation planning

---

## Overview

Add a "My Grooves" personal library to GrooveScribe that lets users save, browse, rename, delete, export, and import grooves — all locally via `localStorage`. No backend, no npm, pure vanilla JS + optional CDN libs.

---

## 1. Data Model

Each saved groove is a plain object:

```json
{
  "name": "My Rock Beat",
  "artist": "John Doe",
  "comment": "Funk groove",
  "url": "?TimeSig=4/4&Div=16&Tempo=80&H=|...|&S=|...|&K=|...|",
  "savedAt": "2026-06-13T12:00:00Z"
}
```

- `name` (= tuneTitle) is the **unique key** — used for duplicate detection and merge deduplication.
- `artist` (= tuneAuthor), `comment` (= tuneComments) are stored for display and search.
- `url` is the full groove URL query string (as produced by `get_FullURLForPage()`).
- `savedAt` is an ISO timestamp.

The full collection is stored under a single localStorage key: `GS_my_grooves` (JSON-encoded array).

---

## 2. Storage Module (`js/groove_storage.js`)

New vanilla JS module exposed as `grooveStorage` global:

| Method | Signature | Description |
|--------|-----------|-------------|
| `getAll` | `() → Groove[]` | Returns the full saved array, sorted by `savedAt` desc. |
| `save` | `(groove) → void` | Upsert by `name` — adds if new, replaces if name already exists. |
| `remove` | `(name) → void` | Deletes the entry with the matching name. |
| `exportJSON` | `() → string` | Returns export blob (see §5). |
| `importJSON` | `(json: string) → { added, cloned }` | Merge-import. Returns counts. |

**Import merge rule:**
- Name doesn't exist → add as-is.
- Name already exists → add with `(imported)` suffix. If that also exists → `(imported 2)`, etc.

---

## 3. UI: New Button in `#upperRight`

Add a new `rightButtons` span between "Grooves" and "Help":

```html
<span class="rightButtons" id="myGroovesAnchor"
      onclick="myGrooveWriter.myGroovesAnchorClick(event);">
  <i class="fa fa-bookmark"></i> My Grooves
</span>
```

Uses the same `showContextMenu()` / `hideContextMenu()` mechanism as all other dropdowns.

---

## 4. My Grooves Dropdown (`#myGroovesMenu`)

A new `.noteContextMenu` div with a custom inner structure (wider than the standard `<ul class="list">` menus):

```
┌─────────────────────────────────┐
│ 🔍 [Search name/artist/comment ] │
├─────────────────────────────────┤
│ My Rock Beat          [▶][✎][🗑] │
│  John Doe · Funk groove          │
│ Jazz Shuffle          [▶][✎][🗑] │
│  (no artist)                     │
│ ···                              │
│ (empty state: "No saved grooves")│
├─────────────────────────────────┤
│ [💾 Save] [💾 Save As]           │
│ [↑ Export] [↓ Import]            │
│ <status line>                    │
└─────────────────────────────────┘
```

- **Search** filters across `name`, `artist`, `comment` (case-insensitive substring). Fuzzy search is out of scope for this iteration.
- **[▶]** loads the groove by calling `myGrooveWriter.loadNewGroove(groove.url)`.
- **[✎]** opens the Save popup pre-filled with this groove's data (rename/update flow).
- **[🗑]** deletes after an inline confirmation text replaces the list item (no `alert()`).
- **[💾 Save]** — quick save: opens the save popup pre-filled with current tuneTitle/Author/Comment. If a saved groove with that name already exists, the popup pre-selects "Replace Existing".
- **[💾 Save As]** — always opens the save popup with name field pre-filled but intent is "new copy"; "Replace" only appears if user types an existing name.
- **[↑ Export]** — triggers JSON download.
- **[↓ Import]** — triggers the hidden `<input type="file">`.
- **Status line** — shows import result or errors inline. Clears after 4 seconds.

The dropdown is repopulated via `renderMyGroovesList()` every time it opens.

---

## 5. Save Popup (`#saveGroovePopup`)

Follows the same pattern as `#timeSigPopup` (fixed-position overlay, shown/hidden by JS):

```
┌─ Save Groove ──────────────────────┐
│ [×]                                │
│ Name:    [My Rock Beat           ] │
│ Artist:  [John Doe               ] │
│ Comment: [Funk groove             ] │
│                                    │
│ ⚠ A groove with this name exists. │ (hidden unless duplicate)
│                                    │
│ [Save as New]  [Replace]  [Cancel] │
│                ("Replace" hidden unless duplicate)
└────────────────────────────────────┘
```

- Name input has an `oninput` handler that checks for duplicates in real time and shows/hides the warning + Replace button.
- **Name is required** — "Save as New" is disabled (greyed out) when the name field is empty.
- "Save as New" always creates a new entry (appends numeric suffix if needed: `"My Beat (2)"`).
- "Replace" overwrites the existing entry with the same name.
- On confirm, closes popup, refreshes dropdown list.
- **Pre-fill source:** name/artist/comment are always read from the current DOM values of `#tuneTitle`, `#tuneAuthor`, `#tuneComments` — there is no "currently loaded saved groove" tracking. If you load "My Rock Beat", edit the title to "My Groove", then click Save, the popup shows "My Groove".

---

## 6. New Local SAVE Bottom Button

Add a new bottom row button `#saveLocalButton` (always visible, not iframe-gated):

```html
<span class="pageBottomButton" id="saveLocalButton"
      onclick="event.preventDefault(); myGrooveWriter.saveCurrentGrooveClick();">
  <span class="bottomButtonIcon"><i class="fa fa-bookmark fa-2x"></i></span>
  <span class="bottomButtonLabel">SAVE</span>
</span>
```

The existing `#saveGroovePracticeButton` (iframe-only, postMessage to GroovePractices) is **left untouched**.

---

## 7. Export / Import JSON Format

**Export** — downloaded as `groovescribe-my-grooves.json` via data URL:

```json
{
  "version": 1,
  "exported": "2026-06-13T12:00:00Z",
  "grooves": [
    {
      "name": "My Rock Beat",
      "artist": "John Doe",
      "comment": "Funk groove",
      "url": "?TimeSig=4/4&Div=16&Tempo=80&H=|...|&S=|...|&K=|...|",
      "savedAt": "2026-06-13T12:00:00Z"
    }
  ]
}
```

**Import merge logic:**
1. Parse JSON; validate it has `grooves` array. On parse error → show error in status line.
2. For each groove in the import:
   - If `name` is not in current storage → add as-is.
   - If `name` already exists → add with `(imported)` suffix (increment number until unique).
3. Show status: _"3 imported, 2 cloned with '(imported)' suffix"_ in the dropdown status line.

---

## 8. Search

Simple case-insensitive substring match on `name + artist + comment`. Runs client-side on every keystroke against the in-memory array. No CDN lib needed for this iteration. Fuzzy search is deferred to a future iteration.

---

## 9. Files

| File | Action | Notes |
|------|--------|-------|
| `js/groove_storage.js` | **Create** | Storage module, no dependencies |
| `index.html` | **Modify** | Add button, dropdown, popup, file input, script tag |
| `js/groove_writer.js` | **Modify** | Add all UI handler functions |
| `css/groove_writer.css` | **Modify** | Styles for dropdown, groove list items, save popup |
| `js/groove_practices.js` | **No change** | iframe SAVE flow left intact |

---

## 10. Out of Scope

- Fuzzy search (deferred)
- Cloud sync
- Ordering/drag-reorder of saved grooves
- Tags or categories
