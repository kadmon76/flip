// keys.js — theme keys (human, 2026-10-24): which themes a player can
// play. Animals and Food are open from the start (START_OPEN). Clearing
// the first stage of any theme earns a key, and the kid picks which
// locked theme it opens (a tap on a locked card on the theme screen).
// A kid who finishes SAFETY_ROUNDS rounds in a row without a key, while
// holding none and with a theme still locked, gets one anyway, so a kid
// who struggles is never stuck with the same themes. Gears stay for
// boosts only.
//
// Persisted in localStorage `flip.keys.v1`, kept per player (players.js
// keyOf: `flip.keys.v1@p1`), read and written only here. Shape
// { "opened": ["home", ...], "bonus": 0, "dry": 0 }: the themes opened
// with a key, in the order they were opened; the safety keys given; the
// rounds finished since the last key while none was held. The keys
// earned are not stored: they are counted from the player's progress
// (progress.js), one per theme with a cleared stage (stages clear in
// order, so a theme with any cleared stage has cleared its first), so a
// replay never earns a second key. Held = earned + bonus - opened.
// A theme the player already has solved words in (progress from before
// keys) stays open without a key. Anything corrupt or missing is dropped
// on read. No DOM and no module state: every call reads the store, so a
// Django test runs this through node with a fake `globalThis.localStorage`.
//
// main.js keeps load() in state.keys (at start-up and in startAs), opens
// a theme with open() (onTheme) and records a finished round once, in
// onNext's round-end branch after progress.js record (record), so a
// round left with the back button counts nothing.

import { keyOf } from './players.js';

// Kept per player (players.js keyOf).
export const KEY = 'flip.keys.v1';

// The themes every player can play from the start.
export const START_OPEN = ['animals', 'food'];

// Finished rounds in a row with no key, while holding none and with a
// theme still locked, before a safety key.
export const SAFETY_ROUNDS = 6;

function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

const whole = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

// A ring, sanitised: a new { opened, bonus, dry }.
export function clean(parsed) {
    const ring = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const opened = Array.isArray(ring.opened)
        ? [...new Set(ring.opened.filter((t) => typeof t === 'string' && t !== '' && !START_OPEN.includes(t)))]
        : [];
    return { opened, bonus: whole(ring.bonus), dry: whole(ring.dry) };
}

// The player's ring. Never throws; an empty ring when there is no
// storage, no entry, or the entry cannot be parsed.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(keyOf(KEY)) : null;
    } catch {
        return clean(null);
    }
    if (typeof raw !== 'string') return clean(null);
    try {
        return clean(JSON.parse(raw));
    } catch {
        return clean(null);
    }
}

function save(ring) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(keyOf(KEY), JSON.stringify(ring));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}

// --- The pure part ---

// The keys earned in `progress` (progress.js load(): { theme: { solved,
// cleared } }): one per theme with a cleared stage.
export function earnedOf(progress) {
    const all = progress && typeof progress === 'object' ? Object.values(progress) : [];
    return all.filter((t) => t && Array.isArray(t.cleared) && t.cleared.length > 0).length;
}

// Whether the player can play `theme`: open from the start, opened with
// a key, or a theme they already solved words in.
export function isOpen(theme, ring, progress) {
    if (START_OPEN.includes(theme)) return true;
    if (clean(ring).opened.includes(theme)) return true;
    const p = progress && typeof progress === 'object' ? progress[theme] : null;
    return !!p && Array.isArray(p.solved) && p.solved.length > 0;
}

// The keys the player holds now (0 or more).
export function held(ring, progress) {
    const r = clean(ring);
    return Math.max(0, earnedOf(progress) + r.bonus - r.opened.length);
}

// The themes of `names` (the game's, in order) the player cannot play yet.
export function lockedOf(names, ring, progress) {
    return (Array.isArray(names) ? names : []).filter((n) => !isOpen(n, ring, progress));
}

// What the theme screen shows: { locked: [names], held, canOpen } —
// canOpen: a key is held and a theme is locked, so the locked cards
// glow and a tap opens one.
export function keysView(names, ring, progress) {
    const locked = lockedOf(names, ring, progress);
    const n = held(ring, progress);
    return { locked, held: n, canOpen: n > 0 && locked.length > 0 };
}

// The ring after the kid uses a key on `theme` (pure): the ring
// unchanged when the theme is already open or no key is held.
export function opened(ring, theme, progress) {
    const r = clean(ring);
    if (typeof theme !== 'string' || !theme || isOpen(theme, r, progress) || held(r, progress) < 1) return r;
    return { ...r, opened: [...r.opened, theme], dry: 0 };
}

// The ring after a finished round (pure): `before` and `after` are the
// player's progress before and after the round was recorded, `names` the
// game's themes. Returns { ring, earned }: `earned` is true when the
// round brought a key the kid can use now (a theme is still locked):
// a first stage cleared, or the safety key. A key earned with nothing
// left to open is kept (held) for themes still to come, quietly.
export function afterRound(ring, before, after, names) {
    const r = clean(ring);
    const locked = lockedOf(names, r, after).length > 0;
    if (earnedOf(after) > earnedOf(before)) return { ring: { ...r, dry: 0 }, earned: locked };
    if (!locked || held(r, after) > 0) return { ring: { ...r, dry: 0 }, earned: false };
    const dry = r.dry + 1;
    if (dry >= SAFETY_ROUNDS) return { ring: { ...r, bonus: r.bonus + 1, dry: 0 }, earned: true };
    return { ring: { ...r, dry }, earned: false };
}

// --- With the store ---

// Use a key on `theme` (opened) and return the ring.
export function open(theme, progress) {
    const before = load();
    const after = opened(before, theme, progress);
    if (after.opened.length !== before.opened.length) save(after);
    return after;
}

// Record a finished round (afterRound) and return { ring, earned }.
export function record(before, after, names) {
    const out = afterRound(load(), before, after, names);
    save(out.ring);
    return out;
}
