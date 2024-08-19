function RhythmGame() {
    // Game constants
    const HIT_WINDOW = 100; // milliseconds

    // Game variables
    let notes = [];
    let score = {
        perfect: 0,
        early: 0,
        late: 0,
        missed: 0,
        misplaced: 0
    };
    let gameStartTime;
    let isGameRunning = false;
    let lastFrameTime;

    // DOM elements
    let gameArea, startButton, scoreElements, drumsContainer;

	const drumMapping = {
		42: 'HIHAT_NORMAL',
		46: 'HIHAT_OPEN',
		108: 'HIHAT_ACCENT',
		49: 'HIHAT_CRASH',
		52: 'HIHAT_STACKER',
		51: 'HIHAT_RIDE',
		53: 'HIHAT_RIDE_BELL',
		105: 'HIHAT_COW_BELL',
		44: 'HIHAT_FOOT',
		38: 'SNARE_NORMAL',
		22: 'SNARE_ACCENT',
		21: 'SNARE_GHOST',
		37: 'SNARE_XSTICK',
		104: 'SNARE_BUZZ',
		107: 'SNARE_FLAM',
		103: 'SNARE_DRAG',
		35: 'KICK_NORMAL',
		48: 'TOM1_NORMAL',
		47: 'TOM2_NORMAL',
		45: 'TOM3_NORMAL',
		43: 'TOM4_NORMAL'
	}

    const onLoad = () => {
        scoreElements = {
            perfect: document.getElementById('perfect-count'),
            early: document.getElementById('early-count'),
            late: document.getElementById('late-count'),
            missed: document.getElementById('missed-count'),
            misplaced: document.getElementById('misplaced-count')
        };
    }

    const createNote = (drum, midiNumber, time) => {
        const note = {
            drum: drum,
            midiNumber: midiNumber,
            creationTime: time
        };
        notes.push(note);
    }


    const removeNote = (note) => {
        const index = notes.indexOf(note);
        if (index > -1) {
            notes.splice(index, 1);
        }
    }

    const checkHit = (midiNumber, hitTime) => {
        if (!isGameRunning) return;
        const hitNote = notes.find(note => note.midiNumber === midiNumber && Math.abs(note.creationTime - hitTime) <= HIT_WINDOW);
        if (hitNote) {
            const timeDiff = Math.abs(hitTime - hitNote.creationTime);
            if (timeDiff <= HIT_WINDOW / 2) {
                score.perfect++;
                updateScoreDisplay('perfect');
            } else if (timeDiff <= HIT_WINDOW) {
                if (hitTime < hitNote.creationTime) {
                    score.early++;
                    updateScoreDisplay('early');
                } else {
                    score.late++;
                    updateScoreDisplay('late');
                }
            }
            removeNote(hitNote);
        } else {
            score.misplaced++;
            updateScoreDisplay('misplaced');
        }
    }

	const onHit = (type, data) => {
        // console.log(MIDI);
		checkHit(42, MIDI.Player.currentTime * 1000);
	};

    const resetScore = () => {
        for (let key in score) {
            score[key] = 0;
            updateScoreDisplay(key);
        }
    }

    const updateScoreDisplay = (type) => {
        if (scoreElements[type]) {
            scoreElements[type].textContent = score[type];
        } else {
            console.error(`Score element for ${type} not found`);
        }
    }

    const onMidiPlayNote = (utilsRoot, data) => {
        console.log('on Play Note');
        isGameRunning = true;
        const currentTime = MIDI.Player.currentTime * 1000;
        if (data.channel === 9) { // Channel 9 is typically used for drums
            const drum = drumMapping[data.note];
            if (drum) {
                if (data.message === 144 && data.velocity > 0) { // Note on
                    createNote(drum, data.note, currentTime);
                }
            }
        }
    }

    const stopGame = () => {
        isGameRunning = false;
    }

    return {
        resetScore: resetScore,
        stopGame: stopGame,
        onHit: onHit,
        onMidiPlayNote: onMidiPlayNote,
        onLoad: onLoad,
    }
} // end of class
