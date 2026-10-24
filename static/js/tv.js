// tv.js — the TV's motion (BACKLOG B-214, DESIGN "Layout", TV screen).
// The approved prototype is design/reference/tv-motion.html; its layer 1
// "TV" (tuneIn, hiss, ambientRoll, the .tune canvas and the .roll bar) is
// ported here with its numbers as they are.
//   - a new word (the round's first and each next one): the TV tunes in
//     for about a second, fine streaky snow, a dark sync bar rolling
//     down, the word's picture rolling vertically and tearing sideways,
//     slowing, then locking still. It is drawn into the .tv-tune canvas
//     over the picture, inside the screen's rounded mask and under its
//     scanlines and glow, with audio.js's hiss and channel click. A
//     picture still loading keeps the snow going (TUNE.hold at most).
//     At the lock `onLock` is told (main.js onTuned, which sets
//     state.tuned): the robot's "Picture shown" moment plays on that
//     change (character.js).
//   - after the lock the TV stays alive but quiet: a faint light bar
//     (.tv-roll) rolls down the screen every 6-11s, and with half of them
//     the screen dims for 90ms.
//   - prefers-reduced-motion: the picture fades in over 250ms and then
//     locks; no snow, roll, hiss, bar or flicker.
// renderTv is a state subscriber after card.js (which has set the new
// picture) and starts the tune-in only on a transition it detects against
// its render cache (the word it last showed): a re-render does nothing.
// It never mutates state and never takes input (the canvas and the bar
// have pointer-events: none), so the kid can drag while it tunes in.
// Everything above "Render" is pure (no DOM) and a Django test runs it
// through node.

import { hiss } from './audio.js';

// --- The tune-in (design/reference/tv-motion.html tuneIn) ---

// Times in ms from the start of the tune-in.
//   - picture: the word's picture comes in (eased) from `from` to `to`,
//     then shines `flare.by` over and settles back by `flare.to`;
//   - snow: the snow goes down by `by` (eased) from `from` to `to`, and
//     the rest of it linearly by `tail`;
//   - settle: the roll and the tear slow down from `from` and stop at
//     `to`; the picture rolls by `roll` screen heights as it slows, rows
//     tear sideways `tear.px` (a sine of `tear.row` per row and `tear.ms`
//     per ms), a row now and then jolts (`jolt`), and a black gap of
//     `blank` of the height runs between the rolling frames while the
//     settle is above `blankUntil`;
//   - bar: the dark sync bar, `height` of the screen tall and dimmed to
//     `dim`, with a light edge (`edge` px, `edgeLight`), moves down
//     `speed` of the height a frame at (`base` + settle), looping every
//     `loop` heights;
//   - grain: each pixel keeps `keep` of the one left of it (streaks),
//     brightness to the power `gamma`, each row its own gain
//     (`gain` + up to `gainRange`); `tint` is its r, g, b;
//   - under: the snow left under the picture as it comes in;
//   - rows: CSS px per canvas row (the grain is streaky, taller than
//     wide); `least` the smallest canvas;
//   - fadeOut: the canvas fades off the locked picture; hiss: the hiss
//     lasts this share of the tune-in; hold: how long the snow waits for
//     a picture still loading (then it tunes in to none); reduced: the
//     fade in under prefers-reduced-motion.
export const TUNE = {
    duration: 1000,
    picture: { from: 230, to: 720 },
    flare: { to: 900, by: 0.18 },
    snow: { from: 230, to: 700, by: 0.78, tail: 930 },
    settle: { from: 230, to: 760 },
    roll: 1.6,
    tear: { px: 14, row: 0.11, ms: 0.02 },
    jolt: { chance: 0.04, px: 30 },
    blank: 0.08,
    blankUntil: 0.02,
    bar: { speed: 0.045, base: 0.4, height: 0.12, loop: 1.25, dim: 0.35, edge: 1.5, edgeLight: 120 },
    grain: { keep: 0.42, gamma: 1.35, gain: 0.7, gainRange: 0.55 },
    tint: [0.88, 0.97, 1],
    under: 0.7,
    rows: 1.5,
    least: { w: 120, h: 60 },
    fadeOut: 120,
    hiss: 0.95,
    hold: 2000,
    reduced: 250,
};

// The quiet life after the lock (design/reference/tv-motion.html
// ambientRoll): a bar every `every.least` + up to `every.extra` ms; it
// rolls from `from` to `to` (% of its own height, so from above the
// screen to below it) in `duration` ms at `opacity`; with `flicker.chance`
// of the bars the screen dims to `brightness` and back in `duration` ms.
export const QUIET = {
    every: { least: 6000, extra: 5000 },
    roll: { duration: 1700, from: -120, to: 480, opacity: 0.07 },
    flicker: { chance: 0.5, duration: 90, brightness: 0.92 },
};

// The frame the prototype's per-frame numbers were made for (60 Hz).
export const FRAME_MS = 1000 / 60;

export const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
export const ramp = (t, a, b) => Math.min(Math.max((t - a) / (b - a), 0), 1);

// How far the tune-in is at `t` ms: how much of the picture shows (0-1,
// up to 1 + flare.by as it shines over), how much snow (1-0), and how
// much roll and tear are left (1-0; 0 is locked).
export function levels(t) {
    const { picture, flare, snow, settle } = TUNE;
    const shine = t > picture.to ? 1 + flare.by * (1 - ramp(t, picture.to, flare.to)) : 1;
    return {
        pic: ease(ramp(t, picture.from, picture.to)) * shine,
        snow: 1 - snow.by * ease(ramp(t, snow.from, snow.to)) - (1 - snow.by) * ramp(t, snow.to, snow.tail),
        settle: 1 - ease(ramp(t, settle.from, settle.to)),
    };
}

// The canvas for a screen `cw` x `ch` CSS px: one column per CSS px, one
// row per TUNE.rows.
export function canvasSize(cw, ch) {
    return {
        W: Math.max(TUNE.least.w, Math.round(cw)),
        H: Math.max(TUNE.least.h, Math.round(ch / TUNE.rows)),
    };
}

// The tune-in's clock after a frame `dt` ms long: it runs on, except
// that while the picture is not `ready` it stops where the picture would
// start to come in, and the time is counted as `held` until TUNE.hold;
// then it runs on without it.
export function clockStep(clock, held, dt, ready) {
    if (ready || held >= TUNE.hold) return { clock: clock + dt, held };
    const free = Math.max(0, Math.min(dt, TUNE.picture.from - clock));
    return { clock: clock + free, held: held + dt - free };
}

// Where the sync bar is after a frame `dt` ms long, at `settle`, on a
// canvas `H` rows tall. The prototype moves it once a frame; here by the
// frame's share of a 60 Hz frame, so it runs as fast on any screen.
export function barStep(bar, settle, H, dt) {
    const { speed, base, loop } = TUNE.bar;
    return (bar + H * speed * (base + settle) * (dt / FRAME_MS)) % (H * loop);
}

// Draw the tune-in at `t` ms into `o` (RGBA bytes, W x H, e.g. an
// ImageData's data): the snow, the sync bar at row `bar` and, once it
// comes in, the picture `pic` (RGBA bytes of the same size, or null for
// none) rolling and tearing. `rand` gives the grain (Math.random). At
// TUNE.duration and later it is the picture exactly (no picture: black).
export function drawTune(o, pic, W, H, t, bar, rand = Math.random) {
    const { pic: pa, snow: sa, settle } = levels(t);
    const { tear: T, jolt, bar: B, grain: G, tint } = TUNE;
    const roll = Math.round(settle * settle * H * TUNE.roll) % H;
    const tear = T.px * settle;
    const blank = Math.round(H * TUNE.blank);
    for (let y = 0; y < H; y++) {
        const rowGain = G.gain + rand() * G.gainRange;
        const inBar = y > bar - H * B.height && y < bar;
        const barEdge = Math.abs(y - bar) < B.edge;
        const sy = (y + H - roll) % H;
        const blanked = settle > TUNE.blankUntil && sy < blank;
        const shift = Math.round(tear * Math.sin(y * T.row + t * T.ms)
            + (rand() < jolt.chance * settle ? (rand() - 0.5) * jolt.px * settle : 0));
        let prev = rand();
        for (let x = 0; x < W; x++) {
            const v = prev * G.keep + rand() * (1 - G.keep);
            prev = v;
            let s = Math.pow(v, G.gamma) * 255 * rowGain;
            if (inBar) s *= B.dim;
            if (barEdge) s = s * 0.5 + B.edgeLight;
            let r = s * tint[0];
            let g = s * tint[1];
            let b = s * tint[2];
            const i = (y * W + x) * 4;
            if (pic && pa > 0) {
                const px = Math.min(Math.max(x - shift, 0), W - 1);
                const j = (sy * W + px) * 4;
                const k = blanked ? 0 : pa;
                r = pic[j] * k + r * sa * TUNE.under;
                g = pic[j + 1] * k + g * sa * TUNE.under;
                b = pic[j + 2] * k + b * sa * TUNE.under;
            } else {
                r *= sa;
                g *= sa;
                b *= sa;
            }
            o[i] = r;
            o[i + 1] = g;
            o[i + 2] = b;
            o[i + 3] = 255;
        }
    }
}

// Ms until the next quiet bar (`rand` is Math.random).
export function quietWait(rand = Math.random) {
    return QUIET.every.least + rand() * QUIET.every.extra;
}

// Whether this bar comes with the dim flicker.
export function flickers(rand = Math.random) {
    return rand() < QUIET.flicker.chance;
}

// --- The picture, as the screen shows it (for the tune-in to roll) ---

// Where an image `nw` x `nh` is drawn in `box` ({ x, y, w, h }) by CSS
// object-fit `fit` ('contain', 'cover'; anything else fills the box),
// centred (object-position 50% 50%).
export function fitRect(box, nw, nh, fit) {
    if (!nw || !nh || (fit !== 'contain' && fit !== 'cover')) return { ...box };
    const s = (fit === 'cover' ? Math.max : Math.min)(box.w / nw, box.h / nh);
    const w = nw * s;
    const h = nh * s;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// The ellipse of game.css's tube, `radial-gradient(ellipse at 50% 45%,
// ...)` on a w x h screen: CSS's farthest-corner size, with the aspect
// ratio closest-side would give.
export function tubeEllipse(w, h) {
    const cx = w * 0.5;
    const cy = h * 0.45;
    const sx = Math.min(cx, w - cx);
    const sy = Math.min(cy, h - cy);
    const k = Math.hypot(Math.max(cx, w - cx) / sx, Math.max(cy, h - cy) / sy);
    return { cx, cy, rx: sx * k, ry: sy * k };
}

// Hex colour `hex` mixed with black to `k` (game.css's `-lo` tones are
// color-mix(in srgb, <colour> 85%, #000)), as rgb(); null if `hex` is not
// a #rgb or #rrggbb colour.
export function shade(hex, k) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// --- Render ---

// Render cache: the word the TV last showed (round, index and word), or
// null off the play screen. Not game state; nothing else reads it.
let shown = null;

// Drawing handle (not game state, CLAUDE.md "tv.js"): the tune-in now
// running, { raf, call, fade, img } (its frame request, its waiting call,
// the reduced-motion fade and whether that fade holds the picture
// hidden), or null once it has locked. Kept only so a new word or another
// screen can stop it; no other module reads it and nothing decides game
// logic from it: whether the picture has locked is state.tuned.
let run = null;

// DOM cache: the TV screen's parts in the template, looked up once (again
// if the page replaced them). Never read to decide game logic.
let dom = null;

function parts() {
    if (dom && dom.card.isConnected) return dom;
    const card = document.querySelector('#screen-play .card');
    if (!card) return null;
    const img = document.getElementById('play-image');
    const canvas = card.querySelector('.tv-tune');
    const roll = card.querySelector('.tv-roll');
    if (!img || !canvas || !roll) return null;
    dom = { card, img, canvas, roll };
    return dom;
}

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderTv(state, onLock) {
    const { current, round } = state;
    const key = state.screen === 'play' && current.word ? `${state.roundsStarted}:${round.index}:${current.word}` : null;
    if (key === shown) return;
    shown = key;
    stop();
    if (!key) return;
    prefetch(state.words[round.index + 1]);
    const d = parts();
    if (!d) return;
    if (reducedMotion()) fadeIn(d, onLock);
    else tuneIn(d, onLock);
}

// The next word's picture starts loading now, so its tune-in rarely has
// to wait for it. (A word the struggle help swaps in as the next word
// starts, BACKLOG B-220, was not fetched ahead: its snow holds while its
// picture loads, 2s at most.)
function prefetch(word) {
    if (word && word.image) new Image().src = word.image;
}

// The word changed or the screen did: whatever the TV was doing stops
// and its parts are back to their CSS render (the canvas and the bar
// hidden, the screen undimmed, the picture shown).
function stop() {
    const was = run;
    if (was) {
        cancelAnimationFrame(was.raf);
        if (was.call) was.call.kill();
        if (was.fade) was.fade.kill();
    }
    run = null;
    gsap.killTweensOf(quietBar);
    const d = parts();
    if (!d) return;
    gsap.killTweensOf([d.canvas, d.roll, d.card]);
    gsap.set([d.canvas, d.roll], { clearProps: 'opacity,transform' });
    gsap.set(d.card, { clearProps: 'filter' });
    if (was && was.img) gsap.set(d.img, { clearProps: 'opacity' });
}

// The picture has locked: the quiet life starts and main.js is told.
function locked(handle, onLock) {
    if (run !== handle) return;
    run = null;
    if (!reducedMotion()) gsap.delayedCall(quietWait() / 1000, quietBar);
    onLock();
}

// The picture as the screen shows it, drawn on a canvas W x H (the tube
// of game.css's .card and the picture where the render put it, as its
// object-fit draws it, clipped to its rounded corners): its RGBA bytes,
// null while it is still loading, false when it cannot be drawn (it
// failed to load, or the canvas will not give its pixels back), and the
// TV tunes in to no picture.
function picturePixels(d, W, H) {
    const { card, img } = d;
    if (!img.complete) return null;
    if (!img.naturalWidth) return false;
    try {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        const cw = card.clientWidth;
        const ch = card.clientHeight;
        x.scale(W / cw, H / ch);
        const teal = getComputedStyle(document.documentElement).getPropertyValue('--teal').trim();
        const tealLo = shade(teal, 0.85);
        if (tealLo) {
            const e = tubeEllipse(cw, ch);
            x.save();
            x.translate(e.cx, e.cy);
            x.scale(1, e.ry / e.rx);
            const g = x.createRadialGradient(0, 0, 0, 0, 0, e.rx);
            g.addColorStop(0, teal);
            g.addColorStop(0.55, teal);
            g.addColorStop(1, tealLo);
            x.fillStyle = g;
            x.fillRect(-e.cx, (-e.cy * e.rx) / e.ry, cw, (ch * e.rx) / e.ry);
            x.restore();
        }
        const style = getComputedStyle(img);
        const box = { x: img.offsetLeft, y: img.offsetTop, w: img.offsetWidth, h: img.offsetHeight };
        const fit = fitRect(box, img.naturalWidth, img.naturalHeight, style.objectFit);
        const r = Math.min(parseFloat(style.borderTopLeftRadius) || 0, box.w / 2, box.h / 2);
        x.save();
        x.beginPath();
        x.moveTo(box.x + r, box.y);
        x.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
        x.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
        x.arcTo(box.x, box.y + box.h, box.x, box.y, r);
        x.arcTo(box.x, box.y, box.x + box.w, box.y, r);
        x.closePath();
        x.clip();
        x.drawImage(img, fit.x, fit.y, fit.w, fit.h);
        x.restore();
        return x.getImageData(0, 0, W, H).data;
    } catch (e) {
        return false;
    }
}

// The tune-in: the canvas covers the screen from the first frame (drawn
// now, before the new picture can be painted under it) to the lock, one
// frame per animation frame and no longer; then it fades off the locked
// picture. The hiss starts with it.
function tuneIn(d, onLock) {
    const ctx = d.canvas.getContext('2d');
    if (!ctx) {
        fadeIn(d, onLock);
        return;
    }
    const { W, H } = canvasSize(d.card.clientWidth, d.card.clientHeight);
    d.canvas.width = W;
    d.canvas.height = H;
    const out = ctx.createImageData(W, H);
    const handle = { raf: 0, call: null, fade: null, img: false };
    let clock = 0;
    let held = 0;
    let last = performance.now();
    let bar = Math.random() * H;
    let pic = null;
    const draw = () => {
        if (pic === null) pic = picturePixels(d, W, H);
        drawTune(out.data, pic || null, W, H, clock, bar);
        ctx.putImageData(out, 0, 0);
    };
    const frame = (now) => {
        if (run !== handle) return;
        const dt = Math.max(0, now - last);
        last = now;
        if (pic === null) pic = picturePixels(d, W, H);
        ({ clock, held } = clockStep(clock, held, dt, pic !== null));
        bar = barStep(bar, levels(clock).settle, H, dt);
        draw();
        if (clock < TUNE.duration) {
            handle.raf = requestAnimationFrame(frame);
            return;
        }
        gsap.to(d.canvas, {
            opacity: 0,
            duration: TUNE.fadeOut / 1000,
            ease: 'none',
            onComplete: () => gsap.set(d.canvas, { clearProps: 'opacity' }),
        });
        locked(handle, onLock);
    };
    run = handle;
    gsap.set(d.canvas, { opacity: 1 });
    draw();
    hiss(TUNE.duration * TUNE.hiss);
    handle.raf = requestAnimationFrame(frame);
}

// Reduced motion: the picture fades in (TUNE.reduced) and locks at the
// end of it. A picture still loading is waited for (TUNE.hold at most),
// so it does not pop in after the fade.
function fadeIn(d, onLock) {
    const handle = { raf: 0, call: null, fade: null, img: true };
    const s = TUNE.reduced / 1000;
    run = handle;
    gsap.set(d.img, { opacity: 0 });
    const begin = () => {
        if (run !== handle || handle.fade) return;
        if (handle.call) handle.call.kill();
        handle.fade = gsap.to(d.img, {
            opacity: 1,
            duration: s,
            ease: 'power1.out',
            onComplete: () => gsap.set(d.img, { clearProps: 'opacity' }),
        });
        handle.call = gsap.delayedCall(s, () => locked(handle, onLock));
    };
    if (d.img.complete) {
        begin();
        return;
    }
    d.img.addEventListener('load', begin, { once: true });
    d.img.addEventListener('error', begin, { once: true });
    handle.call = gsap.delayedCall(TUNE.hold / 1000, begin);
}

// One quiet bar rolls down the screen, sometimes with the dim flicker,
// and the next one is due. Not while the page is in the background; it
// ends when the word or the screen changes (stop).
function quietBar() {
    const d = parts();
    if (d && !document.hidden) {
        const { roll, flicker } = QUIET;
        gsap.fromTo(d.roll, { yPercent: roll.from, opacity: roll.opacity }, {
            yPercent: roll.to,
            duration: roll.duration / 1000,
            ease: 'none',
            onComplete: () => gsap.set(d.roll, { clearProps: 'opacity,transform' }),
        });
        if (flickers()) {
            gsap.fromTo(d.card, { filter: `brightness(${flicker.brightness})` }, {
                filter: 'brightness(1)',
                duration: flicker.duration / 1000,
                ease: 'none',
                onComplete: () => gsap.set(d.card, { clearProps: 'filter' }),
            });
        }
    }
    gsap.delayedCall(quietWait() / 1000, quietBar);
}
