function RhythmGame() {
    // Game constants
    const HIT_WINDOW = 1000; // milliseconds

    // Game variables
    let notes = [];
    let hits = [];
    let loops = 0;
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

    const createNote = (drum, midiNumber, time, loop) => {
        const note = {
            drum: drum,
            midiNumber: midiNumber,
            creationTime: time,
            loop: loop
        };
        notes.push(note);
    }


    const removeNote = (note) => {
        const index = notes.indexOf(note);
        if (index > -1) {
            notes.splice(index, 1);
        }
    }

    /** \
     * @link https://github.com/ChloeLiang/rhythm-game/blob/4995fbf1573f0dbdfac00bfe99c18523b610f24d/scripts/script.js
     */
    var judge = function (index) {
        var timeInSecond = (Date.now() - startTime) / 1000;
        var nextNoteIndex = song.sheet[index].next;
        var nextNote = song.sheet[index].notes[nextNoteIndex];
        var perfectTime = nextNote.duration + nextNote.delay;
        var accuracy = Math.abs(timeInSecond - perfectTime);
        var hitJudgement;

        /**
         * As long as the note has travelled less than 3/4 of the height of
         * the track, any key press on this track will be ignored.
         */
        if (accuracy > (nextNote.duration - speed) / 4) {
        return;
        }

        hitJudgement = getHitJudgement(accuracy);
        displayAccuracy(hitJudgement);
        showHitEffect(index);
        updateHits(hitJudgement);
        updateCombo(hitJudgement);
        updateMaxCombo();
        calculateScore(hitJudgement);
        removeNoteFromTrack(tracks[index], tracks[index].firstChild);
        updateNext(index);
    };

    var getHitJudgement = function (accuracy) {
        if (accuracy < 0.1) {
        return 'perfect';
        } else if (accuracy < 0.2) {
        return 'good';
        } else if (accuracy < 0.3) {
        return 'bad';
        } else {
        return 'miss';
        }
    };

    const checkHit = (midiNumber, hitTime) => {

        if (!isGameRunning) return;

        hits.push({midiNumber, hitTime});
        // console.log('notes', JSON.stringify(notes));
        // console.log('hits', hits);
        // console.log('MIDI', MIDI.Player);

        // Calculate the current loop based on hitTime
        const currentLoop = Math.floor(hitTime / (notes[notes.length - 1]?.creationTime + HIT_WINDOW));

        // Find the closest note within the hit window, considering loops
        const hitNote = notes.find(note => {
            const effectiveCreationTime = note.creationTime + (note.loop * (notes[notes.length - 1]?.creationTime + HIT_WINDOW));
            // Round both times to mitigate floating-point precision issues
            const roundedHitTime = Math.round(hitTime).toFixed(10);
            const roundedCreationTime = Math.round(effectiveCreationTime);
            return note.midiNumber === midiNumber && Math.abs(roundedCreationTime - roundedHitTime) <= HIT_WINDOW;
        });

        if (hitNote) {
            const effectiveCreationTime = hitNote.creationTime + (hitNote.loop * (notes[notes.length - 1].creationTime + HIT_WINDOW));
            // Round both times for comparison
            const roundedHitTime = Math.round(hitTime);
            const roundedCreationTime = Math.round(effectiveCreationTime);
            const timeDiff = roundedHitTime - roundedCreationTime;

            console.log(`Hit time: ${roundedHitTime}, Note time: ${roundedCreationTime}, Time difference: ${timeDiff}`);

            if (Math.abs(timeDiff) <= HIT_WINDOW / 2) {
                score.perfect++;
                updateScoreDisplay('perfect');
            } else if (timeDiff < 0) {
                score.early++;
                updateScoreDisplay('early');
            } else {
                score.late++;
                updateScoreDisplay('late');
            }
            removeNote(hitNote);
        } else {
            score.misplaced++;
            updateScoreDisplay('misplaced');
        }
    };

    const old_withLoops_checkHit = (midiNumber, hitTime) => {
        if (!isGameRunning) return;

        hits.push({midiNumber, hitTime});

        // Calculate the current loop based on hitTime
        const currentLoop = Math.floor(hitTime / (notes[notes.length - 1]?.creationTime + HIT_WINDOW));

        // Find the closest note within the hit window, considering loops
        const hitNote = notes.find(note => {
            const effectiveCreationTime = note.creationTime + (note.loop * (notes[notes.length - 1].creationTime + HIT_WINDOW));
            return note.midiNumber === midiNumber && Math.abs(effectiveCreationTime - hitTime) <= HIT_WINDOW;
        });

        if (hitNote) {
            const effectiveCreationTime = hitNote.creationTime + (hitNote.loop * (notes[notes.length - 1].creationTime + HIT_WINDOW));
            const timeDiff = hitTime - effectiveCreationTime;

            console.log(`Hit time: ${hitTime}, Note time: ${effectiveCreationTime}, Time difference: ${timeDiff}`);

            if (Math.abs(timeDiff) <= HIT_WINDOW / 2) {
                score.perfect++;
                updateScoreDisplay('perfect');
            } else if (timeDiff < 0) {
                score.early++;
                updateScoreDisplay('early');
            } else {
                score.late++;
                updateScoreDisplay('late');
            }
            removeNote(hitNote);
        } else {
            score.misplaced++;
            updateScoreDisplay('misplaced');
        }
    };

    const v2__checkHit = (midiNumber, hitTime) => {
        if (!isGameRunning) return;

        hits.push({midiNumber, hitTime});

        // Find the closest note within the hit window
        const hitNote = notes.find(note => note.midiNumber === midiNumber && Math.abs(note.creationTime - hitTime) <= HIT_WINDOW);

        if (hitNote) {
            const timeDiff = hitTime - hitNote.creationTime;
            console.log('timeDiff', timeDiff);
            console.log('hits', hits);

            if (Math.abs(timeDiff) <= HIT_WINDOW / 2) {
                score.perfect++;
                updateScoreDisplay('perfect');
            } else if (timeDiff < 0) {
                score.early++;
                updateScoreDisplay('early');
            } else {
                score.late++;
                updateScoreDisplay('late');
            }
            removeNote(hitNote);
        } else {
            score.misplaced++;
            updateScoreDisplay('misplaced');
        }
    };

    const checkMissedNotes = (currentTime) => {
        notes.forEach(note => {
            if (note.creationTime < currentTime - HIT_WINDOW) {
                score.missed++;
                updateScoreDisplay('missed');
                removeNote(note);
            }
        });
    };

    // Call this function periodically, e.g., in your game loop
    const updateGameState = () => {
        const currentTime = MIDI.Player.currentTime * 1000;
        // console.log('updateGameState', currentTime)
        checkMissedNotes(currentTime);

    };

    const OLD_checkHit = (midiNumber, hitTime) => {
        if (!isGameRunning) return;
        console.log('notes', notes);
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
		// checkHit(42, MIDI.Player.currentTime * 1000);
		// OLD_checkHit(42, MIDI.Player.currentTime * 1000);
		OLD_checkHit(42, MIDI.Player.ctx.currentTime * 1000);
        // console.log('onHit', MIDI.Player.ctx.currentTime);
	};

    const resetScore = () => {
        for (let key in score) {
            score[key] = 0;
            updateScoreDisplay(key);
        }
        notes = [];
        hits = [];
        loops = 0;
    }

    const onLoop = () => {
        loops++;
    }

    const updateScoreDisplay = (type) => {
        if (scoreElements[type]) {
            scoreElements[type].textContent = score[type];
        } else {
            console.error(`Score element for ${type} not found`);
        }
    }

    const onMidiPlayNote = (utilsRoot, data) => {
        console.log('on Play Note', data.now, data.end);
        isGameRunning = true;
        const currentTime = MIDI.Player.currentTime * 1000;
        console.log('onMidiPlayNote', MIDI.Player.currentTime * 1000)
        if (data.channel === 9) { // Channel 9 is typically used for drums
            const drum = drumMapping[data.note];
            if (drum) {
                if (data.message === 144 && data.velocity > 0) { // Note on
                    createNote(drum, data.note, currentTime, loops);
                }
            }
        }

        updateGameState();
    }

    const stopGame = () => {
        isGameRunning = false;
    }

    return {
        resetScore: resetScore,
        stopGame: stopGame,
        onLoop: onLoop,
        onHit: onHit,
        onMidiPlayNote: onMidiPlayNote,
        onLoad: onLoad,
    }
} // end of class
