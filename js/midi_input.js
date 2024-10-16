class MidiInput {
  constructor() {
    this.midiAccess = null;
    this.selectedInput = null;
    this.noteEvents = [];
    this.inputOptions = [];
    this.midiInputSelect = document.getElementById("midiSettingsSelect");
    this.noteList = document.getElementById("js-note-list");
    this.midiInputLabel = document.getElementById("midiSettingsSelectLabel");

    this.handleMidiMessage = this.handleMidiMessage.bind(this);
    this.handleInputSelectChange = this.handleInputSelectChange.bind(this);
  }

  async init() {
    this.midiInputSelect = document.getElementById("midiSettingsSelect");
    this.noteList = document.getElementById("js-note-list");
    this.midiInputLabel = document.getElementById("midiSettingsSelectLabel");

    if (!navigator.requestMIDIAccess) {
      const err = "WebMidi API not supported on this browser.";
      alert(err);
      console.log(err);
      return;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.onstatechange = this.updateInputs.bind(this);
      this.updateInputs();
    } catch (error) {
      console.error("Failed to initialize MIDI: ", error);
    }
  }

  handleMidiMessage(event) {
    const command = event.data[0];
    const timestamp = event.timeStamp;
    const note = event.data[1];
    const velocity = event.data.length > 2 ? event.data[2] : 0;

    if (command >= 144 && command <= 159) {
      this.noteEvents = [{ note, timestamp, velocity }, ...this.noteEvents];
      this.displayNoteEvents();
    }
  }

  updateSelectedInput(input) {
    if (this.selectedInput !== input) {
      if (this.selectedInput) {
        this.selectedInput.removeEventListener(
          "midimessage",
          this.handleMidiMessage
        );
      }
      this.selectedInput = input;
      this.selectedInput.addEventListener(
        "midimessage",
        this.handleMidiMessage
      );
    }
  }

  handleInputSelectChange(event) {
    const inputId = event.target.value;
    const input = this.midiAccess.inputs.get(inputId);
    if (input) {
      this.updateSelectedInput(input);
    }
  }

  displayNoteEvents() {
    this.noteList.innerHTML = "";
    // Slice the last 5 notes from the noteEvents array
    const lastFiveNotes = this.noteEvents.slice(0, 5);
    lastFiveNotes.forEach((event) => {
        const li = document.createElement("li");
        li.textContent = `Note: ${event.note}, Timestamp: ${event.timestamp}, Velocity: ${event.velocity}`;
        this.noteList.appendChild(li);
    });
  }

  updateInputs() {
    const inputs = Array.from(this.midiAccess.inputs.values());
    if (inputs.length > 0) {
      this.inputOptions = inputs.map((input, i) => ({
        id: input.id,
        name: `${i} ${input.name}`,
      }));
      this.midiInputSelect.innerHTML = this.inputOptions
        .map((option) => `<option value="${option.id}">${option.name}</option>`)
        .join("");
      if (!this.selectedInput || !inputs.includes(this.selectedInput)) {
        this.updateSelectedInput(inputs[0]);
      }
    } else {
      this.inputOptions = [{ id: "", name: "No available MIDI inputs" }];
      this.midiInputSelect.innerHTML =
        '<option value="">No available MIDI inputs</option>';
      this.selectedInput = null;
      this.noteList.innerHTML = "";
    }
  }

  midiSettingsOpen() {
    var popup = document.getElementById("midiSettingsPopup");

    if (popup)
        popup.style.display = "block";
  }

  midiSettingsClose() {
    var popup = document.getElementById("midiSettingsPopup");

    if (popup)
        popup.style.display = "none";
  }
}
