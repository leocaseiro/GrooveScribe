var global_game_hit_notes = [];

class RythmGame {
  myGrooveUtils;

  constructor(myGrooveUtils) {
    this.myGrooveUtils = myGrooveUtils;
    this.midiAccess = null;
  }

  hihatHit() {
    // this.myGrooveWriter;
    // tom_circle tom_circle1 note_part note-selected--background note-highlighted
    document.querySelector('.note-highlighted.tom_circle1')?.classList.add('note-hit');
    document.querySelector('.note-highlighted.tom_circle2')?.classList.add('note-hit');
    document.querySelector('.note-highlighted.tom_circle3')?.classList.add('note-hit');
    document.querySelector('.note-highlighted.tom_circle4')?.classList.add('note-hit');
    document.querySelector('.note-highlighted.kick')?.classList.add('note-hit');
    document.querySelector('.note-highlighted.snare')?.classList.add('note-hit');
    document.querySelector('.note-highlighted.hi-hat')?.classList.add('note-hit');
    // document.querySelector('.note-highlighted .hi-hat .note-selected').classList.add('note-hit');
    // document.querySelector('.note-highlighted .hi-hat .note-selected--background').classList.add('note-hit--background');

    global_game_hit_notes.push({
      currentTime: MIDI.Player.currentTime,
      global_last_midi_update_time: global_last_midi_update_time,
      global_total_midi_play_time_msecs,
      global_total_midi_notes,
      global_total_midi_repeats
    });

    // console.log('>>> global_game_hit_notes', global_game_hit_notes);
  }
}
