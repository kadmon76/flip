// feedback.js — one-shot motion that plays when the word's status
// changes (DESIGN "Motion": wrong -> tiles in wrong boxes wiggle). It
// runs as a state subscriber after card.js has rendered, compares the
// new status with the last one it saw, and only then starts a tween; a
// render while the status is unchanged does nothing. Nothing here is
// game state: the tint itself is card.js's render of `status`.

import { isWrongBox } from './card.js';
import { motionFor } from './motion.js';

// Render cache (like the `tiles` Map in card.js): the status and hearts
// of the last render, so a transition can be told from a re-render.
let last = { status: null, lives: null };

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderFeedback(state) {
    const { current, lives } = state;
    const status = state.screen === 'play' && current.word ? current.status : null;
    // A new wrong check: either the status just became 'wrong', or it
    // was already 'wrong' and another heart went (Check pressed again
    // without moving a tile).
    const wrongAgain = status === 'wrong' && (last.status !== 'wrong' || lives !== last.lives);
    last = { status, lives };
    if (wrongAgain) wiggleWrongTiles(current);
}

// Shake the tiles sitting in wrong boxes ±distance px horizontally and
// land back at x: 0. Input is never blocked; a drag that starts mid-
// wiggle kills the tween (drag.js killTweensOf) and takes over.
function wiggleWrongTiles(current) {
    const m = motionFor('wiggle', reducedMotion());
    if (m.duration === 0 || m.distance === 0) return;
    const boxes = document.getElementById('letter-boxes').children;
    const step = m.duration / 6;   // 0 -> -d (1), -d -> +d (2), +d -> -d (2), -d -> 0 (1)
    current.placed.forEach((slot, i) => {
        if (!isWrongBox(current, i) || !boxes[i]) return;
        const tile = boxes[i].firstElementChild;
        if (!tile) return;
        gsap.killTweensOf(tile, 'x');
        gsap.timeline({ defaults: { ease: m.ease } })
            .to(tile, { x: -m.distance, duration: step })
            .to(tile, { x: m.distance, duration: step * 2 })
            .to(tile, { x: -m.distance, duration: step * 2 })
            .to(tile, { x: 0, duration: step });
    });
}
