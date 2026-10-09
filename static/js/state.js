// state.js — single source of truth for game state.
// Only this module mutates state; everything else calls setState().

export const state = {
    screen: 'theme',            // 'theme' | 'play' | 'round-end' | 'gallery'
    themes: [],                 // [{ name, dataUrl, image, words: [{ word, image }] }] from themes.json and the data files; image is the first word's
    theme: null,
    words: [],                  // [{ word, image, audio }] for the current round
    round: { index: 0, size: 5, results: [] },   // results[i] = { word, correct }
    current: {
        word: null,
        image: null,
        audio: null,            // the word's audio file from the content JSON, or none
        // placed[i] is null or { letter, tileId }; one slot per letter of word
        placed: [],
        // tray is [{ id, letter, used }] in tray display order; id is stable
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
