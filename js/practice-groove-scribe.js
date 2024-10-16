// https://uztfco.csb.app/

const abc_source = document.getElementById("ABCsource").value;
const abc_bpm = document.getElementById("tempoTextField1").value;

const from = `
%%beginsvg
 <defs>
 <path id="Xhead" d="m-3,-3 l6,6 m0,-6 l-6,6" class="stroke" style="stroke-width:1.2"/>
 <path id="Trihead" d="m-3,2 l 6,0 l-3,-6 l-3,6 l6,0" class="stroke" style="stroke-width:1.2"/>
 </defs>
%%endsvg
`;

const to = `
%%percmap D  pedal-hi-hat x
%%percmap F  bass-drum-1
%%percmap E  acoustic-bass-drum
%%percmap G  low-floor-tom
%%percmap A  high-floor-tom
%%percmap B  low-tom
%%percmap ^B tambourine   triangle
%%percmap c  acoustic-snare
%%percmap _c electric-snare
%%percmap ^c low-wood-block   triangle
%%percmap =c side-stick x
%%percmap d  low-tom
%%percmap =d  low-mid-tom harmonic
%%percmap ^d hi-wood-block    triangle
%%percmap e  hi-mid-tom
%%percmap ^e cowbell      triangle
%%percmap f  high-tom
%%percmap ^f ride-cymbal-1
%%percmap =f ride-bell harmonic
%%percmap g  closed-hi-hat x
%%percmap ^g open-hi-hat x
%%percmap a  crash-cymbal-1  x
%%percmap ^a open-triangle     triangle
`;

const fromMusicSpace = `
%%musicspace`;

const toMusicSpaceWithBPM = `
Q:${abc_bpm}
%%musicspace`;


const abcFromGrooveScribe = abc_source.replace(from, to).replace(fromMusicSpace, toMusicSpaceWithBPM);
console.log(abcFromGrooveScribe);
copy(abcFromGrooveScribe);
