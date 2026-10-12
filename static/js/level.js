// level.js — the three levels (BACKLOG M2, B-202): what each one changes
// in a round, and the kid's pick remembered in localStorage `flip.level`,
// read and written only here (loadLevel / saveLevel), as stickers.js owns
// the sticker book and audio.js `flip.muted`. No DOM and no module state;
// a Django test runs it through node with a fake storage.

export const LEVELS = ['easy', 'normal', 'hard'];
export const DEFAULT_LEVEL = 'easy';
export const LEVEL_KEY = 'flip.level';

// The rules of each level (DECISIONS "M2 levels and hints"), used by the
// items that build them:
//   hearBefore            the speaker plays the word before it is answered (B-203)
//   firstLetterGiven      the first letter starts in the first slot, locked (B-204)
//   shortWordsFirst       the round prefers easy, then the shortest words (B-204)
//   leverDropsWrongFirst  after a wrong check the lever first sends back only
//                         the wrong letters, the next pull all of them (B-205)
//   distractors           extra letters on the bench that are not in the word (B-207)
const RULES = {
    easy: { hearBefore: true, firstLetterGiven: true, shortWordsFirst: true, leverDropsWrongFirst: true, distractors: 0 },
    normal: { hearBefore: false, firstLetterGiven: false, shortWordsFirst: false, leverDropsWrongFirst: false, distractors: 0 },
    hard: { hearBefore: false, firstLetterGiven: false, shortWordsFirst: false, leverDropsWrongFirst: false, distractors: 2 },
};

// `value` if it is a level, else the default: a missing or bad value is
// 'easy'.
export function toLevel(value) {
    return LEVELS.includes(value) ? value : DEFAULT_LEVEL;
}

// The rules of `level` as a new object (callers may not change the
// table); anything that is not a level gets easy's.
export function levelRules(level) {
    return { ...RULES[toLevel(level)] };
}

// The remembered level; a missing or bad value, or storage that cannot
// be read (private mode, no localStorage), is 'easy'. The default
// storage is looked up inside the try: reading `localStorage` itself can
// throw when the browser blocks storage.
export function loadLevel(storage) {
    try {
        const store = storage === undefined ? globalThis.localStorage : storage;
        return toLevel(store.getItem(LEVEL_KEY));
    } catch (e) {
        return DEFAULT_LEVEL;
    }
}

// Remember `level` (only a real level is written). Storage that cannot
// be written is ignored: the pick still holds for this visit.
export function saveLevel(level, storage) {
    if (!LEVELS.includes(level)) return;
    try {
        const store = storage === undefined ? globalThis.localStorage : storage;
        store.setItem(LEVEL_KEY, level);
    } catch (e) {
        // nothing to do
    }
}
