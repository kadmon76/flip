// round.js — pure helpers that set up a round from a theme's data file
// and the round's level (state.round.level; the rules are level.js
// levelRules): which words the round plays (pickWords) and how each word
// starts (makeWord; on hard with extra letters, extraLetters). No DOM and
// no module state; main.js calls them and puts the result in state, and
// a Django test runs them through node.
// `rand` (default Math.random) is there so the test can seed them.

import { levelRules } from './level.js';

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
    return {
        word: entry.word,
        image: entry.image,
        audio: entry.audio,
        tray,
        placed,
        status: 'playing',
    };
}
