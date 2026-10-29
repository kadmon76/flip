// celebrate.js — one-shot motion for the two reward beats (DESIGN
// "Feedback", "Motion"): a correct check pulses the slots once and small
// cogs, one per gear the word earns, fly from the TV into the console's
// gear counter, whose count flips up as they land (BACKLOG B-218), setting
// off as the TV's win ends (B-227: picture.js WIN_MS); the TV's own win,
// its warm flash and its sparks start in picture.js (BACKLOG B-222); the
// round-end screen pops the
// earned stars in one after another and, when the round cleared its
// stage, then lights that stage's bulb with a pop (BACKLOG B-216), and
// then pops in the theme key the round earned (human, 2026-10-24); the
// spare bulb a perfect round earned pops in beside the stars right after
// them, before the bulb and the key (BACKLOG B-231); on the
// theme screen a key opening a theme pops the card's padlock off. It
// runs as a state subscriber after
// card.js, the round-end render and the gear counters' (cogs.js), compares the new state with the last
// one it saw and starts a tween only on the transition (status became
// 'correct', screen became 'round-end'); a re-render in the same state
// does nothing. Nothing here
// is game state: the flying cogs exist only for
// their flight and are removed from the DOM when it ends; every tween
// clears what it set, and the count the gear counter holds while the
// cogs fly ends as the one cogs.js rendered from state.

import { motionFor } from './motion.js';
import { wordGears } from './gears.js';
import { cog, countText, showCount } from './cogs.js';
import { WIN_MS } from './picture.js';

// Render cache (like the `tiles` Map in card.js): what the last render
// showed, so a transition can be told from a re-render; `gears` is the
// count it last saw (state.gears), the count before a word's gears.
let last = { screen: null, status: null, gears: null, opened: [] };

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderCelebrate(state) {
    const { screen, current } = state;
    const status = screen === 'play' && current.word ? current.status : null;
    const prev = last;
    const opened = (state.keys && state.keys.opened) || [];
    last = { screen, status, gears: state.gears, opened };

    if (status === 'correct' && prev.status !== 'correct') {
        pulseBoxes();
        flyGears(prev.gears, state.gears, wordGears((state.round.results || [])[state.round.index]));
    } else if (status !== 'correct' && prev.status === 'correct') {
        settle(document.querySelectorAll('#letter-boxes .letter-box'));
        settleGears(state.gears);
    }

    if (screen === 'round-end' && prev.screen !== 'round-end') {
        const spare = !!state.round.spareEarned;
        popStars();
        if (spare) popSpare();
        if (state.round.justCleared) popBulb(state.round.stage, spare);
        if (state.round.keyEarned) popKey(!!state.round.justCleared, spare);
    } else if (screen !== 'round-end' && prev.screen === 'round-end') {
        settle(document.querySelectorAll('#round-stars .fill'));
        settleBulbs(document.querySelectorAll('#round-stages .bulb'));
        settle(document.querySelectorAll('#round-key'));
        settleSpare();
    }

    // a key opened a theme, here on the theme screen
    if (screen === 'theme' && prev.screen === 'theme') {
        opened.filter((t) => !prev.opened.includes(t)).forEach(unlock);
    } else if (screen !== 'theme' && prev.screen === 'theme') {
        settleLocks();
    }
}

// --- Theme keys (human, 2026-10-24) ---

// The round's key (locks.js has shown it) pops in once the stars have
// (starsDone), after the spare bulb's pop when the round earned one
// (`afterSpare`, BACKLOG B-231) and after the stage bulb's pop when the
// round cleared its stage (`afterBulb`): it scales up from 0 with the
// overshoot and turns into place. Reduced motion: it fades in.
function popKey(afterBulb, afterSpare = false) {
    const key = document.getElementById('round-key');
    if (!key || key.hidden) return;
    const m = motionFor('keyPop', reducedMotion());
    const stars = document.querySelectorAll('#round-stars .earned .fill').length;
    const delay = spareDone(stars, afterSpare) + (afterBulb ? motionFor('bulbPop', false).duration : 0);
    gsap.killTweensOf(key);
    const done = () => gsap.set(key, { clearProps: 'transform,opacity' });
    if (m.duration > 0) {
        gsap.fromTo(key, { scale: 0, rotation: m.turn }, {
            scale: m.scale, rotation: 0, duration: m.duration, ease: m.ease, delay, onComplete: done,
        });
    } else if (m.fade > 0) {
        gsap.fromTo(key, { opacity: 0 }, { opacity: 1, duration: m.fade, delay, onComplete: done });
    }
}

// The card of `theme` has just been opened (the render dropped its
// `is-locked` class, which hides the padlock): its padlock shows for the
// moment it rises, swells, turns and fades away, and the picture
// brightens from the locked dim. Reduced motion: the padlock fades out.
function unlock(theme) {
    const card = document.querySelector(`#theme-buttons .theme-btn[data-theme="${theme}"]`);
    const lock = card && card.querySelector('.padlock');
    if (!lock) return;
    const m = motionFor('unlock', reducedMotion());
    const img = card.querySelector('img');
    gsap.killTweensOf([lock, img]);
    const done = () => {
        gsap.set(lock, { clearProps: 'display,transform,opacity,y,scale,rotation' });
        if (img) gsap.set(img, { clearProps: 'filter' });
    };
    gsap.set(lock, { display: 'block' });
    if (img) gsap.fromTo(img, { filter: 'grayscale(0.85) brightness(0.55)' }, { filter: 'grayscale(0) brightness(1)', duration: m.duration || m.fade });
    if (m.duration > 0) {
        gsap.fromTo(lock, { y: 0, scale: 1, rotation: 0, opacity: 1 }, {
            y: -m.height, scale: m.scale, rotation: m.turn, opacity: 0, duration: m.duration, ease: m.ease, onComplete: done,
        });
    } else {
        gsap.fromTo(lock, { opacity: 1 }, { opacity: 0, duration: m.fade, onComplete: done });
    }
}

// Leaving the theme screen: an unlock still running stops.
function settleLocks() {
    const locks = document.querySelectorAll('#theme-buttons .padlock');
    const imgs = document.querySelectorAll('#theme-buttons .theme-btn img');
    if (!locks.length) return;
    gsap.killTweensOf([...locks, ...imgs]);
    gsap.set(locks, { clearProps: 'display,transform,opacity,y,scale,rotation' });
    gsap.set(imgs, { clearProps: 'filter' });
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

// --- Correct: cogs fly into the gear counter (BACKLOG B-218) ---

// The counts the console's counter shows as each of `n` cogs lands
// (pure): from `from` (the count before the word's gears) up to `to`
// (state.gears now), in even steps, the last one `to`. A `from` that is
// not a count (nothing seen yet) shows `to` all along.
export function gearTicks(from, to, n) {
    const start = Number.isSafeInteger(from) && from >= 0 ? from : to;
    return Array.from({ length: Math.max(0, n) }, (_, i) => start + Math.round(((to - start) * (i + 1)) / n));
}

// Which flaps of `after` changed from `before` (pure): their indexes in
// `after`, the digits compared from the right (a digit with none under it
// in `before` changed too).
export function changedFlaps(before, after) {
    const a = String(before);
    const b = String(after);
    const out = [];
    for (let i = 0; i < b.length; i++) {
        const j = a.length - (b.length - i);
        if (j < 0 || a[j] !== b[i]) out.push(i);
    }
    return out;
}

// Seconds from when the cogs set off (as the TV's win ends, WIN_MS after
// the check, B-227) until the counter's last flip ends, for `n` cogs
// (pure): the last cog sets off (n - 1) staggers after the first, lands
// `gearFly.duration` later, then its flip.
export function gearsDone(n) {
    const fly = motionFor('gearFly', false);
    const flip = motionFor('gearFlip', false);
    return n > 0 ? (n - 1) * fly.stagger + fly.duration + flip.duration : 0;
}

// `n` small cogs (the word's gears, gears.js wordGears) pop out of the TV
// picture's centre once its win has played (WIN_MS after the check,
// B-227: hidden until then), rise a little apart and drop into the
// console's gear counter (#console-gears), one after the other; as each
// lands its counter's count goes one step up (gearTicks) with its changed
// digits flipping up and its cog turning a tooth. Until then the counter
// holds the count from before the word (`from`), which cogs.js has
// already replaced with `to`. The cogs live in a fixed, click-through
// layer that is removed when the last one lands; every flip clears what
// it set. Reduced motion: nothing here, the count just changes (cogs.js).
function flyGears(from, to, n) {
    const m = motionFor('gearFly', reducedMotion());
    if (n <= 0 || m.duration === 0) return;
    const card = document.querySelector('#screen-play .card');
    const host = document.querySelector('#console-gears');
    const target = host && host.firstElementChild;
    if (!card || !target) return;
    const hold = Number.isSafeInteger(from) && from >= 0 ? from : to;
    const ticks = gearTicks(hold, to, n);
    showCount(host, countText(hold));

    const r = card.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const half = m.size / 2;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const tx = t.left + t.width / 2;
    const ty = t.top + t.height / 2;

    const wait = WIN_MS / 1000;
    const layer = document.createElement('div');
    layer.className = 'gear-fly';
    layer.setAttribute('aria-hidden', 'true');
    gsap.set(layer, { visibility: 'hidden' });
    gsap.set(layer, { visibility: 'visible', delay: wait });
    let shown = countText(hold);
    for (let i = 0; i < n; i++) {
        const piece = document.createElement('span');
        piece.className = 'gear-fly-cog';
        piece.appendChild(cog());
        layer.appendChild(piece);
        const side = n === 1 ? 0 : ((2 * i) / (n - 1) - 1) * m.spread / 2;
        const at = wait + i * m.stagger;
        gsap.set(piece, { x: cx + side / 2 - half, y: cy - half, scale: 0.5, rotation: 0 });
        gsap.to(piece, { x: cx + side - half, y: cy - m.height - half, scale: 1, rotation: 90,
            duration: m.rise, delay: at, ease: 'power1.out' });
        gsap.to(piece, { x: tx - half, y: ty - half, scale: 0.8, rotation: 300,
            duration: m.duration - m.rise, delay: at + m.rise, ease: m.ease,
            onComplete: () => {
                piece.remove();
                if (i === n - 1) layer.remove();
                const text = countText(ticks[i]);
                const before = shown;
                shown = text;
                flipUp(host, before, text);
            } });
    }
    document.body.appendChild(layer);
}

// The counter shows `text`; the flaps that changed from `before` flip up
// (scaleY 0 -> 1) and its cog turns on to its next tooth (45 degrees: an
// 8-tooth cog looks the same there, so clearing the turn shows no jump).
function flipUp(host, before, text) {
    const m = motionFor('gearFlip', false);
    showCount(host, text);
    const flaps = host.lastElementChild.children;
    const changed = changedFlaps(before, text).map((i) => flaps[i]).filter(Boolean);
    if (changed.length) {
        gsap.fromTo(changed, { scaleY: 0 }, {
            scaleY: 1, duration: m.duration, ease: m.ease, transformOrigin: '50% 50%',
            onComplete: () => gsap.set(changed, { clearProps: 'transform,transformOrigin' }),
        });
    }
    const wheel = host.firstElementChild;
    const turned = Number(gsap.getProperty(wheel, 'rotation')) || 0;
    gsap.to(wheel, {
        rotation: (Math.floor(turned / 45) + 1) * 45, duration: m.duration, ease: m.ease,
        transformOrigin: '50% 50%', overwrite: true,
        onComplete: () => gsap.set(wheel, { clearProps: 'transform,transformOrigin' }),
    });
}

// Leaving the correct word (the next word, the round end, the back
// arrow): cogs still waiting for the win to end or flying are dropped, a
// flip still running stops, and the console's counter shows `gears`
// (state.gears), as cogs.js renders it.
function settleGears(gears) {
    document.querySelectorAll('.gear-fly').forEach((layer) => {
        gsap.killTweensOf([layer, ...Array.from(layer.children)]);
        layer.remove();
    });
    const host = document.querySelector('#console-gears');
    if (!host || !host.firstElementChild) return;
    const parts = [host.firstElementChild, ...Array.from(host.lastElementChild.children)];
    gsap.killTweensOf(parts);
    gsap.set(parts, { clearProps: 'transform,transformOrigin' });
    showCount(host, countText(gears));
}

// --- Round end: the cleared stage's bulb ---

// Seconds after the round-end screen shows when its `stars` earned stars
// have popped in (the last one's pop ends); 0 with none. Pure.
export function starsDone(stars) {
    const m = motionFor('starPop', false);
    return stars > 0 ? (stars - 1) * m.stagger + m.duration : 0;
}

// Seconds after the round-end screen shows when the stars and, with
// `spare` (the round earned a spare bulb, BACKLOG B-231), the spare
// bulb's pop after them are done: when the stage bulb's pop starts. Pure.
export function spareDone(stars, spare) {
    return starsDone(stars) + (spare ? motionFor('sparePop', false).duration : 0);
}

// Drop what the bulb pop set inline (its light and scale), so the
// render's class (lit or `off`) is what shows again.
function unsetBulbs(bulbs) {
    gsap.set(bulbs, { clearProps: 'transform,transformOrigin' });
    bulbs.forEach((b) => b.style.removeProperty('--lit'));
}

// Leaving the round-end screen: a pop still running or waiting stops.
function settleBulbs(bulbs) {
    if (!bulbs.length) return;
    gsap.killTweensOf(bulbs);
    unsetBulbs(bulbs);
}

// The bulb of `stage` (the round's, which it just cleared; the render
// has lit it) stays dark until the stars have popped in (starsDone), and
// the spare bulb after them when the round earned one (`afterSpare`,
// spareDone), then its light comes on while it swells and settles back
// (`bulbPop`). Reduced motion: nothing here, the render's lit bulb simply
// shows.
function popBulb(stage, afterSpare = false) {
    const bulb = document.querySelector(`#round-stages .bulb[data-stage="${stage}"]`);
    if (!bulb) return;
    const m = motionFor('bulbPop', reducedMotion());
    if (m.duration === 0) return;
    const stars = document.querySelectorAll('#round-stars .earned .fill').length;
    gsap.killTweensOf(bulb);
    gsap.set(bulb, { '--lit': 0 });
    gsap.timeline({ delay: spareDone(stars, afterSpare), onComplete: () => unsetBulbs([bulb]) })
        .to(bulb, { '--lit': 1, duration: m.duration / 2, ease: m.ease }, 0)
        .to(bulb, { scale: m.scale, duration: m.duration / 2, ease: m.ease, transformOrigin: '50% 50%' }, 0)
        .to(bulb, { scale: 1, duration: m.duration / 2, ease: m.ease }, m.duration / 2);
}

// --- Round end: the spare bulb (BACKLOG B-231) ---

// The spare bulb a perfect round earned (main.js has shown it, lit) is
// not there until the stars have popped in (starsDone), then it grows
// from nothing past its size and settles back while its light comes on
// (`sparePop`). Reduced motion: it fades in.
function popSpare() {
    const bulb = document.getElementById('round-spare');
    if (!bulb || bulb.hidden) return;
    const m = motionFor('sparePop', reducedMotion());
    const stars = document.querySelectorAll('#round-stars .earned .fill').length;
    const delay = starsDone(stars);
    gsap.killTweensOf(bulb);
    if (m.duration > 0) {
        gsap.set(bulb, { scale: 0, '--lit': 0, transformOrigin: '50% 50%' });
        gsap.timeline({ delay, onComplete: () => unsetBulbs([bulb]) })
            .to(bulb, { '--lit': 1, duration: m.duration / 2, ease: m.ease }, 0)
            .to(bulb, { scale: m.scale, duration: m.duration / 2, ease: m.ease }, 0)
            .to(bulb, { scale: 1, duration: m.duration / 2, ease: m.ease }, m.duration / 2);
    } else if (m.fade > 0) {
        gsap.fromTo(bulb, { opacity: 0 }, { opacity: 1, duration: m.fade, delay, onComplete: () => gsap.set(bulb, { clearProps: 'opacity' }) });
    }
}

// Leaving the round-end screen: the spare bulb's pop, still running or
// waiting, stops and what it set inline (its scale, light or fade) goes.
function settleSpare() {
    const spare = document.querySelectorAll('#round-spare');
    if (!spare.length) return;
    gsap.killTweensOf(spare);
    unsetBulbs(spare);
    gsap.set(spare, { clearProps: 'opacity' });
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
