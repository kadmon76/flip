// state.js — single source of truth for game state.
// Only this module mutates state; everything else calls setState().

export const state = {
    screen: 'theme',            // 'theme' | 'play' | 'round-end' | 'gallery'
    themes: [],                 // [{ name, dataUrl, image }] from themes.json; image is the first word's
    theme: null,
    words: [],                  // [{ word, image, audio }] for the current round
    round: { index: 0, size: 5, results: [] },   // results[i] = { word, correct }
    current: {
        word: null,
        image: null,
        audio: null,
        // placed[i] is null or { letter, tileId }; one slot per letter of word
        placed: [],
        // tray is [{ id, letter, used }] in tray display order; id is stable
        // for the life of the word so the DOM tile can be keyed to it
        tray: [],
        // 'playing' | 'wrong' (checked, lives left) | 'correct' | 'revealed'
        status: 'playing',
    },
    lives: 3,                   // attempts left for the current word
    muted: false,               // sound off; persisted by audio.js to localStorage 'flip.muted'
};

const subscribers = [];

export function subscribe(fn) {
    subscribers.push(fn);
}

export function setState(patch) {
    Object.assign(state, patch);
    subscribers.forEach((fn) => fn(state));
}
