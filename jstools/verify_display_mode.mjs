import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Load js/display_mode.js in an isolated VM context that exposes a CommonJS
// `module` so the file's `module.exports` block hands us the helpers.
function loadModule() {
  const src = readFileSync(join(repoRoot, 'js/display_mode.js'), 'utf8');
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(src, sandbox, { filename: 'display_mode.js' });
  return sandbox.module.exports;
}

const { nextDisplayMode, displayModeButtonLabel } = loadModule();

test('nextDisplayMode walks EDIT -> VIEW -> ALPHATAB -> EDIT', () => {
  assert.equal(nextDisplayMode('edit'), 'view');
  assert.equal(nextDisplayMode('view'), 'alphatab');
  assert.equal(nextDisplayMode('alphatab'), 'edit');
});

test('nextDisplayMode is a full 3-cycle back to the start', () => {
  let mode = 'edit';
  mode = nextDisplayMode(mode);
  mode = nextDisplayMode(mode);
  mode = nextDisplayMode(mode);
  assert.equal(mode, 'edit');
});

test('nextDisplayMode falls back to edit for unknown input', () => {
  assert.equal(nextDisplayMode('bogus'), 'edit');
  assert.equal(nextDisplayMode(undefined), 'edit');
  assert.equal(nextDisplayMode(null), 'edit');
});

test('displayModeButtonLabel names the mode a click switches TO', () => {
  assert.equal(displayModeButtonLabel('edit'), 'Switch to VIEW mode');
  assert.equal(displayModeButtonLabel('view'), 'Switch to ALPHATAB mode');
  assert.equal(displayModeButtonLabel('alphatab'), 'Switch to EDIT mode');
});
