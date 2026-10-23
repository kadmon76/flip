// progress.js — how far the kid got in each theme (BACKLOG B-216,
// PROGRESSION.md "Stages"): the words checked correct at least once
// (`solved`) and the stages cleared (`cleared`), per theme, so the stage
// map shows which stages are open (stations, BACKLOG B-217), play again
// plays the theme's current stage, and a cleared stage opens the next
// one.
// Persisted in localStorage `flip.progress.v1`, read and written only
// here, as stickers.js owns the sticker book and missed.js the missed
// words. No DOM and no module state: every call reads the store, so a
// Django test runs this through node with a fake `globalThis.localStorage`.
//
// Shape { "<theme>": { "solved": ["cat", ...], "cleared": [1, 2, ...] } },
// keyed by the theme keys as they are (`animals`, `transportation`), like
// the sticker book and the missed words; a stage is a stage.js STAGES
// value (the numbers 1-5, the string 'long'). Anything corrupt or missing
// (bad JSON, not an object, a theme whose value is not an object, lists
// that are not arrays, non-string or empty words, values that are not
// stages, duplicates) is dropped on read: every theme read is a clean
// { solved, cleared }, `cleared` in STAGES order.
//
// main.js reads a theme's progress in startRound (the stage picked on
// the stage map, or for play again currentStage; its `solved` words for
// round.js pickRound) and records a finished round once, in onNext's
// round-end branch (record), as it records the missed words; a round
// left with the back button records nothing. It keeps a copy of load()
// in state.progress (read at start-up and again after each record), from
// which the theme cards' bulbs and the stage map (stations) render
// (BACKLOG B-217). A replay of a cleared stage clears nothing new:
// afterRound clears only the round's own stage, which is already
// cleared.

import { STAGES, isStage, stagesOf } from './stage.js';

export const KEY = 'flip.progress.v1';

// The store, or null. Reading `localStorage` itself can throw when the
// browser blocks storage.
function storage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

// A theme's progress with nothing solved or cleared, as a new object.
function empty() {
    return { solved: [], cleared: [] };
}

// One theme's entry, sanitised: a new { solved, cleared }, or null when
// it is not an object.
function clean(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const solved = Array.isArray(entry.solved)
        ? [...new Set(entry.solved.filter((w) => typeof w === 'string' && w !== ''))]
        : [];
    const cleared = Array.isArray(entry.cleared) ? STAGES.filter((s) => entry.cleared.includes(s)) : [];
    return { solved, cleared };
}

// Every theme's progress, sanitised. Never throws; {} when there is no
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
    const all = {};
    for (const [theme, entry] of Object.entries(parsed)) {
        const progress = clean(entry);
        if (progress) all[theme] = progress;
    }
    return all;
}

function save(all) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(KEY, JSON.stringify(all));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}

// The progress of `theme`: { solved, cleared }, empty for a theme never
// finished.
export function forTheme(theme) {
    return load()[theme] || empty();
}

// The stations of a theme's stage map (BACKLOG B-217, PROGRESSION.md
// "Replay"; pure): one per stage of `stages` (stage.js stagesOf of the
// theme's data: the stages it has words in), in STAGES order, each
// { stage, cleared, start, open }. `cleared`: the stage is in the
// progress's cleared stages. `start`: the theme's current stage, the
// first stage not cleared, or with all of them cleared the last one; the
// map's one obvious start, and what play again plays (currentStage).
// `open`: cleared or the start, the stages the kid can play (a replay,
// or the current stage); the others are not open yet. A theme whose data
// has no stage plays stage 1 (as stage.js stageRules reads anything
// else), so its map has that one station. Anything odd in `progress` is
// dropped as load() drops it.
export function stations(stages, progress) {
    const listed = Array.isArray(stages) ? STAGES.filter((s) => stages.includes(s)) : [];
    const all = listed.length ? listed : [STAGES[0]];
    const cleared = (clean(progress) || empty()).cleared;
    const first = all.find((s) => !cleared.includes(s));
    const start = first === undefined ? all[all.length - 1] : first;
    return all.map((stage) => ({
        stage,
        cleared: cleared.includes(stage),
        start: stage === start,
        open: stage === start || cleared.includes(stage),
    }));
}

// The stage a round of the theme plays when none is picked on the stage
// map (play again; pure): the start of its stations, the first stage of
// stagesOf(data) (the stages the theme's data has words in, in order; a
// stage with no words is skipped) that `progress` has not cleared; with
// all of them cleared, the last one. Data with no word in any stage
// plays stage 1, as stage.js stageRules reads anything else.
export function currentStage(data, progress) {
    return stations(stagesOf(data), progress).find((s) => s.start).stage;
}

// A theme's progress after a finished round of `stage` (pure):
// `progress` is the theme's { solved, cleared } before it, `data` the
// theme's data file, `results` the round's [{ word, correct }]
// (state.round.results). Every word checked correct this round joins
// `solved` (with the robot's help too; a word the robot revealed is not
// correct, so it does not). `stage` joins `cleared` once every one of its
// words in `data` is solved; a stage with no word in `data` is never
// cleared. A cleared stage stays cleared, also when the data later adds
// words to it, and solved words stay solved. Returns { progress, justCleared }:
// the new { solved, cleared } (new arrays; the inputs are not changed) and
// whether this round cleared `stage`.
export function afterRound(progress, data, stage, results) {
    const before = clean(progress) || empty();
    const solved = [...before.solved];
    for (const r of Array.isArray(results) ? results : []) {
        if (r && r.correct === true && typeof r.word === 'string' && r.word !== '' && !solved.includes(r.word)) {
            solved.push(r.word);
        }
    }
    let cleared = [...before.cleared];
    let justCleared = false;
    if (isStage(stage) && !cleared.includes(stage)) {
        const entries = data && typeof data === 'object' ? Object.entries(data) : [];
        const words = entries.filter(([, e]) => !!e && e.stage === stage).map(([w]) => w);
        if (words.length && words.every((w) => solved.includes(w))) {
            cleared = STAGES.filter((s) => s === stage || cleared.includes(s));
            justCleared = true;
        }
    }
    return { progress: { solved, cleared }, justCleared };
}

// Record a finished round of `stage` in `theme` (afterRound) and return
// { progress, justCleared }. Nothing is written when the theme's progress
// does not change.
export function record(theme, data, stage, results) {
    if (typeof theme !== 'string' || !theme) return { progress: empty(), justCleared: false };
    const all = load();
    const before = all[theme] || empty();
    const after = afterRound(before, data, stage, results);
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (!same(after.progress.solved, before.solved) || !same(after.progress.cleared, before.cleared)) {
        all[theme] = after.progress;
        save(all);
    }
    return after;
}
