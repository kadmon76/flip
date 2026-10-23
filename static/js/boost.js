// boost.js — boosts (BACKLOG B-219, PROGRESSION.md "Boosts",
// "Guardrails"): help the kid chooses and pays for with gears (gears.js),
// so the free help can fade. The robot does the helping, as part of his
// half-remembering. Three boosts, offered in the tray (boosttray.js) in
// BOOSTS order:
//   - remember ("Remember this one", COSTS.remember): the kid taps a slot
//     that is not locked; the robot puts its right letter there, locked,
//     also when the right letter was already there (it still costs);
//   - first ("First letter", COSTS.first): the same for the first slot,
//     with no slot to pick;
//   - cleanup ("Clean-up", COSTS.cleanup): the extra blocks (round.js
//     makeWord, stages 3-5) leave the bench and any slot.
// Guardrails: one boost per word (PER_WORD), none before the word's first
// try (every slot filled at least once, `filledOnce`) and none once the
// word is answered. Never a free check: what is offered (offered) and
// what glows (pickable) depend only on which slots are locked and which
// blocks are extra, never on whether a placed letter is right; the block
// a boost places is chosen without looking at whether any other slot is
// right (letterFor).
// Pure: no DOM and no module state; main.js applies the results through
// setState and a Django test runs this through node.

import { isLocked, afterMove, markFilled } from './drag.js';

// The boosts, in the tray's order.
export const BOOSTS = ['remember', 'first', 'cleanup'];

// What each costs, in gears (PROGRESSION.md "Boosts"; starting values to
// tune in play).
export const COSTS = { remember: 3, first: 2, cleanup: 2 };

// Boosts a word can take (PROGRESSION.md "Guardrails": start at 1, tune
// in play).
export const PER_WORD = 1;

// The boosts used on the word so far (`current.boosts`, 0 on a new word).
export function boostsOf(current) {
    return current && Number.isSafeInteger(current.boosts) && current.boosts > 0 ? current.boosts : 0;
}

// Whether the word took a boost: its result is then `boosted` (main.js
// onCheck): it still counts for its stage and earns its correct-word
// gear, but no clean gear and no sticker (gears.js isClean).
export function isBoosted(current) {
    return boostsOf(current) > 0;
}

// The word's first try is made: every slot has held a block at least once
// (`current.filledOnce`, per slot: round.js makeWord starts it, true for
// the given first letter's slot; drag.js placeIn marks a slot as a block
// goes in, markFilled). No boost before it (PROGRESSION.md "Guardrails").
export function tried(current) {
    const seen = current && current.filledOnce;
    return Array.isArray(seen) && seen.length > 0 && seen.length === current.placed.length && seen.every(Boolean);
}

// The boosts that apply now, in BOOSTS order: remember when a slot isn't
// locked, first when the first slot isn't locked, cleanup when an extra
// block is still in play (on the bench or in a slot). Only the locks and
// the extra marks are read, never a placed letter.
export function offered(current) {
    if (!current || !current.word) return [];
    const placed = current.placed || [];
    const out = [];
    if (placed.some((p) => !isLocked(p))) out.push('remember');
    if (placed.length > 0 && !isLocked(placed[0])) out.push('first');
    if ((current.tray || []).some((t) => t.extra && !t.gone)) out.push('cleanup');
    return out;
}

// The boost button is on (the console's gear counter, boosttray.js): the
// word is being spelled ('playing' or 'wrong', not answered), its first
// try is made, it has had fewer than PER_WORD boosts and a boost applies.
// Off: dimmed, taps ignored.
export function boostOn(current) {
    if (!current || !current.word) return false;
    if (current.status !== 'playing' && current.status !== 'wrong') return false;
    if (boostsOf(current) >= PER_WORD) return false;
    return tried(current) && offered(current).length > 0;
}

// The kid has the gears for boost `kind` (state.gears, a whole number).
export function canAfford(gears, kind) {
    return Number.isSafeInteger(gears) && kind in COSTS && gears >= COSTS[kind];
}

// The slots that glow for "Remember this one", the ones the kid may tap:
// every slot that isn't locked, right letter or not.
export function pickable(current) {
    if (!current || !current.word) return [];
    return current.placed.map((p, i) => (isLocked(p) ? -1 : i)).filter((i) => i !== -1);
}

// The block a boost puts into slot `index` and the block that leaves it:
// { tileId, back }. The block already there when it has the slot's letter
// (it stays and locks; `back` null); else a block with that letter lying
// on the bench, the first in tray order; else the block holding that
// letter in the first slot, left to right, that is not locked (that slot
// is emptied). Which slot it comes from never depends on whether that
// slot's letter is right there. `back` is the block in slot `index`, if
// any, which goes back to its bench spot. null when the slot is locked or
// there is no such block.
export function letterFor(current, index) {
    const { word, placed, tray } = current;
    if (!word || index < 0 || index >= placed.length || isLocked(placed[index])) return null;
    const letter = word[index];
    const here = placed[index];
    if (here && here.letter === letter) return { tileId: here.tileId, back: null };
    const onBench = tray.find((t) => t.letter === letter && !t.used && !t.extra && !t.gone);
    let tileId = onBench ? onBench.id : null;
    if (!tileId) {
        const from = placed.findIndex((p, i) => i !== index && !!p && p.letter === letter && !isLocked(p));
        if (from === -1) return null;
        tileId = placed[from].tileId;
    }
    return { tileId, back: here ? here.tileId : null };
}

// "Remember this one" on slot `index`, or "First letter" (index 0): the
// block letterFor names goes into the slot, locked and marked `boost` (the
// lever and the reveal keep it like the robot's hint letter, drag.js
// leverResult, revealed; it is not `hint`, so the free hint still comes
// on the second miss), and the block that was there goes back to the
// bench. A block moved, so a wrong check reopens (drag.js afterMove) and
// the next pull is not "right after a pull" (`justPulled` false); when the
// block was already there only its lock is new and the status stays. One
// more boost on the word. `current` itself when there is nothing to give.
export function giveLetter(current, index) {
    const pick = letterFor(current, index);
    if (!pick) return current;
    const { tileId, back } = pick;
    const moved = !(current.placed[index] && current.placed[index].tileId === tileId);
    const placed = current.placed.map((p) => (p && p.tileId === tileId ? null : p));
    placed[index] = { letter: current.word[index], tileId, locked: true, boost: true };
    const tray = current.tray.map((t) => {
        if (t.id === tileId) return { ...t, used: true };
        if (t.id === back) return { ...t, used: false };
        return { ...t };
    });
    return {
        ...current,
        placed,
        tray,
        status: moved ? afterMove(current.status) : current.status,
        justPulled: false,
        boosts: boostsOf(current) + 1,
        filledOnce: markFilled(current.filledOnce, placed.length, index),
    };
}

// "Clean-up": every extra block still in play leaves for good, from the
// bench and from any slot (that slot is emptied); it stays in the tray
// marked `gone` (and not `used`), so the other blocks keep their bench
// spots (card.js lays out one per block; a gone one's stays empty). A
// slot that held one changed, so a wrong check reopens. One more boost on
// the word. `current` itself when no extra block is in play.
export function cleanUp(current) {
    const out = new Set(current.tray.filter((t) => t.extra && !t.gone).map((t) => t.id));
    if (!out.size) return current;
    const placed = current.placed.map((p) => (p && out.has(p.tileId) ? null : p));
    const moved = placed.some((p, i) => p !== current.placed[i]);
    const tray = current.tray.map((t) => (out.has(t.id) ? { ...t, used: false, gone: true } : { ...t }));
    return {
        ...current,
        placed,
        tray,
        status: moved ? afterMove(current.status) : current.status,
        justPulled: false,
        boosts: boostsOf(current) + 1,
    };
}
