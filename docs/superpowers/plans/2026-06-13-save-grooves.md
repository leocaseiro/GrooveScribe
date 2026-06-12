# Save Grooves (Local Storage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "My Grooves" personal library to GrooveScribe — save, browse, edit, delete, export, and import grooves via localStorage, all vanilla JS with no build tools.

**Architecture:** A new `grooveStorage` global module wraps localStorage. A new "My Grooves" button in `#upperRight` opens a fixed-position dropdown (same `showContextMenu` pattern as all other menus). Save interactions use a modal popup (same pattern as `#timeSigPopup`). Export is a JSON data-URL download; import reads a file via `FileReader` and merges with duplicate-cloning logic.

**Tech Stack:** Vanilla JS, HTML5, CSS3. No npm. No CDN needed. Legacy codebase — all files are loaded via `<script>` tags in `index.html`. Active CSS file is `css/groove_writer_orange.css`.

---

## Dev Server

All tasks require a running dev server. Start it once and leave it running:

```bash
cd /Users/leocaseiro/Sites/GrooveScribe
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser. Hard-refresh (`Cmd+Shift+R`) after each task.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `js/groove_storage.js` | **Create** | localStorage read/write, import/export logic |
| `index.html` | **Modify** | Script tag, new button, dropdown HTML, save popup HTML, file input, SAVE LOCAL button |
| `css/groove_writer_orange.css` | **Modify** | Styles for dropdown, list items, save popup |
| `js/groove_writer.js` | **Modify** | All UI handler functions (anchor click, render, save, load, delete, export, import) |

---

## Task 1: Create `js/groove_storage.js`

**Files:**
- Create: `js/groove_storage.js`

- [ ] **Step 1: Create the file**

```javascript
// groove_storage.js — localStorage wrapper for personal groove library
var grooveStorage = (function () {
    "use strict";

    var STORAGE_KEY = "GS_my_grooves";

    function load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch (e) {
            return [];
        }
    }

    function persist(grooves) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(grooves));
    }

    // Returns all grooves sorted newest-first.
    function getAll() {
        return load().sort(function (a, b) {
            return new Date(b.savedAt) - new Date(a.savedAt);
        });
    }

    // Upserts by name: replaces if name exists, appends if new.
    function save(groove) {
        var grooves = load();
        var idx = -1;
        for (var i = 0; i < grooves.length; i++) {
            if (grooves[i].name === groove.name) { idx = i; break; }
        }
        groove.savedAt = new Date().toISOString();
        if (idx >= 0) {
            grooves[idx] = groove;
        } else {
            grooves.push(groove);
        }
        persist(grooves);
    }

    function remove(name) {
        persist(load().filter(function (g) { return g.name !== name; }));
    }

    function getByName(name) {
        var all = load();
        for (var i = 0; i < all.length; i++) {
            if (all[i].name === name) return all[i];
        }
        return null;
    }

    // Returns a name that doesn't yet exist, by appending (imported), (imported 2), etc.
    function uniqueImportName(base, grooves) {
        var candidate = base + " (imported)";
        var n = 2;
        while (true) {
            var found = false;
            for (var i = 0; i < grooves.length; i++) {
                if (grooves[i].name === candidate) { found = true; break; }
            }
            if (!found) return candidate;
            candidate = base + " (imported " + n + ")";
            n++;
        }
    }

    // Merges an exported JSON string into the current library.
    // Returns { added: N, cloned: N }.
    function importJSON(json) {
        var data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            throw new Error("Invalid JSON");
        }
        if (!data || !Array.isArray(data.grooves)) {
            throw new Error("Invalid format: missing grooves array");
        }
        var existing = load();
        var added = 0;
        var cloned = 0;
        data.grooves.forEach(function (g) {
            if (!g.name || !g.url) return;
            var hasName = false;
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].name === g.name) { hasName = true; break; }
            }
            if (!hasName) {
                existing.push({
                    name: g.name,
                    artist: g.artist || "",
                    comment: g.comment || "",
                    url: g.url,
                    savedAt: g.savedAt || new Date().toISOString()
                });
                added++;
            } else {
                var cloneName = uniqueImportName(g.name, existing);
                existing.push({
                    name: cloneName,
                    artist: g.artist || "",
                    comment: g.comment || "",
                    url: g.url,
                    savedAt: new Date().toISOString()
                });
                cloned++;
            }
        });
        persist(existing);
        return { added: added, cloned: cloned };
    }

    // Returns a JSON string suitable for download.
    function exportJSON() {
        return JSON.stringify({
            version: 1,
            exported: new Date().toISOString(),
            grooves: load()
        }, null, 2);
    }

    return {
        getAll: getAll,
        save: save,
        remove: remove,
        getByName: getByName,
        importJSON: importJSON,
        exportJSON: exportJSON
    };
})();
```

- [ ] **Step 2: Verify in browser console**

Open `http://localhost:8080` (no script tag yet — open the console and paste):

```javascript
// Paste groove_storage.js content into console, then:
grooveStorage.save({ name: "Test", artist: "Me", comment: "", url: "?TimeSig=4/4" });
console.assert(grooveStorage.getAll().length === 1, "should have 1 groove");
console.assert(grooveStorage.getByName("Test").artist === "Me", "artist should be Me");
grooveStorage.remove("Test");
console.assert(grooveStorage.getAll().length === 0, "should be empty after remove");

var result = grooveStorage.importJSON(JSON.stringify({
    version: 1,
    grooves: [
        { name: "A", url: "?x=1" },
        { name: "B", url: "?x=2" }
    ]
}));
console.assert(result.added === 2 && result.cloned === 0, "should add 2");

var result2 = grooveStorage.importJSON(JSON.stringify({
    version: 1,
    grooves: [{ name: "A", url: "?x=3" }]
}));
console.assert(result2.cloned === 1, "should clone 1");
console.assert(grooveStorage.getByName("A (imported)") !== null, "clone should exist");
localStorage.removeItem("GS_my_grooves"); // cleanup
console.log("All checks passed");
```

Expected: `All checks passed` with no assertion errors.

- [ ] **Step 3: Commit**

```bash
git add js/groove_storage.js
git commit -m "feat(storage): add grooveStorage localStorage module for My Grooves"
```

---

## Task 2: Add HTML Structure to `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the `<script>` tag for `groove_storage.js`**

In `index.html`, find the line:
```html
<script src="js/groove_practices.js"></script>
```

Add the new script tag directly after it:
```html
<script src="js/groove_practices.js"></script>
<script src="js/groove_storage.js"></script>
```

- [ ] **Step 2: Add the "My Grooves" button in `#upperRight`**

Find:
```html
<span class="rightButtons" id="groovesAnchor" onclick="myGrooveWriter.groovesAnchorClick(event);"><i class="fa fa-bars"></i> Grooves</span>
<span class="rightButtons" id="helpAnchor" onclick="myGrooveWriter.helpAnchorClick(event);"><i class="fa fa-bars"></i> Help</span>
```

Replace with:
```html
<span class="rightButtons" id="groovesAnchor" onclick="myGrooveWriter.groovesAnchorClick(event);"><i class="fa fa-bars"></i> Grooves</span>
<span class="rightButtons" id="myGroovesAnchor" onclick="myGrooveWriter.myGroovesAnchorClick(event);"><i class="fa fa-bookmark"></i> My Grooves</span>
<span class="rightButtons" id="helpAnchor" onclick="myGrooveWriter.helpAnchorClick(event);"><i class="fa fa-bars"></i> Help</span>
```

- [ ] **Step 3: Add the "SAVE LOCAL" button in `#bottomButtonRow`**

Find:
```html
<span class=" grooveDB_hidden pageBottomButton" id="saveGroovePracticeButton" onclick="myGroovePractices.saveGroovePractice();"><span class="bottomButtonIcon"><i class="fa fa-save fa-2x"></i></span><span class="bottomButtonLabel">SAVE</span></span>
```

Add immediately before it:
```html
<span class="pageBottomButton edit-block" id="saveLocalButton" onclick="event.preventDefault(); myGrooveWriter.saveCurrentGrooveClick();"><span class="bottomButtonIcon"><i class="fa fa-bookmark fa-2x"></i></span><span class="bottomButtonLabel">SAVE LOCAL</span></span>
<span class=" grooveDB_hidden pageBottomButton" id="saveGroovePracticeButton" onclick="myGroovePractices.saveGroovePractice();"><span class="bottomButtonIcon"><i class="fa fa-save fa-2x"></i></span><span class="bottomButtonLabel">SAVE</span></span>
```

- [ ] **Step 4: Add the My Grooves dropdown `<div>`**

Find:
```html
<div id="grooveListWrapper">
```

Add the following block immediately before that line:
```html
<div id="myGroovesMenu">
    <div id="myGroovesSearchRow">
        <input type="text" id="myGroovesSearchInput" placeholder="Search name, artist, comment..." oninput="myGrooveWriter.filterMyGrooves(this.value);" onclick="event.stopPropagation();">
    </div>
    <div id="myGroovesList">
        <!-- populated by renderMyGroovesList() -->
    </div>
    <div id="myGroovesFooter">
        <span class="myGroovesFooterBtn" onclick="myGrooveWriter.saveCurrentGrooveClick(); event.stopPropagation();">&#128190; Save</span>
        <span class="myGroovesFooterBtn" onclick="myGrooveWriter.saveAsGrooveClick(); event.stopPropagation();">&#128462; Save As</span>
        <span class="myGroovesFooterBtn" onclick="myGrooveWriter.exportGroovesClick(); event.stopPropagation();">&#8593; Export</span>
        <span class="myGroovesFooterBtn" onclick="myGrooveWriter.importGroovesClick(); event.stopPropagation();">&#8595; Import</span>
        <div id="myGroovesStatus"></div>
    </div>
    <input type="file" id="myGroovesImportFile" accept=".json" style="display:none;" onchange="myGrooveWriter.handleImportFile(event);">
</div>
```

- [ ] **Step 5: Add the Save Groove popup `<div>`**

Find:
```html
<!-- this is used by the share/save button, and is hidden by default -->
<div id="fullURLPopup">
```

Add the following block immediately before that comment:
```html
<!-- Save Groove popup — hidden by default -->
<div id="saveGroovePopup">
    <span id="saveGroovePopupClose" onclick="myGrooveWriter.closeSaveGroovePopup();"><i class="fa fa-lg fa-times-circle"></i></span>
    <div id="saveGroovePopupTitle">Save Groove</div>
    <div class="saveGrooveField">
        <label for="saveGrooveName">Name:</label>
        <input type="text" id="saveGrooveName" oninput="myGrooveWriter.saveGrooveNameChanged();">
    </div>
    <div class="saveGrooveField">
        <label for="saveGrooveArtist">Artist:</label>
        <input type="text" id="saveGrooveArtist">
    </div>
    <div class="saveGrooveField">
        <label for="saveGrooveComment">Comment:</label>
        <input type="text" id="saveGrooveComment">
    </div>
    <div id="saveGrooveDuplicateWarning">A groove with this name already exists.</div>
    <div id="saveGroovePopupButtons">
        <button id="saveGrooveNewBtn" onclick="myGrooveWriter.confirmSaveGroove('new');" disabled>Save as New</button>
        <button id="saveGrooveReplaceBtn" onclick="myGrooveWriter.confirmSaveGroove('replace');">Replace Existing</button>
        <button id="saveGrooveCancelBtn" onclick="myGrooveWriter.closeSaveGroovePopup();">Cancel</button>
    </div>
</div>
```

- [ ] **Step 6: Verify HTML is valid**

Reload `http://localhost:8080`. The page should load without errors. Open DevTools Console — no JS errors. "My Grooves" button should appear in the upper-right. "SAVE LOCAL" should appear in the bottom row.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(html): add My Grooves button, dropdown, save popup, and SAVE LOCAL button"
```

---

## Task 3: Add CSS Styles to `css/groove_writer_orange.css`

**Files:**
- Modify: `css/groove_writer_orange.css`

- [ ] **Step 1: Append styles at the end of the file**

Find the last line of `css/groove_writer_orange.css` (currently `}`  closing a `@media print` block). Append the following after all existing content:

```css
/* ===== My Grooves Feature ===== */

#myGroovesMenu {
    display: none;
    position: fixed;
    z-index: 999;
    width: 320px;
    max-height: 420px;
    overflow: hidden;
    background: #eeeeee;
    border: 1px solid #393939;
    border-radius: 3px;
    display: flex;
    flex-direction: column;
}

#myGroovesSearchRow {
    padding: 8px;
    border-bottom: 1px solid #ccc;
    background: #fff;
    flex-shrink: 0;
}

#myGroovesSearchInput {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    font-size: 13px;
    border: 1px solid #999;
    border-radius: 3px;
}

#myGroovesList {
    overflow-y: auto;
    max-height: 260px;
    flex: 1;
}

.myGrooveLI {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid #ddd;
    cursor: pointer;
}

.myGrooveLI:hover {
    background: #ddd;
}

.myGrooveInfo {
    flex: 1;
    min-width: 0;
}

.myGrooveName {
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
}

.myGrooveMeta {
    font-size: 11px;
    color: #666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.myGrooveActions {
    display: flex;
    gap: 4px;
    margin-left: 8px;
    flex-shrink: 0;
}

.myGrooveActionBtn {
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 3px;
    color: #555;
    font-size: 12px;
}

.myGrooveActionBtn:hover {
    background: #bbb;
    color: #000;
}

.myGrooveDeleteConfirm {
    padding: 8px 12px;
    border-bottom: 1px solid #ddd;
    font-size: 12px;
    background: #fff5f5;
    color: #c00;
}

.myGrooveDeleteConfirm .myGrooveDeleteYes,
.myGrooveDeleteConfirm .myGrooveDeleteNo {
    cursor: pointer;
    text-decoration: underline;
    margin-left: 8px;
    font-weight: bold;
}

.myGroovesEmpty {
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
    font-size: 13px;
}

#myGroovesFooter {
    border-top: 1px solid #ccc;
    padding: 6px 8px;
    background: #f5f5f5;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    flex-shrink: 0;
}

.myGroovesFooterBtn {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 3px;
    background: #e0e0e0;
    border: 1px solid #aaa;
    font-size: 12px;
    user-select: none;
}

.myGroovesFooterBtn:hover {
    background: var(--highlight-color);
    color: #fff;
    border-color: var(--highlight-color);
}

#myGroovesStatus {
    width: 100%;
    font-size: 11px;
    color: #555;
    padding-top: 2px;
    min-height: 14px;
}

/* Save Groove Popup */

#saveGroovePopup {
    display: none;
    position: absolute;
    left: 300px;
    top: 200px;
    z-index: 1000;
    background-color: #fff;
    width: 360px;
    padding: 16px;
    border: solid 2px #999;
    border-radius: 5px;
}

#saveGroovePopupClose {
    float: right;
    cursor: pointer;
    color: #999;
    font-size: 18px;
}

#saveGroovePopupClose:hover {
    color: #333;
}

#saveGroovePopupTitle {
    font-size: 18px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 16px;
    margin-right: 20px;
}

.saveGrooveField {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}

.saveGrooveField label {
    width: 68px;
    font-weight: bold;
    font-size: 13px;
    flex-shrink: 0;
}

.saveGrooveField input {
    flex: 1;
    padding: 5px 8px;
    font-size: 13px;
    border: 1px solid #aaa;
    border-radius: 3px;
}

#saveGrooveDuplicateWarning {
    display: none;
    color: #c06000;
    font-size: 12px;
    margin-bottom: 8px;
    padding: 4px 6px;
    background: #fff8ee;
    border-radius: 3px;
}

#saveGroovePopupButtons {
    text-align: center;
    margin-top: 16px;
    display: flex;
    gap: 8px;
    justify-content: center;
}

#saveGroovePopupButtons button {
    font-size: 14px;
    font-weight: 500;
    border: 0;
    border-radius: 5px;
    padding: 6px 14px;
    cursor: pointer;
}

#saveGrooveNewBtn {
    background: var(--highlight-color);
    color: #fff;
}

#saveGrooveNewBtn:disabled {
    background: #ccc;
    color: #888;
    cursor: not-allowed;
}

#saveGrooveReplaceBtn {
    display: none;
    background: #e06600;
    color: #fff;
}

#saveGrooveCancelBtn {
    background: #fff;
    color: #888;
    border: 1px solid #ccc !important;
}
```

- [ ] **Step 2: Verify styles render correctly**

Reload `http://localhost:8080`. In DevTools Console, temporarily show the dropdown and popup to visually verify:

```javascript
// Show the My Grooves dropdown
document.getElementById("myGroovesMenu").style.display = "flex";
document.getElementById("myGroovesMenu").style.top = "50px";
document.getElementById("myGroovesMenu").style.left = "400px";
// Expected: dropdown appears at top-right with search row, empty list area, and footer buttons

// Show the save popup
document.getElementById("saveGroovePopup").style.display = "block";
// Expected: modal appears with title, 3 input fields, and buttons

// Reset
document.getElementById("myGroovesMenu").style.display = "none";
document.getElementById("saveGroovePopup").style.display = "none";
```

- [ ] **Step 3: Commit**

```bash
git add css/groove_writer_orange.css
git commit -m "feat(css): add My Grooves dropdown and save popup styles"
```

---

## Task 4: Add Dropdown Handlers to `js/groove_writer.js`

**Files:**
- Modify: `js/groove_writer.js`

- [ ] **Step 1: Add `escapeHtml` private helper**

Find the line near the top of the GrooveWriter IIFE:
```javascript
function getTagPosition(tag) {
```

Add the following private helper function immediately before `getTagPosition`:

```javascript
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: Add `myGroovesAnchorClick`, `renderMyGroovesList`, and `filterMyGrooves`**

Find the line near the end of `groove_writer.js`:
```javascript
} // end of class
```

Add the following block immediately before that line:

```javascript
    // ===== My Grooves Feature =====

    root.myGroovesAnchorClick = function (event) {
        var contextMenu = document.getElementById("myGroovesMenu");
        if (contextMenu) {
            var anchorPoint = document.getElementById("myGroovesAnchor");
            if (anchorPoint) {
                var anchorPos = getTagPosition(anchorPoint);
                contextMenu.style.top = (anchorPos.y + anchorPoint.offsetHeight) + "px";
                contextMenu.style.left = (anchorPos.x + anchorPoint.offsetWidth - 320) + "px";
            }
            document.getElementById("myGroovesSearchInput").value = "";
            root.renderMyGroovesList("");
            root.myGrooveUtils.showContextMenu(contextMenu);
        }
    };

    root.renderMyGroovesList = function (filter) {
        var grooves = grooveStorage.getAll();
        var lc = (filter || "").toLowerCase();
        if (lc) {
            grooves = grooves.filter(function (g) {
                return (g.name || "").toLowerCase().indexOf(lc) >= 0 ||
                       (g.artist || "").toLowerCase().indexOf(lc) >= 0 ||
                       (g.comment || "").toLowerCase().indexOf(lc) >= 0;
            });
        }
        var listEl = document.getElementById("myGroovesList");
        if (!listEl) return;
        if (grooves.length === 0) {
            listEl.innerHTML = '<div class="myGroovesEmpty">' +
                (lc ? "No matches found." : "No saved grooves yet. Use Save to get started.") +
                '</div>';
            return;
        }
        var html = "";
        grooves.forEach(function (g) {
            var meta = [g.artist, g.comment].filter(Boolean).join(" · ");
            var safeName = g.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            html += '<div class="myGrooveLI" data-groove-name="' + escapeHtml(g.name) + '">';
            html +=   '<div class="myGrooveInfo" onclick="myGrooveWriter.loadSavedGroove(\'' + safeName + '\')">';
            html +=     '<div class="myGrooveName">' + escapeHtml(g.name) + '</div>';
            if (meta) {
                html += '<div class="myGrooveMeta">' + escapeHtml(meta) + '</div>';
            }
            html +=   '</div>';
            html +=   '<div class="myGrooveActions">';
            html +=     '<span class="myGrooveActionBtn" title="Edit" onclick="myGrooveWriter.editSavedGroove(\'' + safeName + '\'); event.stopPropagation();">' +
                          '<i class="fa fa-pencil"></i></span>';
            html +=     '<span class="myGrooveActionBtn" title="Delete" onclick="myGrooveWriter.deleteSavedGrooveConfirm(\'' + safeName + '\'); event.stopPropagation();">' +
                          '<i class="fa fa-trash"></i></span>';
            html +=   '</div>';
            html += '</div>';
        });
        listEl.innerHTML = html;
    };

    root.filterMyGrooves = function (value) {
        root.renderMyGroovesList(value);
    };
```

- [ ] **Step 3: Verify dropdown opens and renders**

Reload `http://localhost:8080`. Save a test groove in the console first:

```javascript
grooveStorage.save({ name: "Test Beat", artist: "Me", comment: "Test", url: "?TimeSig=4/4&Div=16" });
```

Click "My Grooves" in the upper-right. Expected:
- Dropdown appears below the button
- "Test Beat" is listed with "Me · Test" subtitle
- Edit (pencil) and Delete (trash) icons appear on hover
- Typing in the search box filters the list

Clean up: `grooveStorage.remove("Test Beat");`

- [ ] **Step 4: Commit**

```bash
git add js/groove_writer.js
git commit -m "feat(writer): add My Grooves dropdown open/close and list rendering"
```

---

## Task 5: Add Save Popup Flow to `js/groove_writer.js`

**Files:**
- Modify: `js/groove_writer.js` (append to the My Grooves section added in Task 4)

- [ ] **Step 1: Add save popup handlers**

Find the `} // end of class` line. Add the following immediately before it (after the functions from Task 4):

```javascript
    root.openSaveGroovePopup = function (name, artist, comment) {
        document.getElementById("saveGrooveName").value = name || "";
        document.getElementById("saveGrooveArtist").value = artist || "";
        document.getElementById("saveGrooveComment").value = comment || "";
        root.saveGrooveNameChanged();
        document.getElementById("saveGroovePopup").style.display = "block";
    };

    root.closeSaveGroovePopup = function () {
        document.getElementById("saveGroovePopup").style.display = "none";
    };

    root.saveGrooveNameChanged = function () {
        var name = (document.getElementById("saveGrooveName").value || "").trim();
        var exists = name ? grooveStorage.getByName(name) !== null : false;
        document.getElementById("saveGrooveNewBtn").disabled = !name;
        document.getElementById("saveGrooveDuplicateWarning").style.display = exists ? "block" : "none";
        document.getElementById("saveGrooveReplaceBtn").style.display = exists ? "inline-block" : "none";
    };

    root.saveCurrentGrooveClick = function () {
        root.myGrooveUtils.hideContextMenu(document.getElementById("myGroovesMenu"));
        root.openSaveGroovePopup(
            document.getElementById("tuneTitle").value.trim(),
            document.getElementById("tuneAuthor").value.trim(),
            document.getElementById("tuneComments").value.trim()
        );
    };

    root.saveAsGrooveClick = function () {
        root.myGrooveUtils.hideContextMenu(document.getElementById("myGroovesMenu"));
        root.openSaveGroovePopup(
            document.getElementById("tuneTitle").value.trim(),
            document.getElementById("tuneAuthor").value.trim(),
            document.getElementById("tuneComments").value.trim()
        );
    };

    root.confirmSaveGroove = function (action) {
        var name = (document.getElementById("saveGrooveName").value || "").trim();
        var artist = (document.getElementById("saveGrooveArtist").value || "").trim();
        var comment = (document.getElementById("saveGrooveComment").value || "").trim();
        if (!name) return;

        var groove = { name: name, artist: artist, comment: comment, url: get_FullURLForPage() };

        if (action === "new" && grooveStorage.getByName(name)) {
            // Deduplicate: find an unused name suffix
            var n = 2;
            var candidate = name + " (" + n + ")";
            while (grooveStorage.getByName(candidate)) {
                n++;
                candidate = name + " (" + n + ")";
            }
            groove.name = candidate;
        }

        grooveStorage.save(groove);
        root.closeSaveGroovePopup();
    };
```

- [ ] **Step 2: Verify save flow end-to-end**

Reload `http://localhost:8080`. Set a title in the Title field (the text input at the top of the sheet music section). Click "SAVE LOCAL" at the bottom:
- Expected: popup opens with the title pre-filled
- Expected: "Save as New" button is enabled

Type an existing name (use `grooveStorage.save({name:"X",url:"?x=1"})` to seed one), then type "X" in the Name field:
- Expected: warning "A groove with this name already exists" appears
- Expected: "Replace Existing" button appears

Click "Save as New" — popup closes. Check `grooveStorage.getAll()` in console — groove should be saved with a unique name.

Open My Grooves dropdown — saved groove should be listed.

- [ ] **Step 3: Commit**

```bash
git add js/groove_writer.js
git commit -m "feat(writer): add save groove popup flow (open, close, name check, confirm)"
```

---

## Task 6: Add Load, Edit, and Delete Handlers to `js/groove_writer.js`

**Files:**
- Modify: `js/groove_writer.js` (append to the My Grooves section)

- [ ] **Step 1: Add load/edit/delete handlers**

Find the `} // end of class` line. Add immediately before it:

```javascript
    root.loadSavedGroove = function (name) {
        var groove = grooveStorage.getByName(name);
        if (!groove) return;
        root.myGrooveUtils.hideContextMenu(document.getElementById("myGroovesMenu"));
        root.loadNewGroove(groove.url);
    };

    root.editSavedGroove = function (name) {
        var groove = grooveStorage.getByName(name);
        if (!groove) return;
        root.myGrooveUtils.hideContextMenu(document.getElementById("myGroovesMenu"));
        root.openSaveGroovePopup(groove.name, groove.artist, groove.comment);
    };

    root.deleteSavedGrooveConfirm = function (name) {
        var listEl = document.getElementById("myGroovesList");
        if (!listEl) return;
        var items = listEl.querySelectorAll("[data-groove-name]");
        var target = null;
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute("data-groove-name") === name) { target = items[i]; break; }
        }
        if (!target) return;
        var safeName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        target.outerHTML =
            '<div class="myGrooveDeleteConfirm">' +
            'Delete &ldquo;' + escapeHtml(name) + '&rdquo;? ' +
            '<span class="myGrooveDeleteYes" onclick="myGrooveWriter.deleteSavedGroove(\'' + safeName + '\')">Yes, delete</span>' +
            '<span class="myGrooveDeleteNo" onclick="myGrooveWriter.renderMyGroovesList(document.getElementById(\'myGroovesSearchInput\').value)">Cancel</span>' +
            '</div>';
    };

    root.deleteSavedGroove = function (name) {
        grooveStorage.remove(name);
        var filter = document.getElementById("myGroovesSearchInput").value;
        root.renderMyGroovesList(filter);
    };
```

- [ ] **Step 2: Verify load/edit/delete**

Reload `http://localhost:8080`. Seed two grooves:
```javascript
grooveStorage.save({ name: "Beat A", artist: "Artist", comment: "", url: window.location.search || "?TimeSig=4/4&Div=16" });
grooveStorage.save({ name: "Beat B", artist: "", comment: "Cool", url: "?TimeSig=4/4&Div=8" });
```

Open My Grooves dropdown:
- Click "Beat A" name → groove loads (URL changes, sheet music updates). ✓
- Open dropdown again. Click pencil (✎) on "Beat B" → save popup opens pre-filled with "Beat B". ✓
- Open dropdown. Click trash on "Beat A" → inline confirm appears. Click "Yes, delete" → "Beat A" disappears from list. ✓
- Click trash on "Beat B". Click "Cancel" → item stays. ✓

Clean up: `localStorage.removeItem("GS_my_grooves");`

- [ ] **Step 3: Commit**

```bash
git add js/groove_writer.js
git commit -m "feat(writer): add load, edit, and delete handlers for saved grooves"
```

---

## Task 7: Add Export and Import Handlers to `js/groove_writer.js`

**Files:**
- Modify: `js/groove_writer.js` (append to the My Grooves section)

- [ ] **Step 1: Add export/import handlers**

Find the `} // end of class` line. Add immediately before it:

```javascript
    root.exportGroovesClick = function () {
        var json = grooveStorage.exportJSON();
        var dataURL = "data:application/json;charset=utf-8," + encodeURIComponent(json);
        var a = document.createElement("a");
        a.href = dataURL;
        a.download = "groovescribe-my-grooves.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    root.importGroovesClick = function () {
        document.getElementById("myGroovesImportFile").click();
    };

    root.handleImportFile = function (event) {
        var file = event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            var statusEl = document.getElementById("myGroovesStatus");
            try {
                var result = grooveStorage.importJSON(e.target.result);
                var msg = result.added + " imported";
                if (result.cloned > 0) {
                    msg += ", " + result.cloned + " cloned with ‘(imported)’ suffix";
                }
                statusEl.textContent = msg + ".";
                root.renderMyGroovesList(document.getElementById("myGroovesSearchInput").value);
            } catch (err) {
                statusEl.textContent = "Error: " + err.message;
            }
            event.target.value = "";
            setTimeout(function () { statusEl.textContent = ""; }, 4000);
        };
        reader.readAsText(file);
    };
```

- [ ] **Step 2: Verify export**

Seed some grooves:
```javascript
grooveStorage.save({ name: "Export Test 1", artist: "A", comment: "", url: "?TimeSig=4/4&Div=16" });
grooveStorage.save({ name: "Export Test 2", artist: "B", comment: "cool", url: "?TimeSig=4/4&Div=8" });
```

Open My Grooves dropdown. Click "↑ Export". Expected: browser downloads a file named `groovescribe-my-grooves.json`. Open the file — verify it contains both grooves in the expected format with `version: 1` and a `grooves` array.

- [ ] **Step 3: Verify import**

Create a test JSON file `test-import.json` on your desktop:
```json
{
  "version": 1,
  "grooves": [
    { "name": "Import Test New", "artist": "X", "comment": "", "url": "?TimeSig=4/4" },
    { "name": "Export Test 1", "artist": "Duplicate", "comment": "", "url": "?TimeSig=3/4" }
  ]
}
```

Open My Grooves dropdown. Click "↓ Import". Select `test-import.json`. Expected:
- Status line shows: "1 imported, 1 cloned with '(imported)' suffix."
- List now shows "Import Test New" and "Export Test 1 (imported)" as new entries
- Status clears after 4 seconds

- [ ] **Step 4: Verify import error handling**

Open My Grooves dropdown. Click "↓ Import". Select a non-JSON file (e.g., a .txt file). Expected: status line shows an error message like "Error: Invalid JSON."

Clean up: `localStorage.removeItem("GS_my_grooves");`

- [ ] **Step 5: Commit**

```bash
git add js/groove_writer.js
git commit -m "feat(writer): add export JSON download and import JSON merge handlers"
```

---

## Task 8: Final Integration Smoke Test

- [ ] **Step 1: Full end-to-end test**

Reload `http://localhost:8080` from a clean state (no saved grooves). Run through this sequence:

1. Set Title = "My Test Beat", Author = "Drummer Dave" in the sheet music fields
2. Click some notes in the groove editor
3. Click "SAVE LOCAL" at the bottom → popup opens with "My Test Beat" / "Drummer Dave" pre-filled
4. Click "Save as New" → popup closes
5. Open My Grooves dropdown → "My Test Beat" appears with "Drummer Dave" subtitle
6. Modify the groove (click more notes)
7. Click "My Grooves" → footer "Save" → popup opens → click "Save as New" → saved as "My Test Beat (2)"
8. In My Grooves, click "My Test Beat" → groove loads (notes reset)
9. Click pencil on "My Test Beat (2)" → popup opens pre-filled → change name to "Renamed Beat" → Save as New → now shows "Renamed Beat" (original "My Test Beat (2)" replaced)
10. Click trash on "My Test Beat" → confirm → it disappears
11. Click "↑ Export" → file downloads with 2 grooves
12. `localStorage.removeItem("GS_my_grooves")` → My Grooves shows "No saved grooves yet"
13. Click "↓ Import" → select the exported file → "2 imported" status → both grooves reappear

- [ ] **Step 2: Verify no regressions**

Test that existing features still work:
- Grooves menu (built-in grooves) loads a groove correctly
- Help menu opens
- Download menu (MIDI, SVG, etc.) works
- The SAVE button (iframe-only) is still present in the DOM (only hidden, not broken)
- Share/URL popup opens

- [ ] **Step 3: Final commit**

```bash
git add -A
git status  # verify only expected files changed
git commit -m "feat: complete Save Grooves local storage feature (My Grooves)"
```
