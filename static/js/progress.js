// progress.js — how far the kid got in each theme (BACKLOG B-216,
// PROGRESSION.md "Stages"): the words checked correct at least once in
// a spelling game (`solved`; a recognition game's results, `counts:
// false`, are not solved, BACKLOG B-233), the stages cleared (`cleared`)
// and, since BACKLOG B-232
// (PROGRESSION.md "Bosses"), the stages whose boss (the thief bot) is
// beaten (`bosses`) and the bosses lost per stage since (`bossLosses`),
// per theme, so the stage map shows which stages are open (stations,
// BACKLOG B-217) and which boss waits, play again plays the theme's
// current stage, and the next stage opens once a stage is cleared and
// its boss beaten (the boss guards it).
// Persisted in localStorage `flip.progress.v1`, read and written only
// here, as stickers.js owns the sticker book and missed.js the missed
// words. No DOM and no module state: every call reads the store, so a
// Django test runs this through node with a fake `globalThis.localStorage`.
//
// Shape { "<theme>": { "solved": ["cat", ...], "cleared": [1, 2, ...],
// "bosses": [1, ...], "bossLosses": { "2": 1 } } }, keyed by the theme
// keys as they are (`animals`, `transportation`), like the sticker book
// and the missed words; a stage is a stage.js STAGES value (the numbers
// 1-5, the string 'long'), a key of `bossLosses` its text. Anything
// corrupt or missing (bad JSON, not an object, a theme whose value is not
// an object, lists that are not arrays, non-string or empty words, values
// that are not stages, duplicates, a beaten boss of a stage not cleared,
// losses that are not whole numbers above 0) is dropped on read: every
// theme read is a clean { solved, cleared, bosses, bossLosses },
// `cleared` and `bosses` in STAGES order. A theme saved before B-232 has
// no `bosses`: its cleared stages count as beaten bosses (nobody loses
// an open stage); it gets the list the next time it is written.
//
// main.js reads a theme's progress in startRound (the stage picked on
// the stage map, or for play again currentStage; its `solved` words for
// round.js pickRound), again in onNext before each next word (its
// `solved` words for round.js swapForStruggle, the struggle help, BACKLOG
// B-220) and records a finished round once, in onNext's
// round-end branch (record), as it records the missed words; a round
// left with the back button records nothing. A boss is recorded once,
// when it is won (its last pair found) or lost (he reached the vent)
// (recordBoss); a boss left with the back arrow records nothing. main.js
// keeps a copy of load() in state.progress (read at start-up and again
// after each record), from which the theme cards' bulbs and the stage map
// (stations) render (BACKLOG B-217). A replay of a cleared stage clears
// nothing new: afterRound clears only the round's own stage, which is
// already cleared.

import { STAGES, isStage, stagesOf } from './stage.js';
import { keyOf } from './players.js';

// Kept per player (players.js keyOf: `flip.progress.v1@p1`).
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

// A theme's progress with nothing solved, cleared or beaten, as a new
// object.
function empty() {
    return { solved: [], cleared: [], bosses: [], bossLosses: {} };
}

// A whole number above 0, else 0.
const count = (n) => (Number.isSafeInteger(n) && n > 0 ? n : 0);

// One theme's entry, sanitised: a new { solved, cleared, bosses,
// bossLosses }, or null when it is not an object. With no `bosses` list
// (saved before BACKLOG B-232) every cleared stage's boss is beaten; a
// boss counts as beaten only on a cleared stage. `bossLosses` keeps the
// stages (as text) with a whole number of losses above 0.
function clean(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const solved = Array.isArray(entry.solved)
        ? [...new Set(entry.solved.filter((w) => typeof w === 'string' && w !== ''))]
        : [];
    const cleared = Array.isArray(entry.cleared) ? STAGES.filter((s) => entry.cleared.includes(s)) : [];
    const bosses = Array.isArray(entry.bosses) ? cleared.filter((s) => entry.bosses.includes(s)) : [...cleared];
    const lost = entry.bossLosses && typeof entry.bossLosses === 'object' && !Array.isArray(entry.bossLosses) ? entry.bossLosses : {};
    const bossLosses = {};
    for (const s of STAGES) {
        const n = count(lost[String(s)]);
        if (n) bossLosses[String(s)] = n;
    }
    return { solved, cleared, bosses, bossLosses };
}

// Every theme's progress, sanitised. Never throws; {} when there is no
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
        store.setItem(keyOf(KEY), JSON.stringify(all));
    } catch {
        // quota or private mode: the game still plays, nothing to do
    }
}

// The progress of `theme`: { solved, cleared, bosses, bossLosses }, empty
// for a theme never finished.
export function forTheme(theme) {
    return load()[theme] || empty();
}

// The stations of a theme's stage map (BACKLOG B-217, PROGRESSION.md
// "Replay", "Bosses"; pure): one per stage of `stages` (stage.js stagesOf
// of the theme's data: the stages it has words in), in STAGES order, each
// { stage, cleared, beaten, boss, start, open }. `cleared`: the stage is
// in the progress's cleared stages. `beaten`: its boss is beaten too
// (BACKLOG B-232). `boss`: the stage is cleared and its boss not beaten
// yet: the station shows the thief and a tap starts the boss. `start`:
// the theme's current stage, the first stage not cleared or whose boss
// is not beaten (the boss guards the next stage), or with all of them
// done the last one; the map's one obvious start, and what play again
// plays (currentStage). `open`: cleared or the start, the stages the kid
// can play (a replay, the current stage, or its boss); the others are not
// open yet. A theme whose data has no stage plays stage 1 (as stage.js
// stageRules reads anything else), so its map has that one station.
// Anything odd in `progress` is dropped as load() drops it (a progress
// with no `bosses` list counts its cleared stages' bosses as beaten).
export function stations(stages, progress) {
    const listed = Array.isArray(stages) ? STAGES.filter((s) => stages.includes(s)) : [];
    const all = listed.length ? listed : [STAGES[0]];
    const { cleared, bosses } = clean(progress) || empty();
    const done = (s) => cleared.includes(s) && bosses.includes(s);
    const first = all.find((s) => !done(s));
    const start = first === undefined ? all[all.length - 1] : first;
    return all.map((stage) => ({
        stage,
        cleared: cleared.includes(stage),
        beaten: done(stage),
        boss: cleared.includes(stage) && !bosses.includes(stage),
        start: stage === start,
        open: stage === start || cleared.includes(stage),
    }));
}

// The stage a round of the theme plays when none is picked on the stage
// map (play again; pure): the start of its stations, the first stage of
// stagesOf(data) (the stages the theme's data has words in, in order; a
// stage with no words is skipped) that `progress` has not cleared, or
// whose boss is not beaten (BACKLOG B-232: a round of it then replays the
// stage; its boss is a tap on its station or the round end's thief); with
// all of them done, the last one. Data with no word in any stage
// plays stage 1, as stage.js stageRules reads anything else.
export function currentStage(data, progress) {
    return stations(stagesOf(data), progress).find((s) => s.start).stage;
}

// A theme's progress after a finished round of `stage` (pure):
// `progress` is the theme's { solved, cleared } before it, `data` the
// theme's data file, `results` the round's [{ word, correct, counts? }]
// (state.round.results). Every word checked correct this round joins
// `solved` (with the robot's help too; a word the robot revealed is not
// correct, so it does not), except a word of a recognition game
// (`counts: false`, BACKLOG B-233, games.js resultOf): it is not solved,
// so it cannot clear a stage. `stage` joins `cleared` once every one of its
// words in `data` is solved; a stage with no word in `data` is never
// cleared. A cleared stage stays cleared, also when the data later adds
// words to it, and solved words stay solved; the bosses beaten and lost
// (BACKLOG B-232) are kept as they are (a stage just cleared has its boss
// still to beat). Returns { progress, justCleared }: the new { solved,
// cleared, bosses, bossLosses } (new arrays; the inputs are not changed)
// and whether this round cleared `stage`.
export function afterRound(progress, data, stage, results) {
    const before = clean(progress) || empty();
    const solved = [...before.solved];
    for (const r of Array.isArray(results) ? results : []) {
        if (r && r.correct === true && r.counts !== false && typeof r.word === 'string' && r.word !== '' && !solved.includes(r.word)) {
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
    return { progress: { solved, cleared, bosses: [...before.bosses], bossLosses: { ...before.bossLosses } }, justCleared };
}

// Whether two theme progresses hold the same (pure).
function same(a, b) {
    const list = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
    const keys = (o) => Object.keys(o).sort();
    return list(a.solved, b.solved) && list(a.cleared, b.cleared) && list(a.bosses, b.bosses)
        && list(keys(a.bossLosses), keys(b.bossLosses)) && keys(a.bossLosses).every((k) => a.bossLosses[k] === b.bossLosses[k]);
}

// Record a finished round of `stage` in `theme` (afterRound) and return
// { progress, justCleared }. Nothing is written when the theme's progress
// does not change.
export function record(theme, data, stage, results) {
    if (typeof theme !== 'string' || !theme) return { progress: empty(), justCleared: false };
    const all = load();
    const before = all[theme] || empty();
    const after = afterRound(before, data, stage, results);
    if (!same(after.progress, before)) {
        all[theme] = after.progress;
        save(all);
    }
    return after;
}

// --- The bosses (BACKLOG B-232, PROGRESSION.md "Bosses") ---

// The losses on the boss of `stage` in a theme's `progress` since it was
// last beaten (pure): 0 or more; boss.js rulesOf makes him walk slower
// after a few.
export function bossLossesOf(progress, stage) {
    const p = clean(progress) || empty();
    return p.bossLosses[String(stage)] || 0;
}

// A theme's progress after a boss of `stage` ends (pure): `won` (the last
// pair found) adds the stage to `bosses` (in STAGES order; only a cleared
// stage has a boss) and drops its losses (the slower walk resets), a loss
// adds one to its losses. Returns { progress, beaten }: the new progress
// (new arrays and object; the input is not changed) and whether this
// boss was beaten for the first time.
export function afterBoss(progress, stage, won) {
    const before = clean(progress) || empty();
    const bosses = [...before.bosses];
    const bossLosses = { ...before.bossLosses };
    let beaten = false;
    if (isStage(stage) && before.cleared.includes(stage)) {
        if (won) {
            beaten = !bosses.includes(stage);
            delete bossLosses[String(stage)];
            return { progress: { ...before, bosses: STAGES.filter((s) => s === stage || bosses.includes(s)), bossLosses }, beaten };
        }
        bossLosses[String(stage)] = (bossLosses[String(stage)] || 0) + 1;
    }
    return { progress: { ...before, bosses, bossLosses }, beaten };
}

// Record the end of the boss of `stage` in `theme` (afterBoss) and return
// { progress, beaten }. Nothing is written when nothing changes.
export function recordBoss(theme, stage, won) {
    if (typeof theme !== 'string' || !theme) return { progress: empty(), beaten: false };
    const all = load();
    const before = all[theme] || empty();
    const after = afterBoss(before, stage, won);
    if (!same(after.progress, before)) {
        all[theme] = after.progress;
        save(all);
    }
    return after;
}
