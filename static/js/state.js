// state.js — single source of truth for game state.
// Only this module mutates state; everything else calls setState().

export const state = {
    screen: 'theme',            // 'theme' | 'play' | 'round-end' | 'gallery'
    themes: [],                 // [{ name, dataUrl, image, words: [{ word, image }] }] from themes.json and the data files; image is the first word's
    theme: null,
    words: [],                  // [{ word, image, audio, break }] for the current round
    // results[i] = { word, correct }; level is the level the round is
    // played at, copied from `level` when a theme is tapped (startRound)
    // and fixed for the round (null while no round is in play); the
    // round's rules are level.js levelRules(round.level).
    round: { index: 0, size: 5, level: null, results: [] },
    // The level the kid picked on the theme screen (BACKLOG B-202):
    // 'easy' | 'normal' | 'hard'. Remembered in localStorage `flip.level`
    // (level.js loadLevel / saveLevel); main.js sets it from there at
    // start-up. A change takes effect from the next round.
    level: 'easy',
    // Rounds in a row finished with 3 stars on one level (BACKLOG B-209):
    // { level, rounds }, this session only (not stored). main.js onNext
    // updates it once per finished round (level.js streakAfter: fewer
    // stars, or a round on another level, start it over); a round left
    // with the back button never gets there and changes nothing. From
    // LEVEL_UP_ROUNDS on, the round-end screen suggests the next level
    // (level.js levelUpFor), except on hard.
    streak: { level: null, rounds: 0 },
    // A round is being set up: true from a tap that starts one (a theme
    // card, play again, the level-up nudge) until main.js startRound has
    // the theme's data file and shows the round. A second tap meanwhile
    // starts nothing.
    startingRound: false,
    current: {
        word: null,
        image: null,
        audio: null,            // the word's audio file from the content JSON, or none
        // the letters on the first slot row of a 9-10 letter word (its
        // `break` in the content JSON; round.js makeWord, layout.js
        // slotLayout, BACKLOG B-213), or null
        break: null,
        // placed[i] is null or { letter, tileId, locked?, hint? }; one slot per letter of word. locked: true (easy's given first letter, round.js makeWord; a right letter the lever kept after a wrong check on easy, drag.js leverResult; the robot's letter on the second miss, drag.js giveHint, which is also hint: true) stays put: no drag, tap out or drop on it (drag.js isLocked). The lever always leaves the given letter and the hint letter; its next pull sends a lever-locked one back
        placed: [],
        // tray is [{ id, letter, used, given?, extra? }] in tray display order (given: the easy first letter's block, which has no bench spot; extra: on hard, a block whose letter is not in the word, round.js makeWord, never used by the hint or the reveal); used: it is in a slot; id is stable
        // for the life of the word so the DOM tile can be keyed to it
        tray: [],
        // 'playing' | 'wrong' (checked, lives left; the next block move
        // makes it 'playing' again, as does the robot's letter when it
        // finishes the word, drag.js afterHint) | 'correct' | 'revealed'
        status: 'playing',
    },
    lives: 3,                   // attempts left for the current word
    // Console control held down (DESIGN "Controls and states"): 'dome' for
    // 120ms after a press on the check dome, 'lever' for 250ms after a pull
    // on the reset lever; null otherwise.
    pressed: null,
    speaking: false,            // the word's audio is playing (speaker-on)
    // Taps on the speaker while it holds the word back (normal and hard,
    // before the word is answered; BACKLOG B-203, controls.js
    // speakerAction). Each tap is one more: the robot's `speakerLocked`
    // moment (character.js) and its "hmm no" (audio.js) play on the
    // change, so only the change matters; counted over the session.
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
