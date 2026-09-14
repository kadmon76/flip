// state.js — single source of truth for game state.
// Only this module mutates state; everything else calls setState().

export const state = {
    screen: 'theme',            // 'theme' | 'play' | 'round-end' | 'gallery'
    theme: null,
    words: [],                  // [{ word, image, audio }] for the current round
    round: { index: 0, size: 5, results: [] },
    current: { word: null, image: null, audio: null, placed: [], tray: [] },
    lives: 3,
};

const subscribers = [];

export function subscribe(fn) {
    subscribers.push(fn);
}

export function setState(patch) {
    Object.assign(state, patch);
    subscribers.forEach((fn) => fn(state));
}
