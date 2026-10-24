// players.js — the players on this device: no login, no server, no
// password. Each kid picks an animal picture as theirs on the start
// screen (main.js, start.js); the saves (sticker book, progress, gears,
// missed words) are kept per player, so a second kid on the same phone
// starts fresh and the first keeps theirs (human, 2026-10-24).
//
// The only place localStorage `flip.players.v1` is read or written:
// { list: [{ id: 'p1', pic: 'fox' }, ...], current: 'p1' | null }, the
// players in the order they were added and the one playing now. Every
// read and write is in try/catch (storage can be blocked), and anything
// corrupt is dropped on read. No DOM and no module state: every call
// reads the store, so a Django test runs this through node with a fake
// `globalThis.localStorage`.
//
// keyOf(base) is how the save modules (stickers.js, progress.js,
// gears.js, missed.js) name their key: `<base>@<player id>` while a
// player is current, else `<base>` itself (as before players, and in the
// save modules' own tests). The saves written before players existed
// (the unscoped keys, which main.js hands to add() from each module's
// KEY, so each key is still named only in its own module) move to the
// first player added, so nothing a kid earned is lost.

export const KEY = 'flip.players.v1';

// The pictures a kid can pick, in the picker's order: animal cutouts
// from the word pictures (static/images/words/animals/<pic>-subject.webp).
export const PICS = ['cat', 'dog', 'fox', 'frog', 'lion', 'panda', 'penguin', 'rabbit'];

// At most this many players on one device (the picker has 8 pictures,
// one per player).
export const MAX = 6;

// The picture of `pic` as an image path.
export function picUrl(pic) {
    return `/static/images/words/animals/${pic}-subject.webp`;
}

// The store, or null. Reading `localStorage` itself can throw when the
// browser blocks storage.
function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

// A stored value, sanitised: { list, current } with unique ids of the
// form p<n>, pictures from PICS, at most MAX players, and `current` one
// of their ids or null.
export function clean(parsed) {
    const out = { list: [], current: null };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    const ids = new Set();
    for (const p of Array.isArray(parsed.list) ? parsed.list : []) {
        if (out.list.length >= MAX) break;
        if (!p || typeof p !== 'object') continue;
        if (typeof p.id !== 'string' || !/^p\d+$/.test(p.id) || ids.has(p.id)) continue;
        if (!PICS.includes(p.pic)) continue;
        ids.add(p.id);
        out.list.push({ id: p.id, pic: p.pic });
    }
    out.current = ids.has(parsed.current) ? parsed.current : null;
    return out;
}

// The players and the current one, sanitised. Never throws; an empty
// list and no current player when there is no storage or no entry.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(KEY) : null;
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

function save(players) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(KEY, JSON.stringify(players));
    } catch {
        // storage full or blocked: the game goes on, unsaved
    }
}

// The key a save module reads and writes: scoped to the current player
// (pure: `scoped`), or the base key with no current player.
export function scoped(base, current) {
    return current ? `${base}@${current}` : base;
}

export function keyOf(base) {
    return scoped(base, load().current);
}

// The id after the highest one in `list` (p1, p2, ...; a removed
// player's number is never reused while a higher one exists).
export function nextId(list) {
    const top = list.reduce((n, p) => Math.max(n, Number(p.id.slice(1))), 0);
    return `p${top + 1}`;
}

// The pictures not taken by a player yet, in PICS order.
export function freePics(list) {
    return PICS.filter((pic) => !list.some((p) => p.pic === pic));
}

// Add a player with picture `pic` and make them current. The first
// player on a device takes over the saves made before players existed:
// each key of `saves` (the save modules' KEYs) moves to the player's
// key. Returns the players, or null when the picture is taken, unknown,
// or the device is full.
export function add(pic, saves = []) {
    const players = load();
    if (players.list.length >= MAX || !freePics(players.list).includes(pic)) return null;
    const id = nextId(players.list);
    if (players.list.length === 0) adopt(id, saves);
    const next = { list: [...players.list, { id, pic }], current: id };
    save(next);
    return next;
}

// Move the saves written before players existed to player `id`.
function adopt(id, saves) {
    const store = storage();
    if (!store) return;
    for (const base of saves) {
        try {
            const raw = store.getItem(base);
            if (typeof raw !== 'string') continue;
            if (store.getItem(scoped(base, id)) === null) store.setItem(scoped(base, id), raw);
            store.removeItem(base);
        } catch {
            // blocked storage: that save stays where it is
        }
    }
}

// Make player `id` current. Returns the players, or null for an unknown id.
export function select(id) {
    const players = load();
    if (!players.list.some((p) => p.id === id)) return null;
    const next = { ...players, current: id };
    save(next);
    return next;
}
