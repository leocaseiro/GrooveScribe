# Guitar Pro Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download Guitar Pro file" item to GrooveScribe's download menu that exports the current groove as a `.gp` (Guitar Pro 7/8) file.

**Architecture:** Reuse GrooveScribe's existing ABC engine (`createABCFromGrooveData`, which already has correct durations/triplets/merged-rests) and translate its `V:Hands` line token-by-token into **alphaTex**; alphaTab's `AlphaTexImporter` builds a `Score`, `Gp7Exporter` writes a `.gp` (`Uint8Array`), which the browser downloads via a `Blob`. The stickings/counting row becomes a **second text-only voice** added to each bar via alphaTab's model API. alphaTab is lazy-loaded from the **jsDelivr CDN** (pinned `1.8.3` + SRI) and runtime-cached by `sw.js` for offline use.

**Tech Stack:** Vanilla JS (browser globals, no build step), alphaTab 1.8.3 (CDN in browser / npm in the Node test harness), Node.js `node:test` for the verification harness.

---

## Spike provenance (already validated — do not re-derive)

This plan is seeded by a validated step-0 spike (`jstools/guitarpro-spike/`) plus a planning-time validation run. The following are **confirmed facts**, not assumptions:

- **Durations round-trip.** `createABCFromGrooveData` → ABC → alphaTex → alphaTab gives correct durations: sparse snare on beat 1 = `Snare.4` (quarter), merged rests `z8`→`r.4`, chords `[^g4F4]`→`(HiHat Kick).8`, triplets `(3:3:3…`→`{tu 3}`. **Rule: alphaTex duration number = `32 / abc_units`** (ABC is `L:1/32`), and alphaTab's `Duration` enum *value* equals that same number (`Duration.Eighth === 8`, `Duration.Quarter === 4`, `Duration.Sixteenth === 16`).
- **Beat text → GPIF.** `{txt "1"}` on a beat exports as `<FreeText><![CDATA[1]]></FreeText>` (confirmed by unzipping the `.gp`).
- **Second voice via model API works.** `bar.addVoice(new alphaTab.model.Voice())`, `voice.addBeat(beat)` (rest beat = `new Beat()` with no notes, `beat.text = "…"`, `beat.duration = <enum>`), then `score.finish(settings)`. A 16-count voice exported with all counts as FreeText. **Inline alphaTex multi-voice (`\voice`) does NOT work in 1.8.3** — it collapses to one voice. Use the model API.
- **Time signatures / tuplets / empty bar** all import+export cleanly: `\ts 7 8`→7/8, `\ts 3 4`→3/4, `r.1`→whole rest, `{tu 3}`→`<PrimaryTuplet num="3" den="2"/>`.
- **CDN file:** `https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/alphaTab.min.js` returns HTTP 200, `access-control-allow-origin: *` (CORS-enabled → SW-cacheable, non-opaque), 1,120,798 bytes (~280 KB gzip).
- **Real SRI hash (sha384):** `sha384-qUm2Zrf12JTeEmtMQAdvtbVFGrxkxSSrmqyEU4avNOo/QxYnmgpDsfsdWvYrhmxw`

### Ground-truth ABC for the fixtures (real `createABCFromGrooveData` output)

These exact strings are the test oracle. (`V:Hands` line only; `kickStemsUp=true` merges the kick into the Hands chords; `||` ends the groove, `|` separates measures.)

| Fixture (URL params after `TimeSig=…&Div=…&`) | `V:Hands` music |
| --- | --- |
| Rock `H=\|x-x-x-x-x-x-x-x-\|&S=\|----o-------o---\|&K=\|o-------o-------\|` | `[^g4F4]^g4 [c4^g4]^g4 [^g4F4]^g4 [c4^g4]^g4 \|\|` |
| Sparse snare `S=\|o---…\|` (H,K empty) | `c8 z8 z8 z8 \|\|` |
| Sparse kick+snare `K=\|o…\|&S=\|----…o…\|` | `F8 z8 c8 z8 \|\|` |
| Triplet `Div=12 H=\|xxxxxxxxxxxx\|&K=\|o--o--o--o--\|` | `(3:3:3[^g4F4]^g4^g4 (3:3:3[^g4F4]^g4^g4 …` |
| Accent HH+SN `H=\|X-…\|&S=\|----O-…\|` | `!accent![^g4F4]!accent!^g4 !accent![c4^g4]!accent!^g4 …` |
| Open HH `H=\|o-o-…\|` | `!open![^g4F4]!open!^g4 …` |
| Ghost SN `S=\|--g-o---g---g-o-\|` | `[^g4F4][!(.!!).!c4^g4] [c4^g4]^g4 …` |
| Flam SN `S=\|f-------f-------\|` | `!accent!{/c}c8 z8 !accent!{/c}c8 z8 \|\|` |
| Drag SN `S=\|d-------d-------\|` | `{/cc}c8 z8 {/cc}c8 z8 \|\|` |
| Buzz SN `S=\|b-------b-------\|` | `!///!c8 z8 !///!c8 z8 \|\|` |
| Cross-stick `S=\|x-------x-------\|` | `^c8 z8 ^c8 z8 \|\|` |
| Kick+splash `K=\|X-------X-------\|` | `[F^d,]8 z8 [F^d,]8 z8 \|\|` |
| Ride/Bell/Crash/Cowbell/Stacker `H=\|r-b-c-m-s-…\|` | `^A'4^B'4 ^c'4^D'4 ^d'4^A'4 ^B'4^c'4 \|\|` |
| Click `H=\|n-N-…\|` | `^e'4^f'4 ^e'4^f'4 …` |
| Toms `T1=\|o---o-…\|&T4=\|--------o---o---\|` | `e8 e8 A8 A8 \|\|` |
| 3/4 `?TimeSig=3/4` | `[^g4F4]^g4 [c4^g4]^g4 [^g4F4]^g4 \|\|` (6 eighths) |
| 7/8 `?TimeSig=7/8` | `[^g4F4]^g4 ^g4^g4 ^g4^g4 ^g4\|\|` (7 eighths) |
| Counting stickings (`V:Stickings` line) | `"1"x2"e"x2"&"x2"a"x2 "2"x2"e"x2"&"x2"a"x2 …` |
| R/L/B stickings (`V:Stickings` line) | `"R"x2"L"x2"R"x2"L"x2 …` |
| Empty groove | `z8 z8 z8 z8 \|\|` |

## Scope Check

This is a single cohesive subsystem (one export path, one new module, four small edits). It is **not** split into sub-plans — every task below builds toward the same shippable feature, and the feature is testable end-to-end from Task 2 onward.

## File Structure

| File | New/Edit | Responsibility |
| --- | --- | --- |
| `js/groove_to_guitarpro.js` | **New** | Pure-ish generator. Global `GrooveToGuitarPro` with: `createAlphaTex(grooveData, grooveUtils)` (ABC→alphaTex drum voice), `createStickingVoice(grooveData, grooveUtils)` (per-measure text-beat data), `createGpData(grooveData, grooveUtils, alphaTab)` (import + add text voice + export `Uint8Array`), `escapeAlphaTex(str)`, and the `ARTICULATION_MAP` table. No DOM. |
| `jstools/verify_guitarpro_export.mjs` | **New** | Node `node:test` harness: loads `groove_utils.js` + `groove_to_guitarpro.js` headless, requires alphaTab from npm, asserts each fixture (no parse error, bar/beat counts, articulations, effects, tuplets, stickings text) **and that generated durations match GrooveScribe's own ABC engine** (§10-F2). |
| `js/groove_writer.js` | **Edit** | Add `root.GPSaveAs` + `loadAlphaTab(onLoad, onError)` (CDN inject + SRI + `onerror`/retry + double-injection guard) + `sanitizeFilename`. Mirrors `MIDISaveAs`. Reuses existing `root.grooveDataFromClickableUI()`. |
| `index.html` | **Edit** | Load the new module (`<script>`) + add one `<li>` to `#downloadContextMenu`. |
| `sw.js` | **Edit** | Precache the new module, add a runtime-cache fetch branch for the alphaTab CDN URL, bump `version` `1.2.1`→`1.2.2`. |

**Module loading convention (browser + Node):** `groove_to_guitarpro.js` declares a top-level `var GrooveToGuitarPro = (function () { … return { … }; })();`. In the browser this attaches to `window`; the Node harness loads it with `vm.runInThisContext` over a `globalThis.window = globalThis` shim (same technique the spike uses for `groove_utils.js`) and reads `globalThis.GrooveToGuitarPro`. No `module.exports` — keep the browser file clean.

---

## Task 0: Prerequisite — refresh the stale base so `sw.js` exists

**Files:** none (git only)

This worktree's base predates `sw.js` and other recent commits. `sw.js` exists on `origin/master` (verified after fetch) but is **absent from the working tree**. You must rebase/merge before Task 13 (and before relying on the latest `groove_utils.js`).

- [ ] **Step 1: Fetch and inspect**

```bash
cd /Users/leocaseiro/Sites/GrooveScribe/.claude/worktrees/guitar-pro-export
git fetch origin
git log --oneline -1 origin/master
git cat-file -e origin/master:sw.js && echo "sw.js present on origin/master"
```
Expected: `sw.js present on origin/master`.

- [ ] **Step 2: Rebase the worktree branch onto the refreshed master**

```bash
git rebase origin/master
```
Expected: clean rebase (the spec + spike commits replay on top). If conflicts occur, resolve them (none expected — the new files don't exist upstream), then `git rebase --continue`.

- [ ] **Step 3: Confirm `sw.js` is now in the working tree**

```bash
ls -1 sw.js && head -1 sw.js
```
Expected: `sw.js` listed; first line `var version = '1.2.1';`.

- [ ] **Step 4: Confirm the spike still runs against the refreshed `groove_utils.js`**

```bash
node jstools/guitarpro-spike/abc_headless.cjs | head -5
```
Expected: prints the rock-beat ABC (`[^g4F4]^g4 …`). No commit needed — this task only updates the base.

---

## Task 1: Generator skeleton + rock beat (chords, eighths) + end-to-end `.gp`

**Files:**
- Create: `js/groove_to_guitarpro.js`
- Create: `jstools/verify_guitarpro_export.mjs`
- Create: `package.json` (if absent — for the alphaTab dev dependency)

- [ ] **Step 1: Add the alphaTab dev dependency for the harness**

The browser loads alphaTab from CDN; the Node harness needs it locally. If no `package.json` exists at repo root, create one:

```json
{
  "name": "groovescribe",
  "private": true,
  "devDependencies": {
    "@coderline/alphatab": "1.8.3"
  }
}
```

Then:

```bash
npm install
```
Expected: `node_modules/@coderline/alphatab` present. (If a `package.json` already exists, instead run `npm install --save-dev @coderline/alphatab@1.8.3`.)

- [ ] **Step 2: Write the failing test (harness skeleton + rock beat)**

Create `jstools/verify_guitarpro_export.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// IMPORTANT: require alphaTab BEFORE the window shim below. alphaTab's bundle runs
// a browser DOM polyfill (`'replaceChildren' in Element.prototype`) at load time
// when `window` exists, which throws `Element is not defined` in Node. Loading it
// first (while `window` is still undefined) takes its non-browser path.
const alphaTab = require('@coderline/alphatab');
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// --- load GrooveScribe globals headless (same shim approach as the spike) ---
function loadGrooveScribe() {
  // Only set globals that aren't already defined. In Node 21+ `navigator` is a
  // READ-ONLY global, so assigning it throws in ESM strict mode (the spike's .cjs
  // silently no-op'd it in sloppy mode). The native navigator has .userAgent,
  // which is all groove_utils.js reads.
  const setGlobal = (name, value) => {
    try { if (typeof globalThis[name] === 'undefined') globalThis[name] = value; } catch (_) { /* read-only native global */ }
  };
  setGlobal('window', globalThis);
  setGlobal('navigator', { userAgent: 'node' });
  setGlobal('document', {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, click() {}, getContext: () => null }),
    querySelector: () => null, querySelectorAll: () => [], write() {}, addEventListener() {},
  });
  setGlobal('location', { href: '', search: '', pathname: '' });
  setGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  setGlobal('alert', () => {});
  vm.runInThisContext(readFileSync(join(repoRoot, 'js/groove_utils.js'), 'utf8'), { filename: 'groove_utils.js' });
  vm.runInThisContext(readFileSync(join(repoRoot, 'js/groove_to_guitarpro.js'), 'utf8'), { filename: 'groove_to_guitarpro.js' });
  return { GrooveUtils: globalThis.GrooveUtils, GrooveToGuitarPro: globalThis.GrooveToGuitarPro };
}

const { GrooveUtils, GrooveToGuitarPro } = loadGrooveScribe();
const gu = new GrooveUtils();

// --- helpers shared by all tests ---
// getGrooveDataFromUrlString does my_string.substring(1) (it expects a leading '?'
// like location.search). Without it, the FIRST param loses its leading char —
// "TimeSig=3/4" becomes "imeSig=3/4" and silently falls back to 4/4. Prepend '?'
// when absent so non-4/4 fixtures are actually exercised, not vacuously passing.
export function grooveFromUrl(url) { return gu.getGrooveDataFromUrlString(url[0] === '?' ? url : '?' + url); }

export function importTex(tex) {
  const settings = new alphaTab.Settings();
  const imp = new alphaTab.importer.AlphaTexImporter();
  imp.initFromString(tex, settings, null);
  return { score: imp.readScore(), settings };
}

// flat list of voice-0 beat duration enum names across all bars (rests prefixed 'r')
export function beatDurations(score) {
  const out = [];
  for (const bar of score.tracks[0].staves[0].bars) {
    for (const b of bar.voices[0].beats) {
      out.push((b.isRest ? 'r' : '') + alphaTab.model.Duration[b.duration]);
    }
  }
  return out;
}

test('rock beat: chords + eighths import and export', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  const { score } = importTex(tex);
  // 8 beats, all eighths
  assert.deepEqual(beatDurations(score),
    ['Eighth','Eighth','Eighth','Eighth','Eighth','Eighth','Eighth','Eighth']);
  // beat 0 is a 2-note chord (HiHat + Kick)
  assert.equal(score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes.length, 2);
  // end-to-end export does not throw and yields bytes
  const bytes = GrooveToGuitarPro.createGpData(gd, gu, alphaTab);
  assert.ok(bytes.length > 100, 'exported .gp has content');
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: FAIL — `groove_to_guitarpro.js` does not exist (`ENOENT`) or `GrooveToGuitarPro` is undefined.

- [ ] **Step 4: Write the minimal implementation**

Create `js/groove_to_guitarpro.js`:

```js
// Guitar Pro export generator. Translates GrooveScribe's ABC (V:Hands line)
// into alphaTex, then (in the browser) hands it to alphaTab to write a .gp file.
// No DOM access — `alphaTab` is injected so this module never reaches for a global.
var GrooveToGuitarPro = (function () {
  'use strict';

  // ABC pitch token -> { name, midi }. Keys are the constant_ABC_* pitch values
  // (decorations like !accent! / !open! are handled separately in resolveArticulation).
  // Grows in Task 5. Rock beat needs only these three.
  var ARTICULATION_MAP = {
    '^g': { name: 'HiHat', midi: 42 },
    'c':  { name: 'Snare', midi: 38 },
    'F':  { name: 'Kick',  midi: 36 },
  };

  // alphaTex duration number = 32 / abc_units (ABC is L:1/32).
  function durFromUnits(units) { return 32 / units; }

  // Extract the V:Hands music (across measures) from full ABC, skipping the
  // optional on-screen legend (which also contains a V:Hands line in the header).
  function extractHandsMusic(abc) {
    var clefIdx = abc.indexOf('K:C clef=perc');
    if (clefIdx === -1) return '';                 // unexpected ABC shape — fail closed, don't slice(-1)
    var afterClef = abc.slice(clefIdx);
    var m = afterClef.match(/V:Hands[^\n]*\n%%voicemap drum\n([\s\S]*?)(?:\nV:|\nT:|$)/);
    return m ? m[1].replace(/\n/g, ' ').trim() : '';
  }

  function articulationFor(pitch) { return ARTICULATION_MAP[pitch] || null; }

  // Resolve one ABC pitch segment to an alphaTex articulation name.
  // Task 1: pitch only. Task 6 replaces this to also handle decorations (the
  // third `extraDecs` param). Returns null for unknown pitches.
  function resolveNote(seg, usedNames, extraDecs) {
    var pm = seg.match(/^(\^?[A-Ga-g][,']*)/);
    if (!pm) return null;
    var art = articulationFor(pm[1]);
    if (!art) return null;
    usedNames[art.name] = art.midi;
    return art.name;
  }

  // Hand-written scanner over the V:Hands line. A regex-per-token approach can't
  // handle BOTH chord forms GrooveScribe emits: a normal chord puts the duration
  // INSIDE ([^g4F4], no trailing digit), while the kick+splash literal puts it
  // AFTER ([F^d,]8). The scanner reads an optional trailing duration and falls
  // back to the first inner note's duration. Task 1 handles chords/notes/rests/
  // bars/triplets; Tasks 6-7 replace this to add decorations + graces.
  function translateHands(line, usedNames) {
    var out = [];
    var tripletLeft = 0;
    var i = 0, n = line.length;
    function emit(beat) {
      if (tripletLeft > 0) { beat += ' {tu 3}'; tripletLeft--; }
      out.push(beat);
    }
    while (i < n) {
      var ch = line[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (line.startsWith('(3:3:3', i)) { tripletLeft = 3; i += 6; continue; }
      if (ch === '|') { while (line[i] === '|') i++; out.push('|'); continue; }
      var rm = /^z(\d+)/.exec(line.slice(i));
      if (rm) { emit('r.' + durFromUnits(+rm[1])); i += rm[0].length; continue; }
      if (ch === '[') {                            // chord
        var end = line.indexOf(']', i);
        if (end === -1) { i++; continue; }         // malformed: no closing bracket — skip, never loop forever
        var innerStr = line.slice(i + 1, end);
        i = end + 1;
        var units;
        var trailing = /^(\d+)/.exec(line.slice(i));
        if (trailing) { units = +trailing[1]; i += trailing[0].length; }
        var innerNotes = innerStr.match(/\^?[A-Ga-g][,']*\d*/g) || [];
        if (units === undefined) {
          var fd = innerNotes[0] && innerNotes[0].match(/(\d+)$/);
          units = fd ? +fd[1] : 8;
        }
        var names = innerNotes.map(function (seg) {
          return resolveNote(seg.replace(/\d+$/, ''), usedNames, []);
        }).filter(Boolean);
        emit('(' + names.join(' ') + ').' + durFromUnits(units));
      } else {                                     // single note
        var nm = /^(\^?[A-Ga-g][,']*)(\d+)/.exec(line.slice(i));
        if (!nm) { i++; continue; }
        i += nm[0].length;
        var one = resolveNote(nm[1], usedNames, []);
        emit((one || 'r') + '.' + durFromUnits(+nm[2]));
      }
    }
    return out.join(' ');
  }

  function createAlphaTex(grooveData, grooveUtils) {
    // never include the on-screen legend in the export
    var gd = Object.assign({}, grooveData);
    gd.showLegend = false;
    var abc = grooveUtils.createABCFromGrooveData(gd, 800);
    var handsLine = extractHandsMusic(abc);

    var usedNames = {};
    var music = translateHands(handsLine, usedNames);

    var header = '\\title "' + (gd.title || 'GrooveScribe') + '" \\tempo ' + (gd.tempo || 120) + '\n.\n';
    header += '\\track "Drums"\n\\instrument percussion \\clef neutral\n';
    header += '\\ts ' + (gd.numBeats || 4) + ' ' + (gd.noteValue || 4) + '\n';
    Object.keys(usedNames).forEach(function (name) {
      header += '\\articulation ' + name + ' ' + usedNames[name] + '\n';
    });
    // ensure the line ends with a bar so the importer closes the last measure
    if (!/\|\s*$/.test(music)) music += ' |';
    return header + music + '\n';
  }

  function createGpData(grooveData, grooveUtils, alphaTab) {
    var tex = createAlphaTex(grooveData, grooveUtils);
    var settings = new alphaTab.Settings();
    var importer = new alphaTab.importer.AlphaTexImporter();
    importer.initFromString(tex, settings, null);
    var score = importer.readScore();
    return new alphaTab.exporter.Gp7Exporter().export(score, settings);
  }

  return {
    ARTICULATION_MAP: ARTICULATION_MAP,
    createAlphaTex: createAlphaTex,
    createGpData: createGpData,
  };
})();
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS (1 test). If the duration array mismatches, print `tex` to debug.

- [ ] **Step 6: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs package.json package-lock.json
git commit -m "feat(gp-export): generator skeleton + rock-beat alphaTex round-trip"
```

---

## Task 2: Sparse durations + merged rests + ABC-engine duration parity (§10-F2)

**Files:**
- Modify: `jstools/verify_guitarpro_export.mjs` (add helper + tests)
- (no generator change expected — Task 1's `translateHands` already covers this; the test proves it)

- [ ] **Step 1: Write the failing tests + the ABC-engine parity oracle**

Add to `jstools/verify_guitarpro_export.mjs`:

```js
// Parse the V:Hands ABC line into expected duration enum names, using the SAME
// rule the generator uses (32/units). This makes GrooveScribe's ABC engine the
// source of truth (review F2): the generator must not drift from it.
export function abcHandsExpectedDurations(gd) {
  const abc = gu.createABCFromGrooveData(Object.assign({}, gd, { showLegend: false }), 800);
  const after = abc.slice(abc.indexOf('K:C clef=perc'));
  const m = after.match(/V:Hands[^\n]*\n%%voicemap drum\n([\s\S]*?)(?:\nV:|\nT:|$)/);
  const line = m ? m[1].replace(/\n/g, ' ').trim() : '';
  // \[[^\]]*\]\d*  matches BOTH chord forms: [^g4F4] (dur inside) and [F^d,]8 (dur after).
  const re = /\(3:3:3|\[[^\]]*\]\d*|\^?[A-Ga-gz][,']*\d+|\|+/g;
  const out = [];
  let tok;
  while ((tok = re.exec(line))) {
    const t = tok[0];
    if (t === '(3:3:3' || /^\|+$/.test(t)) continue;
    let units, isRest = false;
    if (t[0] === '[') {
      const tr = t.match(/\](\d+)$/);                // trailing dur (kick+splash form)
      units = tr ? +tr[1] : +t.match(/(\d+)\]/)[1];  // else first inner note's dur
    } else if (t[0] === 'z') { isRest = true; units = +t.match(/(\d+)$/)[1]; }
    else { units = +t.match(/(\d+)$/)[1]; }
    out.push((isRest ? 'r' : '') + alphaTab.model.Duration[32 / units]);
  }
  return out;
}

test('sparse snare on beat 1 is a QUARTER, not 16ths', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|o---------------|&K=|----------------|&measures=1');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  assert.deepEqual(beatDurations(score), ['Quarter', 'rQuarter', 'rQuarter', 'rQuarter']);
});

test('sparse kick+snare with merged rests', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|--------o-------|&K=|o---------------|&measures=1');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  assert.deepEqual(beatDurations(score), ['Quarter', 'rQuarter', 'Quarter', 'rQuarter']);
});

// §10-F2: every fixture's generated durations must equal the ABC engine's.
const parityFixtures = {
  rock: 'TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&measures=1',
  sparseSnare: 'TimeSig=4/4&Div=16&H=|----------------|&S=|o---------------|&K=|----------------|&measures=1',
  sparseKickSnare: 'TimeSig=4/4&Div=16&H=|----------------|&S=|--------o-------|&K=|o---------------|&measures=1',
};
for (const [name, url] of Object.entries(parityFixtures)) {
  test(`duration parity with ABC engine: ${name}`, () => {
    const gd = grooveFromUrl(url);
    const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
    assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
  });
}
```

- [ ] **Step 2: Run to verify (expect PASS — Task 1 already handles these)**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: all PASS. If `sparse` fails, the bug is in `translateHands` rest/duration handling — fix there until parity holds. (This is the regression net for every later task.)

- [ ] **Step 3: Commit**

```bash
git add jstools/verify_guitarpro_export.mjs
git commit -m "test(gp-export): sparse durations, merged rests, ABC-engine duration parity"
```

---

## Task 3: Multi-measure + non-4/4 time signatures

**Files:**
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)
- Modify: `js/groove_to_guitarpro.js` (only if multi-measure extraction fails)

- [ ] **Step 1: Write the failing tests**

Add:

```js
test('two measures produce two bars', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|x-x-x-x-x-x-x-x-|&S=|----o-------o---|----o-------o---|&K=|o-------o-------|o-------o-------|&measures=2');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  assert.equal(score.tracks[0].staves[0].bars.length, 2);
  assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
});

test('3/4 time signature', () => {
  const gd = grooveFromUrl('TimeSig=3/4&Div=16&H=|x-x-x-x-x-x-|&S=|----o-------|&K=|o-------o---|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /\\ts 3 4/);
  const { score } = importTex(tex);
  const mb = score.masterBars[0];
  assert.equal(mb.timeSignatureNumerator, 3);
  assert.equal(mb.timeSignatureDenominator, 4);
});

test('7/8 time signature', () => {
  const gd = grooveFromUrl('TimeSig=7/8&Div=16&H=|x-x-x-x-x-x-x-|&S=|------------------------------|&K=|o-------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /\\ts 7 8/);
  const { score } = importTex(tex);
  assert.equal(score.masterBars[0].timeSignatureNumerator, 7);
  assert.equal(score.masterBars[0].timeSignatureDenominator, 8);
});
```

- [ ] **Step 2: Run to verify**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS. The `extractHandsMusic` regex already spans measures (`[\s\S]*?` + `\n`→space), and `\ts` uses `gd.numBeats`/`gd.noteValue`. If the two-bar test reports one bar, confirm the `|` between measures survived translation (it should, via the `\|+` token).

- [ ] **Step 3: Commit**

```bash
git add jstools/verify_guitarpro_export.mjs
git commit -m "test(gp-export): multi-measure and non-4/4 time signatures"
```

---

## Task 4: Triplets (`{tu 3}`)

**Files:**
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)
- (no generator change expected — `translateHands` already emits `{tu 3}`)

- [ ] **Step 1: Write the failing test**

Add:

```js
test('triplet grid emits tuplets', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=12&H=|xxxxxxxxxxxx|&S=|------------|&K=|o--o--o--o--|&measures=1');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
  assert.equal(beats.length, 12, '12 triplet eighths');
  assert.ok(beats.every(b => b.tupletNumerator === 3), 'every beat is part of a 3-tuplet');
  assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
});
```

- [ ] **Step 2: Run to verify**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS. If `tupletNumerator` is 0, the `(3:3:3` marker isn't being consumed — verify the regex ordering puts `\(3:3:3` first (it does).

- [ ] **Step 3: Commit**

```bash
git add jstools/verify_guitarpro_export.mjs
git commit -m "test(gp-export): triplet grids map to tuplets"
```

---

## Task 5: Full articulation mapping table (all T3 voices)

**Files:**
- Modify: `js/groove_to_guitarpro.js` (`ARTICULATION_MAP`)
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)

These articulations are **plain pitches** (no decorations) — they only need map entries: ride, ride bell, cowbell, crash, stacker, click voices, cross-stick, kick+splash, foot-splash, toms. (Accent/open/ghost/buzz/flam/drag decorations come in Tasks 6–7.)

- [ ] **Step 1: Write the failing tests**

Add:

```js
const articulationCases = [
  // url params (H/S/K rows), expected articulation name on beat 0
  ['ride',      'H=|r---------------|', 'Ride'],
  ['rideBell',  'H=|b---------------|', 'RideBell'],
  ['cowbell',   'H=|m---------------|', 'Cowbell'],
  ['crash',     'H=|c---------------|', 'Crash'],
  ['stacker',   'H=|s---------------|', 'China'],
  ['click',     'H=|n---------------|', 'Click'],
  ['clickAccent','H=|N---------------|', 'ClickAccent'],
  ['crossStick','S=|x---------------|', 'SideStick'],
  ['tom1',      'T1=|o---------------|', 'Tom1'],
  ['tom4',      'T4=|o---------------|', 'Tom4'],
];
for (const [name, row, expected] of articulationCases) {
  test(`articulation maps: ${name} -> ${expected}`, () => {
    const gd = grooveFromUrl(`TimeSig=4/4&Div=16&${row}&measures=1`);
    const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
    assert.match(tex, new RegExp(`\\\\articulation ${expected} \\d+`), `declares ${expected}`);
    assert.ok(tex.includes(expected), `uses ${expected} in music`);
  });
}

// NOTE: isolate with explicit empty H/S rows — a bare `K=|X…|` makes GrooveScribe
// inject its DEFAULT hi-hat pattern, turning beat 0 into a 3-note chord.
test('kick + splash exports as a 2-note chord (Kick + HiHatPedal)', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|----------------|&K=|X-------X-------|&measures=1');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  assert.equal(score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes.length, 2);
});
```

> **Fixture hygiene (applies to every isolation test below):** when you want a groove with only one articulation, set the *other* rows explicitly empty (`H=|----…|&S=|----…|&K=|----…|`). A URL that omits a row gets GrooveScribe's **default pattern** for it, which silently adds notes/chords and breaks single-note assertions.

- [ ] **Step 2: Run to verify it fails**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: FAIL — unknown pitches currently fall back to `r` (rest), so the names aren't declared.

- [ ] **Step 3: Extend `ARTICULATION_MAP`**

In `js/groove_to_guitarpro.js`, replace the Task-1 `ARTICULATION_MAP` with the full table (per spec §6). Keys are the `constant_ABC_*` pitch values (octave marks `'` and `,` included):

```js
  var ARTICULATION_MAP = {
    '^g':   { name: 'HiHat',       midi: 42 }, // hi-hat normal / close / accent (decoration handled in Task 6)
    '^A\'': { name: 'Ride',        midi: 51 },
    '^B\'': { name: 'RideBell',    midi: 53 },
    '^D\'': { name: 'Cowbell',     midi: 56 },
    '^c\'': { name: 'Crash',       midi: 49 },
    '^d\'': { name: 'China',       midi: 52 }, // stacker (approx)
    '^e\'': { name: 'Click',       midi: 77 }, // metronome normal
    '^f\'': { name: 'ClickAccent', midi: 76 }, // metronome accent
    'c':    { name: 'Snare',       midi: 38 },
    '^c':   { name: 'SideStick',   midi: 37 }, // cross-stick
    'F':    { name: 'Kick',        midi: 36 },
    '^d,':  { name: 'HiHatPedal',  midi: 44 }, // foot splash (approx)
    'e':    { name: 'Tom1',        midi: 48 },
    'd':    { name: 'Tom2',        midi: 47 },
    'B':    { name: 'Tom3',        midi: 45 },
    'A':    { name: 'Tom4',        midi: 43 },
  };
```

The chord/note regex `\^?[A-Ga-g][,']*` already captures `^A'`, `^d,`, `^c'`, etc. The kick+splash token `[F^d,]` is a chord, so both `F`→Kick and `^d,`→HiHatPedal map and combine — no special case needed.

- [ ] **Step 4: Run to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs
git commit -m "feat(gp-export): full T3 articulation mapping table"
```

---

## Task 6: Note effects — accent, ghost, buzz, open/close (decoration parsing)

**Files:**
- Modify: `js/groove_to_guitarpro.js` (`translateHands` + new `resolveDecorated`)
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)

ABC decorations to handle (from ground truth): `!accent!`→`{ac}`, `!(.!!).!`→`{g}` (ghost), `!///!`→`{tp (3 buzzRoll)}` (buzz), `!open!`→swap articulation to `HiHatOpen` (46), `!plus!`→close = plain `HiHat`. In a chord, GrooveScribe **moves `!accent!`/`!open!`/`!plus!`/`!///!` to the front** (applies to the whole chord); ghost `!(.!!).!` **stays inside** attached to its note.

- [ ] **Step 1: Write the failing tests**

Add:

```js
function beat0(score) { return score.tracks[0].staves[0].bars[0].voices[0].beats[0]; }

test('accent maps to {ac} (note.isStaccato/accentuated flag set)', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|O---------------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /Snare\{ac\}/);
  const { score } = importTex(tex);
  assert.notEqual(beat0(score).notes[0].accentuated, alphaTab.model.AccentuationType.None);
});

test('ghost snare maps to {g}', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|g---------------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /Snare\{g\}/);
  const { score } = importTex(tex);
  assert.equal(beat0(score).notes[0].isGhost, true);
});

test('buzz snare maps to {tp (3 buzzRoll)}', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|b---------------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /Snare\{tp \(3 buzzRoll\)\}/);
  importTex(tex); // must not throw
});

test('open hi-hat swaps articulation to HiHatOpen', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|o---------------|&S=|----------------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /\\articulation HiHatOpen 46/);
  assert.match(tex, /HiHatOpen/);
});

test('whole-chord accent (HH+SN both accented) applies {ac} to chord notes', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|X-X-X-X-X-X-X-X-|&S=|----O-------O---|&K=|o-------o-------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  importTex(tex); // must not throw
  assert.match(tex, /\{ac\}/);
  // durations still match the engine
  const { score } = importTex(tex);
  assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: FAIL — decorations are currently treated as literal characters that don't match the pitch regex, so notes are dropped/misparsed.

- [ ] **Step 3: Implement decoration parsing**

In `js/groove_to_guitarpro.js`, add a resolver and rework the note/chord branches of `translateHands`. Insert this helper above `translateHands`:

```js
  // Effect decorations that GrooveScribe moves to the FRONT of a chord (apply to all notes).
  var LEADING_DECORATIONS = ['!accent!', '!open!', '!plus!', '!///!'];
  // Decoration -> alphaTex note-effect (or articulation override for open/close).
  // Returns { effect: '{ac}'|'{g}'|'{tp (3 buzzRoll)}'|null, overrideName, overrideMidi }
  function decorationEffect(dec, baseName) {
    switch (dec) {
      case '!accent!': return { effect: '{ac}' };
      case '!(.!!).!': return { effect: '{g}' };
      case '!///!':    return { effect: '{tp (3 buzzRoll)}' };
      case '!open!':   return baseName === 'HiHat' ? { overrideName: 'HiHatOpen', overrideMidi: 46 } : {};
      case '!plus!':   return {}; // close hi-hat == plain HiHat in GP
      default:         return {};
    }
  }

  // Resolve one ABC note segment ("[inner-decorations]pitch") to an alphaTex
  // note string + records the used articulation. `extraDecs` are leading
  // decorations that were moved out of a chord (apply to this note too).
  function resolveNote(seg, usedNames, extraDecs) {
    var decs = (extraDecs || []).slice();
    var rest = seg;
    var dm;
    // pull inner decorations (!...! groups, including the ghost !(.!!).! form)
    var decRe = /^(!\(\.!!\)\.!|![^!]*!)/;
    while ((dm = rest.match(decRe))) { decs.push(dm[1]); rest = rest.slice(dm[1].length); }
    var pm = rest.match(/^(\^?[A-Ga-g][,']*)/);
    if (!pm) return null;
    var art = articulationFor(pm[1]);
    if (!art) return null;
    var name = art.name, midi = art.midi, effects = '';
    decs.forEach(function (d) {
      var r = decorationEffect(d, name);
      if (r.overrideName) { name = r.overrideName; midi = r.overrideMidi; }
      if (r.effect) effects += r.effect;
    });
    usedNames[name] = midi;
    return name + effects;
  }
```

Then **replace** the Task 1 `translateHands` with the decoration-aware scanner. It parses leading decorations (moved-out effects) before each note/chord, and inner decorations inside chords (the ghost form stays attached to its note). Grace handling is added in Task 7:

```js
  function translateHands(line, usedNames) {
    var out = [];
    var tripletLeft = 0;
    var i = 0, n = line.length;
    function emit(beat) {
      if (tripletLeft > 0) { beat += ' {tu 3}'; tripletLeft--; }
      out.push(beat);
    }
    while (i < n) {
      var ch = line[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (line.startsWith('(3:3:3', i)) { tripletLeft = 3; i += 6; continue; }
      if (ch === '|') { while (line[i] === '|') i++; out.push('|'); continue; }
      var rm = /^z(\d+)/.exec(line.slice(i));
      if (rm) { emit('r.' + durFromUnits(+rm[1])); i += rm[0].length; continue; }
      // leading decorations (moved-out effects; grace handling added in Task 7)
      var leading = [], dm;
      while ((dm = /^(!\(\.!!\)\.!|![^!]*!|\{\/c+\})/.exec(line.slice(i)))) { leading.push(dm[1]); i += dm[1].length; }
      var movedEffects = leading.filter(function (d) { return LEADING_DECORATIONS.indexOf(d) !== -1; });
      if (line[i] === '[') {                        // chord
        var end = line.indexOf(']', i);
        if (end === -1) { i++; continue; }         // malformed: no closing bracket — skip, never loop forever
        var innerStr = line.slice(i + 1, end);
        i = end + 1;
        var units;
        var trailing = /^(\d+)/.exec(line.slice(i));
        if (trailing) { units = +trailing[1]; i += trailing[0].length; }
        var innerNotes = innerStr.match(/(?:!\(\.!!\)\.!|![^!]*!)*\^?[A-Ga-g][,']*\d*/g) || [];
        if (units === undefined) {
          var fd = innerNotes[0] && innerNotes[0].match(/(\d+)$/);
          units = fd ? +fd[1] : 8;
        }
        var names = innerNotes.map(function (seg) {
          return resolveNote(seg.replace(/\d+$/, ''), usedNames, movedEffects);
        }).filter(Boolean);
        emit('(' + names.join(' ') + ').' + durFromUnits(units));
      } else {                                      // single note
        var nm = /^(\^?[A-Ga-g][,']*)(\d+)/.exec(line.slice(i));
        if (!nm) { i++; continue; }
        i += nm[0].length;
        // single notes: pass ALL leading decorations, not just movedEffects — a lone
        // ghost note is `!(.!!).!c8`, and ghost is NOT in LEADING_DECORATIONS, so it
        // would be dropped if we filtered. (In chords, ghost rides inside the inner seg.)
        var one = resolveNote(nm[1], usedNames, leading);
        emit((one || 'r') + '.' + durFromUnits(+nm[2]));
      }
    }
    return out.join(' ');
  }
```

> **Note on whole-chord accents:** GrooveScribe's ABC moves a single `!accent!` to the front even when only one chord note was accented (a known rendering "hack"), so the GP export accents the whole chord — matching what GrooveScribe shows on screen. This is intentional fidelity, not a bug.

- [ ] **Step 4: Run to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS. The model getters are confirmed in 1.8.3: `note.accentuated` (`AccentuationType.None === 0`, accent `=== 1`) and `note.isGhost` (`true`).

- [ ] **Step 5: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs
git commit -m "feat(gp-export): note effects (accent, ghost, buzz, open/close)"
```

---

## Task 7: Grace notes — flam (1 grace) + drag (2 graces)

**Files:**
- Modify: `js/groove_to_guitarpro.js` (`translateHands` — emit graces *before* the chord/note dispatch)
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)

Ground truth: isolated flam `!accent!{/c}c8` (one grace `c` + accented main); drag `{/cc}c8` (two graces). **But a flam usually coincides with a hi-hat** (backbeat), so GrooveScribe emits a chord with the grace moved to the front: `!accent!{/c}[c2^g2F2]`. Grace emission must therefore happen for **both** single notes and chords. alphaTex grace = a beat marked `{gr bb}` *before* the main beat (spec §3); the grace is always a snare ornament; its duration is ignored by the importer (becomes eighth — kept).

- [ ] **Step 1: Write the failing tests**

Add (isolated single-note flam/drag **and** the realistic flam-in-chord case):

```js
test('isolated flam emits one grace beat before the main snare', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|f-------f-------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /Snare\.8 \{gr bb\} Snare/);
  const { score } = importTex(tex);
  const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
  const graces = beats.filter(b => b.graceType && b.graceType !== alphaTab.model.GraceType.None);
  assert.equal(graces.length, 2, 'two flams -> two grace beats');
});

test('isolated drag emits two grace beats before the main snare', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|d-------d-------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /Snare\.8 \{gr bb\} Snare\.8 \{gr bb\} Snare/);
  const { score } = importTex(tex);
  const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
  const graces = beats.filter(b => b.graceType && b.graceType !== alphaTab.model.GraceType.None);
  assert.equal(graces.length, 4, 'two drags -> four grace beats');
});

test('backbeat flam (snare flam + hi-hat) emits the grace before the chord', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|f-------f-------|&K=|o-------o-------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /Snare\.8 \{gr bb\} \(Snare/);   // grace precedes the chord, not dropped
  const { score } = importTex(tex);
  const graces = score.tracks[0].staves[0].bars[0].voices[0].beats
    .filter(b => b.graceType && b.graceType !== alphaTab.model.GraceType.None);
  assert.equal(graces.length, 2, 'two backbeat flams -> two grace beats');
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: FAIL — the Task 6 scanner parses the `{/c}`/`{/cc}` into `leading` but does nothing with it, so no `{gr bb}` is emitted (and the backbeat-flam case proves graces must precede a *chord*, not just a single note).

- [ ] **Step 3: Implement grace emission (before the chord/note dispatch)**

In `translateHands`, add a grace block **after** the leading-decoration scan and **before** the `if (line[i] === '[')` dispatch, so it fires for both single notes and chords. Replace the whole `translateHands` with:

```js
  function translateHands(line, usedNames) {
    var out = [];
    var tripletLeft = 0;
    var i = 0, n = line.length;
    function emit(beat) {
      if (tripletLeft > 0) { beat += ' {tu 3}'; tripletLeft--; }
      out.push(beat);
    }
    while (i < n) {
      var ch = line[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (line.startsWith('(3:3:3', i)) { tripletLeft = 3; i += 6; continue; }
      if (ch === '|') { while (line[i] === '|') i++; out.push('|'); continue; }
      var rm = /^z(\d+)/.exec(line.slice(i));
      if (rm) { emit('r.' + durFromUnits(+rm[1])); i += rm[0].length; continue; }
      // leading decorations (moved-out effects + graces)
      var leading = [], dm;
      while ((dm = /^(!\(\.!!\)\.!|![^!]*!|\{\/c+\})/.exec(line.slice(i)))) { leading.push(dm[1]); i += dm[1].length; }
      var movedEffects = leading.filter(function (d) { return LEADING_DECORATIONS.indexOf(d) !== -1; });
      // graces (flam {/c} / drag {/cc}) — a snare ornament emitted BEFORE the main
      // beat, whether the main hit is a single note or a chord (backbeat flam + hi-hat).
      var graceMatch = leading.join('').match(/\{\/(c+)\}/);
      if (graceMatch) {
        usedNames['Snare'] = 38;
        for (var gI = 0; gI < graceMatch[1].length; gI++) out.push('Snare.8 {gr bb}');
      }
      if (line[i] === '[') {                        // chord
        var end = line.indexOf(']', i);
        if (end === -1) { i++; continue; }         // malformed: no closing bracket — skip, never loop forever
        var innerStr = line.slice(i + 1, end);
        i = end + 1;
        var units;
        var trailing = /^(\d+)/.exec(line.slice(i));
        if (trailing) { units = +trailing[1]; i += trailing[0].length; }
        var innerNotes = innerStr.match(/(?:!\(\.!!\)\.!|![^!]*!)*\^?[A-Ga-g][,']*\d*/g) || [];
        if (units === undefined) {
          var fd = innerNotes[0] && innerNotes[0].match(/(\d+)$/);
          units = fd ? +fd[1] : 8;
        }
        var names = innerNotes.map(function (seg) {
          return resolveNote(seg.replace(/\d+$/, ''), usedNames, movedEffects);
        }).filter(Boolean);
        emit('(' + names.join(' ') + ').' + durFromUnits(units));
      } else {                                      // single note
        var nm = /^(\^?[A-Ga-g][,']*)(\d+)/.exec(line.slice(i));
        if (!nm) { i++; continue; }
        i += nm[0].length;
        // single notes: pass ALL leading decorations, not just movedEffects — a lone
        // ghost note is `!(.!!).!c8`, and ghost is NOT in LEADING_DECORATIONS, so it
        // would be dropped if we filtered. (In chords, ghost rides inside the inner seg.)
        var one = resolveNote(nm[1], usedNames, leading);
        emit((one || 'r') + '.' + durFromUnits(+nm[2]));
      }
    }
    return out.join(' ');
  }
```

(The `{gr bb}` marks the *preceding* beat as a before-beat grace, so we push the grace beat(s) then the main beat/chord.)

- [ ] **Step 4: Run to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS (all three grace tests). `graceType`/`GraceType.None` are confirmed present in 1.8.3 (`graceType` is `2` = BeforeBeat when set, `0` = None otherwise).

- [ ] **Step 5: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs
git commit -m "feat(gp-export): grace notes for flam and drag"
```

---

## Task 8: Header, subtitle, and alphaTex escaping (security F4)

**Files:**
- Modify: `js/groove_to_guitarpro.js` (`escapeAlphaTex`, header)
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)

User-controlled strings (`title`, `author`, and later stickings text) must be escaped before interpolation — an unescaped `"` throws `UnsupportedFormatError` and fails the **entire** export (reproduced in the spike).

- [ ] **Step 1: Write the failing tests**

Add:

```js
test('title with a double-quote does not break the export', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&measures=1&Title=My "Cool" Beat');
  gd.title = 'My "Cool" Beat';   // belt-and-suspenders (URL decode may strip)
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  importTex(tex); // must NOT throw
  assert.ok(!/\\title "[^"]*"[^"]*"/.test(tex.split('\n')[0]), 'no raw inner quote in title line');
});

test('author becomes \\subtitle when present', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x---------------|&measures=1');
  gd.author = 'Jane Drummer';
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /\\subtitle "Jane Drummer"/);
});

test('escapeAlphaTex strips quotes, backslashes, and newlines', () => {
  assert.equal(GrooveToGuitarPro.escapeAlphaTex('a"b\\c\nd'), 'abc d');
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: FAIL — `escapeAlphaTex` undefined; `\subtitle` not emitted.

- [ ] **Step 3: Implement escaping + subtitle**

In `js/groove_to_guitarpro.js`, add near the top of the IIFE:

```js
  function escapeAlphaTex(str) {
    return String(str == null ? '' : str)
      .replace(/[\\"]/g, '')      // drop backslashes and double-quotes
      .replace(/[\r\n]+/g, ' ')   // collapse newlines to a space
      .trim();
  }
```

Update the header build in `createAlphaTex`:

```js
    var header = '\\title "' + (escapeAlphaTex(gd.title) || 'GrooveScribe') + '"';
    var subtitle = escapeAlphaTex(gd.author);
    if (subtitle) header += ' \\subtitle "' + subtitle + '"';
    header += ' \\tempo ' + (gd.tempo || 120) + '\n.\n';
```

Add `escapeAlphaTex` to the returned object:

```js
  return {
    ARTICULATION_MAP: ARTICULATION_MAP,
    escapeAlphaTex: escapeAlphaTex,
    createAlphaTex: createAlphaTex,
    createGpData: createGpData,
  };
```

- [ ] **Step 4: Run to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs
git commit -m "feat(gp-export): header subtitle + alphaTex string escaping (F4)"
```

---

## Task 9: Stickings & counting as a text-only second voice (validated Option A)

**Files:**
- Modify: `js/groove_to_guitarpro.js` (`createStickingVoice`, `createGpData`)
- Modify: `jstools/verify_guitarpro_export.mjs` (tests + GPIF-text helper)

The `V:Stickings` ABC line is a complete voice from the same engine (`"R"x2"L"x2…` for R/L/B, `"1"x2"e"x2…` for counting, bare `x8` when off). Translate it with the **same** approach: `x<units>`→rest of `32/units`, preceding `"text"`→`beat.text`. Build it as a **second voice per bar** via the model API (validated recipe). When the line has no `"…"` annotations (stickings off), add no voice.

- [ ] **Step 1: Write the failing tests + GPIF text helper**

First, add these to the **import block at the top of the file** (ESM `import`s must be top-level): `import { execSync } from 'node:child_process';`, `import { tmpdir } from 'node:os';`, and add `writeFileSync` to the existing `node:fs` import (`import { readFileSync, writeFileSync } from 'node:fs';`). Then add the helper + tests:

```js
// extract all <FreeText> CDATA values from an exported .gp (unzip the gpif)
function gpifFreeTexts(bytes) {
  const f = join(tmpdir(), 'gp_test_' + Date.now() + '.gp');
  writeFileSync(f, Buffer.from(bytes));
  const xml = execSync(`unzip -p ${f} "Content/score.gpif" 2>/dev/null || unzip -p ${f} "*.gpif"`, { encoding: 'latin1', maxBuffer: 1e8 });
  return [...xml.matchAll(/<FreeText><!\[CDATA\[([^\]]*)\]\]><\/FreeText>/g)].map(m => m[1]);
}

test('R/L/B stickings export as FreeText on a second voice', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|oooooooooooooooo|&Stickings=|rlrlrlrlrlrlrlrl|&measures=1');
  const bytes = GrooveToGuitarPro.createGpData(gd, gu, alphaTab);
  const texts = gpifFreeTexts(bytes);
  assert.ok(texts.includes('R') && texts.includes('L'), 'R and L present');
  // drum voice durations are untouched by the sticking voice
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
});

test('counting mode preserves sub-beat counts (1 e & a) via the 2nd voice', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&Stickings=|cccccccccccccccc|&measures=1');
  const bytes = GrooveToGuitarPro.createGpData(gd, gu, alphaTab);
  const texts = gpifFreeTexts(bytes);
  assert.deepEqual(texts, ['1','e','&','a','2','e','&','a','3','e','&','a','4','e','&','a']);
});

test('stickings OFF adds no second voice', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&measures=1');
  const beats = GrooveToGuitarPro.createStickingVoice(gd, gu);
  // returns one entry per measure; with no annotations every entry is null/empty
  assert.ok(beats.every(measure => measure.every(b => !b.text)), 'no text beats');
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: FAIL — `createStickingVoice` undefined; counting texts absent from GPIF.

- [ ] **Step 3: Implement `createStickingVoice` + wire it into `createGpData`**

In `js/groove_to_guitarpro.js`, add `createStickingVoice` (translates the `V:Stickings` line into per-measure beat descriptors):

```js
  function extractStickingsMusic(abc) {
    var clefIdx = abc.indexOf('K:C clef=perc');
    if (clefIdx === -1) return '';
    var afterClef = abc.slice(clefIdx);
    var m = afterClef.match(/V:Stickings[^\n]*\n([\s\S]*?)(?:\nV:|\nT:|$)/);
    return m ? m[1].replace(/\n/g, ' ').trim() : '';
  }

  // -> array of measures; each measure is an array of { durationValue, text }.
  // text is '' when the slot carries no annotation.
  function createStickingVoice(grooveData, grooveUtils) {
    var gd = Object.assign({}, grooveData);
    gd.showLegend = false;
    var abc = grooveUtils.createABCFromGrooveData(gd, 800);
    var line = extractStickingsMusic(abc);
    var measures = [[]];
    // optional "text" annotation, then x<dur> (hidden rest); bars split measures
    var re = /("(?:[^"]*)")?\s*x(\d+)|\|+/g;
    var tok;
    while ((tok = re.exec(line))) {
      if (/^\|+$/.test(tok[0])) { measures.push([]); continue; }
      var text = tok[1] ? escapeAlphaTex(tok[1].slice(1, -1)) : '';
      measures[measures.length - 1].push({ durationValue: durFromUnits(+tok[2]), text: text });
    }
    // drop a trailing empty measure produced by the closing ||
    if (measures.length && measures[measures.length - 1].length === 0) measures.pop();
    return measures;
  }
```

Then extend `createGpData` to add the second voice when any text exists:

```js
  function createGpData(grooveData, grooveUtils, alphaTab) {
    var tex = createAlphaTex(grooveData, grooveUtils);
    var settings = new alphaTab.Settings();
    var importer = new alphaTab.importer.AlphaTexImporter();
    importer.initFromString(tex, settings, null);
    var score = importer.readScore();

    var stickings = createStickingVoice(grooveData, grooveUtils);
    var hasText = stickings.some(function (m) { return m.some(function (b) { return b.text; }); });
    if (hasText) {
      var bars = score.tracks[0].staves[0].bars;
      for (var i = 0; i < bars.length && i < stickings.length; i++) {
        var voice = new alphaTab.model.Voice();
        bars[i].addVoice(voice);
        stickings[i].forEach(function (desc) {
          var beat = new alphaTab.model.Beat();
          beat.duration = desc.durationValue;          // enum value == 32/units
          if (desc.text) beat.text = desc.text;        // FreeText; no notes -> rest
          voice.addBeat(beat);
        });
      }
      score.finish(settings);
    }
    return new alphaTab.exporter.Gp7Exporter().export(score, settings);
  }
```

Add `createStickingVoice` to the returned object.

- [ ] **Step 4: Run to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS, including the exact counting sequence `['1','e','&','a',…]`.

- [ ] **Step 5: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs
git commit -m "feat(gp-export): stickings/counting as text-only second voice"
```

---

## Task 10: Edge cases — empty groove, unsupported articulation, importer error

**Files:**
- Modify: `js/groove_to_guitarpro.js` (empty-groove guard, degradation log)
- Modify: `jstools/verify_guitarpro_export.mjs` (tests)

- [ ] **Step 1: Write the failing tests**

Add:

```js
test('empty groove produces a valid one-bar rest and never throws', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|----------------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  const { score } = importTex(tex);
  assert.equal(score.tracks[0].staves[0].bars.length, 1);
  const bytes = GrooveToGuitarPro.createGpData(gd, gu, alphaTab);
  assert.ok(bytes.length > 100);
});
```

- [ ] **Step 2: Run to verify**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: likely PASS already (empty groove → `z8 z8 z8 z8` → four quarter rests). If the bar has zero beats (importer rejects an empty bar), add a guard in `createAlphaTex`: if `music` is empty/whitespace, set `music = 'r.1'`. Implement only if the test fails.

- [ ] **Step 3: Add the graceful-degradation log (no behavior change, observability only)**

In `resolveNote`/`articulationFor`, when a pitch is unknown, log once instead of silently dropping. Add at the top of the IIFE:

```js
  var _warnedPitches = {};
  function warnUnknownPitch(pitch) {
    if (!_warnedPitches[pitch]) {
      _warnedPitches[pitch] = true;
      if (typeof console !== 'undefined') console.warn('[GuitarPro export] unsupported articulation, skipped:', pitch);
    }
  }
```

Call `warnUnknownPitch(pm[1])` in `resolveNote` when `articulationFor` returns null (before `return null`).

- [ ] **Step 4: Run to verify it passes**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add js/groove_to_guitarpro.js jstools/verify_guitarpro_export.mjs
git commit -m "feat(gp-export): empty-groove guard + unsupported-articulation logging"
```

---

## Task 11: `GPSaveAs` + `loadAlphaTab` in groove_writer.js

**Files:**
- Modify: `js/groove_writer.js` (add after `root.MIDISaveAs`, around line 2555)

- [ ] **Step 1: Add `loadAlphaTab`, `sanitizeFilename`, and `GPSaveAs`**

In `js/groove_writer.js`, immediately after the `root.MIDISaveAs = function () { … };` block (ends ~line 2555), insert:

```js
	// --- Guitar Pro export -------------------------------------------------
	var ALPHATAB_CDN_URL = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/alphaTab.min.js';
	var ALPHATAB_SRI = 'sha384-qUm2Zrf12JTeEmtMQAdvtbVFGrxkxSSrmqyEU4avNOo/QxYnmgpDsfsdWvYrhmxw';
	var _alphaTabPendingLoad = [];
	var _alphaTabPendingError = [];

	// Lazy-load alphaTab from the CDN exactly once. Only the importer + exporter
	// are used (no AlphaTabApi), so no Web Worker, audio, or font assets load.
	function loadAlphaTab(onLoad, onError) {
		if (root.alphaTab && root.alphaTab.importer && root.alphaTab.importer.AlphaTexImporter) {
			onLoad(root.alphaTab);
			return;
		}
		_alphaTabPendingLoad.push(onLoad);
		_alphaTabPendingError.push(onError);
		if (document.getElementById('alphaTabScript')) return; // injection already in flight

		var script = document.createElement('script');
		script.id = 'alphaTabScript';
		script.src = ALPHATAB_CDN_URL;
		script.integrity = ALPHATAB_SRI;
		script.crossOrigin = 'anonymous';
		script.onload = function () {
			if (root.alphaTab && root.alphaTab.importer && root.alphaTab.importer.AlphaTexImporter) {
				var cbs = _alphaTabPendingLoad; _alphaTabPendingLoad = []; _alphaTabPendingError = [];
				cbs.forEach(function (cb) { cb(root.alphaTab); });
			} else {
				script.remove(); // reset so a later click can retry
				var errs = _alphaTabPendingError; _alphaTabPendingLoad = []; _alphaTabPendingError = [];
				errs.forEach(function (cb) { cb(new Error('alphaTab loaded but API missing')); });
			}
		};
		script.onerror = function () {
			script.remove(); // reset so a later click can retry
			var errs = _alphaTabPendingError; _alphaTabPendingLoad = []; _alphaTabPendingError = [];
			errs.forEach(function (cb) { cb(new Error('Failed to load alphaTab')); });
		};
		document.head.appendChild(script);
	}

	function sanitizeFilename(name) {
		var n = (name || '').replace(/[\/\\:*?"<>|]/g, '').trim();
		return n.length ? n : 'GrooveScribe';
	}

	root.GPSaveAs = function () {
		loadAlphaTab(function (alphaTab) {
			try {
				var grooveData = root.grooveDataFromClickableUI();
				var bytes = GrooveToGuitarPro.createGpData(grooveData, root.myGrooveUtils, alphaTab);
				var blob = new Blob([bytes], { type: 'application/gp' });
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url;
				a.download = sanitizeFilename(grooveData.title) + '.gp';
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			} catch (e) {
				if (typeof console !== 'undefined') console.error(e);
				alert('Guitar Pro export failed: ' + e.message);
			}
		}, function (err) {
			if (typeof console !== 'undefined') console.error(err);
			alert('Guitar Pro export unavailable — could not load the export library. Check your connection and try again.');
		});
	};
```

- [ ] **Step 2: Verify it parses (no test rig in-browser; lint via node)**

```bash
node --check js/groove_writer.js && echo "groove_writer.js OK"
```
Expected: `groove_writer.js OK`. (Confirms no syntax errors from the insertion.)

- [ ] **Step 3: Commit**

```bash
git add js/groove_writer.js
git commit -m "feat(gp-export): GPSaveAs handler + lazy CDN loader with retry"
```

---

## Task 12: Wire the menu item + load the module in index.html

**Files:**
- Modify: `index.html` (script tag near line 59; menu `<li>` near line 398)

- [ ] **Step 1: Load the new module after groove_utils.js**

In `index.html`, after the line `<script src="js/groove_utils.js"></script>` (line 59), add:

```html
		<script src="js/groove_to_guitarpro.js"></script>
```

- [ ] **Step 2: Add the menu item after the MIDI item**

In `#downloadContextMenu` (after the `MIDISaveAs` `<li>`, line 398), add:

```html
				<li onclick='myGrooveWriter.GPSaveAs();'><b>Download Guitar Pro file</b></li>
```

- [ ] **Step 3: Verify the edits landed**

```bash
grep -n 'groove_to_guitarpro.js' index.html && grep -n 'GPSaveAs' index.html
```
Expected: the script tag (~line 60) and the `<li>` (~line 399) both present.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(gp-export): add Download Guitar Pro file menu item + load module"
```

---

## Task 13: Service worker — precache module, runtime-cache CDN, bump version

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump the version**

In `sw.js`, change:

```js
var version = '1.2.1';
```
to:

```js
var version = '1.2.2';
```

- [ ] **Step 2: Precache the new module**

In the `cache.addAll([...])` list, after the `js/groove_utils.js` entry, add:

```js
        '/GrooveScribe/js/groove_to_guitarpro.js?timestamp=' + timeStamp,
```

- [ ] **Step 3: Runtime-cache the alphaTab CDN URL**

Replace the existing `fetch` handler:

```js
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request, {ignoreSearch:true}).then(function(response) {
      return response || fetch(event.request);
    })
  );
});
```
with:

```js
var ALPHATAB_CDN_URL = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/alphaTab.min.js';

self.addEventListener('fetch', function(event) {
  // Runtime-cache the alphaTab CDN bundle so Guitar Pro export works offline
  // after the first use. jsDelivr is CORS-enabled, so the response is non-opaque.
  if (event.request.url === ALPHATAB_CDN_URL) {
    event.respondWith(
      caches.open(coreID).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          return cached || fetch(event.request).then(function(response) {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }
  event.respondWith(
    caches.match(event.request, {ignoreSearch:true}).then(function(response) {
      return response || fetch(event.request);
    })
  );
});
```

- [ ] **Step 4: Verify it parses**

```bash
node --check sw.js && echo "sw.js OK"
```
Expected: `sw.js OK`.

- [ ] **Step 5: Commit**

```bash
git add sw.js
git commit -m "feat(gp-export): runtime-cache alphaTab CDN + precache module, bump sw to 1.2.2"
```

---

## Task 14: Full verification + manual spot-check + PR

**Files:** none (verification only)

- [ ] **Step 1: Run the entire harness green**

```bash
node --test jstools/verify_guitarpro_export.mjs
```
Expected: ALL tests pass (rock, sparse, parity, multi-measure, 3/4, 7/8, triplets, all articulations, accent/ghost/buzz/open, flam/drag, header/escaping, R/L/B + counting stickings, empty groove). Capture the summary line for the PR.

- [ ] **Step 2: Generate sample `.gp` files for manual inspection**

```bash
node -e '
const { execSync } = require("child_process");
' # (optional) — or add a tiny export-to-file mode in the harness behind `if (process.env.GP_DUMP)`.
```
Then open the generated `.gp` files in **MuseScore 4** and/or **Guitar Pro 7/8** and eyeball against the GrooveScribe rendering for: a rock beat, a triplet/shuffle, a multi-measure groove, a flam, and a counting-mode groove. Confirm noteheads (X for hi-hat), accents, ghosts, and counts appear correctly.

- [ ] **Step 3: Manual browser smoke test**

Serve the repo locally (e.g. `python3 -m http.server`), open `index.html`, build a groove, open the download menu, click **Download Guitar Pro file**. Confirm: the file downloads as `<title>.gp`, opens in MuseScore/GP, and that a second click still works (loader retry path). Toggle offline (DevTools) after first load and confirm export still works (SW cache).

- [ ] **Step 4: Open the PR with the degraded-cases list**

Per spec §6/§12, the PR description must list the approximations for follow-up: **kick foot-splash → pedal hi-hat (44)**, **stacker → China (52)**. Note that swing % is intentionally written straight, and embed/Cordova export is out of scope (v1 = main editor browser only).

```bash
git push -u origin worktree-guitar-pro-export
gh pr create --title "Guitar Pro (.gp) export" --body "<summary + degraded cases + test output>"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:

| Spec § | Covered by |
| --- | --- |
| §1 Goal, §4 architecture, §5 alphaTex shape | Tasks 1, 9, 11–13 |
| §6 T3 articulation mapping (all voices) | Task 5 (plain pitches) + Task 6 (accent/ghost/buzz/open) + Task 7 (flam/drag) |
| §6 click voices, kick+splash, toms | Task 5 |
| §7 timing (look-ahead durations, merged rests, triplets, multi-measure, non-4/4) | Tasks 2, 3, 4 |
| §7 swing ignored | Inherited (ABC engine writes straight) — noted in Task 14 PR |
| §8 stickings/counting (both modes, sparse-groove rule, one `{…}` group) | Task 9 (text-only 2nd voice — preserves sub-beat counts) |
| §9 lazy-load + download + CDN + SW cache | Tasks 11, 13 |
| §10 verification (Node harness, ABC-engine duration parity F2) | Tasks 1–10 build it; Task 14 runs it |
| §11 edge cases (empty, unsupported, alphaTab fails, importer throws) | Task 10 (empty/unsupported), Task 11 (`onError` notice, try/catch) |
| §13 file-by-file + stale-base prerequisite | Tasks 0, 11, 12, 13; **plus** index.html `<script>` + sw.js precache (spec omitted these — added here) |
| §3 F4 escaping | Task 8 |

**2. Placeholder scan** — Task 14 Step 2 leaves the export-to-file dump as optional (`GP_DUMP`); all other steps contain real, runnable code and exact commands. The SRI hash, CDN URL, ground-truth ABC, and alphaTab API calls are all validated, not guessed.

**3. Type/signature consistency** — `createAlphaTex(grooveData, grooveUtils)`, `createStickingVoice(grooveData, grooveUtils)`, `createGpData(grooveData, grooveUtils, alphaTab)`, `escapeAlphaTex(str)`, `ARTICULATION_MAP` are used identically across the module (Tasks 1, 5, 6, 7, 8, 9) and the harness. `durFromUnits`, `articulationFor`, `resolveNote`, `translateHands`, `extractHandsMusic`, `extractStickingsMusic` are all internal and defined before use. `loadAlphaTab(onLoad, onError)`, `sanitizeFilename`, `GPSaveAs` are consistent between Task 11 and the spec. Duration enum value == `32/units` is used consistently in both the generator and the harness oracle.

**Decisions baked in (resolved during planning):**
- **Stickings mechanism = text-only second voice** (user choice [Q-S1]) — validated via the model API; preserves counting sub-beats.
- **Test runner = `node:test`** (built-in, zero extra deps beyond alphaTab).
- **Module export = browser global** `GrooveToGuitarPro` (no `module.exports`); the harness vm-loads it like the spike loads `groove_utils.js`.
- **Legend suppressed** (`showLegend=false` on a clone) so the on-screen legend's own `V:Hands` line never contaminates the export.
- **Whole-chord accent** mirrors GrooveScribe's ABC rendering (intentional).
