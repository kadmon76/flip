// bossview.js — renders the boss screen from state (BACKLOG B-232,
// PROGRESSION.md "Bosses"; the mock is design/reference/boss-thief.html):
// the pairs found, the card table (#boss-cards: each card face down, face
// up, gone, a fake caught with its wrong letters red, a fake shown or
// fixed at the end or called out by a second tap, BACKLOG B-234), the
// bubble over a fake caught (the right spelling,
// its fixed letters marked), the thief's track (#boss-lamps, #boss-vent,
// #boss-thief), the console's window with the part once he is beaten, the
// lab dimmed red, and the end card (#boss-end: the part, the stars and
// the gears won, or the thief getting away). The boss screen is the play
// scene with state.screen 'boss' (screens.js); everything here is the
// interim look drawn in code (thief.js, game.css "Boss").
//
// renderBoss(state, taps) is a subscriber: it builds the table once per
// boss (state.boss.run) and updates it in place on every render; a tap on
// a card calls taps.onCard(id) (main.js onBossCard; also a second tap on
// the card up, which may call it a fake, BACKLOG B-234). renderBossClock(state,
// now, onTick) runs every frame (main.js, gsap.ticker): the thief's place
// on his track is a pure function of time (boss.js thiefAt), so the clock
// is never a per-frame setState; it places him, turns the lamps behind
// him red (a lamp a knock-back turns back off flashes), flashes the vent's
// alarm lamp past three quarters and calls onTick (main.js: audio.js
// bossTick) at his ticking's pace, faster near the vent. Neither mutates
// state. Its caches: a DOM cache (`built`: the elements it made, per run)
// and a render cache (`shown`: the lamps it last lit red, when it last
// ticked); nothing reads them to decide game logic. No text: the cards'
// words are the target words (a fake is one misspelt), every label is
// aria only.

import { thiefAt, lampsBehind, NEAR, tickEvery, letterMarks } from './boss.js';
import { thiefSvg, ventSvg, windowSvg, partIcon, cardBackSvg } from './thief.js';

const $ = (id) => document.getElementById(id);

// How many lamps the track has, from his start to the vent.
export const LAMPS = 12;

// DOM cache: the boss run its elements were made for, its card buttons by
// card id, its lamps. Rebuilt for every new boss.
let built = null;

// Render cache: how many lamps were red last frame, when he last ticked
// (performance.now() ms), and the run it belongs to.
let shown = { run: null, red: 0, tickAt: -Infinity };

// The letters of `text` as spans (class `bl`), each marked by `marks`
// (per letter: 'bad', 'fix' or nothing), in one line or, for 7 letters
// or more, two at `split` (splitAt: the word's break, BACKLOG B-213);
// --len is the longest line's letters, which sizes the font (game.css).
export function wordEl(text, marks = [], split = 0) {
    const el = document.createElement('span');
    el.className = 'bc-word';
    const lines = split > 0 && split < text.length ? [text.slice(0, split), text.slice(split)] : [text];
    el.style.setProperty('--len', String(Math.max(...lines.map((l) => l.length))));
    let i = 0;
    for (const line of lines) {
        const row = document.createElement('span');
        row.className = 'bc-line';
        for (const ch of line) {
            const s = document.createElement('span');
            s.className = marks[i] ? `bl is-${marks[i]}` : 'bl';
            s.textContent = ch;
            row.appendChild(s);
            i++;
        }
        el.appendChild(row);
    }
    return el;
}

// Where a word card's text goes to a second line (pure): a text of 7 or
// more letters at the word's `break` (the letters on its first row, a
// whole number, BACKLOG B-213: its chunks; a fake keeps its word's), else
// at the middle; 0 for shorter texts (one line). Cards are 5 to a row, so
// a long word on one line would be too small to read (DECISIONS
// 2026-11-16).
export function splitAt(text, brk) {
    const n = String(text || '').length;
    if (n < 7) return 0;
    return Number.isInteger(brk) && brk >= 1 && brk < n ? brk : Math.ceil(n / 2);
}

// What a card shows face up (pure): { text, marks } for a word card or a
// fake (marks per letter: 'bad' for a fake's wrong letters while it is
// caught or shown, at the end or called out by a second tap (BACKLOG
// B-234), 'fix' for the letters a fixed fake got right, which then shows
// its real word); null for a picture card.
export function faceOf(card, boss) {
    if (!card || card.kind === 'pic') return null;
    if (card.kind === 'fake') {
        const m = letterMarks(card.text, card.word);
        if ((boss.fixed || []).includes(card.id)) return { text: card.word, marks: m.fixed.map((f) => (f ? 'fix' : '')) };
        if (boss.caught === card.id || (boss.shown || []).includes(card.id)) return { text: card.text, marks: m.bad.map((b) => (b ? 'bad' : '')) };
    }
    return { text: card.text, marks: [] };
}

// Whether a card shows its face (pure): flipped up, a fake caught, the
// fakes shown and fixed at the end (and a fake called out by a second
// tap, BACKLOG B-234, which is up anyway).
export function isUp(card, boss) {
    return boss.up.includes(card.id) || boss.caught === card.id
        || (boss.shown || []).includes(card.id) || (boss.fixed || []).includes(card.id);
}

// A card's button: its back and its face (a picture, or the word drawn by
// update()).
function cardEl(card, onCard) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boss-card';
    btn.dataset.id = card.id;
    btn.setAttribute('aria-label', 'card');
    const inner = document.createElement('span');
    inner.className = 'bc-in';
    const back = document.createElement('span');
    back.className = 'bc-face bc-back';
    back.innerHTML = cardBackSvg();
    const front = document.createElement('span');
    front.className = 'bc-face bc-front';
    if (card.kind === 'pic') {
        const img = document.createElement('img');
        img.src = card.image || '';
        img.alt = '';
        img.draggable = false;
        front.appendChild(img);
    }
    inner.append(back, front);
    btn.appendChild(inner);
    btn.addEventListener('click', () => onCard(card.id));
    return btn;
}

// The elements of a new boss (run): its cards, the lamps, the vent, the
// thief and the console's window.
function build(boss, onCard) {
    const table = $('boss-cards');
    table.innerHTML = '';
    const cards = new Map();
    for (const card of boss.cards) {
        const el = cardEl(card, onCard);
        cards.set(card.id, el);
        table.appendChild(el);
    }
    const lampsEl = $('boss-lamps');
    lampsEl.innerHTML = '';
    const lamps = [];
    for (let i = 0; i < LAMPS; i++) {
        const lamp = document.createElement('span');
        lamp.className = 'boss-lamp';
        lamp.style.left = `${((i + 0.5) / LAMPS) * 100}%`;
        lampsEl.appendChild(lamp);
        lamps.push(lamp);
    }
    const vent = $('boss-vent');
    if (!vent.firstElementChild) vent.appendChild(ventSvg());
    const thief = $('boss-thief');
    thief.innerHTML = '';
    const move = document.createElement('span');
    move.className = 'thief-move';
    move.appendChild(thiefSvg());
    thief.appendChild(move);
    const win = $('boss-window');
    if (!win.firstElementChild) {
        win.appendChild(windowSvg());
        win.appendChild(partIcon());
    }
    shown = { run: boss.run, red: 0, tickAt: -Infinity };
    return { run: boss.run, cards, lamps, words: new Map(), order: '', walk: null };
}

export function renderBoss(state, taps = {}) {
    if (state.screen !== 'boss' || !state.boss) return;
    const boss = state.boss;
    const onCard = taps.onCard || (() => {});
    if (!built || built.run !== boss.run || !built.lamps[0] || !built.lamps[0].isConnected) built = build(boss, onCard);

    // the cards in table order (the thief's swap changes it)
    const order = boss.cards.map((c) => c.id).join(',');
    if (order !== built.order) {
        const table = $('boss-cards');
        for (const c of boss.cards) table.appendChild(built.cards.get(c.id));
        built.order = order;
    }
    for (const card of boss.cards) {
        const el = built.cards.get(card.id);
        const gone = boss.gone.includes(card.id);
        el.classList.toggle('is-up', isUp(card, boss));
        el.classList.toggle('is-gone', gone);
        el.classList.toggle('is-fixed', (boss.fixed || []).includes(card.id));
        // the card up stays tappable: a second tap on it may call it a
        // fake (BACKLOG B-234; main.js onBossCard decides, boss.js
        // canDecline), so a picture, a real word and a fake look the same
        el.disabled = boss.phase !== 'play' || boss.busy || gone;
        const face = faceOf(card, boss);
        if (face) {
            const key = `${face.text}|${face.marks.join(',')}`;
            if (built.words.get(card.id) !== key) {
                built.words.set(card.id, key);
                const front = el.querySelector('.bc-front');
                front.innerHTML = '';
                front.appendChild(wordEl(face.text, face.marks, splitAt(face.text, card.brk)));
            }
        }
    }

    // the pairs found
    const pairs = $('boss-pairs');
    while (pairs.children.length > boss.pairs) pairs.lastElementChild.remove();
    while (pairs.children.length < boss.pairs) pairs.appendChild(document.createElement('i'));
    [...pairs.children].forEach((pip, i) => pip.classList.toggle('is-found', i < boss.found));
    pairs.setAttribute('aria-label', `pairs: ${boss.found} / ${boss.pairs}`);

    // the bubble over a fake caught: its real word, the fixed letters marked
    const bubble = $('boss-bubble');
    const caught = boss.caught ? boss.cards.find((c) => c.id === boss.caught) : null;
    bubble.hidden = !caught;
    if (caught) {
        const key = `${caught.id}|${caught.word}`;
        if (bubble.dataset.key !== key) {
            bubble.dataset.key = key;
            const fixed = letterMarks(caught.text, caught.word).fixed;
            bubble.innerHTML = '';
            [...caught.word].forEach((ch, i) => {
                const s = document.createElement('span');
                if (fixed[i]) s.className = 'is-fix';
                s.textContent = ch;
                bubble.appendChild(s);
            });
        }
        placeBubble(bubble, built.cards.get(caught.id));
    } else {
        bubble.dataset.key = '';
    }

    // the lab dimmed red from the entrance until he is beaten or gone
    document.querySelector('#screen-play .boss-dim').classList.toggle('is-on', boss.phase !== 'won' && boss.phase !== 'lost');
    // the thief: gone once he burst or dove into the vent
    $('boss-thief').style.visibility = boss.phase === 'won' || boss.phase === 'lost' ? 'hidden' : '';
    // the part in the console's window once he is beaten
    $('boss-window').classList.toggle('is-full', boss.phase === 'won');

    renderEnd(boss);
}

// The bubble above the card `el`, inside the scene: its middle over the
// card, kept 8px from the scene's sides (its tip still points at the card).
function placeBubble(bubble, el) {
    if (!el) return;
    const scene = $('screen-play').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const half = bubble.offsetWidth / 2;
    const want = r.left - scene.left + r.width / 2;
    const x = Math.max(half + 8, Math.min(scene.width - half - 8, want));
    bubble.style.left = `${x}px`;
    bubble.style.top = `${r.top - scene.top - 8}px`;
    bubble.style.setProperty('--tip', `${Math.round(want - x)}px`);
}

// The end card (state.boss.card): won, the part, the stars lit by how far
// he was from the vent, the gears (cogs.js fills #boss-end-gears); lost,
// the thief laughing with the part, the gears.
function renderEnd(boss) {
    const end = $('boss-end');
    end.hidden = !boss.card;
    if (!boss.card) return;
    const won = boss.phase === 'won';
    end.classList.toggle('is-lost', !won);
    const art = $('boss-end-art');
    const want = won ? 'part' : 'thief';
    if (art.dataset.art !== want) {
        art.dataset.art = want;
        art.innerHTML = '';
        if (won) {
            art.appendChild(partIcon());
        } else {
            const t = thiefSvg();
            t.classList.add('is-laugh');
            art.appendChild(t);
        }
    }
    document.querySelectorAll('#boss-stars > span').forEach((star, i) => star.classList.toggle('earned', won && i < boss.stars));
    $('boss-stars').setAttribute('aria-label', `stars: ${won ? boss.stars : 0}`);
}

// Every frame (main.js): the thief's place from the clock, the lamps, the
// vent's alarm lamp, his ticking.
export function renderBossClock(state, now, onTick = () => {}) {
    if (state.screen !== 'boss' || !state.boss || !built || built.run !== state.boss.run) return;
    const boss = state.boss;
    const at = boss.clock ? thiefAt(boss.clock, now) : { p: 0, walking: false };
    const thief = $('boss-thief');
    const rail = thief.parentElement.querySelector('.boss-rail');
    // from --thief-start right of the rail's left end until his front is
    // --thief-past into the vent (game.css; the lamps lie on the stretch
    // his middle walks)
    if (!built.walk) {
        const css = getComputedStyle(thief);
        built.walk = { start: parseFloat(css.getPropertyValue('--thief-start')) || 0, past: parseFloat(css.getPropertyValue('--thief-past')) || 0 };
    }
    const { start, past } = built.walk;
    const travel = rail.offsetWidth - thief.offsetWidth + past - start;
    thief.style.transform = `translateX(${(start + at.p * travel).toFixed(1)}px)`;
    const art = thief.querySelector('.thief');
    if (art) art.classList.toggle('is-walk', at.walking && boss.phase === 'play');

    const red = lampsBehind(at.p, LAMPS);
    built.lamps.forEach((lamp, i) => {
        lamp.classList.toggle('is-red', i < red);
        if (i >= red && i < shown.red) {
            lamp.classList.remove('is-flash');
            void lamp.offsetWidth;
            lamp.classList.add('is-flash');
        }
    });
    $('boss-vent').classList.toggle('is-near', at.p > NEAR && boss.phase !== 'won');
    const ticking = at.walking && boss.phase === 'play';
    if (ticking && now - shown.tickAt >= tickEvery(at.p) * 1000) {
        onTick(at.p > NEAR);
        shown = { ...shown, tickAt: now };
    }
    shown = { ...shown, red };
}
