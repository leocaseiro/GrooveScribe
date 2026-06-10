import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The alphaTab CDN URL is duplicated in js/groove_writer.js (the app loader) and
// sw.js (a service worker can't import app code). A version bump that touches only
// one file silently breaks offline export — the SW caches a URL the app never
// requests. These tests turn that silent drift into a red build.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const read = (f) => readFileSync(join(repoRoot, f), 'utf8');

const CDN_RE = /https:\/\/cdn\.jsdelivr\.net\/npm\/@coderline\/alphatab@(\d+\.\d+\.\d+)\/dist\/alphaTab\.min\.js/;

function cdnPin(file) {
  const m = read(file).match(CDN_RE);
  assert.ok(m, `expected an alphaTab jsDelivr URL in ${file}`);
  return { url: m[0], version: m[1] };
}

test('groove_writer.js and sw.js pin the same alphaTab CDN URL', () => {
  const app = cdnPin('js/groove_writer.js');
  const sw = cdnPin('sw.js');
  assert.equal(sw.url, app.url, 'ALPHATAB_CDN_URL drifted between groove_writer.js and sw.js');
});

test('the pinned CDN version matches the @coderline/alphatab dependency the tests run against', () => {
  const { version } = cdnPin('js/groove_writer.js');
  const pkg = JSON.parse(read('package.json'));
  const dep = (pkg.dependencies && pkg.dependencies['@coderline/alphatab'])
    || (pkg.devDependencies && pkg.devDependencies['@coderline/alphatab']);
  assert.ok(dep, '@coderline/alphatab not found in package.json');
  const depVersion = dep.replace(/^[^\d]*/, '');   // tolerate ^/~ range prefixes
  assert.equal(depVersion, version,
    'CDN-pinned alphaTab version != package.json dependency — the browser ships a different version than the Node tests validate');
});
