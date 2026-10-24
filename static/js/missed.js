// missed.js — the words the kid missed, per theme (BACKLOG B-208), so the
// next round of that theme brings them back (round.js pickRound).
// Persisted in localStorage `flip.missed.v1`, read and written only here,
// as stickers.js owns the sticker book. No DOM and no module state: every
// call reads the store, so a Django test runs this through node with a
// fake `globalThis.localStorage`.
//
// Shape { "<theme>": ["rabbit", ...] }, the oldest miss first; a word is
// in its theme's list at most once. Anything corrupt or missing (bad
// JSON, not an object, a theme whose value is not an array, non-string or
// empty entries, duplicates) is dropped on read, so the lists are always
// clean arrays of unique words.
//
// main.js records a round when it ends (the round-end screen): a word not
// checked correct (revealed, or a word left without a result, which
// onNext counts as wrong) goes to the end of the list, a word checked
// correct comes out. A round left with the back button (B-201) keeps no
// results, so it records nothing.

import { keyOf } from './players.js';

// Kept per player (players.js keyOf: `flip.missed.v1@p1`).
export const KEY = 'flip.missed.v1';

// The store, or null. Reading `localStorage` itself can throw when the
// browser blocks storage.
function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

// Every theme's list, sanitised. Never throws; {} when there is no
// storage, no entry, or the entry cannot be parsed.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(keyOf(KEY)) : null;
    } catch {
        return {};
    }
    if (typeof raw !== 'string') return {};
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const lists = {};
    for (const [theme, words] of Object.entries(parsed)) {
        if (!Array.isArray(words)) continue;
        const clean = [...new Set(words.filter((w) => typeof w === 'string' && w !== ''))];
        if (clean.length) lists[theme] = clean;
    }
    return lists;
}

function save(lists) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(keyOf(KEY), JSON.stringify(lists));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}

// The missed words of `theme`, the oldest miss first ([] when none).
export function wordsFor(theme) {
    const words = load()[theme];
    return Array.isArray(words) ? words : [];
}

// A theme's list after a round (pure): `results` is the round's
// [{ word, correct }] (state.round.results). In round order, each word
// comes out of the list, and a word not checked correct goes back in at
// the end (the newest miss). Words the round did not play keep their
// place. Returns a new array; `words` is not changed.
export function afterRound(words, results) {
    let list = Array.isArray(words) ? [...words] : [];
    for (const r of Array.isArray(results) ? results : []) {
        if (!r || typeof r.word !== 'string' || r.word === '') continue;
        list = list.filter((w) => w !== r.word);
        if (!r.correct) list.push(r.word);
    }
    return list;
}

// Record a finished round of `theme` (afterRound) and return the theme's
// new list. Nothing is written when the list does not change; a theme
// left empty is dropped.
export function record(theme, results) {
    if (typeof theme !== 'string' || !theme) return [];
    const lists = load();
    const before = lists[theme] || [];
    const words = afterRound(before, results);
    if (words.length === before.length && words.every((w, i) => w === before[i])) return words;
    if (words.length) lists[theme] = words;
    else delete lists[theme];
    save(lists);
    return words;
}
