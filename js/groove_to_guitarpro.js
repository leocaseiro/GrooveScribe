// Guitar Pro export generator. Translates GrooveScribe's ABC (V:Hands line)
// into alphaTex, then (in the browser) hands it to alphaTab to write a .gp file.
// No DOM access — `alphaTab` is injected so this module never reaches for a global.
var GrooveToGuitarPro = (function () {
  'use strict';

  // ABC pitch token -> { name, midi }. Keys are the constant_ABC_* pitch values
  // (decorations like !accent! / !open! are handled separately in resolveArticulation).
  // Grows in Task 5. Rock beat needs only these three.
  var ARTICULATION_MAP = {
    '^g':   { name: 'HiHat',       midi: 42 }, // hi-hat normal / close / accent (decoration handled in Task 6)
    '^A\'': { name: 'Ride',        midi: 51 },
    '^B\'': { name: 'RideBell',    midi: 53 },
    '^D\'': { name: 'Cowbell',     midi: 56 },
    '^c\'': { name: 'Crash',       midi: 49 },
    '^d\'': { name: 'China',       midi: 52 }, // stacker (approx)
    '^e\'': { name: 'Click',       midi: 77 }, // metronome normal
    '^f\'': { name: 'ClickAccent', midi: 76 }, // metronome accent
    'c':    { name: 'Snare',       midi: 38 },
    '^c':   { name: 'SideStick',   midi: 37 }, // cross-stick
    'F':    { name: 'Kick',        midi: 36 },
    '^d,':  { name: 'HiHatPedal',  midi: 44 }, // foot splash (approx)
    'e':    { name: 'Tom1',        midi: 48 },
    'd':    { name: 'Tom2',        midi: 47 },
    'B':    { name: 'Tom3',        midi: 45 },
    'A':    { name: 'Tom4',        midi: 43 },
  };

  // alphaTex duration number = 32 / abc_units (ABC is L:1/32).
  function durFromUnits(units) { return 32 / units; }

  // Extract the V:Hands music (across measures) from full ABC, skipping the
  // optional on-screen legend (which also contains a V:Hands line in the header).
  function extractHandsMusic(abc) {
    var clefIdx = abc.indexOf('K:C clef=perc');
    if (clefIdx === -1) return '';                 // unexpected ABC shape — fail closed, don't slice(-1)
    var afterClef = abc.slice(clefIdx);
    var m = afterClef.match(/V:Hands[^\n]*\n%%voicemap drum\n([\s\S]*?)(?:\nV:|\nT:|$)/);
    return m ? m[1].replace(/\n/g, ' ').trim() : '';
  }

  function articulationFor(pitch) { return ARTICULATION_MAP[pitch] || null; }

  // Effect decorations that GrooveScribe moves to the FRONT of a chord (apply to all notes).
  var LEADING_DECORATIONS = ['!accent!', '!open!', '!plus!', '!///!'];
  // Decoration -> alphaTex note-effect (or articulation override for open/close).
  // Returns { effect: '{ac}'|'{g}'|'{tp (3 buzzRoll)}'|null, overrideName, overrideMidi }
  function decorationEffect(dec, baseName) {
    switch (dec) {
      case '!accent!': return { effect: '{ac}' };
      case '!(.!!).!': return { effect: '{g}' };
      case '!///!':    return { effect: '{tp (3 buzzRoll)}' };
      case '!open!':   return baseName === 'HiHat' ? { overrideName: 'HiHatOpen', overrideMidi: 46 } : {};
      case '!plus!':   return {}; // close hi-hat == plain HiHat in GP
      default:         return {};
    }
  }

  // Resolve one ABC note segment ("[inner-decorations]pitch") to an alphaTex
  // note string + records the used articulation. `extraDecs` are leading
  // decorations that were moved out of a chord (apply to this note too).
  function resolveNote(seg, usedNames, extraDecs) {
    var decs = (extraDecs || []).slice();
    var rest = seg;
    var dm;
    // pull inner decorations (!...! groups, including the ghost !(.!!).! form)
    var decRe = /^(!\(\.!!\)\.!|![^!]*!)/;
    while ((dm = rest.match(decRe))) { decs.push(dm[1]); rest = rest.slice(dm[1].length); }
    var pm = rest.match(/^(\^?[A-Ga-g][,']*)/);
    if (!pm) return null;
    var art = articulationFor(pm[1]);
    if (!art) return null;
    var name = art.name, midi = art.midi, effects = '';
    decs.forEach(function (d) {
      var r = decorationEffect(d, name);
      if (r.overrideName) { name = r.overrideName; midi = r.overrideMidi; }
      if (r.effect) effects += r.effect;
    });
    usedNames[name] = midi;
    return name + effects;
  }

  // Hand-written scanner over the V:Hands line. A regex-per-token approach can't
  // handle BOTH chord forms GrooveScribe emits: a normal chord puts the duration
  // INSIDE ([^g4F4], no trailing digit), while the kick+splash literal puts it
  // AFTER ([F^d,]8). The scanner reads an optional trailing duration and falls
  // back to the first inner note's duration. Task 7 adds grace emission before
  // the chord/note dispatch (flam/drag).
  function translateHands(line, usedNames) {
    var out = [];
    var tripletLeft = 0;
    var i = 0, n = line.length;
    function emit(beat) {
      if (tripletLeft > 0) { beat += ' {tu 3}'; tripletLeft--; }
      out.push(beat);
    }
    while (i < n) {
      var ch = line[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (line.startsWith('(3:3:3', i)) { tripletLeft = 3; i += 6; continue; }
      if (ch === '|') { while (line[i] === '|') i++; out.push('|'); continue; }
      var rm = /^z(\d+)/.exec(line.slice(i));
      if (rm) { emit('r.' + durFromUnits(+rm[1])); i += rm[0].length; continue; }
      // leading decorations (moved-out effects + graces)
      var leading = [], dm;
      while ((dm = /^(!\(\.!!\)\.!|![^!]*!|\{\/c+\})/.exec(line.slice(i)))) { leading.push(dm[1]); i += dm[1].length; }
      var movedEffects = leading.filter(function (d) { return LEADING_DECORATIONS.indexOf(d) !== -1; });
      // graces (flam {/c} / drag {/cc}) — a snare ornament emitted BEFORE the main
      // beat, whether the main hit is a single note or a chord (backbeat flam + hi-hat).
      var graceMatch = leading.join('').match(/\{\/(c+)\}/);
      if (graceMatch) {
        usedNames['Snare'] = 38;
        for (var gI = 0; gI < graceMatch[1].length; gI++) out.push('Snare.8 {gr bb}');
      }
      if (line[i] === '[') {                        // chord
        var end = line.indexOf(']', i);
        if (end === -1) { i++; continue; }         // malformed: no closing bracket — skip, never loop forever
        var innerStr = line.slice(i + 1, end);
        i = end + 1;
        var units;
        var trailing = /^(\d+)/.exec(line.slice(i));
        if (trailing) { units = +trailing[1]; i += trailing[0].length; }
        var innerNotes = innerStr.match(/(?:!\(\.!!\)\.!|![^!]*!)*\^?[A-Ga-g][,']*\d*/g) || [];
        if (units === undefined) {
          var fd = innerNotes[0] && innerNotes[0].match(/(\d+)$/);
          units = fd ? +fd[1] : 8;
        }
        var names = innerNotes.map(function (seg) {
          return resolveNote(seg.replace(/\d+$/, ''), usedNames, movedEffects);
        }).filter(Boolean);
        emit('(' + names.join(' ') + ').' + durFromUnits(units));
      } else {                                      // single note
        var nm = /^(\^?[A-Ga-g][,']*)(\d+)/.exec(line.slice(i));
        if (!nm) { i++; continue; }
        i += nm[0].length;
        // For single notes, pass all leading decorations (including ghost which
        // stays before a lone note, not inside a chord bracket).
        var one = resolveNote(nm[1], usedNames, leading);
        emit((one || 'r') + '.' + durFromUnits(+nm[2]));
      }
    }
    return out.join(' ');
  }

  function createAlphaTex(grooveData, grooveUtils) {
    // never include the on-screen legend in the export
    var gd = Object.assign({}, grooveData);
    gd.showLegend = false;
    var abc = grooveUtils.createABCFromGrooveData(gd, 800);
    var handsLine = extractHandsMusic(abc);

    var usedNames = {};
    var music = translateHands(handsLine, usedNames);

    var header = '\\title "' + (gd.title || 'GrooveScribe') + '" \\tempo ' + (gd.tempo || 120) + '\n.\n';
    header += '\\track "Drums"\n\\instrument percussion \\clef neutral\n';
    header += '\\ts ' + (gd.numBeats || 4) + ' ' + (gd.noteValue || 4) + '\n';
    Object.keys(usedNames).forEach(function (name) {
      header += '\\articulation ' + name + ' ' + usedNames[name] + '\n';
    });
    // ensure the line ends with a bar so the importer closes the last measure
    if (!/\|\s*$/.test(music)) music += ' |';
    return header + music + '\n';
  }

  function createGpData(grooveData, grooveUtils, alphaTab) {
    var tex = createAlphaTex(grooveData, grooveUtils);
    var settings = new alphaTab.Settings();
    var importer = new alphaTab.importer.AlphaTexImporter();
    importer.initFromString(tex, settings, null);
    var score = importer.readScore();
    return new alphaTab.exporter.Gp7Exporter().export(score, settings);
  }

  return {
    ARTICULATION_MAP: ARTICULATION_MAP,
    createAlphaTex: createAlphaTex,
    createGpData: createGpData,
  };
})();
