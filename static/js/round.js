// round.js — pure helpers that set up a round from a theme's data file
// and the round's level (state.round.level; the rules are level.js
// levelRules): which words the round plays (pickRound: the theme's missed
// words back, then pickWords by the level) and how each word starts
// (makeWord; on hard with extra letters, extraLetters). No DOM and
// no module state; main.js calls them and puts the result in state, and
// a Django test runs them through node.
// `rand` (default Math.random) is there so the test can seed them.

import { levelRules } from './level.js';
import { ONE_ROW_MAX, isBreak } from './layout.js';

// A shuffled copy of `arr` (Fisher-Yates).
export function shuffle(arr, rand = Math.random) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// The words of a round: `size` names from `data` (a theme's data file,
// { "duck": { image, audio, difficulty }, ... }), in random order.
// Normal and hard: any words, at random. Easy (shortWordsFirst, BACKLOG
// B-204): the words tagged "difficulty": "easy" first (a random `size` of
// them if there are more), then the shortest of the others (at random
// among words of the same length; the sort is stable over the shuffle);
// a theme without tags gets its shortest words. The round then plays
// them in random order.
export function pickWords(data, size, level, rand = Math.random) {
    const names = shuffle(Object.keys(data), rand);
    if (!levelRules(level).shortWordsFirst) return names.slice(0, size);
    const isEasy = (w) => !!data[w] && data[w].difficulty === 'easy';
    const easy = names.filter(isEasy);
    const rest = names.filter((w) => !isEasy(w)).sort((a, b) => a.length - b.length);
    return shuffle([...easy, ...rest].slice(0, size), rand);
}

// How many remembered missed words a round brings back (BACKLOG B-208).
export const MISSED_BACK = 2;

// The words of a round with the theme's missed words back (BACKLOG
// B-208): `missed` is the theme's list (missed.js wordsFor, the oldest
// miss first). The round takes the first MISSED_BACK of them that are
// still in `data`, on every level, and fills the other places with
// pickWords (the level's pick) from the theme's words that are not
// remembered, or, when those run out, from the other remembered ones; so
// a round holds no more than MISSED_BACK remembered words while the
// theme has enough others. All in random order. With no remembered word
// in `data` it is pickWords exactly.
export function pickRound(data, size, level, missed = [], rand = Math.random) {
    const names = Object.keys(data);
    const list = Array.isArray(missed) ? missed : [];
    const remembered = list.filter((w, i) => names.includes(w) && list.indexOf(w) === i);
    const back = remembered.slice(0, Math.min(MISSED_BACK, size));
    if (!back.length) return pickWords(data, size, level, rand);
    const only = (keep) => Object.fromEntries(names.filter(keep).map((w) => [w, data[w]]));
    const need = size - back.length;
    const fresh = pickWords(only((w) => !remembered.includes(w)), need, level, rand);
    const more = fresh.length < need
        ? pickWords(only((w) => remembered.includes(w) && !back.includes(w)), need - fresh.length, level, rand)
        : [];
    return shuffle([...back, ...fresh, ...more], rand);
}

// Letters a beginner mixes up (BACKLOG B-207): the pairs the backlog
// names (mirror shapes b/d, p/q, m/n; sounds c/k, s/z; vowels i/e, a/e,
// u/o), plus three more for Hebrew-speaking beginners: v/w (one Hebrew
// sound), c/s (the soft c of "bicycle") and i/y (the y of "bicycle").
export const CONFUSIONS = [
    ['b', 'd'], ['p', 'q'], ['c', 'k'], ['s', 'z'], ['m', 'n'], ['i', 'e'], ['a', 'e'], ['u', 'o'],
    ['v', 'w'], ['c', 's'], ['i', 'y'],
];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

// `count` different letters that are not in `word`, for the bench on hard
// (levelRules(level).distractors): first the partners (CONFUSIONS) of the
// word's letters, at random, then random other letters. Never a letter of
// the word; [] when `count` is 0 (and `rand` is then not called, so easy
// and normal words come out as before).
export function extraLetters(word, count, rand = Math.random) {
    if (!(count > 0)) return [];
    const inWord = new Set(word.split(''));
    const partners = new Set();
    for (const [a, b] of CONFUSIONS) {
        if (inWord.has(a) && !inWord.has(b)) partners.add(b);
        if (inWord.has(b) && !inWord.has(a)) partners.add(a);
    }
    const picked = shuffle([...partners], rand).slice(0, count);
    if (picked.length < count) {
        const rest = ALPHABET.filter((ch) => !inWord.has(ch) && !picked.includes(ch));
        picked.push(...shuffle(rest, rand).slice(0, count - picked.length));
    }
    return picked;
}

// How a word starts (state.current): one block per letter on the bench
// in random order (tray: { id, letter, used }; `newId()` gives each a
// fresh id, unique over the session, so card.js can key the DOM tile to
// it) and one empty slot per letter (placed: null or { letter, tileId }).
// Easy (firstLetterGiven, BACKLOG B-204): the word's first letter starts
// in the first slot, locked. Its block is marked `given`: it has no spot
// on the bench (card.js lays out only the other blocks) and never goes
// back there.
// Hard (distractors, BACKLOG B-207): the bench also gets that many extra
// blocks with letters that are not in the word (extraLetters), marked
// `extra`, shuffled in with the others. They can be placed like any
// block and are wrong in any slot; the check, the second-miss hint and
// the reveal never need them (drag.js hintFor, revealed).
// A slot's `locked: true` means its letter stays: it cannot be dragged,
// tapped out or swapped out, nothing can be dropped on it (drag.js
// placeIn, takeOut), the reset lever leaves the given letter (drag.js
// leverResult, returnAll), and card.js draws it with the locked look
// (game.css .letter-box.locked).
// `break` (BACKLOG B-213) is the entry's `break`, the number of letters
// on the first slot row of a word long enough to be in two (layout.js
// slotLayout), or null when it has none that splits the word. A word of
// more than ONE_ROW_MAX letters without one is split at half, with a
// console warning for whoever writes the theme's data.
export function makeWord(entry, level, newId, rand = Math.random) {
    const letters = entry.word.split('');
    const extras = extraLetters(entry.word, levelRules(level).distractors, rand);
    const blocks = [...letters.map((letter) => ({ letter })), ...extras.map((letter) => ({ letter, extra: true }))];
    const tray = shuffle(blocks, rand).map((b) => ({ id: newId(), letter: b.letter, used: false, ...(b.extra ? { extra: true } : {}) }));
    const placed = new Array(letters.length).fill(null);
    if (levelRules(level).firstLetterGiven && letters.length > 0) {
        const tile = tray.find((t) => t.letter === letters[0]);
        tile.used = true;
        tile.given = true;
        placed[0] = { letter: tile.letter, tileId: tile.id, locked: true };
    }
    const brk = isBreak(entry.break, letters.length) ? entry.break : null;
    if (letters.length > ONE_ROW_MAX && brk === null) {
        console.warn(`flip: "${entry.word}" has ${letters.length} letters and no break; its two slot rows split at half`);
    }
    return {
        word: entry.word,
        image: entry.image,
        audio: entry.audio,
        break: brk,
        tray,
        placed,
        status: 'playing',
    };
}
