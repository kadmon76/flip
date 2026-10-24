// start.js — the start screen, who's playing (human, 2026-10-24), and the
// theme screen's switch-player button. Renders from state only and never
// mutates it: `state.players` (players.js load().list, kept in state by
// main.js), `state.picking` (the picker is showing) and `state.player`
// (the one playing now). The taps call main.js's handlers.
//
// The start screen: one card per player (their animal picture and, under
// it, the name the kid typed) and a new-player card (+) while the device
// has room (players.js MAX). The picker (the new-player card's, or
// straight away when there is no player yet) shows the pictures no player
// has taken (players.js freePics); its back arrow returns to the cards,
// and has nothing to return to with no player yet, so it hides. A picture
// picked opens the name step (`state.naming`): the picture, a name field
// (any language; the only text on screen besides the logo and the target
// word, and it is the kid's own) and go. Its back arrow returns to the
// picker.

import { MAX, NAME_MAX, freePics, picUrl } from './players.js';

// DOM cache: what the cards and the picker were last built from (the
// players list and whether the picker shows), so a re-render in the same
// state touches nothing. Never read to decide game logic.
let built = null;

// The pure part: what the start screen shows for `players` (the list),
// `picking` and `naming` (the picture waiting for its name):
// { cards: [{ id, pic, name }], plus, picker, pics, back, naming }.
export function startView(players, picking, naming = null) {
    const list = Array.isArray(players) ? players : [];
    const named = naming && freePics(list).includes(naming) ? naming : null;
    const picker = !named && (picking || list.length === 0);
    const cards = !picker && !named;
    return {
        cards: cards ? list.map((p) => ({ id: p.id, pic: p.pic, name: p.name || '' })) : [],
        plus: cards && list.length < MAX,
        picker,
        pics: picker ? freePics(list) : [],
        back: picker && list.length > 0,
        naming: named,
    };
}

function card(cls, label, pic, onTap, name = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${cls} panel`;
    btn.setAttribute('aria-label', name || label);
    if (pic) {
        const img = document.createElement('img');
        img.src = picUrl(pic);
        img.alt = '';
        img.draggable = false;
        btn.appendChild(img);
    }
    if (name) {
        const tag = document.createElement('span');
        tag.className = 'player-name';
        tag.dir = 'auto';
        tag.textContent = name;
        btn.appendChild(tag);
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
    const view = startView(state.players, state.picking, state.naming);
    const key = JSON.stringify(view);
    if (key === built) return;
    built = key;

    const cards = document.getElementById('player-cards');
    const picker = document.getElementById('player-picker');
    const pics = document.getElementById('picker-pics');
    const namer = document.getElementById('player-namer');
    cards.innerHTML = '';
    cards.hidden = view.picker || !!view.naming;
    view.cards.forEach((p, i) => cards.appendChild(card('player-card', `player ${i + 1}`, p.pic, () => handlers.onPlayer(p.id), p.name)));
    if (view.plus) {
        const add = card('player-card player-new', 'New player', null, () => handlers.onNew());
        add.appendChild(plus());
        cards.appendChild(add);
    }
    picker.hidden = !view.picker;
    pics.innerHTML = '';
    for (const pic of view.pics) pics.appendChild(card('player-card', pic, pic, () => handlers.onPick(pic)));
    document.getElementById('picker-back-btn').hidden = !view.back;
    // the name step: a fresh, empty field, focused so the keyboard comes up
    const wasNaming = !namer.hidden;
    namer.hidden = !view.naming;
    if (view.naming) {
        document.getElementById('namer-pic').src = picUrl(view.naming);
        const field = document.getElementById('player-name');
        field.maxLength = NAME_MAX * 2;
        if (!wasNaming) field.value = '';
        try { field.focus({ preventScroll: true }); } catch (e) { /* no focus: the kid taps the field */ }
    }
}

// The theme screen's switch-player button shows the picture of the
// player playing now (none before a player is picked), and beside it
// their name.
export function renderPlayerButton(state) {
    if (state.screen !== 'theme') return;
    const me = (state.players || []).find((p) => p.id === state.player);
    const img = document.getElementById('player-pic');
    const src = me ? picUrl(me.pic) : '';
    if (img.getAttribute('src') !== src) {
        if (src) img.setAttribute('src', src); else img.removeAttribute('src');
    }
    const label = document.getElementById('player-label');
    const name = (me && me.name) || '';
    if (label.textContent !== name) label.textContent = name;
}
