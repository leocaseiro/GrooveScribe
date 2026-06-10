// Standalone, testable alphaTab CDN loader.
//
// `createAlphaTabLoader(opts)` returns a `loadAlphaTab(onLoad, onError)` function
// that lazily injects the alphaTab <script> exactly once, queues concurrent
// callers, and tears the injection down (so a later call can retry) on error,
// missing-API, or a CDN socket stall (the timeout watchdog).
//
// Everything external is injected via `opts` so the loader can be unit-tested
// with stubbed doc/win/timers — no real DOM, no real network. Defaults wire it
// to the live browser globals when run in the app.
//
// opts:
//   doc        - document-like (createElement, getElementById, head.appendChild)
//   win        - window-like (read .alphaTab to detect an already-loaded API)
//   url        - CDN script src
//   sri        - Subresource Integrity hash for the <script integrity> attr
//   timeoutMs  - watchdog deadline in ms before a stalled load is failed (default 15000)
//   setTimeout / clearTimeout - timer fns (default to globals; injectable for tests)
var createAlphaTabLoader = (function () {
	'use strict';

	// The alphaTab API is "ready" only when the importer entry point we use exists.
	// A bare `win.alphaTab` truthy check is NOT enough: the bug this guards against
	// shipped because code trusted the global object before its importer was attached.
	function apiReady(win) {
		return !!(win && win.alphaTab && win.alphaTab.importer && win.alphaTab.importer.AlphaTexImporter);
	}

	return function createAlphaTabLoader(opts) {
		opts = opts || {};
		var doc = opts.doc;
		var win = opts.win;
		var url = opts.url;
		var sri = opts.sri;
		var timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 15000;
		// Bind timer fns. In the browser, setTimeout/clearTimeout must be called with
		// `this === window` or they throw "Illegal invocation"; the default arrows
		// below preserve that. Tests pass their own stubs.
		var setTimeoutFn = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
		var clearTimeoutFn = opts.clearTimeout || function (id) { return clearTimeout(id); };

		// Queues of callers waiting on the in-flight injection.
		var pendingLoad = [];
		var pendingError = [];

		// Reset all in-flight state so the NEXT loadAlphaTab() re-injects cleanly.
		// Returns the captured error queue so the caller can drain it AFTER reset
		// (draining first would let a callback re-enter loadAlphaTab against stale state).
		function resetInflight() {
			var errs = pendingError;
			pendingLoad = [];
			pendingError = [];
			return errs;
		}

		return function loadAlphaTab(onLoad, onError) {
			if (apiReady(win)) {
				onLoad(win.alphaTab);
				return;
			}
			pendingLoad.push(onLoad);
			pendingError.push(onError);
			if (doc.getElementById('alphaTabScript')) return; // injection already in flight

			var timer = null;
			function clearWatchdog() {
				if (timer !== null) { clearTimeoutFn(timer); timer = null; }
			}

			var script = doc.createElement('script');
			script.id = 'alphaTabScript';
			script.src = url;
			script.integrity = sri;
			script.crossOrigin = 'anonymous';

			script.onload = function () {
				clearWatchdog(); // a completed load must never let the watchdog double-drain later
				if (apiReady(win)) {
					var cbs = pendingLoad;
					pendingLoad = [];
					pendingError = [];
					cbs.forEach(function (cb) { cb(win.alphaTab); });
				} else {
					script.remove(); // reset so a later click can retry
					resetInflight().forEach(function (cb) { cb(new Error('alphaTab loaded but API missing')); });
				}
			};
			script.onerror = function () {
				clearWatchdog();
				script.remove(); // reset so a later click can retry
				resetInflight().forEach(function (cb) { cb(new Error('Failed to load alphaTab')); });
			};

			// Watchdog: if the CDN socket stalls (neither onload nor onerror ever
			// fires) the queued callers would hang forever AND the in-flight
			// getElementById guard above would block every future retry. On expiry
			// we remove the <script>, fail the queue, and reset so a later click
			// re-injects from scratch.
			timer = setTimeoutFn(function () {
				timer = null;
				script.remove();
				resetInflight().forEach(function (cb) { cb(new Error('alphaTab load timed out')); });
			}, timeoutMs);

			doc.head.appendChild(script);
		};
	};
})();

// Export for Node unit tests without disturbing the browser global.
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { createAlphaTabLoader: createAlphaTabLoader };
}
