// picture.js — the TV picture's life (BACKLOG B-221, DESIGN "Layout", TV
// picture life). The approved prototype is design/reference/tv-motion.html;
// its layer 2 "Life" (IDLE, startLife: the plate's glow and the motes) is
// ported here, its sway and rumble with their numbers as they are.
//   - a word whose data entry (state.data[word]) has `motion` shows, once
//     the TV's tune-in has locked (state.tuned, tv.js), as two layers over
//     #play-image, framed exactly like it (they line up pixel for pixel
//     with the full picture): motion.plate (the background with the
//     subject painted out) and over it motion.subject (the cutout). Both
//     start loading as the word starts (the next word's with them) and
//     show once both have decoded; until then, and for a word without
//     `motion` (duck), the still picture shows as before. The tune-in
//     still draws from `image`.
//   - while they show, the subject loops its `idle` move around its
//     `pivot`, the plate's glow breathes and a few dim specks drift up.
//     Web Animations only (Element.animate: transforms, opacity and the
//     plate's brightness), so no script runs per frame. All of it is
//     cancelled on a new word, on leaving the play screen and while the
//     page is hidden (main.js renders it again on visibilitychange).
//   - prefers-reduced-motion: the two layers show still.
// renderPicture is a state subscriber after tv.js's renderTv. It never
// mutates state and takes no input (.tv-life has pointer-events: none).
// The TV's quiet bar, its dim flicker (on .card) and the wrong-check
// static show over the layers (the template's order; feedback.js jitters
// the picture as it shows, .tv-life with #play-image). It holds no
// animation handle: it finds its animations with getAnimations().
// Everything above "Render" is pure (no DOM) and a Django test runs it
// through node.

// --- The life (design/reference/tv-motion.html layer 2) ---

// Where the subject turns and scales from: the data's `pivot`, as a CSS
// transform-origin in % of the picture. Anything else turns from its
// centre.
export const PIVOTS = {
    top: '50% 12%',
    bottom: '50% 88%',
    center: '50% 50%',
};

// The idle moves, one per `idle` in the data: keyframes (transforms only;
// a % in translate is of the picture) and timing for Element.animate,
// looped forever. `sway` and `rumble` are the prototype's IDLE, its
// keyframes and timings as they are; sway starts halfway through its first
// swing (`iterationStart`), at rest. The others are new, in the same small
// scale (at most about 2% of the picture or 3 degrees, `spin` about 10;
// a loop of 1-3.5s) and each starts and ends at rest, so the subject never
// jumps off the still picture as the layers come in. A keyframe's
// `easing` runs from it to the next one.
export const IDLE = {
    // a pendulum, 3.2s each way (the prototype's)
    sway: {
        keyframes: [{ transform: 'rotate(-1.8deg)' }, { transform: 'rotate(1.8deg)' }],
        duration: 3200,
        direction: 'alternate',
        easing: 'ease-in-out',
        iterationStart: 0.5,
    },
    // an engine's shudder (the prototype's)
    rumble: {
        keyframes: [
            { transform: 'translateY(0) scaleY(1)' },
            { transform: 'translateY(-0.9%) scaleY(1.008)', offset: 0.18 },
            { transform: 'translateY(0) scaleY(0.994)', offset: 0.36 },
            { transform: 'translateY(0) scaleY(1)' },
        ],
        duration: 950,
        easing: 'ease-in-out',
    },
    // a gentle up and down
    bob: {
        keyframes: [
            { transform: 'translateY(0%)', easing: 'ease-in-out' },
            { transform: 'translateY(-1.2%)', easing: 'ease-in-out' },
            { transform: 'translateY(0%)' },
        ],
        duration: 1800,
    },
    // a small hop, a squash as it lands, then a pause
    hop: {
        keyframes: [
            { transform: 'translateY(0%) scale(1, 1)', easing: 'ease-out' },
            { transform: 'translateY(-1.8%) scale(0.99, 1.01)', offset: 0.12, easing: 'ease-in' },
            { transform: 'translateY(0%) scale(1.03, 0.97)', offset: 0.24, easing: 'ease-out' },
            { transform: 'translateY(0%) scale(1, 1)', offset: 0.36 },
            { transform: 'translateY(0%) scale(1, 1)' },
        ],
        duration: 1600,
    },
    // a rock side to side from its pivot that dies down, then a rest
    wobble: {
        keyframes: [
            { transform: 'rotate(0deg)', easing: 'ease-out' },
            { transform: 'rotate(-2.5deg)', offset: 0.12, easing: 'ease-in-out' },
            { transform: 'rotate(2.2deg)', offset: 0.32, easing: 'ease-in-out' },
            { transform: 'rotate(-1.3deg)', offset: 0.5, easing: 'ease-in-out' },
            { transform: 'rotate(0.6deg)', offset: 0.64, easing: 'ease-in-out' },
            { transform: 'rotate(0deg)', offset: 0.76 },
            { transform: 'rotate(0deg)' },
        ],
        duration: 2400,
    },
    // a slow drift up and back down, tilting a little on the way
    float: {
        keyframes: [
            { transform: 'translateY(0%) rotate(0deg)', easing: 'ease-in-out' },
            { transform: 'translateY(-2%) rotate(-1.5deg)', easing: 'ease-in-out' },
            { transform: 'translateY(0%) rotate(0deg)' },
        ],
        duration: 3400,
    },
    // a slow swell from the pivot and back
    breathe: {
        keyframes: [
            { transform: 'scale(1)', easing: 'ease-in-out' },
            { transform: 'scale(1.02)', easing: 'ease-in-out' },
            { transform: 'scale(1)' },
        ],
        duration: 3200,
    },
    // a slow turn one way and the other, never a full turn
    spin: {
        keyframes: [
            { transform: 'rotate(0deg)', easing: 'ease-out' },
            { transform: 'rotate(10deg)', offset: 0.25, easing: 'ease-in-out' },
            { transform: 'rotate(-10deg)', offset: 0.75, easing: 'ease-in' },
            { transform: 'rotate(0deg)' },
        ],
        duration: 3500,
    },
};

// The plate's glow (the prototype's glowAnim): its brightness breathes
// from 1 to 1.07 and back, 4.2s each way.
export const GLOW = {
    keyframes: [{ filter: 'brightness(1)' }, { filter: 'brightness(1.07)' }],
    duration: 4200,
    direction: 'alternate',
    easing: 'ease-in-out',
};

// The specks (the prototype's motes): `count` small cream dots (game.css
// .tv-mote), each at a random place in the lower part of the picture
// (left `left.least` + up to `left.range` %, top likewise), fading in to
// `peak` at `peakAt` of the way and out again while it drifts up `rise`
// px (+ up to `range`) and sideways up to half `drift` px either way, in
// `duration` ms (+ up to `range`), linearly, starting after up to `delay`
// ms, again and again. The px are the prototype's, on the TV picture as
// wide as it is on a 360px screen (`width`), scaled with it.
export const MOTES = {
    count: 6,
    left: { least: 18, range: 64 },
    top: { least: 55, range: 35 },
    drift: 30,
    rise: { least: 40, range: 50 },
    duration: { least: 9000, range: 7000 },
    delay: 6000,
    peak: 0.3,
    peakAt: 0.3,
    width: 151.2,
};

const has = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const isPath = (p) => typeof p === 'string' && p.length > 0;

// A word's life from its data entry ({ image, audio, stage, motion, ... }):
// { subject, plate, idle, origin }, or null when the entry has no
// `motion` with both pictures (the still picture shows). `idle` is null
// for a move the table does not have (the subject stays still; the glow
// and the specks still run); `origin` is its pivot's (PIVOTS). The data's
// `win` (BACKLOG B-222) is not read here.
export function lifeOf(entry) {
    const m = entry && typeof entry === 'object' ? entry.motion : null;
    if (!m || typeof m !== 'object' || !isPath(m.subject) || !isPath(m.plate)) return null;
    return {
        subject: m.subject,
        plate: m.plate,
        idle: has(IDLE, m.idle) ? m.idle : null,
        origin: has(PIVOTS, m.pivot) ? PIVOTS[m.pivot] : PIVOTS.center,
    };
}

// The idle move `name` for Element.animate, looped forever: { keyframes,
// options }, or null for none.
export function idleOf(name) {
    if (!has(IDLE, name)) return null;
    const { keyframes, ...timing } = IDLE[name];
    return { keyframes, options: { ...timing, iterations: Infinity } };
}

// The plate's glow for Element.animate, looped forever.
export function glowOf() {
    const { keyframes, ...timing } = GLOW;
    return { keyframes, options: { ...timing, iterations: Infinity } };
}

// MOTES.count specks, each { left, top (% of the picture), dx, dy (px at
// MOTES.width), duration, delay (ms) }, drawn from `rand` (Math.random)
// in the prototype's order.
export function moteSpecs(rand = Math.random) {
    const { count, left, top, drift, rise, duration, delay } = MOTES;
    return Array.from({ length: count }, () => {
        const l = left.least + rand() * left.range;
        const t = top.least + rand() * top.range;
        return {
            left: l,
            top: t,
            dx: (rand() - 0.5) * drift,
            dy: rise.least + rand() * rise.range,
            duration: duration.least + rand() * duration.range,
            delay: rand() * delay,
        };
    });
}

const px = (v) => `${Math.round(v * 100) / 100}px`;

// A speck's drift for Element.animate, on a TV picture `scale` times as
// wide as MOTES.width: { keyframes, options }, looped forever.
export function moteOf(spec, scale = 1) {
    return {
        keyframes: [
            { transform: 'translate(0px, 0px)', opacity: 0 },
            { opacity: MOTES.peak, offset: MOTES.peakAt },
            { transform: `translate(${px(spec.dx * scale)}, ${px(-spec.dy * scale)})`, opacity: 0 },
        ],
        options: { duration: spec.duration, delay: spec.delay, iterations: Infinity, easing: 'linear' },
    };
}

// How much wider the TV picture is (`width` CSS px) than on a 360px
// screen; 1 when it cannot be told.
export function scaleOf(width) {
    return width > 0 ? width / MOTES.width : 1;
}

// --- Render ---

// Render cache: the word the TV shows (round, index and word, as tv.js
// keys it; null off the play screen), its life (lifeOf), whether its
// picture has locked (state.tuned, as last heard), whether its two layers
// have decoded, and whether its life is running. Not game state; nothing
// else reads it.
let shown = { key: null, life: null, tuned: false, ready: false, running: false };

// DOM cache: the TV picture's parts in the template, looked up once (again
// if the page replaced them). Never read to decide game logic.
let dom = null;

function parts() {
    if (dom && dom.card.isConnected) return dom;
    const card = document.querySelector('#screen-play .card');
    if (!card) return null;
    const life = card.querySelector('.tv-life');
    const plate = card.querySelector('.tv-plate');
    const motes = card.querySelector('.tv-motes');
    const actor = card.querySelector('.tv-actor');
    const subject = card.querySelector('.tv-subject');
    if (!life || !plate || !motes || !actor || !subject) return null;
    dom = { card, life, plate, motes, actor, subject };
    return dom;
}

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const entryOf = (data, word) => (has(data, word) ? data[word] : null);

export function renderPicture(state) {
    const { current, round } = state;
    const key = state.screen === 'play' && current.word ? `${state.roundsStarted}:${round.index}:${current.word}` : null;
    if (key !== shown.key) {
        const life = key ? lifeOf(entryOf(state.data, current.word)) : null;
        shown = { key, life, tuned: false, ready: false, running: false };
        const d = parts();
        if (d) {
            halt(d);
            d.card.classList.remove('life-on');
            if (life) load(d, life, key);
        }
        if (key) prefetch(state.data, state.words[round.index + 1]);
    }
    shown.tuned = !!state.tuned;
    sync();
}

// The layers show once the picture has locked and both have decoded, and
// their life runs while they show, unless motion is reduced or the page
// is hidden. Started or stopped only when that changes.
function sync() {
    const d = parts();
    if (!d) return;
    const on = !!(shown.life && shown.tuned && shown.ready);
    d.card.classList.toggle('life-on', on);
    const running = on && !reducedMotion() && !document.hidden;
    if (running === shown.running) return;
    shown.running = running;
    if (running) start(d, shown.life);
    else halt(d);
}

// The word's two layers start loading (its pivot set on the subject's
// box); once both have decoded, they can show (sync). A picture that fails
// leaves the still picture.
function load(d, life, key) {
    if (d.plate.getAttribute('src') !== life.plate) d.plate.src = life.plate;
    if (d.subject.getAttribute('src') !== life.subject) d.subject.src = life.subject;
    d.actor.style.transformOrigin = life.origin;
    Promise.all([d.plate.decode(), d.subject.decode()]).then(() => {
        if (shown.key !== key) return;
        shown.ready = true;
        sync();
    }, () => {});
}

// The next word's layers start loading now, so they are there at its
// lock (as tv.js fetches its picture ahead).
function prefetch(data, next) {
    const life = next ? lifeOf(entryOf(data, next.word)) : null;
    if (!life) return;
    new Image().src = life.plate;
    new Image().src = life.subject;
}

// The life starts: the subject's idle move, the plate's glow, the specks.
function start(d, life) {
    const idle = idleOf(life.idle);
    if (idle) d.actor.animate(idle.keyframes, idle.options);
    const glow = glowOf();
    d.plate.animate(glow.keyframes, glow.options);
    const scale = scaleOf(d.card.clientWidth);
    for (const spec of moteSpecs()) {
        const el = document.createElement('div');
        el.className = 'tv-mote';
        el.style.left = `${spec.left}%`;
        el.style.top = `${spec.top}%`;
        d.motes.appendChild(el);
        const m = moteOf(spec, scale);
        el.animate(m.keyframes, m.options);
    }
}

// Every animation of the life is cancelled (the layers are back at rest)
// and the specks are gone.
function halt(d) {
    d.life.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    d.motes.textContent = '';
}
