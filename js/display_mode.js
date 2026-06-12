// Pure display-mode helpers for GrooveScribe's EDIT / VIEW / ALPHATAB switch.
//
// No DOM access — kept standalone (like js/alphatab_loader.js) so the cycle order
// and the control label can be unit-tested in Node. The DOM glue that reads the
// page state and toggles elements lives in js/groove_writer.js (cycleDisplayMode).
var GrooveDisplayMode = (function () {
	'use strict';

	// The cycle order the top-left control walks on each click.
	var ORDER = ['edit', 'view', 'alphatab'];

	// EDIT -> VIEW -> ALPHATAB -> EDIT. Any unknown value falls back to 'edit', so a
	// bad state can never wedge the control on a mode the user can't click out of.
	function nextDisplayMode(mode) {
		var i = ORDER.indexOf(mode);
		if (i === -1) return 'edit';
		return ORDER[(i + 1) % ORDER.length];
	}

	// Label for the top-left control: it always names the mode a click switches TO.
	function displayModeButtonLabel(mode) {
		return 'Switch to ' + nextDisplayMode(mode).toUpperCase() + ' mode';
	}

	return {
		nextDisplayMode: nextDisplayMode,
		displayModeButtonLabel: displayModeButtonLabel
	};
})();

// Export for Node unit tests without disturbing the browser global.
if (typeof module !== 'undefined' && module.exports) {
	module.exports = GrooveDisplayMode;
}
