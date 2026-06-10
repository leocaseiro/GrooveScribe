const fs = require('fs');
const vm = require('vm');
const alphaTab = require('@coderline/alphatab');

// --- headless GrooveScribe ---
globalThis.window = globalThis;
globalThis.navigator = { userAgent: 'node' };
globalThis.document = { getElementById:()=>null, createElement:()=>({style:{},appendChild(){},setAttribute(){},click(){},getContext:()=>null}), querySelector:()=>null, querySelectorAll:()=>[], write(){}, addEventListener(){} };
globalThis.location = { href:'', search:'', pathname:'' };
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
globalThis.alert = () => {};
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname,'../../js/groove_utils.js'),'utf8'),{filename:'groove_utils.js'});
const gu = new globalThis.GrooveUtils();

// ABC drum pitch -> {name, midi}
const PITCH = {
  "^g": ["HiHat",42], "F": ["Kick",36], "c": ["Snare",38],
  "^c": ["SideStick",37], "A": ["FloorTom",43], "^A'": ["Ride",51],
};
const DECL = Object.entries(PITCH).map(([,[n,m]])=>`\\articulation ${n} ${m}`).join("\n");
// L:1/32 -> alphaTex duration = 32 / units
const dur = u => 32 / u;

function handsLine(url){
  const abc = gu.createABCFromGrooveData(gu.getGrooveDataFromUrlString(url), 800);
  const m = abc.match(/V:Hands[^\n]*\n%%voicemap drum\n([^\n]*)/);
  return m ? m[1].trim() : null;
}

// translate one V:Hands ABC line -> alphaTex beats
function translate(line){
  const out = [];
  let tripletLeft = 0;
  // tokenize: triplet marker | chord+dur | note/rest+dur | bar
  const re = /\(3:3:3|\[[^\]]*\]|\^?[A-Ga-gz][,']*\d+|\|+/g;
  let tok;
  while ((tok = re.exec(line))) {
    const t = tok[0];
    if (t === '(3:3:3') { tripletLeft = 3; continue; }
    if (/^\|+$/.test(t)) { out.push('|'); continue; }
    let beat;
    if (t[0] === '[') {                              // chord: [^g4F4] (per-note durations inside)
      const inner = [...t.slice(1,-1).matchAll(/(\^?[A-Ga-g][,']*)(\d+)/g)];
      const units = +inner[0][2];                    // duration from first note
      const notes = inner.map(x=>PITCH[x[1]] ? PITCH[x[1]][0] : ('?'+x[1]));
      beat = `(${notes.join(' ')}).${dur(units)}`;
    } else {                                          // single note or rest
      const mm = t.match(/^(\^?[A-Ga-gz][,']*)(\d+)$/);
      const pitch = mm[1], units = +mm[2];
      if (pitch === 'z') beat = `r.${dur(units)}`;
      else beat = `${PITCH[pitch] ? PITCH[pitch][0] : ('?'+pitch)}.${dur(units)}`;
    }
    if (tripletLeft > 0) { beat += ' {tu 3}'; tripletLeft--; }
    out.push(beat);
  }
  return out.join(' ');
}

const HEADER = `\\title "spike" \\tempo 120\n.\n\\track "Drums"\n\\instrument percussion \\clef neutral\n\\ts 4 4\n${DECL}\n`;

function check(label, url, expectFirstDur){
  const line = handsLine(url);
  const tex = translate(line);
  const settings = new alphaTab.Settings();
  const imp = new alphaTab.importer.AlphaTexImporter();
  imp.initFromString(HEADER + tex + ' |', settings, null);
  const score = imp.readScore();
  const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
  const info = beats.map(b => (b.isRest ? 'r' : '') + alphaTab.model.Duration[b.duration] + (b.tupletNumerator>0?'(3)':''));
  new alphaTab.exporter.Gp7Exporter().export(score, settings); // ensure it exports
  console.log(`\n### ${label}`);
  console.log('  ABC  :', line);
  console.log('  tex  :', tex);
  console.log('  beats:', info.join(' '));
  console.log('  first-beat duration =', alphaTab.model.Duration[beats[0].duration], '(expected', expectFirstDur + ')', beats[0].duration===alphaTab.model.Duration[expectFirstDur]||alphaTab.model.Duration[beats[0].duration]===expectFirstDur ? 'OK':'');
}

check('ROCK (expect eighths)', 'TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&measures=1', 'Eighth');
check('SPARSE snare beat1 (expect QUARTER not 16ths)', 'TimeSig=4/4&Div=16&H=|----------------|&S=|o---------------|&K=|----------------|&measures=1', 'Quarter');
check('TRIPLET (expect tuplet eighths)', 'TimeSig=4/4&Div=12&H=|xxxxxxxxxxxx|&S=|------------|&K=|o--o--o--o--|&measures=1', 'Eighth');
