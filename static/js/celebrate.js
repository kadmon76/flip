// celebrate.js — one-shot motion for the two reward beats (DESIGN
// "Motion"): a correct check pulses the boxes once and bursts confetti
// from the card; the round-end screen pops the earned stars in one after
// another. It runs as a state subscriber after card.js and the round-end
// render, compares the new state with the last one it saw and starts a
// tween only on the transition (status became 'correct', screen became
// 'round-end'); a re-render in the same state does nothing. Nothing here
// is game state: the confetti pieces exist only for the burst and are
// removed from the DOM when it ends; every tween clears what it set.

import { motionFor } from './motion.js';

// Palette roles the confetti pieces cycle through (colours in game.css).
const CONFETTI_COLOURS = ['accent', 'primary', 'error'];

// Render cache (like the `tiles` Map in card.js): what the last render
// showed, so a transition can be told from a re-render.
let last = { screen: null, status: null };

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderCelebrate(state) {
    const { screen, current } = state;
    const status = screen === 'play' && current.word ? current.status : null;
    const prev = last;
    last = { screen, status };

    if (status === 'correct' && prev.status !== 'correct') {
        pulseBoxes();
        burstConfetti();
    } else if (status !== 'correct' && prev.status === 'correct') {
        settle(document.querySelectorAll('#letter-boxes .letter-box'));
    }

    if (screen === 'round-end' && prev.screen !== 'round-end') {
        popStars();
    } else if (screen !== 'round-end' && prev.screen === 'round-end') {
        settle(document.querySelectorAll('#round-stars .fill'));
    }
}

// Stop a running celebration on `els` and drop the inline transform and
// opacity it set, so the CSS render of state is what shows again.
function settle(els) {
    if (!els.length) return;
    gsap.killTweensOf(els);
    gsap.set(els, { clearProps: 'transform,opacity' });
}

// --- Correct: box pulse ---

// Every box scales up to `m.scale` and back once (yoyo), ease-out both
// ways, within `m.duration`. Reduced motion: a short opacity fade instead.
function pulseBoxes() {
    const boxes = document.querySelectorAll('#letter-boxes .letter-box');
    if (!boxes.length) return;
    const m = motionFor('pulse', reducedMotion());
    gsap.killTweensOf(boxes);
    const done = () => gsap.set(boxes, { clearProps: 'transform,opacity' });
    if (m.duration > 0) {
        gsap.fromTo(boxes, { scale: 1 }, {
            scale: m.scale,
            duration: m.duration / 2,
            ease: m.ease,
            yoyo: true,
            yoyoEase: true,
            repeat: 1,
            transformOrigin: '50% 50%',
            onComplete: done,
        });
    } else if (m.fade > 0) {
        gsap.fromTo(boxes, { opacity: 0.4 }, { opacity: 1, duration: m.fade, ease: m.ease, onComplete: done });
    }
}

// --- Correct: confetti ---

function rand(min, max) {
    return min + Math.random() * (max - min);
}

// `m.count` small paper pieces in palette colours start inside the card
// and fly outward past its edge, spinning and fading, over `m.duration`.
// They live in a fixed, click-through layer appended to <body> that is
// removed when the timeline ends, so input is never blocked and nothing
// stays in the DOM. Reduced motion: count 0, no confetti.
function burstConfetti() {
    const m = motionFor('confetti', reducedMotion());
    if (m.count === 0 || m.duration === 0) return;
    const card = document.querySelector('#screen-play .card');
    if (!card) return;

    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    const tl = gsap.timeline({ onComplete: () => layer.remove() });

    for (let i = 0; i < m.count; i++) {
        const piece = document.createElement('span');
        piece.className = `confetti-piece ${CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]}`;
        layer.appendChild(piece);

        // Evenly spread directions with a little jitter; start somewhere
        // in the middle half of the card and end past its edge, with a
        // slight downward drift so the pieces look like they are falling.
        const angle = (i / m.count) * Math.PI * 2 + rand(-0.3, 0.3);
        const dist = rand(r.width * 0.55, r.width * 1.1);
        const sx = cx + rand(-r.width / 4, r.width / 4);
        const sy = cy + rand(-r.height / 4, r.height / 4);
        gsap.set(piece, { x: sx, y: sy, rotation: rand(0, 360), scale: rand(0.7, 1.2) });
        tl.to(piece, {
            x: sx + Math.cos(angle) * dist,
            y: sy + Math.sin(angle) * dist + rand(10, 40),
            rotation: `+=${rand(90, 360)}`,
            duration: m.duration,
            ease: m.ease,
        }, 0);
        tl.to(piece, { opacity: 0, duration: m.duration * 0.4, ease: 'power1.in' }, m.duration * 0.6);
    }
    document.body.appendChild(layer);
}

// --- Round end: star pop ---

// The fill layer of each earned star (class `earned` is set by the
// round-end render) scales in from 0 with the overshoot, one star
// `m.stagger` after the previous. Reduced motion: each fades in instead.
function popStars() {
    const fills = document.querySelectorAll('#round-stars .earned .fill');
    if (!fills.length) return;
    const m = motionFor('starPop', reducedMotion());
    gsap.killTweensOf(fills);
    const done = () => gsap.set(fills, { clearProps: 'transform,opacity' });
    if (m.duration > 0) {
        gsap.fromTo(fills, { scale: 0 }, {
            scale: m.scale,
            duration: m.duration,
            ease: m.ease,
            stagger: m.stagger,
            transformOrigin: '50% 50%',
            onComplete: done,
        });
    } else if (m.fade > 0) {
        gsap.fromTo(fills, { opacity: 0 }, { opacity: 1, duration: m.fade, ease: m.ease, stagger: m.stagger, onComplete: done });
    }
}
