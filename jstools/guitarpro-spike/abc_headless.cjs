const fs = require('fs');
const vm = require('vm');
globalThis.window = globalThis;
globalThis.navigator = { userAgent: 'node' };
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{},appendChild(){},setAttribute(){},click(){},getContext:()=>null }), querySelector: () => null, querySelectorAll: () => [], write(){}, addEventListener(){} };
globalThis.location = { href:'', search:'', pathname:'' };
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
globalThis.alert = () => {};
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname,'../../js/groove_utils.js'),'utf8'), { filename:'groove_utils.js' });
const gu = new globalThis.GrooveUtils();

function musicOf(url) {
  const gd = gu.getGrooveDataFromUrlString(url);
  const abc = gu.createABCFromGrooveData(gd, 800);
  // print only the voice music lines (after K:C clef=perc)
  const idx = abc.indexOf('K:C clef=perc');
  return abc.slice(idx);
}

console.log('### 1) ROCK BEAT (16th grid, HH 8ths, S 2&4, K 1&3)');
console.log(musicOf('TimeSig=4/4&Div=16&H=|x-x-x-x-x-x-x-x-|&S=|----o-------o---|&K=|o-------o-------|&measures=1'));

console.log('\n### 2) SPARSE: snare on beat 1 only, everything else empty (the F1 case)');
console.log(musicOf('TimeSig=4/4&Div=16&H=|----------------|&S=|o---------------|&K=|----------------|&measures=1'));

console.log('\n### 3) SPARSE: kick beat 1 + snare beat 3 only');
console.log(musicOf('TimeSig=4/4&Div=16&H=|----------------|&S=|--------o-------|&K=|o---------------|&measures=1'));

console.log('\n### 4) TRIPLET grid (Div=12): HH all, K on each beat');
console.log(musicOf('TimeSig=4/4&Div=12&H=|xxxxxxxxxxxx|&S=|------------|&K=|o--o--o--o--|&measures=1'));
