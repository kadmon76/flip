// gears.js — the kid's gears (BACKLOG B-218, PROGRESSION.md "Gears"):
// earned only by playing, never lost, spent only on boosts (B-219). A
// correct word earns GEARS.correct (1), a clean one GEARS.clean (1) more,
// and a round that reaches the round-end screen GEARS.round (2).
// Persisted in localStorage `flip.gears.v1`, read and written only here,
// as stickers.js owns the sticker book and progress.js the progress. No
// DOM and no module state: every call reads the store, so a Django test
// runs this through node with a fake `globalThis.localStorage`.
//
// The stored value is the count as JSON, a whole number, 0 or more
// ("12"). Anything else (missing, bad JSON, not a whole number, below 0)
// reads as 0.
//
// main.js adds a word's gears at its correct check (wordGears), so a
// round left with the back button keeps them (B-201 takes back only that
// round's stickers), and the round's GEARS.round in onNext's round-end
// branch. It keeps a copy of the count in state.gears (load() at
// start-up, add()'s return after each add), from which the gear counters
// render (cogs.js). Nothing takes gears away yet; B-219's boosts will.

export const KEY = 'flip.gears.v1';

// What playing earns (PROGRESSION.md "Gears"; starting values to tune in
// play).
export const GEARS = { correct: 1, clean: 1, round: 2 };

// The store, or null. Reading `localStorage` itself can throw when the
// browser blocks storage.
function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

// A whole number, 0 or more (and safe to add to).
function isCount(n) {
    return Number.isSafeInteger(n) && n >= 0;
}

// The stored count. Never throws; 0 when there is no storage, no entry,
// or an entry that is not a whole number, 0 or more.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(KEY) : null;
    } catch {
        return 0;
    }
    if (typeof raw !== 'string') return 0;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return 0;
    }
    return isCount(parsed) ? parsed : 0;
}

function save(count) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(KEY, JSON.stringify(count));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}

// Add `n` gears (a whole number above 0) and return the stored count
// after it (load(): with storage blocked, 0, as nothing is kept). Any
// other `n` adds nothing and writes nothing. There is no way to take
// gears away here: they are never lost.
export function add(n) {
    if (!isCount(n) || n === 0) return load();
    save(load() + n);
    return load();
}

// Whether a word's check was clean (pure): checked correct on the word's
// first check, that is with no wrong check before it (each wrong check
// costs a lives bulb, so main.js passes the bulbs lost), and with no
// boost (B-219 passes it). Only a clean word earns its sticker
// (stickers.js add) and the clean gear.
export function isClean(correct, wrongChecks, boosted = false) {
    return correct === true && wrongChecks === 0 && !boosted;
}

// The gears a word's result earns (pure): `result` is a round result
// { word, correct, clean } (state.round.results); GEARS.correct for a
// correct word, GEARS.clean more when it is clean; none for a word not
// checked correct (missed, revealed or left without a check).
export function wordGears(result) {
    if (!result || result.correct !== true) return 0;
    return GEARS.correct + (result.clean === true ? GEARS.clean : 0);
}

// The gears a finished round earned (pure): every word's (wordGears) and
// GEARS.round for reaching the round end; the round-end's "+N".
export function roundGears(results) {
    const words = Array.isArray(results) ? results : [];
    return words.reduce((sum, r) => sum + wordGears(r), 0) + GEARS.round;
}
