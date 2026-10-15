// state.js — single source of truth for game state.
// Only this module mutates state; everything else calls setState().

export const state = {
    screen: 'theme',            // 'theme' | 'play' | 'round-end' | 'gallery'
    themes: [],                 // [{ name, dataUrl, image, words: [{ word, image }] }] from themes.json and the data files; image is the first word's
    theme: null,
    words: [],                  // [{ word, image, audio }] for the current round
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
    current: {
        word: null,
        image: null,
        audio: null,            // the word's audio file from the content JSON, or none
        // placed[i] is null or { letter, tileId, locked? }; one slot per letter of word. locked: true (easy's given first letter, round.js makeWord) stays put: no drag, tap out or drop on it, and the lever leaves it (drag.js isLocked)
        placed: [],
        // tray is [{ id, letter, used, given? }] in tray display order (given: the easy first letter's block, which has no bench spot); id is stable
        // for the life of the word so the DOM tile can be keyed to it
        tray: [],
        // 'playing' | 'wrong' (checked, lives left; the next block move
        // makes it 'playing' again) | 'correct' | 'revealed'
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
};

const subscribers = [];

export function subscribe(fn) {
    subscribers.push(fn);
}

export function setState(patch) {
    Object.assign(state, patch);
    subscribers.forEach((fn) => fn(state));
}
