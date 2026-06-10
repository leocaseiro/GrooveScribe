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
