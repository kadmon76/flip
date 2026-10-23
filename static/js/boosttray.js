// boosttray.js — the boost button and its tray (BACKLOG B-219,
// PROGRESSION.md "Boosts"): the console's gear counter (#console-gears,
// cogs.js draws its cog and count) is the boost button, on or off from
// boost.js boostOn; a tap on it opens a small brass tray over the bench,
// above the console, with the boosts that apply now (boost.js offered),
// each an icon drawn in code with its cost as gear pips (one small cog per
// gear, cogs.js cog). After "Remember this one" the slots that aren't
// locked glow (boost.js pickable) for the kid to tap one. Under the tray
// or the glowing slots a clear scrim covers the page: a tap on it closes
// them, and no tap reaches a block, a control or the header below.
// Interim look, a new scene object drawn in code (DESIGN "The layer
// model", its exception for the boost tray) until the Claude Design pass
// replaces it; all of it is this render and game.css's "Boost tray" rules.
//
// It renders from state (state.current, state.boostMenu) on every render
// and never mutates state: a tap on a boost calls `onPick(kind)`, a tap on
// a glowing slot `onSlot(index)` (main.js onBoostPick, onBoostSlot; the
// boost button and the scrim are wired in main.js). The tray and the
// glowing slots are placed from where the console, the boost button and
// the slots are on screen (fixed, as the page cannot scroll under the
// scrim). The tray's pop-in is feedback.js's.

import { boostOn, offered, pickable, COSTS } from './boost.js';
import { cog } from './cogs.js';
import { slotLayout } from './layout.js';

const $ = (id) => document.getElementById(id);

// The icons, inline SVG in a 36x28 box; their colours are game.css's.
//   remember: a light bulb (the robot remembers) over one slot
//   first: three slots, the first a brass plate (the locked look) with a
//     marker over it
//   cleanup: a broom sweeping, with puffs of dust
const ICONS = {
    remember: '<svg viewBox="0 0 36 28" aria-hidden="true">'
        + '<path class="i-ray" d="M8.5 8.5h2.6M24.9 8.5h2.6M10.9 2.6l1.9 1.9M25.1 2.6l-1.9 1.9"/>'
        + '<path class="i-bulb" d="M18 2a6.6 6.6 0 0 0-3.7 12.1v1.6h7.4v-1.6A6.6 6.6 0 0 0 18 2z"/>'
        + '<rect class="i-base" x="14.6" y="15.9" width="6.8" height="2.6" rx="0.9"/>'
        + '<rect class="i-slot" x="8.5" y="20" width="19" height="7" rx="2"/>'
        + '</svg>',
    first: '<svg viewBox="0 0 36 28" aria-hidden="true">'
        + '<path class="i-mark" d="M7.5 9.6L3.6 4.6h7.8z"/>'
        + '<rect class="i-plate" x="2.5" y="12" width="10" height="13" rx="1.8"/>'
        + '<circle class="i-rivet" cx="4.6" cy="14.1" r="0.8"/><circle class="i-rivet" cx="10.4" cy="14.1" r="0.8"/>'
        + '<circle class="i-rivet" cx="4.6" cy="22.9" r="0.8"/><circle class="i-rivet" cx="10.4" cy="22.9" r="0.8"/>'
        + '<rect class="i-slot" x="13.5" y="12" width="10" height="13" rx="1.8"/>'
        + '<rect class="i-slot" x="24.5" y="12" width="10" height="13" rx="1.8"/>'
        + '</svg>',
    cleanup: '<svg viewBox="0 0 36 28" aria-hidden="true">'
        + '<path class="i-handle" d="M27.5 2.5L16.5 14.5"/>'
        + '<path class="i-brush" d="M14.6 12.4l5.6 5.4-6.6 8c-2.6-.4-6.2-2-8.5-4.6z"/>'
        + '<path class="i-bristle" d="M9.8 23.2l4.8-4.6M7.6 21.2l4.9-4.4"/>'
        + '<circle class="i-puff" cx="26.5" cy="21.5" r="3"/><circle class="i-puff" cx="31.6" cy="18.4" r="2.2"/>'
        + '<circle class="i-puff" cx="31.4" cy="25" r="1.7"/>'
        + '</svg>',
};

// What a boost says to a screen reader (never shown).
const NAMES = { remember: 'remember this one', first: 'first letter', cleanup: 'clean up' };

// The gap between the tray (its notch) and the console's top edge, and
// how far it keeps in from the console's right end, in px; the share of
// the console's width from its left end the tray keeps clear of (the
// robot stands behind its left third, CLAUDE.md); and how far the notch
// keeps in from the tray's ends, in px.
const GAP = 2;
const SIDE = 6;
const ROBOT = 1 / 3 + 0.025;
const NOTCH_IN = 16;

// A boost in the tray: a cream key holding its icon and, under it, one
// small cog per gear it costs. A tap calls `onPick(kind)`.
function item(kind, onPick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boost-item';
    btn.dataset.boost = kind;
    btn.setAttribute('aria-label', `${NAMES[kind]}: ${COSTS[kind]} gears`);
    const icon = document.createElement('span');
    icon.className = 'boost-icon';
    icon.innerHTML = ICONS[kind];
    btn.appendChild(icon);
    const pips = document.createElement('span');
    pips.className = 'boost-pips';
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < COSTS[kind]; i++) pips.appendChild(cog());
    btn.appendChild(pips);
    btn.addEventListener('click', () => onPick(kind));
    return btn;
}

// A glowing slot for "Remember this one": a clear button over slot
// `index`'s tap area (the slot, out to the rail's full height on a small
// slot, layout.js slotLayout `hit`), its glow round the slot itself
// (game.css). A tap calls `onSlot(index)`.
function pick(index, onSlot) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boost-pick';
    btn.dataset.slot = String(index);
    btn.setAttribute('aria-label', `slot ${index + 1}`);
    btn.addEventListener('click', () => onSlot(index));
    return btn;
}

// DOM cache: what the tray and the glowing slots were last built for (the
// boosts offered, the slots that glow), so a re-render in the same state
// moves them but does not rebuild them (which would restart the glow's
// pulse). Rebuilt from state; nothing reads it to decide anything else.
const built = { tray: '', picks: '' };

export function renderBoost(state, { onPick, onSlot }) {
    const btn = $('console-gears');
    const layer = $('boost-layer');
    if (!btn || !layer) return;
    const { current } = state;
    const on = state.screen === 'play' && boostOn(current);
    btn.disabled = !on;
    const menu = on ? state.boostMenu : null;
    layer.hidden = menu !== 'tray' && menu !== 'pick';
    if (layer.hidden) return;

    const tray = $('boost-tray');
    const picks = $('boost-picks');
    tray.hidden = menu !== 'tray';
    picks.hidden = menu !== 'pick';
    if (menu === 'tray') placeTray(tray, offered(current), btn, onPick);
    else placePicks(picks, current, onSlot);
}

// The tray: one key per boost offered, in boost.js BOOSTS order; centred
// over the boost button, but never over the console's left third (the
// robot) nor past SIDE px in from its right end; its notch just above the
// console's top edge, pointing down at the boost button.
function placeTray(tray, kinds, btn, onPick) {
    const key = kinds.join(',');
    if (built.tray !== key) {
        built.tray = key;
        tray.innerHTML = '';
        kinds.forEach((kind) => tray.appendChild(item(kind, onPick)));
    }
    const plate = document.querySelector('#screen-play .console');
    if (!plate) return;
    const c = plate.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const w = tray.offsetWidth;
    const notch = parseFloat(getComputedStyle(tray).getPropertyValue('--notch-h')) || 0;
    const mid = b.left + b.width / 2;
    const left = Math.max(c.left + c.width * ROBOT, Math.min(mid - w / 2, c.right - SIDE - w));
    const top = c.top - GAP - notch - tray.offsetHeight;
    tray.style.left = `${Math.round(left)}px`;
    tray.style.top = `${Math.round(top)}px`;
    tray.style.setProperty('--notch', `${Math.round(Math.min(Math.max(mid - left, NOTCH_IN), w - NOTCH_IN))}px`);
}

// The glowing slots: one clear button over each slot that isn't locked,
// placed over its tap area.
function placePicks(picks, current, onSlot) {
    const indexes = pickable(current);
    const key = indexes.join(',');
    if (built.picks !== key) {
        built.picks = key;
        picks.innerHTML = '';
        indexes.forEach((i) => picks.appendChild(pick(i, onSlot)));
    }
    const rail = $('letter-boxes');
    if (!rail) return;
    const boxes = rail.children;
    const { hit } = slotLayout(current.placed.length, rail.clientWidth, current.break);
    Array.from(picks.children).forEach((el) => {
        const box = boxes[Number(el.dataset.slot)];
        if (!box) return;
        const r = box.getBoundingClientRect();
        el.style.left = `${r.left - hit.x}px`;
        el.style.top = `${r.top - hit.y}px`;
        el.style.width = `${r.width + 2 * hit.x}px`;
        el.style.height = `${r.height + 2 * hit.y}px`;
        el.style.setProperty('--hit-x', `${hit.x}px`);
        el.style.setProperty('--hit-y', `${hit.y}px`);
    });
}
