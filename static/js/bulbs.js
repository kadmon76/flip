// bulbs.js — the round's bulbs and the spare bulbs (BACKLOG B-231,
// PROGRESSION.md "Guardrails"): the TV's bulbs are the round's, not the
// word's. A round starts with BULBS (3) plus the player's spare bulbs,
// and they do not refill on a new word; every wrong check turns one off,
// on any word, except on the first word's tutorial (coach.js), which
// costs none. When the last one goes off the word on screen is revealed
// (as on a third miss) and the round ends after it. Per word the rest
// stays: the robot's letter after the word's own second miss (B-206,
// HINT_AT), the reveal after its own third miss (WORD_MISSES), the lever
// rule.
//
// Spare bulbs: a perfect round (every word of the round's size checked
// correct on its first check with no boost: every result `clean`, gears.js
// isClean) earns one, at most SPARE_MAX held. The next round starts with
// them as its first bulbs over BULBS, so a wrong check turns a spare off
// first: the spares a round ends with still lit are kept, the ones it
// turned off are gone, and a perfect round can earn one again.
//
// Persisted in localStorage `flip.bulbs.v1`, kept per player (players.js
// keyOf: `flip.bulbs.v1@p1`), read and written only here, every read and
// write in try/catch. The stored value is the spare count as JSON, a
// whole number from 0 to SPARE_MAX ("1"); anything else reads as 0 (a
// number above SPARE_MAX as SPARE_MAX). No DOM and no module state: every
// call reads the store, so a Django test runs this through node with a
// fake `globalThis.localStorage`.
//
// main.js reads load() in startRound (startBulbs: the round's bulbs, in
// state.lives and state.round.bulbs), applies afterCheck and missKind on
// every wrong check (onCheck), ends the round with roundOver (onNext) and
// records a finished round once, in onNext's round-end branch (record),
// so a round left with the back button records nothing.

import { keyOf } from './players.js';

// Kept per player (players.js keyOf).
export const KEY = 'flip.bulbs.v1';

// Every round's own bulbs, before its spares.
export const BULBS = 3;

// The spare bulbs a player can hold (so the TV shows at most 5).
export const SPARE_MAX = 2;

// Per word, unchanged (BACKLOG B-206; the word's own wrong checks, not
// the round's bulbs): the wrong check that brings the robot's letter and
// the one that reveals the word.
export const HINT_AT = 2;
export const WORD_MISSES = 3;

// The store, or null. Reading `localStorage` itself can throw when the
// browser blocks storage.
function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

// A spare count as kept: a whole number from 0 to SPARE_MAX; anything
// that is not a whole number reads as 0, a larger one as SPARE_MAX.
export function clean(n) {
    if (!Number.isInteger(n) || n < 0) return 0;
    return Math.min(n, SPARE_MAX);
}

// The player's spare bulbs. Never throws; 0 when there is no storage, no
// entry, or an entry that is not a whole number.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(keyOf(KEY)) : null;
    } catch {
        return 0;
    }
    if (typeof raw !== 'string') return 0;
    try {
        return clean(JSON.parse(raw));
    } catch {
        return 0;
    }
}

function save(spares) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(keyOf(KEY), JSON.stringify(clean(spares)));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}

// --- The pure part ---

// The bulbs a round starts with: BULBS and the player's spares.
export function startBulbs(spares) {
    return BULBS + clean(spares);
}

// The round's bulbs left after a check: a wrong check turns one off,
// except on the tutorial word (`tutorial`, coach.js), which costs none; a
// correct check none. Never below 0.
export function afterCheck(bulbs, correct, tutorial = false) {
    const lit = Number.isInteger(bulbs) && bulbs > 0 ? bulbs : 0;
    return correct === true || tutorial ? lit : Math.max(0, lit - 1);
}

// What a wrong check does to the word: `misses` is the word's own wrong
// checks with this one, `bulbs` the round's bulbs left after it
// (afterCheck). 'reveal' on the word's own third miss or when the round's
// last bulb went off (the word is revealed, and with no bulb left the
// round ends after it, roundOver); 'hint' on its own second miss (the
// robot's letter, B-206); else 'wrong'.
export function missKind(misses, bulbs) {
    if (misses >= WORD_MISSES || !(bulbs > 0)) return 'reveal';
    if (misses === HINT_AT) return 'hint';
    return 'wrong';
}

// Whether the round ends after word `index` (of `size`): it was the
// round's last word, or the round has no bulb left. The words not
// reached are not played.
export function roundOver(bulbs, index, size) {
    return !(bulbs > 0) || index + 1 >= size;
}

// A perfect round (pure): every word of its `size` has a result and all
// are clean (correct on the first check, no boost). A round the bulbs
// ended early is never one.
export function isPerfect(results, size) {
    if (!Array.isArray(results) || !Number.isInteger(size) || size <= 0 || results.length < size) return false;
    return results.slice(0, size).every((r) => !!r && r.clean === true);
}

// The spares after a finished round (pure): `bulbs` the round's bulbs
// still lit at its end, `results` and `size` the round's. The bulbs over
// BULBS still lit are the spares kept (a wrong check turns a spare off
// first); a perfect round adds one, up to SPARE_MAX. Returns
// { spares, earned }: `earned` is true when the round brought a new spare
// (none when the player already holds SPARE_MAX).
export function afterRound(bulbs, results, size) {
    const lit = Number.isInteger(bulbs) ? bulbs : 0;
    const kept = clean(lit - BULBS);
    const spares = isPerfect(results, size) ? clean(Math.min(kept + 1, SPARE_MAX)) : kept;
    return { spares, earned: spares > kept };
}

// --- With the store ---

// Record a finished round (afterRound) and return { spares, earned }.
// Nothing is written when the count does not change.
export function record(bulbs, results, size) {
    const out = afterRound(bulbs, results, size);
    if (out.spares !== load()) save(out.spares);
    return out;
}
