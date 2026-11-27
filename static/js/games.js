// games.js — the games a round can play (BACKLOG B-233, PROGRESSION.md
// "Games"; M8 "More than one game"): one game for the whole round, picked
// as the round starts (main.js startRound) among the games the player has
// unlocked. Every game plays on the same words, bulbs, gears, missed
// words, stage progress and bosses; a spelling game's words count toward
// clearing a stage, a recognition game's (`spelling: false`) do not: their
// results are stored with `counts: false` (resultOf), which progress.js
// afterRound leaves out of `solved`, which earns no sticker (main.js
// settle), and which keeps a word on the missed list even when right
// (missed.js afterRound). Only classic (today's spelling game) is built;
// each later game adds its row when it is built.
//
// Pure: no DOM, no storage, no module state; a Django test runs it through
// node. The last game played is kept per player by lastgame.js, the slot
// that plays a game by main.js (PLAYS), the robot's moments per game by
// character.js (GAME_MOMENTS).

import { STAGES } from './stage.js';
import { stations } from './progress.js';

// The games, in M8's unlock order. `unlockStage`: the stage that opens it
// (unlocked); `spelling`: its words count toward clearing a stage;
// `words`: 'round', the round's words (round.js pickRound), or 'solved',
// the player's solved words across themes, played only with `minWords` of
// them at least (playable).
export const GAMES = [
    { id: 'classic', unlockStage: 1, spelling: true, words: 'round' },
];

// The game every round falls back to: always unlocked, the tutorial
// word's.
export const CLASSIC = 'classic';

// How often a round plays a game other than classic (starting values the
// human tunes, DECISIONS 2026-11-27): a recognition game with chance
// RECOGNITION_SHARE (never two recognition rounds in a row), else a
// spelling game other than classic with chance OTHER_SHARE.
export const RECOGNITION_SHARE = 0.25;
export const OTHER_SHARE = 0.5;

// The row of game `id` in `games`, or null.
export function gameOf(id, games = GAMES) {
    return (Array.isArray(games) ? games : []).find((g) => g && g.id === id) || null;
}

// Whether game `id` is a recognition game (its words do not count toward
// clearing a stage); an unknown id is not.
export function isRecognition(id, games = GAMES) {
    const game = gameOf(id, games);
    return !!game && game.spelling === false;
}

// The ids of the games the player has unlocked, in `games` order: a game
// is unlocked once its `unlockStage` is open (progress.js stations' `open`:
// cleared, or the theme's current stage) in any theme of `themes`
// (state.themes, [{ name, stages }]) with `progress` (progress.js load(),
// every theme's), so a game unlocks once, not per theme. A game of the
// first stage is unlocked from the start, also before the themes are
// loaded.
export function unlocked(progress, themes, games = GAMES) {
    const all = progress && typeof progress === 'object' ? progress : {};
    const open = new Set([STAGES[0]]);
    for (const theme of Array.isArray(themes) ? themes : []) {
        if (!theme || typeof theme.name !== 'string') continue;
        for (const s of stations(theme.stages, all[theme.name])) {
            if (s.open) open.add(s.stage);
        }
    }
    return (Array.isArray(games) ? games : []).filter((g) => g && open.has(g.unlockStage)).map((g) => g.id);
}

// The player's solved words across themes (progress.js `solved` of every
// theme), each theme's word once.
function solvedCount(progress) {
    const all = progress && typeof progress === 'object' ? progress : {};
    return Object.values(all).reduce((n, t) => n + (t && Array.isArray(t.solved) ? new Set(t.solved).size : 0), 0);
}

// The unlocked games of `ids` that can play now: a game whose words are
// the solved words ('solved') is left out while the player has fewer than
// its `minWords` solved words across themes (that round is another game,
// classic at least). Unknown ids are left out.
export function playable(ids, progress, games = GAMES) {
    const solved = solvedCount(progress);
    return (Array.isArray(ids) ? ids : []).filter((id) => {
        const game = gameOf(id, games);
        if (!game) return false;
        return game.words !== 'solved' || solved >= (Number.isFinite(game.minWords) ? game.minWords : Infinity);
    });
}

// One of `list` by `r` (0 <= r < 1).
const oneOf = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

// The game of the next round (BACKLOG B-233; human 2026-11-27:
// recognition rounds must not slow the way to the next machine part), from
// the ids of `unlocked` (playable's) and `last`, the game of the round
// before (lastgame.js; null for none): a recognition game with chance
// RECOGNITION_SHARE, a random one of the unlocked ones, but never right
// after a recognition round; otherwise a spelling game: classic, or with
// chance OTHER_SHARE a random other unlocked spelling game, never the same
// one as `last` (with only that one other, the round is classic). With
// only classic unlocked, always classic, and `rand` is not called: a
// draw is made only when there is a game to draw.
export function pickGame(unlocked, last, rand = Math.random, games = GAMES) {
    const ids = (Array.isArray(unlocked) ? unlocked : []).filter((id) => id !== CLASSIC && gameOf(id, games));
    const recognition = ids.filter((id) => isRecognition(id, games));
    if (recognition.length && !isRecognition(last, games)) {
        const r = rand();
        if (r < RECOGNITION_SHARE) return oneOf(recognition, r / RECOGNITION_SHARE);
    }
    const others = ids.filter((id) => !isRecognition(id, games) && id !== last);
    if (others.length) {
        const r = rand();
        if (r < OTHER_SHARE) return oneOf(others, r / OTHER_SHARE);
    }
    return CLASSIC;
}

// A word's result as every game writes it into round.results (main.js
// settle): `fields` as the game gives them (classic's: word, correct,
// clean, boosted), and `counts: false` when `game` is a recognition game,
// so its word does not count toward clearing a stage (progress.js
// afterRound), earns no sticker and stays on the missed list (missed.js
// afterRound). A new object; `fields` is not changed.
export function resultOf(game, fields, games = GAMES) {
    return isRecognition(game, games) ? { ...fields, counts: false } : { ...fields };
}
