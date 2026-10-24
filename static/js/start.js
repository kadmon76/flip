// start.js — the start screen, who's playing (human, 2026-10-24), and the
// theme screen's switch-player button. Renders from state only and never
// mutates it: `state.players` (players.js load().list, kept in state by
// main.js), `state.picking` (the picker is showing) and `state.player`
// (the one playing now). The taps call main.js's handlers.
//
// The start screen: one card per player (their animal picture) and a
// new-player card (+) while the device has room (players.js MAX). The
// picker (the new-player card's, or straight away when there is no
// player yet) shows the pictures no player has taken (players.js
// freePics); its back arrow returns to the cards, and has nothing to
// return to with no player yet, so it hides. No names and no text.

import { MAX, freePics, picUrl } from './players.js';

// DOM cache: what the cards and the picker were last built from (the
// players list and whether the picker shows), so a re-render in the same
// state touches nothing. Never read to decide game logic.
let built = null;

// The pure part: what the start screen shows for `players` (the list)
// and `picking`: { cards: [{ id, pic }], plus, picker, pics, back }.
export function startView(players, picking) {
    const list = Array.isArray(players) ? players : [];
    const picker = picking || list.length === 0;
    return {
        cards: picker ? [] : list.map((p) => ({ id: p.id, pic: p.pic })),
        plus: !picker && list.length < MAX,
        picker,
        pics: picker ? freePics(list) : [],
        back: picker && list.length > 0,
    };
}

function card(cls, label, pic, onTap) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${cls} panel`;
    btn.setAttribute('aria-label', label);
    if (pic) {
        const img = document.createElement('img');
        img.src = picUrl(pic);
        img.alt = '';
        img.draggable = false;
        btn.appendChild(img);
    }
    btn.addEventListener('click', onTap);
    return btn;
}

// A plus drawn in code, the new-player card's icon.
function plus() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('class', 'stroke');
    path.setAttribute('d', 'M12 5v14M5 12h14');
    svg.appendChild(path);
    return svg;
}

// handlers: { onPlayer(id), onNew(), onPick(pic), onPickBack() }.
export function renderStart(state, handlers) {
    if (state.screen !== 'start') return;
    const view = startView(state.players, state.picking);
    const key = JSON.stringify(view);
    if (key === built) return;
    built = key;

    const cards = document.getElementById('player-cards');
    const picker = document.getElementById('player-picker');
    const pics = document.getElementById('picker-pics');
    cards.innerHTML = '';
    cards.hidden = view.picker;
    view.cards.forEach((p, i) => cards.appendChild(card('player-card', `player ${i + 1}`, p.pic, () => handlers.onPlayer(p.id))));
    if (view.plus) {
        const add = card('player-card player-new', 'New player', null, () => handlers.onNew());
        add.appendChild(plus());
        cards.appendChild(add);
    }
    picker.hidden = !view.picker;
    pics.innerHTML = '';
    for (const pic of view.pics) pics.appendChild(card('player-card', pic, pic, () => handlers.onPick(pic)));
    document.getElementById('picker-back-btn').hidden = !view.back;
}

// The theme screen's switch-player button shows the picture of the
// player playing now (none before a player is picked).
export function renderPlayerButton(state) {
    if (state.screen !== 'theme') return;
    const me = (state.players || []).find((p) => p.id === state.player);
    const img = document.getElementById('player-pic');
    const src = me ? picUrl(me.pic) : '';
    if (img.getAttribute('src') !== src) {
        if (src) img.setAttribute('src', src); else img.removeAttribute('src');
    }
}
