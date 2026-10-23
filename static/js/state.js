// state.js — single source of truth for game state.
// Only this module mutates state; everything else calls setState().

export const state = {
    screen: 'theme',            // 'theme' | 'stages' | 'play' | 'round-end' | 'gallery'
    themes: [],                 // [{ name, dataUrl, image, words: [{ word, image }], stages }] from themes.json and the data files; image is the first word's; stages: stage.js stagesOf(data), the stages the data has words in (BACKLOG B-217)
    // The theme being played: set when its card is tapped (its stage
    // screen, BACKLOG B-217) and kept through its rounds, their round end
    // and the play screen's back arrow to its stage screen; null on the
    // theme screen.
    theme: null,
    // The kid's progress per theme as progress.js load() reads it from
    // the browser ({ "<theme>": { solved, cleared } }): main.js sets it at
    // start-up and again after each round's record, so the theme cards'
    // bulbs and the stage map (BACKLOG B-217) are a render of state.
    // progress.js stays the only reader and writer of the stored copy.
    progress: {},
    // The kid's gears (BACKLOG B-218, PROGRESSION.md "Gears"), as gears.js
    // reads them from the browser: main.js sets it at start-up (load())
    // and to gears.js add()'s return when a word is checked correct and
    // when a round reaches its end, so the gear counters (cogs.js) are a
    // render of state. gears.js stays the only reader and writer of the
    // stored count.
    gears: 0,
    // The data file of the round's theme ({ "cat": { image, audio, stage,
    // break }, ... }), set by startRound with the round and kept to its
    // round-end screen (the round's stage's words, progress.js afterRound;
    // the theme's stages, stage.js stagesOf); null with no round in play
    // (the theme and stage screens).
    data: null,
    words: [],                  // [{ word, image, audio, break }] for the current round
    // results[i] = { word, correct, clean, newSticker? }: clean (BACKLOG
    // B-218, gears.js isClean) when checked correct on the first check
    // with no boost; newSticker on a correct word, true when it was clean
    // and new in the sticker book (stickers.js add). stage is the stage the round is
    // played at (BACKLOG B-215: 1-5 or 'long', stage.js STAGES), set when
    // a station on the theme's stage map is tapped (its stage, BACKLOG
    // B-217) or play again is (startRound: the theme's current stage,
    // progress.js currentStage, BACKLOG B-216) and fixed for the
    // round (null while no round is in play); the round's rules are
    // stage.js stageRules(round.stage), for every word of the round.
    // cleared and justCleared are set when the round is recorded, at its
    // end (main.js onNext, progress.js record; BACKLOG B-216): the theme's
    // cleared stages after the round, and whether this round cleared its
    // stage (the round-end's stage bulbs; celebrate.js pops that bulb).
    round: { index: 0, size: 5, stage: null, results: [], cleared: [], justCleared: false },
    // A round is being set up: true from a tap that starts one (a station
    // on the stage map, play again) until main.js startRound has the theme's data file
    // and shows the round, or finds the kid has left the screen the tap came
    // from (BACKLOG B-217) and starts none. A second tap meanwhile starts nothing.
    startingRound: false,
    current: {
        word: null,
        image: null,
        audio: null,            // the word's audio file from the content JSON, or none
        // the letters on the first slot row of a 9-10 letter word (its
        // `break` in the content JSON; round.js makeWord, layout.js
        // slotLayout, BACKLOG B-213), or null
        break: null,
        // placed[i] is null or { letter, tileId, locked?, hint? }; one slot per letter of word. locked: true (stage 1's given first letter, round.js makeWord; a letter the last wrong check found right that the lever kept, drag.js leverResult; the robot's letter on the second miss, drag.js giveHint, which is also hint: true) stays put: no drag, tap out or drop on it (drag.js isLocked). The lever always leaves the given letter and the hint letter (and from B-219 a boost's, boost: true); a start-over pull sends a lever-locked one back
        placed: [],
        // tray is [{ id, letter, used, given?, extra? }] in tray display order (given: stage 1's first letter's block, which has no bench spot; extra: on a stage with extras, a block whose letter is not in the word, round.js makeWord, never used by the hint or the reveal); used: it is in a slot; id is stable
        // for the life of the word so the DOM tile can be keyed to it
        tray: [],
        // 'playing' | 'wrong' (checked, lives left; the next block move
        // makes it 'playing' again, as does the robot's letter when it
        // finishes the word, drag.js afterHint) | 'correct' | 'revealed'
        status: 'playing',
        // The reset lever's facts (BACKLOG B-215b, PROGRESSION.md "Lever
        // rule", drag.js leverResult). rightAtCheck: per slot, the tile id
        // the word's last wrong check found right there, else null (drag.js
        // checkedWrong); null before any wrong check and after a start-over
        // pull. A pull keeps those blocks still in their own slot, locked,
        // and sends every other letter back.
        rightAtCheck: null,
        // true after a lever pull (drag.js returnAll), false after any
        // block move (a drag, a tap, the robot's letter landing: placeIn,
        // takeOut, giveHint) and after a wrong check; a pull while it is
        // true starts the word over.
        justPulled: false,
    },
    lives: 3,                   // attempts left for the current word
    // Console control held down (DESIGN "Controls and states"): 'dome' for
    // 120ms after a press on the check dome, 'lever' for 250ms after a pull
    // on the reset lever; null otherwise.
    pressed: null,
    speaking: false,            // the word's audio is playing (speaker-on)
    // Times the robot shakes his head (his `speakerLocked` moment in
    // character.js, with its "hmm no" in audio.js): each one more plays it
    // once, so only the change matters; counted over the session. Since
    // BACKLOG B-215 the speaker always plays the word, so nothing adds to
    // it yet; B-219 adds one when the kid can't afford a boost.
    lockedTaps: 0,
    // Sound off (the header's mute toggle, B-108): no sound plays at all.
    // Remembered in localStorage `flip.muted` (audio.js loadMuted /
    // saveMuted); main.js sets it from there at start-up.
    muted: false,
    // The robot (character.js, CHARACTER.md "Moment map"):
    roundsStarted: 0,           // rounds started this session (he points at the dome in the first two)
    // performance.now() of the kid's last input on the current word, or of
    // its start; monotonic, so a wall-clock change cannot fire or delay
    // the idle beat.
    lastInput: 0,
    // The kid-idle beat of the current word, once per word: null until
    // IDLE_MS pass without input, 'sunk' from then (he has sunk) until the
    // kid's next input, 'over' after it (he popped back up).
    idleBeat: null,
    // Times the robot has nudged toward the dome on the current word
    // (BACKLOG B-212): once the word is answered (correct or revealed, the
    // dome means "next") and the dome is not pressed, main.js's nudge
    // timer adds one after character.js NUDGE_MS.first and then every
    // NUDGE_MS.every; each one more is his domeNudge moment. 0 on a new
    // word.
    nudges: 0,
    // The TV has tuned in to the current word's picture (BACKLOG B-214):
    // false on a new word, while tv.js's tune-in runs; true once its
    // picture has locked (main.js onTuned, told by tv.js). The robot's
    // "Picture shown" moment plays on the change (character.js).
    tuned: false,
};

const subscribers = [];

export function subscribe(fn) {
    subscribers.push(fn);
}

export function setState(patch) {
    Object.assign(state, patch);
    subscribers.forEach((fn) => fn(state));
}
