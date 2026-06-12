---
date: 2026-06-12
topic: alphatab-view-mode
---

# ALPHATAB View Mode — Requirements

## Summary

Add a third top-level mode, **ALPHATAB**, beside EDIT and VIEW. Selecting it renders the current groove as alphaTab (Guitar Pro) notation, read-only, drawn once on entry. EDIT, VIEW, abcjs print, and share are unchanged.

---

## Problem Frame

GrooveScribe renders notation with abcjs. The Guitar Pro export work on this branch already loads alphaTab from a CDN but uses it *headlessly* — only its alphaTex importer and Gp7 exporter, to produce a `.gp` file. alphaTab's rendering engine is present in the page but never drawn to screen.

Today, to see how a groove looks as Guitar Pro notation, a user has to download the `.gp` and open it in Guitar Pro, TuxGuitar, or a mobile app — a round-trip just to eyeball the export. Surfacing alphaTab's render in-app gives users a second notation view and lets them confirm what the `.gp` export contains without leaving the browser. It is the visual counterpart to the read-only "Show AlphaTex" text panel already on this branch.

---

## Key Decisions

- **Additive third mode, not a replacement.** ALPHATAB joins EDIT and VIEW rather than replacing the abcjs VIEW. abcjs stays the canonical notation; print and share are untouched. Lowest regret — nothing existing changes for current users.
- **Render once on entry, not live.** ALPHATAB hides the note grid (it is `.edit-block`, like VIEW), so the groove cannot change while the mode is active. The render runs on mode entry only — no live re-render wiring and no per-edit performance cost.
- **Reuse the existing Score build.** The render consumes the same alphaTab `Score` the GP export already builds from the live groove. Score-building stays DOM-free and in one place; only the renderer wiring is new.
- **Graceful loading / unavailable state.** alphaTab is CDN-loaded behind a watchdog. If the user enters ALPHATAB before alphaTab is ready, or after a load failure, the mode shows an inline status message rather than blocking or throwing.
- **Reuse the existing top-left toggle.** The current EDIT/VIEW control cycles to a third state rather than adding a separate control — smallest UI change, matches house style. Exact widget (cycling link vs. segmented control) is settled in planning.

---

## Requirements

**Mode & control**

- R1. A third mode, ALPHATAB, is selectable alongside EDIT and VIEW from the existing top-left mode control.
- R2. Entering ALPHATAB hides the editing chrome (the `.edit-block` note grid and bottom buttons), matching VIEW-mode behavior.
- R3. Leaving ALPHATAB for EDIT or VIEW restores that mode's existing behavior unchanged.

**Rendering**

- R4. On entering ALPHATAB, the current groove renders as alphaTab notation in a dedicated render area.
- R5. The render reflects the groove as it was on entry; live re-render on edit is not required, because editing is unavailable in this mode.
- R6. An empty groove renders valid alphaTab notation (a one-bar rest), not an error.

**Loading & failure**

- R7. If alphaTab is not yet loaded when ALPHATAB is entered, the mode shows a loading state and renders once alphaTab becomes available.
- R8. If alphaTab fails to load, the mode shows an inline "unavailable" message and does not throw.

**Non-regression**

- R9. EDIT mode, VIEW mode, abcjs rendering, print, and share behave exactly as before.
- R10. `js/groove_to_guitarpro.js` stays DOM-free; all render and DOM wiring lives in `js/groove_writer.js` and `index.html`.

---

## Acceptance Examples

- AE1. **Covers R4, R5.** Build a groove in EDIT, switch to ALPHATAB → the render shows that groove. Switch back to EDIT, change a note, switch to ALPHATAB again → the render reflects the change (it re-renders on entry).
- AE2. **Covers R6.** With an empty groove, switch to ALPHATAB → a one-bar rest renders with no console error.
- AE3. **Covers R7.** Switch to ALPHATAB on a cold load before alphaTab finishes downloading → a loading state shows, then the notation appears once alphaTab is ready.
- AE4. **Covers R8.** With alphaTab blocked or failed (offline, CDN down) → ALPHATAB shows an inline "unavailable" message; EDIT and VIEW still work.
- AE5. **Covers R9.** Switch EDIT → VIEW (skipping ALPHATAB) → abcjs sheet music shows as before; print and share unchanged.

---

## Scope Boundaries

**Deferred for later**

- alphaTab audio playback and follow cursor.
- alphaTab-based print, share, or image export — print and share stay abcjs.
- Remembering ALPHATAB across reloads (mode persistence).
- Editing the groove from within ALPHATAB mode (the grid is hidden by design).

**Outside this feature's identity**

- Replacing or retiring the abcjs view anywhere. abcjs remains the canonical notation and the basis for print/share.

---

## Dependencies / Assumptions

- Lives on branch `worktree-guitar-pro-export` (29 commits ahead of master). alphaTab, the CDN loader (`js/alphatab_loader.js`), and the Score builder exist only on that branch — master cannot host this feature.
- Assumes the existing `buildScore()` path produces a `Score` suitable for rendering; it is currently exercised only by the Gp7 exporter. Planning should confirm alphaTab's renderer accepts that Score and that drum / percussion notation displays correctly.
- Assumes the alphaTab bundle loaded from the CDN includes the rendering engine, not an importer/exporter-only build.

---

## Outstanding Questions (Deferred to Planning)

- Mode-control widget: cycle the existing top-left link through three states, or switch to a small segmented control.
- Render target: a new container shown only in ALPHATAB, vs. reusing or sitting adjacent to `#svgTarget`; and how the abcjs and alphaTab targets show/hide per mode.
- alphaTab `Settings` for a clean read-only drum view (layout mode, scale, player disabled).
- Whether `myGrooveUtils.viewMode` becomes an enum or a second flag, and how `?Mode=` URL handling plus the on-load default interact with a third mode.

---

## Sources / Research

- Mode toggle: `root.swapViewEditMode()` and the `myGrooveUtils.viewMode` boolean in `js/groove_writer.js`; top-left control at `index.html:93`. VIEW hides `.edit-block`; abcjs renders into `#svgTarget`, which is not `.edit-block` and so stays visible in VIEW.
- Score builder + alphaTex generator: `buildScore()` and `createAlphaTex()` in `js/groove_to_guitarpro.js` (DOM-free).
- alphaTab CDN loader and watchdog: `js/alphatab_loader.js`.
- Sibling feature (text precursor): the read-only "Show AlphaTex" debug panel, commit `7e8ea817`.
- Prior GP export design and plan: `docs/superpowers/specs/2026-06-10-guitar-pro-export-design.md`, `docs/superpowers/plans/2026-06-10-guitar-pro-export.md`.
