# Guitar Pro Export — Design

- **Date:** 2026-06-10
- **Branch:** `worktree-guitar-pro-export`
- **Status:** Draft for review
- **Author:** leocaseiro (with Claude)

## 1. Goal

Add a **"Download Guitar Pro file"** option to GrooveScribe so a drummer can export
the current groove (all its measures) as a `.gp` (Guitar Pro 7/8) file, openable in
Guitar Pro 7/8, MuseScore 4, and recent TuxGuitar.

Implementation path: **GrooveData → GrooveScribe's ABC → alphaTex → `AlphaTexImporter` →
`Gp7Exporter` → `Uint8Array` → download**. We reuse GrooveScribe's existing ABC (which already has
correct durations/triplets/rests) and translate it to alphaTex; alphaTab builds a correct Guitar Pro
drum kit from our articulation definitions and writes the `.gp`.

## 2. Decisions locked (from brainstorming)

| #           | Decision                                                  | Choice                                                                                                                 |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Approach    | alphaTex string vs direct model API vs hand-rolled writer | **alphaTex via ABC→alphaTex (b)** — alphaTab API + timing both proven (step-0 spike)                                                                                |
| Fidelity    | Core / Core+dynamics / Full                               | **T3 — Full fidelity** (all articulations)                                                                             |
| Stickings   | Omit / mirror app / toggle                                | **Mirror the app** — export the stickings row as beat text whenever it is shown (covers both R/L/B and counting modes) |
| Packaging   | Vendor vs CDN                                             | **CDN (jsDelivr)** + SRI, pinned 1.8.3, lazy-loaded; `sw.js` runtime-caches it (offline, no repo blob)                            |
| Voice model | Single voice vs two voices                                | **Single voice** for v1 (all hits per slot as one chord); two-voice stems = fast-follow                                |

## 3. Validated facts (spike: alphaTab 1.8.3, `/tmp/alphatab-spike`)

All of the following were confirmed by running alphaTab headless in Node and inspecting
the model + exported GPIF:

- **Import:** `new alphaTab.importer.AlphaTexImporter().initFromString(tex, settings, null)`
then `readScore()` → `Score`. Headless, no DOM.
- **Export:** `new alphaTab.exporter.Gp7Exporter().export(score, settings)` → `Uint8Array`.
Produces a valid GP7 zip (`VERSION` 7.0, `Content/score.gpif`, GP8 GPIF internally),
drum kit on MIDI channel 10. Headless, no rendering/audio/fonts.
- **Percussion track header:** `\track "Drums"` / `\instrument percussion` / `\clef neutral`.
- **Articulations:** `\articulation <Name> <GM-MIDI#>` (e.g. `\articulation Kick 36`).
alphaTab auto-builds a proper GP drum kit (correct noteheads incl. X for hi-hat).
- **Chords (simultaneous hits):** `(Kick HiHat).8`.
- **Beat text (stickings/counting):** `{txt "R"}` after the duration → GP `<FreeText>`.
- **Note effects** (hug the note value, before the dot — `Snare{ac}.4`):
`{ac}`=accent, `{hac}`=heavy accent, `{ten}`=tenuto, `{g}`=ghost (parenthesized),
`{x}`=dead/cross-stick, `{lr}`=let-ring. Per-note effects inside a chord work:
`(Snare{ac} HiHat).8`.
- **Grace beats** (flam/drag): mark the grace's beat with `{gr bb}` before the main beat →
`graceType=BeforeBeat`, survives export (GPIF `<GraceNotes>BeforeBeat</GraceNotes>`), incl. a flam
into a chord. `{gr ob}`→OnBeat; `bb` is default. **The alphaTex grace _duration_ is ignored** — the
importer always makes graces Eighth, which we **keep** — default graces (flam = eighth, drag = 16th).
A post-import pass forcing 32nd was tried and sounded **worse** through alphaTab's export, so we do
**not** mutate grace duration. **Gotcha:** needs the articulation declared + percussion header.

- **Buzz roll:** `{tp (3 buzzRoll)}` (beat-level) → `tremoloPicking{style:buzzRoll}`, survives export
as a GP buzz tremolo. **Click voices:** `\articulation Click 77` / `ClickAccent 76` (GrooveScribe `n`/`N`).
- **One `{…}` group per beat:** combine beat-level props in one group (`{tp 1 txt "R"}`); two separate
groups (`{tp 1} {txt "R"}`) error. Note-effects still hug the note value (`Snare{ac}`).

**To confirm during implementation (low risk):** `\ts <top> <bottom>` for non-4/4;
browser `Blob` download; lazy injection of the
UMD bundle with no worker/font side effects.

**✅ Validated — generator timing (step-0 spike, real path):** ran GrooveScribe's
`createABCFromGrooveData` headless in Node (minimal `window`/`document` shims) and translated its ABC →
alphaTex → `.gp`. Durations round-trip correctly: a **sparse snare on beat 1 → `Snare.4`** (a quarter,
not sixteen 16ths), merged rests (`z8`→`r.4`), chords (`[^g4F4]`→`(HiHat Kick).8`), triplets
(`(3:3:3…`→`{tu 3}`), bars (`||`→`|`). The translator is a small tokenizer over GrooveScribe's `V:Hands`
line: pitch→articulation (`^g`=HiHat, `F`=Kick, `c`=Snare, `^c`=SideStick, …), duration = `32/units`
(ABC `L:1/32`). Kick sits in the Hands voice (`kickStemsUp`) → single voice, matching v1. **F1/F2 retired.**

## 4. Architecture

```
GrooveData (existing)
   │
   ▼
groove_to_guitarpro.js  ── createAlphaTex(grooveData, grooveUtils)  ──►  alphaTex string
   │                                                                          │
   │   (lazy-load alphaTab from CDN on first use)                            ▼
   └──────────────────────────────────►  AlphaTexImporter.readScore()  →  Score
                                                                              │
                                                          Gp7Exporter.export() │
                                                                              ▼
                                                                        Uint8Array
                                                                              │
                                          Blob → object URL → <a download> click
                                                                              ▼
                                                                  <title>.gp downloaded
```

### Components

1. `**js/groove_to_guitarpro.js**` (new) — pure-ish module, no DOM. Exposes a small API on a
  global `GrooveToGuitarPro` object:
  - `createAlphaTex(grooveData, grooveUtils)` → `string` (the alphaTex; testable in isolation,
  this is where ~all logic and the mapping table live).
  - `createGpData(grooveData, grooveUtils, alphaTab)` → `Uint8Array` (constructs
  `new alphaTab.Settings()`, runs `AlphaTexImporter.initFromString(tex, settings, null)` +
  `readScore()` + `Gp7Exporter.export(score, settings)`, returns the bytes; `alphaTab` injected so
  the module never reaches for a global).
   Rationale for a new file rather than growing `groove_utils.js` (already 3,400 lines): keeps the
   mapping table + generator isolated, independently testable, and the diff reviewable.
2. `**js/groove_writer.js**` (edit) — add `root.GPSaveAs = function () {…}`: lazy-load alphaTab,
  build the groove data (reuse the same path as MIDI/PNG export), call
   `GrooveToGuitarPro.createGpData`, trigger the download. Mirrors the existing
   `MIDISaveAs` / `PNGSaveAs` handlers.
3. `**sw.js**` (edit) — runtime-cache the alphaTab CDN URL (jsDelivr, pinned 1.8.3 + SRI) on first
  fetch + bump `version`, so the export lib works offline after first use. No alphaTab file in the repo.
4. `**index.html**` (edit) — one `<li>` in `#downloadContextMenu` next to SVG/PNG/MIDI.
5. `**jstools/verify_guitarpro_export.mjs**` (new) — Node verification harness (see §10).

### Data flow detail — the generator

The current groove is already available the same way the MIDI exporter gets it
(`root.myGrooveData` / `createMidiUrlFromClickableUI`). We reuse it unchanged.

**Approach (b) — reuse GrooveScribe's ABC.** GrooveScribe already generates correct ABC (durations,
beat-grouping, triplets, merged rests) to render the groove; `createAlphaTex` **translates that ABC
into alphaTex token-by-token**, inheriting all timing/grouping correctness instead of re-deriving it.
Per-token voice/articulation comes from §6; durations, tuplets, and rests come straight from the ABC.
The steps below describe the resulting alphaTex (not a raw per-slot walk):

1. **Header:** `\title "<title>"`, `\subtitle "<author>"` (if any), `\tempo <tempo>`, then `.`
2. **Track:** `\track "Drums"`, `\instrument percussion`, `\clef neutral`,
  `\ts <numBeats> <noteValue>`, and one `\articulation <Name> <GM#>` per voice actually used.
3. **Bars:** for each measure, for each grid slot:
  - Collect the active voices at that slot (hi-hat, snare, kick, toms) from the GrooveData arrays.
  - Map each via the §6 table to `Name` + optional note-effect (`{ac}`, `{g}`, `{x}`…).
  - Empty slot → rest `r.<dur>`. One+ voices → chord `(A B{ac} C).<dur>`.
  - Append stickings text `{txt "R"}` from the sticking array at that slot (if the stickings row
  is shown). Flam/drag insert a preceding grace beat.
  - Triplet grids wrap the slot run in tuplets (`{tu 3}`).
  - End each measure with `|`.

**Escape user strings (security — F4):** `title`, `author`, and stickings/counting text are
user-controlled. Before interpolating into alphaTex (`\title "…"`, `\subtitle "…"`, `{txt "…"}`), run
them through an `escapeAlphaTex()` helper that strips/replaces `"`, `\`, and newlines. An unescaped
quote throws `UnsupportedFormatError` and fails the **entire** export (reproduced in spike).

## 5. alphaTex shape (worked example)

A basic rock beat, 1 bar, 8th-note hi-hat, with counting shown:

```alphatex
\title "Groove" \tempo 120
.
\track "Drums"
\instrument percussion \clef neutral
\ts 4 4
\articulation Kick 36
\articulation Snare 38
\articulation HiHat 42
(Kick HiHat).8 {txt "1"} HiHat.8 {txt "&"} (Snare HiHat).8 {txt "2"} HiHat.8 {txt "&"} (Kick HiHat).8 {txt "3"} HiHat.8 {txt "&"} (Snare HiHat).8 {txt "4"} HiHat.8 {txt "&"} |
```

## 6. T3 articulation mapping

GrooveScribe encodes **dynamics as distinct playback MIDI notes** (e.g. snare accent = 22,
ghost = 21). Guitar Pro encodes them as the **base instrument + a notation modifier**. The
generator therefore maps each GrooveScribe ABC articulation to a GP base voice (a standard
**General MIDI** percussion number, so GP shows the right instrument/notehead) **plus** an
optional alphaTex note-effect. **The generator dispatches on the raw `constant_ABC_*` token in each
voice array** (e.g. `constant_ABC_HH_Open`), mirroring the `switch` blocks in
`MIDI_from_HH_Snare_Kick_Arrays`; the label column below is for human reading, not the switch key.

| GrooveScribe articulation | alphaTex articulation (GM #)          | Note effect                                                   |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Hi-hat normal `x`         | `HiHat` (42)                          | —                                                             |
| Hi-hat accent `X`         | `HiHat` (42)                          | `{ac}`                                                        |
| Hi-hat open `o`           | `HiHatOpen` (46)                      | —                                                             |
| Hi-hat close `+`          | `HiHat` (42)                          | —                                                             |
| Hi-hat foot/pedal         | `HiHatPedal` (44)                     | —                                                             |
| Ride `r`                  | `Ride` (51)                           | —                                                             |
| Ride bell `b`             | `RideBell` (53)                       | —                                                             |
| Cowbell `m`               | `Cowbell` (56)                        | —                                                             |
| Crash `c`                 | `Crash` (49)                          | —                                                             |
| Stacker `s`               | `China` (52) *(approx)*               | —                                                             |
| Snare normal `o`          | `Snare` (38)                          | —                                                             |
| Snare accent `O`          | `Snare` (38)                          | `{ac}`                                                        |
| Snare ghost `g`           | `Snare` (38)                          | `{g}`                                                         |
| Snare cross-stick `x`     | `SideStick` (37)                      | —                                                             |
| Snare buzz                | `Snare` (38)                          | `{tp (3 buzzRoll)}` (buzz roll, beat-level) |
| Snare flam `f`            | `Snare` (38)                          | preceding grace beat `{gr bb}` (default eighth)                       |
| Snare drag `d`            | `Snare` (38)                          | two preceding grace beats: `… {gr bb} … {gr bb} <main>`                                   |
| Kick normal `o`           | `Kick` (36)                           | —                                                             |
| Kick + splash `X`         | `Kick` (36) + `HiHatPedal` (44) chord | —                                                             |
| Kick foot-splash `x`      | `HiHatPedal` (44) *(approx)*          | —                                                             |
| Tom 1                     | `Tom1` (48)                           | —                                                             |
| Tom 2                     | `Tom2` (47)                           | —                                                             |
| Tom 3                     | `Tom3` (45)                           | —                                                             |
| Tom 4                     | `Tom4` (43)                           | —                                                             |

**Click voices** (GrooveScribe's `n` / `N` in the hi-hat row): `Click` (77) and `ClickAccent` (76)
— GM low/high wood block, GrooveScribe's metronome/count sounds.

**Graceful degradation rule:** the only remaining approximation is the kick foot-splash
(→ pedal hi-hat 44); it falls back to its nearest base hit so the export never fails or drops a
note. Degraded cases are listed in the PR description for follow-up.

**Articulation names** are arbitrary identifiers we declare with `\articulation`; only the GM
number matters to Guitar Pro. We declare **only** the articulations a given groove actually uses.
Note the **kick uses GM 36 (Bass Drum 1)** — Guitar Pro's standard kick — rather than
GrooveScribe's internal playback value 35 (Acoustic Bass Drum). The main editor only emits **Tom1**
(`toms_array[0]`) and **Tom4** (`toms_array[3]`); the Tom2/Tom3 rows are future-proofing, unreachable
from the current UI.

## 7. Timing & subdivisions

- GrooveScribe is grid-based: each measure holds `notesPerMeasure` equal slots. The slot duration
derives from `timeDivision` + time signature (the same inputs the MIDI exporter already uses).
- **Durations are NOT per-slot.** Arrays scale to 32 (48 triplet) slots, **most empty**; the ABC engine
sizes each note by **look-ahead to the next active slot** (a snare on an otherwise-empty 16th beat is a
quarter, not four 16ths). Approach (b) inherits these durations from the ABC.
- **Triplet grids** (12/24/48): the ABC engine already groups triplets correctly (whole-beat rests,
straight-vs-triplet detection, odd-time end-of-group); the translator maps its triplet groups to `{tu 3}`.
- **Rests:** the ABC engine **merges consecutive empty slots into one rest** (empty slots are the
majority, not rare); the translator emits those merged rests, not one rest per slot.
- **Multiple measures:** emit each measure's slots, separated by `|`.
- **Swing %:** the swing slider is **ignored**; notation is written straight (standard for GP).

## 8. Stickings (mirror the app)

The stickings row in GrooveScribe has modes: off, R/L/B, or counting. Both visible modes map to
the **same** mechanism: the per-slot sticking value becomes beat text `{txt "<value>"}` on that
beat. When the row is off (or a slot is blank) no text is emitted. Validated: text round-trips to
GP `<FreeText>` and shows above the beat.

**Sparse-groove rule (review F3):** a count/sticking can land on a slot the ABC engine absorbed into a
longer note, leaving no beat to hold the `{txt}` (which parse-errors). Mirror GrooveScribe: when the
stickings/counting row is shown, every count/sticking position must have a beat — emit a **rest**
(`r…{txt "…"}`) where no drum note exists rather than dropping the text. R/L/B stickings already sit on
played notes; this mainly affects counting mode. Exact mechanism (granular text beats vs a second
text-only voice) is confirmed in the step-0 spike. Also: a beat carrying both a beat-effect and text
must combine them into **one** `{…}` group (`{tp (3 buzzRoll) txt "R"}`), never two groups.

## 9. Export, download & packaging

### Lazy-load + download (`GPSaveAs` in groove_writer.js)

```js
root.GPSaveAs = function () {
  loadAlphaTab(function (alphaTab) {                  // injects the alphaTab CDN script once (sw.js runtime-caches it)
    var grooveData = /* same source as MIDI/PNG export */;
    var bytes = GrooveToGuitarPro.createGpData(grooveData, root.myGrooveUtils, alphaTab);
    var blob = new Blob([bytes], { type: "application/gp" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = sanitizeFilename(grooveData.title) + ".gp"; // strip path/illegal chars, empty→"GrooveScribe"
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
};
```

`loadAlphaTab(onLoad, onError)` contract: on first call inject `<script src="https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/alphaTab.min.js" integrity="sha384-…" crossorigin="anonymous">`;
`script.onload` caches `window.alphaTab` (assert `alphaTab.importer.AlphaTexImporter` exists) and
invokes `onLoad`; `script.onerror` invokes `onError` (wires the §11 "unavailable" notice) and
**resets the cache so a later click can retry**. Guard against double-injection; subsequent successful
calls are immediate. We use **only** `AlphaTexImporter` + `Gp7Exporter` — no `AlphaTabApi`, so no Web
Worker, audio, or font assets load (confirm no network request fires on inject).

### Packaging — CDN + service-worker cache

Load alphaTab from **jsDelivr at a pinned version with SRI** (no repo blob): `loadAlphaTab` injects
`https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.3/dist/alphaTab.min.js` with an `integrity` hash
+ `crossorigin="anonymous"`. For **offline** support, `sw.js` (currently precache + cache-first, no
origin check) **runtime-caches** that URL: add a fetch-handler branch that, on a cache miss for the
alphaTab URL, fetches → clones → `cache.put`s it, then bump `sw.js` `version` (`1.2.1`→`1.2.2`) so the
new SW activates. jsDelivr is CORS-enabled, so the cached response is non-opaque and reusable; only
users who export download the ~350 KB gzip, offline thereafter. The Node verify harness still
`npm install`s `@coderline/alphatab@1.8.3` locally (independent of the browser load path).

## 10. Verification

No browser test rig exists in the repo, so verification is a **Node round-trip harness**
(`jstools/verify_guitarpro_export.mjs`) plus manual spot-checks:

1. Feed representative grooves' alphaTex through `AlphaTexImporter` + `Gp7Exporter`; assert:
  no parse error, expected bar/beat counts, expected articulations present, accents/ghosts/grace
   flags set on the right beats, stickings text present, tuplets on triplet grooves.
2. Cover: straight 8th & 16th rock beat; triplet/shuffle; multi-measure; every T3 articulation;
  non-4/4 time sig; stickings in both R/L/B and counting modes.
3. Manual: open a handful of exported `.gp` files in MuseScore 4 / Guitar Pro and eyeball against
  the GrooveScribe rendering.
4. **Timing assertion (review F2):** for each fixture, assert generated note durations match
  GrooveScribe's **existing ABC engine** output for the same groove — the engine is the source of
  truth; the translator must not drift from it.

The generator is built test-first against this harness (write the assertion, then make
`createAlphaTex` produce passing output).

## 11. Edge cases & error handling

- **Empty groove** (no notes) → still produce a valid 1-bar rest measure; never throw.
- **Unsupported articulation** → graceful degradation (§6); log once, never drop the beat.
- **alphaTab fails to load** (offline asset missing, injection error) → catch, show a small
user-facing notice ("Guitar Pro export unavailable"), leave the app untouched.
- **Importer throws** `UnsupportedFormatError` → catch, surface a friendly message, and (dev mode)
log the offending alphaTex for debugging.
- **Very large grooves** (max measures) → fine; export is linear and fast (the spike bar exported
in well under a frame).

## 12. Out of scope (future)

- Two-voice stems (hands up / feet down) — v1 is single-voice.
- Swing-feel encoded as swung rhythms.
- Kick foot-splash uses an approximate GM voice (pedal hi-hat 44).
- Export from the embed/display pages (`GrooveEmbed*.html`) — v1 is the main editor only.
- **Cordova app build** — v1 targets the browser; the Cordova webview download path is out of scope.
- GP5/GP4 output (alphaTab exports GP7 `.gp` only).

## 13. File-by-file change list

**⚠ Prerequisite:** this worktree's `origin/master` is **stale** (missing `sw.js` + recent commits);
`git fetch origin` and update the base before implementing so `sw.js` exists to edit.

| File                                  | Change                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `js/groove_to_guitarpro.js`           | **New.** `createAlphaTex` + `createGpData` + mapping table.                |
| `sw.js`                               | **Edit.** Runtime-cache the alphaTab CDN URL in the fetch handler + bump `version`. |
| `js/groove_writer.js`                 | **Edit.** Add `GPSaveAs` + `loadAlphaTab` lazy loader.                     |
| `index.html`                          | **Edit.** Add "Download Guitar Pro file" `<li>` to `#downloadContextMenu`. |
| `jstools/verify_guitarpro_export.mjs` | **New.** Node verification harness.                                        |

## 14. Open questions / risks

1. ~~**Flam/drag grace beats**~~ — **Resolved (spike):** flam (1 grace) and drag (2 stacked grace
   beats) both export correctly (`<GraceNotes>BeforeBeat</GraceNotes>`), including a flam into a
   snare+kick chord. Under approach (b), grace beats are inherited from the ABC translation.
2. ~~**Triplet tuplet syntax**~~ — **Resolved (spike):** `{tu 3}` exports as
   `<PrimaryTuplet num="3" den="2"/>`. Implementation still maps the 12/24/48 grids onto it.
3. ~~**Cowbell/stacker/buzz**~~ — **Resolved:** cowbell (56) + stacker→China (52) approved by ear;
   buzz roll now exports via `{tp (3 buzzRoll)}`. Open only: which buzz-mark count (tp1/2/3) reads
   best — see `Buzz-and-Click.gp`. Kick foot-splash→pedal-hat (44) is the one remaining approximation.
