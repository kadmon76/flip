// lastgame.js — the game the player's last round played (BACKLOG B-233,
// games.js), so games.js pickGame's rules (never two recognition rounds in
// a row, never the same game other than classic twice) hold across rounds
// and reloads. Recorded as a round starts (main.js startRound), so a
// round left with the back button still counts as played.
//
// Persisted in localStorage `flip.lastgame.v1`, kept per player
// (players.js keyOf: `flip.lastgame.v1@p1`), read and written only here,
// every read and write in try/catch. The stored value is the game's id as
// JSON ("\"classic\""); anything else (missing, bad JSON, not a game of
// games.js GAMES) reads as null. No DOM and no module state: every call
// reads the store, so a Django test runs this through node with a fake
// `globalThis.localStorage`.

import { keyOf } from './players.js';
import { gameOf } from './games.js';

// Kept per player (players.js keyOf).
export const KEY = 'flip.lastgame.v1';

// The store, or null. Reading `localStorage` itself can throw when the
// browser blocks storage.
function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

// The id of the last round's game, or null. Never throws.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(keyOf(KEY)) : null;
    } catch {
        return null;
    }
    if (typeof raw !== 'string') return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    return typeof parsed === 'string' && gameOf(parsed) ? parsed : null;
}

// Record `id` (a game of GAMES) as the last round's game; anything else
// writes nothing. Nothing is written when it is already the one kept.
export function record(id) {
    if (typeof id !== 'string' || !gameOf(id) || load() === id) return;
    const store = storage();
    if (!store) return;
    try {
        store.setItem(keyOf(KEY), JSON.stringify(id));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}
