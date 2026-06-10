import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Load js/alphatab_loader.js in an isolated VM context that exposes a CommonJS
// `module` so the file's `module.exports` block hands us the factory. No real
// DOM, window, or timers exist here — every test injects its own stubs.
function loadFactory() {
  const src = readFileSync(join(repoRoot, 'js/alphatab_loader.js'), 'utf8');
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(src, sandbox, { filename: 'alphatab_loader.js' });
  return sandbox.module.exports.createAlphaTabLoader;
}

const createAlphaTabLoader = loadFactory();

// A minimal HTMLScriptElement stand-in. Captures the assigned onload/onerror so a
// test can fire them. remove() DETACHES the node from the document (splicing it
// out of `appended`), matching real-browser Element.remove() — critical because
// the loader relies on remove() to clear the getElementById in-flight guard so a
// later call can re-inject. `_appended` is the doc's live list, set on append.
function makeScript() {
  return {
    id: '', src: '', integrity: '', crossOrigin: '',
    onload: null, onerror: null,
    removed: false,
    _appended: null,
    remove() {
      this.removed = true;
      if (this._appended) {
        const i = this._appended.indexOf(this);
        if (i !== -1) this._appended.splice(i, 1);
      }
    },
  };
}

// A document stub. createElement returns a fresh script and records it; the
// element only counts as "in the document" (visible to getElementById) once
// head.appendChild runs — matching real DOM semantics the loader relies on. We
// track total injections via `created` (never spliced) so retry assertions hold
// even after remove() detaches the element from `appended`.
function makeDoc() {
  const created = [];
  const appended = [];
  const doc = {
    created, appended,
    createElement() { const s = makeScript(); created.push(s); return s; },
    getElementById(id) { return appended.find(s => s.id === id) || null; },
    head: { appendChild(s) { s._appended = appended; appended.push(s); } },
  };
  return doc;
}

// A controllable timer stub. Records scheduled callbacks; `fire()` runs the most
// recent one; `cleared` counts clearTimeout calls so a test can assert the
// watchdog was cancelled on success.
function makeTimers() {
  const scheduled = [];
  let cleared = 0;
  return {
    scheduled,
    get cleared() { return cleared; },
    setTimeout(fn, ms) { const id = scheduled.length + 1; scheduled.push({ id, fn, ms, alive: true }); return id; },
    clearTimeout(id) { cleared++; const e = scheduled.find(s => s.id === id); if (e) e.alive = false; },
    fire(idx) { const e = idx == null ? scheduled[scheduled.length - 1] : scheduled[idx]; e.fn(); },
  };
}

// alphaTab API object with the importer entry point the loader checks for.
const FULL_API = { importer: { AlphaTexImporter: function () {} } };

function makeLoader(over = {}) {
  const doc = over.doc || makeDoc();
  const win = over.win || {};
  const timers = over.timers || makeTimers();
  const loadAlphaTab = createAlphaTabLoader({
    doc, win,
    url: 'https://cdn.example/alphaTab.min.js',
    sri: 'sha384-TEST',
    timeoutMs: over.timeoutMs || 15000,
    setTimeout: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimeout: (id) => timers.clearTimeout(id),
  });
  return { loadAlphaTab, doc, win, timers };
}

// (a) already-loaded fast path -> onLoad synchronously with the API; no injection.
test('already-loaded: onLoad fires synchronously with the API, no script injected', () => {
  const { loadAlphaTab, doc } = makeLoader({ win: { alphaTab: FULL_API } });
  let got = null;
  let errored = false;
  loadAlphaTab((api) => { got = api; }, () => { errored = true; });
  assert.equal(got, FULL_API, 'onLoad received the alphaTab API object');
  assert.equal(errored, false);
  assert.equal(doc.created.length, 0, 'no <script> created on the fast path');
});

// (b) two concurrent calls while in-flight -> ONE script, both callbacks queued.
test('concurrent calls inject one script and queue both callers', () => {
  const { loadAlphaTab, doc, win } = makeLoader();
  const loads = [];
  loadAlphaTab((api) => loads.push('a:' + !!api), () => {});
  loadAlphaTab((api) => loads.push('b:' + !!api), () => {});
  assert.equal(doc.created.length, 1, 'exactly one <script> injected');
  assert.equal(doc.appended.length, 1, 'script appended to head once');
  assert.equal(doc.appended[0].id, 'alphaTabScript');
  // both fire when the single load resolves
  win.alphaTab = FULL_API;
  doc.appended[0].onload();
  assert.deepEqual(loads, ['a:true', 'b:true'], 'both queued onLoads drained');
});

// (c) script.onload with API present -> drains all pending onLoad with the API.
test('onload with API present drains all pending onLoad', () => {
  const { loadAlphaTab, doc, win } = makeLoader();
  const seen = [];
  loadAlphaTab((api) => seen.push(api), () => {});
  loadAlphaTab((api) => seen.push(api), () => {});
  win.alphaTab = FULL_API;
  doc.appended[0].onload();
  assert.deepEqual(seen, [FULL_API, FULL_API]);
  assert.equal(doc.appended[0].removed, false, 'a successful script is left in place');
});

// (d) onload with API absent -> onError('...API missing'), script removed, state
//     reset so a LATER call re-injects.
test('onload with API absent drains onError and resets for retry', () => {
  const { loadAlphaTab, doc, win } = makeLoader(); // win.alphaTab stays undefined
  const errs = [];
  loadAlphaTab(() => {}, (e) => errs.push(e));
  const first = doc.appended[0];
  first.onload(); // loaded, but importer.AlphaTexImporter missing
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /API missing/);
  assert.equal(first.removed, true, 'broken script removed');

  // a later call must re-inject (in-flight guard was reset)
  loadAlphaTab(() => {}, () => {});
  assert.equal(doc.created.length, 2, 'second injection after reset');
});

// (e) script.onerror -> onError('Failed to load alphaTab'), removed, reset.
test('onerror drains pending onError, removes script, resets for retry', () => {
  const { loadAlphaTab, doc } = makeLoader();
  const errs = [];
  loadAlphaTab(() => {}, (e) => errs.push(e));
  loadAlphaTab(() => {}, (e) => errs.push(e));
  const first = doc.appended[0];
  first.onerror();
  assert.equal(errs.length, 2, 'both queued onErrors drained');
  assert.match(errs[0].message, /Failed to load alphaTab/);
  assert.equal(first.removed, true);

  loadAlphaTab(() => {}, () => {});
  assert.equal(doc.created.length, 2, 'reset allows a fresh injection');
});

// (f-1) timeout path: after timeoutMs the watchdog drains onError('...timed out'),
//       removes the script, and resets so a later call re-injects.
test('timeout watchdog drains onError, removes script, resets for retry', () => {
  const { loadAlphaTab, doc, timers } = makeLoader();
  const errs = [];
  loadAlphaTab(() => {}, (e) => errs.push(e));
  loadAlphaTab(() => {}, (e) => errs.push(e));
  assert.equal(timers.scheduled.length, 1, 'one watchdog armed');
  assert.equal(timers.scheduled[0].ms, 15000, 'armed at the configured timeoutMs');

  const stalled = doc.appended[0]; // capture before remove() detaches it
  timers.fire(); // CDN socket stalled — watchdog expires
  assert.equal(errs.length, 2, 'every queued caller failed');
  assert.match(errs[0].message, /timed out/);
  assert.equal(stalled.removed, true, 'stalled script removed');

  // in-flight state reset -> a later click re-injects cleanly
  loadAlphaTab(() => {}, () => {});
  assert.equal(doc.created.length, 2, 'retry after timeout re-injects');
});

// (f-2) the watchdog is CLEARED on success, so a completed load can never also
//       fire the timeout and double-drain.
test('successful onload clears the watchdog (no later double-drain)', () => {
  const { loadAlphaTab, doc, win, timers } = makeLoader();
  const loads = [];
  const errs = [];
  loadAlphaTab((api) => loads.push(api), (e) => errs.push(e));
  assert.equal(timers.scheduled.length, 1);

  win.alphaTab = FULL_API;
  doc.appended[0].onload();
  assert.equal(timers.cleared, 1, 'watchdog cleared exactly once on success');
  assert.equal(timers.scheduled[0].alive, false, 'the armed timer was cancelled');
  assert.deepEqual(loads, [FULL_API]);

  // even if the (already-cancelled) timer callback somehow ran, it must not
  // re-drain: pending queues are empty, so firing it produces no extra errors.
  timers.scheduled[0].fn();
  assert.equal(errs.length, 0, 'a stale watchdog fire after success is a no-op');
});

// onerror also clears the watchdog (mirror of f-2 for the error branch).
test('onerror clears the watchdog too', () => {
  const { loadAlphaTab, doc, timers } = makeLoader();
  loadAlphaTab(() => {}, () => {});
  doc.appended[0].onerror();
  assert.equal(timers.cleared, 1, 'watchdog cleared on error');
  assert.equal(timers.scheduled[0].alive, false);
});
