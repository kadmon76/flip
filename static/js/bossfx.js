// bossfx.js — the boss's one-shot motion (BACKLOG B-232; the feel of
// design/reference/boss-thief.html): the only place a boss beat's motion
// starts, as feedback.js is for the play screen's. On a new boss: the
// entrance (the lights flicker and dim red, the alarm turns, the thief
// drops in with a clank, points along his track to the vent and laughs
// while the track lights up once from him to the vent, the cards are
// dealt onto the table). On a new beat (state.boss.beat.seq): a pair (a
// zap flies from the console's dome to the thief, he is hit, the pair
// flies off the table; a bigger zap for a second pair in a row; the
// knock-back itself is his clock, boss.js thiefAt), a miss (he laughs),
// his swap (he hops onto the table, grabs two face-down cards, slides
// them to each other's places, hops back), a fake caught (it shakes, the
// bubble pops up, he laughs), a fake fixed at the end (its wrong letters
// spin out and the right ones drop in, it zaps him), the burst (the final
// big zap, he swells and bursts into bolts and springs and his key, the
// part drops into the console's window) and his escape (he laughs and
// dives into the vent). Its numbers are boss.js's BEAT and ENTRANCE, which
// main.js's timers and audio.js's sounds read too.
//
// renderBossFx(state) is a subscriber after bossview.js's render; it never
// mutates state. Its render cache (`last`: the boss run and the beat it
// last saw) tells a new beat from a re-render; its steps' timers drop out
// when the boss or the beat they belong to is gone. Web Animations (and a
// few classes for the thief's poses: is-laugh, is-hit, is-swap, is-point;
// lamps is-lit; #boss is-firing while the dome zaps), each cleared when
// it ends. Reduced motion: no shake, no flying cards (they fade), the
// thief slides without bouncing and fades in and out, no sparks or bolts;
// the clock still runs.

import { BEAT, ENTRANCE, zapMs, letterMarks } from './boss.js';
import { partIcon } from './thief.js';
import { wordEl, splitAt, LAMPS } from './bossview.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

// Render cache: the boss run and beat (seq) it last saw.
let last = { run: null, seq: 0 };

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderBossFx(state) {
    const boss = state.screen === 'boss' ? state.boss : null;
    const prev = last;
    if (!boss) {
        if (prev.run !== null) stopAll();
        last = { run: null, seq: 0 };
        return;
    }
    last = { run: boss.run, seq: boss.beat.seq };
    if (boss.run !== prev.run) {
        stopAll();
        entrance(boss);
        return;
    }
    if (boss.beat.seq === prev.seq) return;
    const beat = boss.beat;
    if (beat.kind === 'pair') pair(boss, beat);
    else if (beat.kind === 'miss') pose('laugh', BEAT.miss.laugh + 200);
    else if (beat.kind === 'swap') swap(beat);
    else if (beat.kind === 'fake') fake(beat);
    else if (beat.kind === 'fix') fix(boss, beat);
    else if (beat.kind === 'burst') burst();
    else if (beat.kind === 'escape') escape();
}

// --- helpers ---

// `fn` after `ms`, unless the boss (or with `seq`, the beat) it belongs to
// is gone by then.
function later(ms, fn, seq = null) {
    const run = last.run;
    setTimeout(() => {
        if (last.run !== run || (seq !== null && last.seq !== seq)) return;
        fn();
    }, ms);
}

function scene() {
    return $('screen-play');
}

// An element's box in the scene's coordinates: its centre, size, top.
function rel(el) {
    const s = scene().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height, top: r.top - s.top };
}

function thiefArt() {
    return document.querySelector('#boss-thief .thief');
}

function thiefMove() {
    return document.querySelector('#boss-thief .thief-move');
}

// The thief takes pose `name` for `ms` (a class on him, game.css).
function pose(name, ms, seq = null) {
    const art = thiefArt();
    if (!art) return;
    art.classList.add(`is-${name}`);
    later(ms, () => art.classList.remove(`is-${name}`), seq);
}

// The scene shakes (not under reduced motion).
function shake(px, ms = 350) {
    if (reducedMotion()) return;
    scene().animate([
        { transform: 'none' }, { transform: `translate(${px}px, ${-px / 2}px)` }, { transform: `translate(${-px}px, ${px / 2}px)` },
        { transform: `translate(${px / 2}px, ${px}px)` }, { transform: 'none' },
    ], { duration: ms });
}

function svgEl(name, attrs) {
    const el = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    $('boss-fx').appendChild(el);
    return el;
}

// A zap from point `a` to point `b` (scene coordinates), `ms` long: a few
// jagged bolts one after the other, a teal glow and a light core; sparks
// where it hits (not under reduced motion).
function zap(a, b, big, ms) {
    const bolts = big ? 5 : 3;
    const each = ms / bolts;
    for (let k = 0; k < bolts; k++) {
        later(k * each, () => {
            const n = 9;
            const pts = [];
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                const dx = -(b.y - a.y);
                const dy = b.x - a.x;
                const len = Math.hypot(dx, dy) || 1;
                const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 30;
                pts.push(`${(a.x + (b.x - a.x) * t + (dx / len) * j).toFixed(1)},${(a.y + (b.y - a.y) * t + (dy / len) * j).toFixed(1)}`);
            }
            const w = big ? 8 : 5;
            const glow = svgEl('polyline', { points: pts.join(' '), class: 'fx-zap-glow', 'stroke-width': w * 3 });
            const core = svgEl('polyline', { points: pts.join(' '), class: 'fx-zap', 'stroke-width': w });
            setTimeout(() => { glow.remove(); core.remove(); }, each);
        });
    }
    later(ms, () => sparks(b.x, b.y, big ? 24 : 12));
}

function sparks(x, y, n, amber = false) {
    if (reducedMotion()) return;
    for (let i = 0; i < n; i++) {
        const c = svgEl('circle', { cx: x, cy: y, r: 2 + Math.random() * 3.5, class: i % 3 && !amber ? 'fx-spark' : 'fx-spark is-amber' });
        const ang = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 80;
        c.animate([{ transform: 'translate(0, 0)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 24}px)`, opacity: 0 }],
            { duration: 500 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => c.remove();
    }
}

function smoke(x, y) {
    if (reducedMotion()) return;
    for (let i = 0; i < 5; i++) {
        const c = svgEl('circle', { cx: x + (Math.random() - 0.5) * 14, cy: y, r: 5 + Math.random() * 4, class: 'fx-smoke' });
        c.animate([{ transform: 'translate(0, 0) scale(0.6)', opacity: 0.8 }, { transform: `translate(${(Math.random() - 0.5) * 24}px, -34px) scale(1.6)`, opacity: 0 }],
            { duration: 700, delay: i * 40, easing: 'ease-out' }).onfinish = () => c.remove();
    }
}

// The dome lights while a zap leaves it (game.css: #boss.is-firing).
function fire(ms) {
    const boss = $('boss');
    boss.classList.add('is-firing');
    later(ms, () => boss.classList.remove('is-firing'));
}

function domePoint() {
    const dome = document.querySelector('#check-btn .sprite');
    const r = rel(dome);
    return { x: r.x, y: r.y - r.h * 0.2 };
}

function thiefPoint() {
    const art = thiefArt();
    const r = rel(art || $('boss-thief'));
    return { x: r.x, y: r.y };
}

function cardEl(id) {
    return document.querySelector(`#boss-cards .boss-card[data-id="${id}"]`);
}

// --- the beats ---

function entrance(boss) {
    const reduced = reducedMotion();
    const e = ENTRANCE;
    const s = (t) => t * 1000;
    const dim = document.querySelector('#screen-play .boss-dim');
    if (!reduced) {
        dim.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }],
            { duration: s(e.beats * e.beat), easing: 'steps(5, end)' });
    }
    const alarm = document.querySelector('#screen-play .boss-alarm');
    const spin = reduced ? [] : [{ transform: 'translate(-50%, -50%) rotate(0deg)' }, { transform: 'translate(-50%, -50%) rotate(980deg)' }];
    alarm.animate(reduced
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 1, offset: 0.95 }, { opacity: 0 }]
        : [{ ...spin[0], opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 1, offset: 0.95 }, { ...spin[1], opacity: 0 }],
    { duration: s(e.deal - e.alarm), delay: s(e.alarm) });

    // he drops in from above, lands with a clank
    const move = thiefMove();
    if (move) {
        const drop = s(e.land - e.drop);
        move.animate(reduced
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ transform: 'translateY(-140vh)' }, { transform: 'translateY(0)', offset: 0.75 }, { transform: 'translateY(-16px)', offset: 0.88 }, { transform: 'translateY(0)' }],
        { duration: reduced ? 200 : drop * 1.3, delay: s(e.drop), easing: 'ease-in', fill: 'backwards' });
    }
    later(s(e.land), () => shake(10, 400));
    // he points along his track to the vent and laughs; the track lights
    // up once from him to the vent
    later(s(e.point), () => {
        pose('point', s(e.deal - e.point));
        pose('laugh', 900);
        const lamps = [...document.querySelectorAll('#boss-lamps .boss-lamp')];
        lamps.forEach((lamp, i) => {
            later(reduced ? 0 : (s(e.sweep) * i) / LAMPS, () => lamp.classList.add('is-lit'));
            later(s(e.sweep) + 400, () => lamp.classList.remove('is-lit'));
        });
    });
    // the cards are dealt onto the table
    boss.cards.forEach((card, k) => {
        const el = cardEl(card.id);
        if (!el) return;
        el.animate(reduced
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ transform: 'translateY(-160px) rotate(25deg) scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: s(e.fly), delay: s(e.deal + k * e.every), easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' });
    });
}

function pair(boss, beat) {
    const ms = zapMs(beat.big);
    fire(ms);
    zap(domePoint(), thiefPoint(), beat.big, ms);
    later(ms, () => {
        pose('hit', 700);
        const t = thiefPoint();
        smoke(t.x, t.y - 30);
        shake(beat.big ? 12 : 6);
    });
    const reduced = reducedMotion();
    for (const id of beat.ids || []) {
        const el = cardEl(id);
        if (!el) continue;
        el.animate(reduced
            ? [{ visibility: 'visible', opacity: 1 }, { visibility: 'visible', opacity: 0 }]
            : [{ visibility: 'visible', transform: 'none', opacity: 1 }, { visibility: 'visible', transform: 'scale(1.15)', opacity: 1, offset: 0.3 },
                { visibility: 'visible', transform: 'scale(.3) translateY(80px)', opacity: 0 }],
        { duration: 500, delay: ms, easing: 'ease-in', fill: 'backwards' });
    }
}

// He hops onto the table above the two cards (`beat.ids`, already in each
// other's places in the render), grabs them, slides them over from where
// they were, and hops back.
function swap(beat) {
    const m = BEAT.miss;
    const reduced = reducedMotion();
    const [a, b] = (beat.ids || []).map(cardEl);
    const move = thiefMove();
    if (!a || !b || !move) return;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const box = $('boss-thief').getBoundingClientRect();
    const dx = (ra.left + rb.left) / 2 + ra.width / 2 - (box.left + box.width / 2);
    const dy = Math.min(ra.top, rb.top) - box.bottom + box.height * 0.35;
    const there = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    // one move, no fill: out to the table, there while he swaps, back
    const total = m.hop + m.lift + m.slide + m.back;
    move.animate([
        { transform: 'none', offset: 0, easing: reduced ? 'ease-in-out' : 'cubic-bezier(.3,1.4,.5,1)' },
        { transform: there, offset: m.hop / total },
        { transform: there, offset: (m.hop + m.lift + m.slide) / total, easing: 'ease-in-out' },
        { transform: 'none', offset: 1 },
    ], { duration: total });
    const pupil = document.querySelector('#boss-thief .t-pupil');
    later(m.hop, () => {
        pose('swap', m.lift + m.slide, beat.seq);
        if (pupil) pupil.style.transform = `translate(${dx < 0 ? -3 : 3}px, 5px)`;
    }, beat.seq);
    // each card from the other's place (where it was) to its own
    const slide = (el, from, to) => {
        const x = from.left - to.left;
        const y = from.top - to.top;
        el.animate(reduced
            ? [{ transform: `translate(${x}px, ${y}px)`, opacity: 1 }, { transform: `translate(${x}px, ${y}px)`, opacity: 0, offset: 0.5 },
                { transform: 'none', opacity: 0, offset: 0.5 }, { transform: 'none', opacity: 1 }]
            : [{ transform: `translate(${x}px, ${y}px)` }, { transform: `translate(${x}px, ${y - 12}px) rotate(-6deg)`, offset: m.lift / (m.lift + m.slide) },
                { transform: 'none' }],
        { duration: m.lift + m.slide, delay: m.hop, easing: 'ease-in-out', fill: 'backwards' });
    };
    slide(a, rb, ra);
    slide(b, ra, rb);
    later(m.hop + m.lift + m.slide, () => {
        if (pupil) pupil.style.transform = '';
    }, beat.seq);
}

// A fake caught: it shakes, the bubble pops up over it, he laughs and
// jumps ahead (his clock).
function fake(beat) {
    const f = BEAT.fake;
    const reduced = reducedMotion();
    const el = cardEl(beat.id);
    if (el && !reduced) {
        el.animate([{ transform: 'none' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'none' }],
            { duration: f.shake });
    }
    // one animation, no fill (none outlives the beat): hidden while the
    // fake shakes, pops up, stays, fades out as the cards turn back, and
    // stays out a little past it, until the render hides the bubble
    const bubble = $('boss-bubble');
    const total = f.shake + f.bubble + f.fade + 150;
    const at = (ms) => ms / total;
    const pos = (sc) => (reduced ? 'translate(-50%, -100%)' : `translate(-50%, -100%) scale(${sc})`);
    bubble.animate([
        { transform: pos(0.3), opacity: 0, offset: 0 },
        { transform: pos(0.3), opacity: 0, offset: at(f.shake), easing: 'ease-out' },
        { transform: pos(1.1), opacity: 1, offset: at(f.shake + 210) },
        { transform: pos(1), opacity: 1, offset: at(f.shake + 300) },
        { transform: pos(1), opacity: 1, offset: at(f.shake + f.bubble) },
        { transform: pos(1), opacity: 0, offset: at(f.shake + f.bubble + f.fade) },
        { transform: pos(1), opacity: 0, offset: 1 },
    ], { duration: total });
    later(f.shake, () => pose('laugh', 900, beat.seq), beat.seq);
}

// A fake fixes itself at the end: over its right word (the render), its
// old spelling spins its wrong letters out while the right ones drop in;
// then it zaps him.
function fix(boss, beat) {
    const e = BEAT.ending;
    const reduced = reducedMotion();
    const card = boss.cards.find((c) => c.id === beat.id);
    const el = cardEl(beat.id);
    if (!card || !el) return;
    const front = el.querySelector('.bc-front');
    const wrong = letterMarks(card.text, card.word).bad;
    const bad = new Set(wrong.map((w, i) => (w ? i : -1)).filter((i) => i >= 0));
    const ghost = wordEl(card.text, wrong.map((w) => (w ? 'bad' : '')), splitAt(card.text, card.brk));
    ghost.classList.add('bc-ghost');
    ghost.style.cssText += ';position:absolute;inset:0;justify-content:center;background:none;';
    front.appendChild(ghost);
    const half = e.swap / 2;
    ghost.querySelectorAll('.bl').forEach((s, i) => {
        s.animate(bad.has(i) && !reduced
            ? [{ transform: 'none', opacity: 1 }, { transform: 'translateY(10px) rotate(220deg) scale(.3)', opacity: 0 }]
            : [{ opacity: 1 }, { opacity: bad.has(i) ? 0 : 1 }],
        { duration: half, fill: 'forwards', easing: 'ease-in' });
    });
    const real = front.querySelectorAll('.bc-word:not(.bc-ghost) .bl');
    real.forEach((s) => {
        const isFix = s.classList.contains('is-fix');
        s.animate(isFix && !reduced
            ? [{ transform: 'translateY(-16px) rotate(-200deg) scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }]
            : [{ opacity: 0 }, { opacity: 1 }],
        { duration: half, delay: isFix ? half : half * 0.9, fill: 'backwards', easing: 'ease-out' });
    });
    later(e.swap, () => ghost.remove());
    // his forgery backfires: the card zaps him
    later(e.zap, () => {
        const from = rel(el);
        zap({ x: from.x, y: from.top }, thiefPoint(), false, 260);
        later(260, () => pose('hit', 450));
    }, beat.seq);
}

// The final big zap: he swells and bursts, the part drops into the
// console's window.
function burst() {
    const e = BEAT.ending;
    const reduced = reducedMotion();
    const big = zapMs(true);
    fire(big);
    zap(domePoint(), thiefPoint(), true, big);
    pose('hit', e.swell + 200);
    const art = thiefArt();
    const at = thiefPoint();
    if (art) {
        art.animate(reduced
            ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [{ transform: 'none' }, { transform: 'rotate(-14deg) scale(1.1)' }, { transform: 'rotate(14deg) scale(1.2)' }, { transform: 'rotate(-20deg) scale(1.35)' }],
        { duration: e.swell, easing: 'ease-in', fill: 'forwards' });
    }
    later(e.swell, () => {
        if (art) art.style.visibility = 'hidden';
        shake(16, 500);
        sparks(at.x, at.y, 30, true);
        pieces(at.x, at.y);
        // the part drops into the console's window
        const win = $('boss-window');
        if (!win) return;
        const to = rel(win);
        const part = partIcon();
        part.classList.add('boss-flying-part');
        part.style.cssText = `position:absolute;left:0;top:0;width:52px;height:52px;z-index:5;pointer-events:none;`;
        scene().appendChild(part);
        const p = (x, y, r, sc = 1) => `translate(${(x - 26).toFixed(1)}px, ${(y - 26).toFixed(1)}px) rotate(${r}deg) scale(${sc})`;
        part.animate(reduced
            ? [{ transform: p(to.x, to.y, 0, 0.6), opacity: 0 }, { transform: p(to.x, to.y, 0, 0.6), opacity: 1 }]
            : [{ transform: p(at.x, at.y, 0) }, { transform: p((at.x + to.x) / 2, at.y - 50, -200), offset: 0.35 }, { transform: p(to.x, to.y, -360, 0.6) }],
        { duration: e.drop, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
            part.remove();
            sparks(to.x, to.y, 16, true);
        };
    });
}

// He bursts: bolts, springs and his key fly apart (not under reduced
// motion).
function pieces(x, y) {
    if (reducedMotion()) return;
    const kinds = ['is-tin', 'is-brass', 'is-dark', 'is-cream'];
    for (let i = 0; i < 16; i++) {
        const r = svgEl('rect', { x: x - 4, y: y - 4, width: 6 + Math.random() * 8, height: 4 + Math.random() * 6, rx: 2, class: `fx-bolt ${kinds[i % 4]}` });
        const ang = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 110;
        r.animate([{ transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 110}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
        { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.6,1)' }).onfinish = () => r.remove();
    }
    // a spring and his key
    const spring = svgEl('path', { d: `M${x} ${y} l8 -4 l-8 -4 l8 -4 l-8 -4 l8 -4`, class: 't-spring', style: 'display:inline' });
    spring.animate([{ transform: 'translate(0, 0) rotate(0deg)', opacity: 1 }, { transform: 'translate(-70px, 60px) rotate(-260deg)', opacity: 0 }],
        { duration: 1100, easing: 'cubic-bezier(.2,.6,.6,1)' }).onfinish = () => spring.remove();
    const key = svgEl('path', { d: `M${x} ${y} C${x - 8} ${y - 13} ${x - 14} ${y - 11} ${x - 12} ${y} C${x - 14} ${y + 11} ${x - 8} ${y + 13} ${x} ${y} Z`, class: 't-key-bow' });
    key.animate([{ transform: 'translate(0, 0) rotate(0deg)', opacity: 1 }, { transform: 'translate(80px, -40px) rotate(540deg)', opacity: 0 }],
        { duration: 1200, easing: 'cubic-bezier(.2,.6,.6,1)' }).onfinish = () => key.remove();
}

// He reached the vent: he laughs, then dives into it with the part.
function escape() {
    const x = BEAT.escape;
    const reduced = reducedMotion();
    pose('laugh', x.laugh + x.dive);
    const move = thiefMove();
    if (!move) return;
    move.animate(reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-20px) scale(.8)', opacity: 1, offset: 0.4 }, { transform: 'translate(24px, 0) scale(.1)', opacity: 0 }],
    { duration: x.dive, delay: x.laugh, easing: 'ease-in', fill: 'forwards' });
}

// Leaving the boss, or a new one: every boss motion stops and what it set
// goes (the elements of a new boss are new anyway).
function stopAll() {
    const ids = ['boss-cards', 'boss-thief', 'boss-bubble', 'boss-fx', 'boss-window'];
    for (const a of document.getAnimations ? document.getAnimations() : []) {
        const t = a.effect && a.effect.target;
        if (!t || (typeof CSSAnimation === 'function' && a instanceof CSSAnimation) || (typeof CSSTransition === 'function' && a instanceof CSSTransition)) continue;
        if (ids.some((id) => { const host = $(id); return host && host.contains(t); })
            || t.classList.contains('boss-dim') || t.classList.contains('boss-alarm') || t.id === 'screen-play' || t.classList.contains('boss-flying-part')) {
            a.cancel();
        }
    }
    const fx = $('boss-fx');
    if (fx) fx.innerHTML = '';
    document.querySelectorAll('.boss-flying-part').forEach((p) => p.remove());
    const boss = $('boss');
    if (boss) boss.classList.remove('is-firing');
    document.querySelectorAll('#boss-lamps .is-lit').forEach((l) => l.classList.remove('is-lit'));
    const art = thiefArt();
    if (art) {
        art.classList.remove('is-laugh', 'is-hit', 'is-swap', 'is-point');
        art.style.visibility = '';
    }
}
