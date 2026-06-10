# Guitar Pro export — step-0 spike (validated 2026-06-10)

Proves the spec's approach (b): GrooveData → GrooveScribe ABC → alphaTex → alphaTab → .gp,
with durations round-tripping correctly. See `docs/superpowers/specs/2026-06-10-guitar-pro-export-design.md`.

- `abc_headless.cjs` — runs GrooveScribe's `createABCFromGrooveData` in Node (minimal window/document
  shims via `vm.runInThisContext`) and prints the ABC for rock / sparse / triplet grooves. Standalone:
  `node abc_headless.cjs`
- `abc_to_alphatex.cjs` — translates the ABC `V:Hands` line → alphaTex, imports via alphaTab, asserts
  durations (sparse snare = quarter, not 16ths; triplets = {tu 3}; chords). Needs alphaTab:
  `npm i @coderline/alphatab@1.8.3 && node abc_to_alphatex.cjs`

Translation rules (validated): pitch→articulation (`^g`=HiHat, `F`=Kick, `c`=Snare, `^c`=SideStick…),
duration = `32/units` (ABC L:1/32), `[..]`→chord `(..)`, `z`→rest `r`, `(3:3:3`→`{tu 3}`, `||`→`|`.
