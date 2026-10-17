// feedback.js — one-shot motion keyed on a state transition (DESIGN
// "Feedback", "Controls and states"). It runs as a state subscriber after
// card.js has rendered, compares the new state with what it last rendered
// and starts motion only on a transition; a re-render in the same state
// does nothing. It never mutates state.
//   - a lives bulb went out (any wrong check): that bulb flickers three
//     times and stays dark, and the TV picture gets a short static flicker
//   - status became 'wrong': blocks in wrong slots wiggle
//   - status became 'revealed' (third miss): the right blocks fly into the
//     slots in order, and an extra letter (hard, BACKLOG B-207) that was
//     in a slot hops back to the bench
//   - the robot's letter appeared (the miss that leaves one bulb lit,
//     drag.js giveHint): the wrong block in its slot hops back to the
//     bench, then his letter flies in from where it was
//   - the reset lever went down: the rail shakes and the blocks it took
//     out of slots hop back to their start spots (a letter it left or
//     locked stays put; drag.js leverResult)
//   - a letter locked (BACKLOG B-211): the right letters the lever kept
//     on easy, at once, and the robot's letter as it lands, are pressed
//     into their slots with a short clunk, their locked look (game.css)
//     coming on at the hit
// The correct-check beat (slot pulse, TV flash, sparks) is celebrate.js.
// Every tween clears what it set when it ends, so the CSS render of state
// is what stays.

import { motionFor } from './motion.js';
import { centre } from './drag.js';

// Render cache (like `last` in celebrate.js): what the last render showed
// of the current word, so a transition can be told from a re-render. The
// placement is kept so the reveal, the second-miss hint and the reset
// can fly blocks from the slots they were in.
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
    if (hintSlot(now.placed) !== -1 && hintSlot(prev.placed) === -1) {
        hintIn(prev.placed, current);
    }
    if (now.status === 'revealed' && prev.status !== 'revealed') {
        flyIn(prev.placed, current);
        // an extra letter of hard (BACKLOG B-207) in a slot goes back to
        // the bench as the right ones fly in
        hopBack(prev.placed);
    }
    if (now.pressed === 'lever' && prev.pressed !== 'lever') {
        shakeRail();
        hopBack(prev.placed);
    }
    // a letter that locked clunks into its slot now (the lever on easy,
    // BACKLOG B-205); the robot's letter clunks as it lands (hintIn)
    newlyLocked(prev.placed, now.placed)
        .filter((i) => !now.placed[i].hint)
        .forEach((i) => clunk(tileEl(now.placed[i].tileId), 0));
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

// Fly each { el, from, scale? } (a screen centre, and the size to start
// at, 1 if not given) to where the render put it, m.stagger apart,
// upright to its rendered tilt. With `hop` the block
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
    moves.forEach(({ el, from, scale = 1 }, k) => {
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
            // a block from the bench starts at the bench's size (`scale`)
            const size = scale === 1 ? [{}, {}] : [{ scale }, { scale: 1 }];
            gsap.fromTo(el, { x: dx, y: dy, rotation: 0, ...size[0] }, {
                x: 0, y: 0, rotation: rot, ...size[1], duration: m.duration, ease: m.ease, delay, onStart: lift,
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
// slot it was in, in slot order, 120ms apart. A block that lay on the
// bench (on hard, where an extra letter held its slot, BACKLOG B-207)
// flies from its bench spot, starting at the bench's size, as the
// second-miss hint's letter does.
function flyIn(prevPlaced, current) {
    const boxes = document.getElementById('letter-boxes').children;
    const wasIn = new Map();
    prevPlaced.forEach((slot, i) => {
        if (slot && boxes[i]) wasIn.set(slot.tileId, boxes[i]);
    });
    const moves = [];
    current.placed.forEach((slot, i) => {
        if (!slot) return;
        const el = tileEl(slot.tileId);
        const box = wasIn.get(slot.tileId);
        const from = box || benchSpot(current, slot.tileId);
        if (!el || !from || from === boxes[i]) return;
        const scale = !box && el.offsetWidth ? from.offsetWidth / el.offsetWidth : 1;
        moves.push({ el, from: centre(from), scale });
    });
    fly(moves, motionFor('flyIn', reducedMotion()), false);
}

// --- Second miss: the robot's letter (BACKLOG B-206) ---

// The slot holding the robot's letter (drag.js giveHint), or -1.
function hintSlot(placed) {
    return placed.findIndex((p) => !!p && !!p.hint);
}

// The bench spot of tray tile `tileId` (card.js lays out one per block
// that is not `given`, in tray order), or null.
function benchSpot(current, tileId) {
    const i = current.tray.filter((t) => !t.given).findIndex((t) => t.id === tileId);
    return i === -1 ? null : document.getElementById('letter-tray').children[i] || null;
}

// The miss that left one bulb lit also gave the robot's letter, in the
// same render (drag.js giveHint): the block that was in that slot is on
// the bench now and his letter is in the slot, locked. Both start where
// the check found them (travel) and, if they were in a wrong slot,
// wiggle there with the other wrong blocks (wiggleWrong); then the one
// that was in the way hops back onto its bench spot (the lever's hop,
// over his letter still waiting where it was) and, once it is down, his
// letter flies into the slot (the reveal's fly-in), landing while the
// robot still peeks; he pops up happy when his peek is over (2.5s, the
// puppet's peek, BACKLOG B-210; character.js hintGiven). As it lands it
// clunks into the slot (BACKLOG B-211): until the hit it has class
// `landing`, so it flies as a plain block and its locked look (game.css)
// comes on at the hit. Reduced motion: no wiggle, flight or clunk; the
// two fade in where they now are, one after the other.
function hintIn(prevPlaced, current) {
    const boxes = document.getElementById('letter-boxes').children;
    const k = hintSlot(current.placed);
    const hint = current.placed[k];
    const el = tileEl(hint.tileId);
    if (!el || !boxes[k]) return;
    const reduced = reducedMotion();
    const wiggle = motionFor('wiggle', reduced);
    const hop = motionFor('hop', reduced);
    const flyIn = motionFor('flyIn', reduced);
    const was = prevPlaced[k];
    const out = was && was.tileId !== hint.tileId ? tileEl(was.tileId) : null;
    const j = prevPlaced.findIndex((p) => !!p && p.tileId === hint.tileId);
    const from = j !== -1 ? boxes[j] : benchSpot(current, hint.tileId);
    let at = wiggle.duration;
    if (out) {
        travel(out, boxes[k], { wiggle, at, m: hop, hop: true, z: 11 });
        at += hop.duration || hop.fade;
    }
    if (!from) return;
    const wrongThere = j !== -1 && prevPlaced[j].letter !== current.word[j];
    // a plain block's size before travel measures it; the clunk after
    // travel, which stops the block's tweens when it starts
    if (!reduced) el.classList.add('landing');
    travel(el, from, { wiggle: wrongThere ? wiggle : null, at, m: flyIn, hop: false, z: 10 });
    if (!reduced) clunk(el, at + flyIn.duration);
}

// Move `el` from where `fromEl` is (a slot or a bench spot) to where the
// render put it: from now it is held there, upright, at that place's
// size and lifted over the other blocks; with `wiggle` it swings there
// first (the wrong wiggle); at `at` seconds it leaves along `m` (with
// `hop` the lever's hop, else the reveal's fly-in) and turns to its
// rendered tilt. What it set is put back when it has landed. Reduced
// motion (m.duration 0): it fades in where it is at `at`.
function travel(el, fromEl, { wiggle, at, m, hop, z }) {
    gsap.killTweensOf(el);
    if (m.duration === 0) {
        gsap.set(el, { x: 0, y: 0 });
        if (m.fade > 0) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: m.fade, delay: at, ease: 'power1.out' });
        restoreAfter(el, at + m.fade, 'opacity');
        return;
    }
    const to = centre(el);
    const from = centre(fromEl);
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const rot = gsap.getProperty(el, 'rotation');
    const size = el.offsetWidth ? fromEl.offsetWidth / el.offsetWidth : 1;
    gsap.set(el, { x: dx, y: dy, rotation: 0, scale: size, position: 'relative', zIndex: z });
    const tl = gsap.timeline();
    if (wiggle && wiggle.distance > 0) {
        const step = wiggle.duration / 6;
        const d = wiggle.distance;
        tl.to(el, { x: dx - d, duration: step, ease: wiggle.ease }, 0)
            .to(el, { x: dx + d, duration: step * 2, ease: wiggle.ease })
            .to(el, { x: dx - d, duration: step * 2, ease: wiggle.ease })
            .to(el, { x: dx, duration: step, ease: wiggle.ease });
    }
    if (hop) {
        const up = m.duration * 0.4;
        tl.to(el, { x: 0, rotation: rot, scale: 1, duration: m.duration, ease: 'power1.inOut' }, at)
            .to(el, { y: Math.min(dy, 0) - m.height, duration: up, ease: m.ease }, at)
            .to(el, { y: 0, duration: m.duration - up, ease: 'power2.in' }, at + up);
    } else {
        tl.to(el, { x: 0, y: 0, rotation: rot, scale: 1, duration: m.duration, ease: m.ease }, at);
    }
    restoreAfter(el, at + m.duration, 'position,zIndex');
}

// --- A letter locks (BACKLOG B-211) ---

// The slots whose letter is locked now and was not at the last render
// (`prevPlaced`): a locked slot that was not locked, or held another
// block. Pure. The given letter of easy is locked from the word's first
// render, so it never shows up here.
export function newlyLocked(prevPlaced, placed) {
    const fresh = [];
    placed.forEach((p, i) => {
        const was = prevPlaced[i];
        if (p && p.locked && !(was && was.locked && was.tileId === p.tileId)) fresh.push(i);
    });
    return fresh;
}

// A letter that locks is pressed into its slot, from `at` seconds: drawn
// as a placed block (class `landing`, game.css) it sinks to m.scale in
// m.press (ease-in, the hit); at the hit its locked look comes on, sunk
// and smaller, and it comes up from where the press left it to its
// locked size by m.duration (ease-out). Reduced motion: no press; the
// locked look is on at once and the letter dips in opacity. Nothing to
// clear: it ends at scale 1, the CSS render.
function clunk(el, at) {
    if (!el) return;
    const m = motionFor('clunk', reducedMotion());
    if (m.duration === 0) {
        el.classList.remove('landing');
        if (m.fade > 0) dip(el, m.fade);
        return;
    }
    el.classList.add('landing');
    gsap.to(el, { scale: m.scale, duration: m.press, ease: 'power2.in', delay: at });
    gsap.delayedCall(at + m.press, () => {
        const placed = el.offsetWidth;
        el.classList.remove('landing');
        const locked = el.offsetWidth;
        const from = locked ? (m.scale * placed) / locked : m.scale;
        // not lazy: drawn at `from` in this very frame, not the next
        gsap.fromTo(el, { scale: from }, { scale: 1, duration: m.duration - m.press, ease: m.ease, lazy: false });
    });
}

// --- Reset lever ---

// The rail shakes ±4px for 200ms (the swing of the wrong wiggle).
function shakeRail() {
    const rail = document.getElementById('letter-boxes');
    const m = motionFor('shake', reducedMotion());
    if (m.distance > 0) swing(rail, m);
}

// The blocks that were in slots and now lie on the bench hop from there
// back onto their start spots, left to right, 30ms apart (a letter the
// lever left or locked is still in its slot and stays still; on the
// reveal, a block that went to another slot flies in instead, flyIn).
function hopBack(prevPlaced) {
    const boxes = document.getElementById('letter-boxes').children;
    const inSlot = (el) => Array.prototype.includes.call(boxes, el.parentNode);
    const moves = [];
    prevPlaced.forEach((slot, i) => {
        if (!slot || !boxes[i]) return;
        const el = tileEl(slot.tileId);
        if (!el || inSlot(el)) return;
        moves.push({ el, from: centre(boxes[i]) });
    });
    fly(moves, motionFor('hop', reducedMotion()), true);
}
