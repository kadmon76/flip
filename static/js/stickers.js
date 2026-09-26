// stickers.js — the sticker book: which words the kid has mastered, per
// theme, persisted in localStorage (BACKLOG B-111). No DOM and no module
// state: every call reads the store, so a Django test runs this through
// node with a fake `globalThis.localStorage`. The book is the truth for
// "already mastered"; main.js records per round which words were new.
//
// Key `flip.stickers.v1`, shape { "<theme>": ["duck", ...] }. Anything
// corrupt or missing (bad JSON, not an object, a theme whose value is not
// an array, non-string entries, duplicates) is dropped on read, so the
// book is always a clean object of unique word arrays.

export const KEY = 'flip.stickers.v1';

function storage() {
    return globalThis.localStorage || null;
}

// Read and sanitise the book. Never throws; returns {} when there is no
// storage, no entry, or the entry cannot be parsed.
export function load() {
    const store = storage();
    let raw = null;
    try {
        raw = store ? store.getItem(KEY) : null;
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
    const book = {};
    for (const [theme, words] of Object.entries(parsed)) {
        if (!Array.isArray(words)) continue;
        book[theme] = [...new Set(words.filter((w) => typeof w === 'string' && w !== ''))];
    }
    return book;
}

function save(book) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(KEY, JSON.stringify(book));
    } catch {
        // quota or private mode: the round still plays, nothing to do
    }
}

// True when `word` is already a sticker in `theme`.
export function has(theme, word) {
    const words = load()[theme];
    return Array.isArray(words) && words.includes(word);
}

// Add `word` to `theme`. Returns true when it is a new sticker, false
// when the book already had it (nothing is written then).
export function add(theme, word) {
    if (typeof theme !== 'string' || typeof word !== 'string' || !theme || !word) return false;
    const book = load();
    const words = book[theme] || [];
    if (words.includes(word)) return false;
    book[theme] = [...words, word];
    save(book);
    return true;
}

// Every sticker as a flat list, [{ theme, word }], in book order.
export function all() {
    const book = load();
    return Object.entries(book).flatMap(([theme, words]) => words.map((word) => ({ theme, word })));
}
