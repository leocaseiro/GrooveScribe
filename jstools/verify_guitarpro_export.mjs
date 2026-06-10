import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

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
// getGrooveDataFromUrlString does my_string.substring(1) (it expects a leading
// '?' like location.search). Without it, the FIRST param's leading char is eaten
// — e.g. "TimeSig=3/4" becomes "imeSig=3/4", silently falling back to 4/4. Prepend
// a '?' when absent so every fixture parses correctly regardless of leading char.
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

test('two measures produce two bars', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|x-x-x-x-x-x-x-x-|&S=|----o-------o---|----o-------o---|&K=|o-------o-------|o-------o-------|&measures=2');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  assert.equal(score.tracks[0].staves[0].bars.length, 2);
  assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
});

test('3/4 time signature', () => {
  const gd = grooveFromUrl('?TimeSig=3/4&Div=16&H=|x-x-x-x-x-x-|&S=|----o-------|&K=|o-------o---|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /\\ts 3 4/);
  const { score } = importTex(tex);
  const mb = score.masterBars[0];
  assert.equal(mb.timeSignatureNumerator, 3);
  assert.equal(mb.timeSignatureDenominator, 4);
});

test('7/8 time signature', () => {
  const gd = grooveFromUrl('?TimeSig=7/8&Div=16&H=|x-x-x-x-x-x-x-|&S=|------------------------------|&K=|o-------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  assert.match(tex, /\\ts 7 8/);
  const { score } = importTex(tex);
  assert.equal(score.masterBars[0].timeSignatureNumerator, 7);
  assert.equal(score.masterBars[0].timeSignatureDenominator, 8);
});

test('triplet grid emits tuplets', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=12&H=|xxxxxxxxxxxx|&S=|------------|&K=|o--o--o--o--|&measures=1');
  const { score } = importTex(GrooveToGuitarPro.createAlphaTex(gd, gu));
  const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
  assert.equal(beats.length, 12, '12 triplet eighths');
  assert.ok(beats.every(b => b.tupletNumerator === 3), 'every beat is part of a 3-tuplet');
  assert.deepEqual(beatDurations(score), abcHandsExpectedDurations(gd));
});

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
  ['tom2',      'T2=|o---------------|', 'Tom2'],
  ['tom3',      'T3=|o---------------|', 'Tom3'],
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

test('triplet groove: the stickings/counting voice gets the same tuplet as the drum voice', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=12&H=|xxxxxxxxxxxx|&S=|------------|&K=|o--o--o--o--|&Stickings=|cccccccccccc|&measures=1');
  const { score } = GrooveToGuitarPro.buildScore(gd, gu, alphaTab);
  const bar0 = score.tracks[0].staves[0].bars[0];
  assert.ok(bar0.voices[0].beats.every(b => b.tupletNumerator === 3), 'drum voice is triplet');
  const sticking = bar0.voices[1].beats;
  assert.ok(sticking.length > 0, 'sticking voice exists');
  assert.ok(sticking.every(b => b.tupletNumerator === 3), 'sticking voice matches the triplet tuplet');
});

test('straight groove: the stickings voice carries no triplet tuplet', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&Stickings=|cccccccccccccccc|&measures=1');
  const { score } = GrooveToGuitarPro.buildScore(gd, gu, alphaTab);
  const sticking = score.tracks[0].staves[0].bars[0].voices[1].beats;
  assert.ok(sticking.every(b => b.tupletNumerator !== 3), 'no false triplet on a straight groove');
});

test('empty groove produces a valid one-bar rest and never throws', () => {
  const gd = grooveFromUrl('TimeSig=4/4&Div=16&H=|----------------|&S=|----------------|&K=|----------------|&measures=1');
  const tex = GrooveToGuitarPro.createAlphaTex(gd, gu);
  const { score } = importTex(tex);
  assert.equal(score.tracks[0].staves[0].bars.length, 1);
  const bytes = GrooveToGuitarPro.createGpData(gd, gu, alphaTab);
  assert.ok(bytes.length > 100);
});

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
