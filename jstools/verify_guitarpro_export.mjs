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
export function grooveFromUrl(url) { return gu.getGrooveDataFromUrlString(url); }

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
