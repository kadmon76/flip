// feedback.js — one-shot motion keyed on a state transition (DESIGN
// "Feedback", "Controls and states"). It runs as a state subscriber after
// card.js has rendered, compares the new state with what it last rendered
// and starts motion only on a transition; a re-render in the same state
// does nothing. It never mutates state.
//   - a lives bulb went out (any wrong check): that bulb flickers three
//     times and stays dark, and the TV picture gets a short static flicker
//   - status became 'wrong': blocks in wrong slots wiggle
//   - status became 'revealed' (third miss): the right blocks fly into the
//     slots in order
//   - the reset lever went down: the rail shakes and the blocks that were
//     in slots hop back to their start spots
// The correct-check beat (slot pulse, TV flash, sparks) is celebrate.js.
// Every tween clears what it set when it ends, so the CSS render of state
// is what stays.

import { motionFor } from './motion.js';
import { centre } from './drag.js';

// Render cache (like `last` in celebrate.js): what the last render showed
// of the current word, so a transition can be told from a re-render. The
// placement is kept so the reveal and the reset can fly blocks from the
// slots they were in.
const NONE = { key: null, status: null, lives: null, pressed: null, placed: [] };
let last = NONE;

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderFeedback(state) {
    const { current, lives, pressed, round } = state;
    const onWord = state.screen === 'play' && !!current.word;
    const now = onWord
        ? { key: `${round.index}:${current.word}`, status: current.status, lives, pressed, placed: current.placed }
        : NONE;
    const prev = last;
    last = now;
    // A new word or another screen: nothing to react to yet.
    if (!onWord || prev.key !== now.key) return;

    if (now.lives < prev.lives) {
        flickerBulb(now.lives);
        staticTv();
    }
    if (now.status === 'wrong' && (prev.status !== 'wrong' || now.lives < prev.lives)) {
        wiggleWrong(current);
    }
    if (now.status === 'revealed' && prev.status !== 'revealed') {
        flyIn(prev.placed, current.placed);
    }
    if (now.pressed === 'lever' && prev.pressed !== 'lever') {
        shakeRail();
        hopBack(prev.placed);
    }
}

// --- Shared motion ---

// Swing `targets` ±m.distance px horizontally and land back at x 0 within
// m.duration, symmetric in-out ease (the wrong wiggle and the rail shake).
// Input is never blocked: a drag that starts mid-swing kills the tween
// (drag.js killTweensOf) and takes over.
function swing(targets, m) {
    const step = m.duration / 6;   // 0 -> -d (1), -d -> +d (2), +d -> -d (2), -d -> 0 (1)
    gsap.killTweensOf(targets, 'x');
    gsap.timeline({ defaults: { ease: m.ease } })
        .to(targets, { x: -m.distance, duration: step })
        .to(targets, { x: m.distance, duration: step * 2 })
        .to(targets, { x: -m.distance, duration: step * 2 })
        .to(targets, { x: 0, duration: step });
}

// Put `els` back to their CSS render after `seconds`. A delayed call, not
// an onComplete: a drag that picks a block up mid-motion kills that
// block's tweens (drag.js), and the cleanup must still happen.
function restoreAfter(els, seconds, props) {
    gsap.delayedCall(seconds, () => gsap.set(els, { clearProps: props }));
}

// Reduced motion: an opacity dip instead of a swing.
function dip(targets, seconds) {
    gsap.fromTo(targets, { opacity: 0.4 }, { opacity: 1, duration: seconds, ease: 'power1.out' });
    restoreAfter(targets, seconds, 'opacity');
}

function tileEl(tileId) {
    return document.querySelector(`#screen-play [data-tile-id="${tileId}"]`);
}

// Fly each { el, from } (a screen centre) to where the render put it,
// m.stagger apart, upright to its rendered tilt. With `hop` the block
// rises m.height px above the higher end of its path and drops onto its
// spot. From take-off a block is lifted over the resting ones: on the
// reveal a later one over an earlier one, so none passes under, or lands
// under, a block still waiting in its old slot; on the hop (all in the
// air at once) an earlier one over a later one, so the first is seen
// crossing. All are put back when the last one has landed. Reduced
// motion: each block fades in where it now is.
function fly(moves, m, hop) {
    if (!moves.length) return;
    const els = moves.map((mv) => mv.el);
    restoreAfter(els, (moves.length - 1) * m.stagger + (m.duration || m.fade), 'position,zIndex,opacity');
    moves.forEach(({ el, from }, k) => {
        const delay = k * m.stagger;
        const lift = () => gsap.set(el, { position: 'relative', zIndex: hop ? 10 + moves.length - k : 10 + k });
        gsap.killTweensOf(el);
        if (m.duration === 0) {
            gsap.set(el, { x: 0, y: 0 });
            if (m.fade > 0) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: m.fade, delay, ease: 'power1.out' });
            return;
        }
        const to = centre(el);
        const rot = gsap.getProperty(el, 'rotation');
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        if (!hop) {
            gsap.fromTo(el, { x: dx, y: dy, rotation: 0 }, {
                x: 0, y: 0, rotation: rot, duration: m.duration, ease: m.ease, delay, onStart: lift,
            });
            return;
        }
        const up = m.duration * 0.4;
        gsap.timeline({ delay, onStart: lift })
            .fromTo(el, { x: dx, rotation: 0 }, { x: 0, rotation: rot, duration: m.duration, ease: 'power1.inOut' }, 0)
            .fromTo(el, { y: dy }, { y: Math.min(dy, 0) - m.height, duration: up, ease: m.ease }, 0)
            .to(el, { y: 0, duration: m.duration - up, ease: 'power2.in' }, up);
    });
}

// --- Wrong check ---

// Blocks sitting in a slot with the wrong letter wiggle ±6px for 300ms.
function wiggleWrong(current) {
    const boxes = document.getElementById('letter-boxes').children;
    const tiles = [];
    current.placed.forEach((slot, i) => {
        if (!slot || slot.letter === current.word[i] || !boxes[i]) return;
        const tile = boxes[i].firstElementChild;
        if (tile) tiles.push(tile);
    });
    if (!tiles.length) return;
    const m = motionFor('wiggle', reducedMotion());
    if (m.distance > 0) swing(tiles, m);
    else if (m.fade > 0) dip(tiles, m.fade);
}

// The bulb at `index` (the one just lost; card.js has already rendered it
// dark) lights up and goes out m.flashes times, then stays dark. Driven
// through the bulb's `--lit` custom property (game.css), so the render's
// `lost` class stays the truth once the inline value is removed. Reduced
// motion: one fade from lit to dark.
function flickerBulb(index) {
    const bulb = document.querySelectorAll('#screen-play .hearts span')[index];
    if (!bulb) return;
    const m = motionFor('flicker', reducedMotion());
    const done = () => bulb.style.removeProperty('--lit');
    gsap.killTweensOf(bulb);
    gsap.set(bulb, { '--lit': 1 });
    if (m.flashes > 0) {
        const step = m.duration / (m.flashes * 2);
        const tl = gsap.timeline({ onComplete: done });
        for (let i = 0; i < m.flashes; i++) {
            tl.set(bulb, { '--lit': 0 }, (2 * i + 1) * step);
            if (i < m.flashes - 1) tl.set(bulb, { '--lit': 1 }, (2 * i + 2) * step);
        }
        tl.set(bulb, { '--lit': 0 }, m.duration);
    } else {
        gsap.to(bulb, { '--lit': 0, duration: m.fade, ease: 'power1.out', onComplete: done });
    }
}

// The TV picture breaks into static for 150ms: the static layer
// (.tv-static) flickers and jumps while the picture jitters sideways.
// Reduced motion: the static layer fades in and out once, no jitter.
function staticTv() {
    const layer = document.querySelector('#screen-play .tv-static');
    const img = document.getElementById('play-image');
    if (!layer || !img) return;
    const m = motionFor('tvStatic', reducedMotion());
    const done = () => gsap.set([layer, img], { clearProps: 'opacity,transform,backgroundPosition' });
    gsap.killTweensOf([layer, img]);
    if (m.distance > 0) {
        const step = m.duration / 4;
        const frames = [
            { o: 0.9, x: -m.distance, bg: '0 0' },
            { o: 0.5, x: m.distance, bg: '3px 2px' },
            { o: 0.8, x: -m.distance / 2, bg: '1px 4px' },
        ];
        const tl = gsap.timeline({ onComplete: done });
        frames.forEach((f, i) => {
            tl.set(layer, { opacity: f.o, backgroundPosition: f.bg }, i * step);
            tl.set(img, { x: f.x, opacity: 0.75 }, i * step);
        });
        tl.set(layer, { opacity: 0 }, m.duration);
        tl.set(img, { x: 0, opacity: 1 }, m.duration);
    } else {
        gsap.fromTo(layer, { opacity: 0 }, {
            opacity: 0.6, duration: m.fade / 2, ease: 'none', yoyo: true, repeat: 1, onComplete: done,
        });
    }
}

// --- Third miss: reveal ---

// Every block that is not already in its right slot flies there from the
// slot it was in, in slot order, 120ms apart.
function flyIn(prevPlaced, placed) {
    const boxes = document.getElementById('letter-boxes').children;
    const wasIn = new Map();
    prevPlaced.forEach((slot, i) => {
        if (slot && boxes[i]) wasIn.set(slot.tileId, boxes[i]);
    });
    const moves = [];
    placed.forEach((slot, i) => {
        if (!slot) return;
        const from = wasIn.get(slot.tileId);
        const el = tileEl(slot.tileId);
        if (!el || !from || from === boxes[i]) return;
        moves.push({ el, from: centre(from) });
    });
    fly(moves, motionFor('flyIn', reducedMotion()), false);
}

// --- Reset lever ---

// The rail shakes ±4px for 200ms (the swing of the wrong wiggle).
function shakeRail() {
    const rail = document.getElementById('letter-boxes');
    const m = motionFor('shake', reducedMotion());
    if (m.distance > 0) swing(rail, m);
}

// The blocks that were in slots hop from there back onto their start
// spots, left to right, 30ms apart.
function hopBack(prevPlaced) {
    const boxes = document.getElementById('letter-boxes').children;
    const moves = [];
    prevPlaced.forEach((slot, i) => {
        if (!slot || !boxes[i]) return;
        const el = tileEl(slot.tileId);
        if (!el || el.parentNode === boxes[i]) return;
        moves.push({ el, from: centre(boxes[i]) });
    });
    fly(moves, motionFor('hop', reducedMotion()), true);
}
