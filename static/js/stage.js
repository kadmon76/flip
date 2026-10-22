// stage.js — a theme's stages (BACKLOG M4, B-215; PROGRESSION.md
// "Stages"): the stages in order, the ones a theme's data has words in,
// and what each stage changes in a round. Stages replace the three levels
// (no picker): every theme climbs 1, 2, 3, 4, 5, then `long` (its 7–10
// letter words). A word's stage is its data entry's `stage` field. No DOM
// and no module state; a Django test runs it through node.

export const STAGES = [1, 2, 3, 4, 5, 'long'];

// PROGRESSION.md's stage table, the dials each stage turns:
//   givenFirst  the word's first letter starts in the first slot, locked
//               (round.js makeWord; easy's given letter, B-204)
//   extras      extra letters on the bench that are not in the word,
//               the beginner confusions first (round.js extraLetters,
//               B-207)
// The table's other column (the lever keeps the right letters, locked)
// is the same on every stage: drag.js leverResult (B-215b).
const RULES = {
    1: { givenFirst: true, extras: 0 },
    2: { givenFirst: false, extras: 0 },
    3: { givenFirst: false, extras: 1 },
    4: { givenFirst: false, extras: 2 },
    5: { givenFirst: false, extras: 2 },
    long: { givenFirst: false, extras: 0 },
};

// `value` is one of STAGES (the number 1–5 or the string 'long', as the
// data writes them; '3' or 'Long' is not).
export function isStage(value) {
    return STAGES.includes(value);
}

// The stages `data` (a theme's data file, { "cat": { stage, ... }, ... })
// has words in, in STAGES order; a stage with no word is left out. A word
// whose `stage` is not a stage is in none of them.
export function stagesOf(data) {
    const entries = Object.values(data || {});
    return STAGES.filter((stage) => entries.some((e) => !!e && e.stage === stage));
}

// The rules of `stage` as a new object (callers may not change the
// table); anything that is not a stage (null between rounds, a bad value)
// gets stage 1's.
export function stageRules(stage) {
    return { ...RULES[isStage(stage) ? stage : STAGES[0]] };
}
