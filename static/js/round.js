// round.js — pure helpers that set up a round from a theme's data file
// and the round's stage (state.round.stage; the rules are stage.js
// stageRules, BACKLOG B-215): which words the round plays (pickRound: the
// theme's missed words back, then pickWords by the stage and the theme's
// solved words, BACKLOG B-216; and, during the round, the struggle help,
// swapForStruggle, BACKLOG B-220) and how each word starts (makeWord, by
// the stage's rules: the first letter given on stage 1, extra letters,
// extraLetters, on stages 3-5). No DOM and no module state; main.js calls
// them and puts the result in state, and a Django test runs them through
// node.
// `rand` (default Math.random) is there so the test can seed them.

import { STAGES, isStage, stageRules } from './stage.js';
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

// The words of a round of `stage`: `size` names from `data` (a theme's
// data file, { "cat": { image, audio, stage }, ... }), in random order
// (BACKLOG B-216, PROGRESSION.md "Rounds"). `solved` is the theme's
// solved words (progress.js, the words checked correct at least once).
// In this order, each group at random: the stage's words (the entries
// whose `stage` is `stage`) not yet solved; then its solved words; then
// the words of the theme's earlier stages, the nearest stage first (the
// review); then, only while places are left (a theme whose data is still
// partial), the words of its later stages, the nearest first; last the
// words whose `stage` is not a stage. A `stage` that is not a stage reads
// as stage 1, as in stage.js stageRules. Words are picked by `stage`
// only: the data's `difficulty` is not read.
export function pickWords(data, size, stage, solved = [], rand = Math.random) {
    const names = Object.keys(data);
    const done = new Set(Array.isArray(solved) ? solved : []);
    const at = isStage(stage) ? STAGES.indexOf(stage) : 0;
    const of = (s) => names.filter((w) => !!data[w] && data[w].stage === s);
    const own = of(STAGES[at]);
    const earlier = STAGES.slice(0, at).reverse();
    const later = STAGES.slice(at + 1);
    const unstaged = names.filter((w) => !data[w] || !isStage(data[w].stage));
    const order = [
        ...shuffle(own.filter((w) => !done.has(w)), rand),
        ...shuffle(own.filter((w) => done.has(w)), rand),
        ...earlier.flatMap((s) => shuffle(of(s), rand)),
        ...later.flatMap((s) => shuffle(of(s), rand)),
        ...shuffle(unstaged, rand),
    ];
    return shuffle(order.slice(0, size), rand);
}

// How many remembered missed words a round brings back (BACKLOG B-208).
export const MISSED_BACK = 2;

// The words of a round (BACKLOG B-208, B-216; PROGRESSION.md "Rounds"):
// `missed` is the theme's missed words (missed.js wordsFor, the oldest
// miss first), `solved` its solved words (progress.js). The round takes
// the first MISSED_BACK missed words that are still in `data` and whose
// stage is the round's stage or an earlier one (a missed word of a later
// stage waits for its own stage, human 2026-10-25: helicopter came back
// on stage 1), and fills the other places with pickWords (the stage's
// unsolved words, its solved words, the earlier stages, then the later
// ones) from the theme's other words; a missed word after the first
// MISSED_BACK takes its place there like any word of its stage. All in
// random order. With no such missed word it is pickWords exactly. A `stage`
// that is not a stage reads as stage 1, as in pickWords.
export function pickRound(data, size, stage, missed = [], solved = [], rand = Math.random) {
    const names = Object.keys(data);
    const list = Array.isArray(missed) ? missed : [];
    const at = isStage(stage) ? STAGES.indexOf(stage) : 0;
    const reached = (w) => !!data[w] && isStage(data[w].stage) && STAGES.indexOf(data[w].stage) <= at;
    const remembered = list.filter((w, i) => names.includes(w) && list.indexOf(w) === i && reached(w));
    const back = remembered.slice(0, Math.min(MISSED_BACK, size));
    if (!back.length) return pickWords(data, size, stage, solved, rand);
    const rest = Object.fromEntries(names.filter((w) => !back.includes(w)).map((w) => [w, data[w]]));
    return shuffle([...back, ...pickWords(rest, size - back.length, stage, solved, rand)], rand);
}

// The struggle help (BACKLOG B-220, PROGRESSION.md "Guardrails"): after
// STRUGGLE_RUN words in a row of a round that were not clean, the next
// STRUGGLE_SWAP words of the round are easier ones.
export const STRUGGLE_RUN = 3;
export const STRUGGLE_SWAP = 2;

// The round's words once the word at `index` is done (main.js onNext
// calls it before it starts the next word). `words` is the round's words
// (state.words, [{ word, image, audio, break }]), `results` its results
// so far, the word at `index` included (state.round.results, each
// { word, correct, clean, ... }), `data` the theme's data file, `stage`
// the round's stage and `solved` the theme's solved words (progress.js).
// When the word at `index` and the STRUGGLE_RUN - 1 words before it all
// have a result that is not clean (`clean` not true: a wrong check, a
// boost or a reveal; gears.js isClean), the next STRUGGLE_SWAP words not
// yet shown (from index + 1, as many as the round has left) are swapped,
// each for a solved word of an earlier stage than `stage` that is not in
// the round yet: the nearest earlier stage first, each stage's words at
// random (pickWords' review order). A word that already is a solved word
// of an earlier stage (a review word, or one swapped in before) stays, so
// a word swapped in is never swapped out again. With fewer such words
// than places, the first places are swapped and the others stay. Nothing
// changes, and the same array comes back, on stage 1 (or anything that
// is not a stage, which reads as stage 1, as in stage.js stageRules),
// when no earlier word is solved, or without the run. A word swapped in
// is { word, image, audio, break } from `data`, the shape main.js
// startRound gives the round's words; it plays by the round's stage rules
// like every word of the round (makeWord). A word swapped out is in no
// result, so the round end records nothing about it (missed.js,
// progress.js): it stays unsolved, a missed word stays missed, and it
// comes back in a later round (pickRound). The kid isn't told.
export function swapForStruggle(words, index, results, data, stage, solved = [], rand = Math.random) {
    const at = isStage(stage) ? STAGES.indexOf(stage) : 0;
    if (at === 0 || !Array.isArray(words) || !data || typeof data !== 'object') return words;
    if (!Number.isInteger(index) || index < STRUGGLE_RUN - 1 || !Array.isArray(results)) return words;
    const run = results.slice(index - STRUGGLE_RUN + 1, index + 1);
    if (run.length < STRUGGLE_RUN || run.some((r) => !r || r.clean === true)) return words;
    const done = new Set(Array.isArray(solved) ? solved : []);
    const earlier = STAGES.slice(0, at);
    const easy = (w) => done.has(w) && !!data[w] && earlier.includes(data[w].stage);
    const inRound = new Set(words.map((e) => e && e.word));
    const names = Object.keys(data).filter((w) => easy(w) && !inRound.has(w));
    const pool = [...earlier].reverse().flatMap((s) => shuffle(names.filter((w) => data[w].stage === s), rand));
    const out = [...words];
    let swapped = false;
    for (let i = index + 1; i < Math.min(words.length, index + 1 + STRUGGLE_SWAP) && pool.length; i++) {
        if (words[i] && easy(words[i].word)) continue;
        const w = pool.shift();
        out[i] = { word: w, image: data[w].image, audio: data[w].audio, break: data[w].break };
        swapped = true;
    }
    return swapped ? out : words;
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

// `count` different letters that are not in `word`, for the bench on a
// stage with extras (stageRules(stage).extras): first the partners
// (CONFUSIONS) of the word's letters, at random, then random other
// letters. Never a letter of the word; [] when `count` is 0 (and `rand` is
// then not called, so a word of a stage without extras comes out as
// before).
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
// The round's stage rules (stage.js stageRules; BACKLOG B-215) apply to
// every word of the round, review, fill and missed words too:
// givenFirst (stage 1; easy's, B-204): the word's first letter starts in
// the first slot, locked. Its block is marked `given`: it has no spot on
// the bench (card.js lays out only the other blocks) and never goes back
// there.
// extras (stages 3–5; hard's, B-207): the bench also gets that many extra
// blocks with letters that are not in the word (extraLetters), marked
// `extra`, shuffled in with the others. They can be placed like any
// block and are wrong in any slot; the check, the second-miss hint and
// the reveal never need them (drag.js hintFor, revealed).
// A slot's `locked: true` means its letter stays: it cannot be dragged,
// tapped out or swapped out, nothing can be dropped on it (drag.js
// placeIn, takeOut), the reset lever leaves the given letter (drag.js
// leverResult, returnAll), and card.js draws it with the locked look
// (game.css .letter-box.locked).
// A word starts unchecked and unpulled: `rightAtCheck` null (no wrong
// check yet) and `justPulled` false, the lever's two facts (drag.js
// checkedWrong, leverResult; BACKLOG B-215b). And with no boost
// (BACKLOG B-219, boost.js): `boosts` 0, and `filledOnce`, per slot,
// whether a block has been in it yet (only the given letter's slot), so
// the boost button stays off until every slot has been filled once.
// `break` (BACKLOG B-213) is the entry's `break`, the number of letters
// on the first slot row of a word long enough to be in two (layout.js
// slotLayout), or null when it has none that splits the word. A word of
// more than ONE_ROW_MAX letters without one is split at half, with a
// console warning for whoever writes the theme's data.
export function makeWord(entry, stage, newId, rand = Math.random) {
    const rules = stageRules(stage);
    const letters = entry.word.split('');
    const extras = extraLetters(entry.word, rules.extras, rand);
    const blocks = [...letters.map((letter) => ({ letter })), ...extras.map((letter) => ({ letter, extra: true }))];
    const tray = shuffle(blocks, rand).map((b) => ({ id: newId(), letter: b.letter, used: false, ...(b.extra ? { extra: true } : {}) }));
    const placed = new Array(letters.length).fill(null);
    if (rules.givenFirst && letters.length > 0) {
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
        rightAtCheck: null,
        justPulled: false,
        filledOnce: placed.map(Boolean),
        boosts: 0,
    };
}
