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
//   - the win (BACKLOG B-222, DESIGN "Feedback", Correct; the prototype's
//     layer 3 "Win"): when the word is checked correct, once, the TV
//     flashes warm white, sparks burst from it and its subject plays the
//     word's `win` move inside the TV's mask (its idle paused meanwhile and
//     played again after it); the drive blows exhaust puffs, the splash
//     throws drops. A word whose layers are not showing (no `motion`, or
//     not decoded yet) pops its whole picture instead. Reduced motion: the
//     flash and an opacity pulse, no move and no sparks. It is cancelled
//     with the life (a new word, leaving the play screen, a hidden page).
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
// { subject, plate, idle, origin, win }, or null when the entry has no
// `motion` with both pictures (the still picture shows). `idle` is null
// for a move the table does not have (the subject stays still; the glow
// and the specks still run); `origin` is its pivot's (PIVOTS); `win` is
// its win move (WIN, BACKLOG B-222), `pop` for one the table does not
// have.
export function lifeOf(entry) {
    const m = entry && typeof entry === 'object' ? entry.motion : null;
    if (!m || typeof m !== 'object' || !isPath(m.subject) || !isPath(m.plate)) return null;
    return {
        subject: m.subject,
        plate: m.plate,
        idle: has(IDLE, m.idle) ? m.idle : null,
        origin: has(PIVOTS, m.pivot) ? PIVOTS[m.pivot] : PIVOTS.center,
        win: has(WIN, m.win) ? m.win : 'pop',
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

// --- The win (design/reference/tv-motion.html layer 3 "Win"; BACKLOG B-222) ---

// The win moves, one per `win` in the data: keyframes and timing for
// Element.animate, played once on the subject, from the word's pivot (or
// the move's own `pivot`), each ending exactly where it started (a full
// turn counts as where it started). `cheer`, `bungee` and `drive` are the
// prototype's WIN, its keyframes, durations and easing as they are;
// `drive` blurs the subject on its fast part and blows exhaust puffs
// (`fx`). The others are new, in the same spirit, big and silly, 1.2-1.9s;
// a keyframe's `easing` runs from it to the next one that sets the same
// property. A % in translate is of the picture.
export const WIN = {
    // jumps for joy: a squash, a stretch up, a bounce (the prototype's)
    cheer: {
        keyframes: [
            { transform: 'translateY(0) scale(1,1)' },
            { transform: 'translateY(0) scale(0.9,1.1)', offset: 0.06 },
            { transform: 'translateY(-3%) scale(1.14,0.94)', offset: 0.16 },
            { transform: 'translateY(-5%) scale(1,1)', offset: 0.34 },
            { transform: 'translateY(2%) scale(1,1.02)', offset: 0.55 },
            { transform: 'translateY(-2%) scale(1,1)', offset: 0.75 },
            { transform: 'translateY(0) scale(1,1)' },
        ],
        duration: 1900,
        easing: 'ease-in-out',
    },
    // stretches, swings one way and the other on a spring (the prototype's)
    bungee: {
        keyframes: [
            { transform: 'rotate(0) scale(1,1)' },
            { transform: 'rotate(0) scale(0.92,1.18)', offset: 0.14 },
            { transform: 'rotate(-9deg) scale(1.06,0.88)', offset: 0.3 },
            { transform: 'rotate(11deg) scale(0.97,1.08)', offset: 0.46 },
            { transform: 'rotate(-6deg) scale(1.02,0.96)', offset: 0.62 },
            { transform: 'rotate(3deg) scale(1,1.02)', offset: 0.78 },
            { transform: 'rotate(0) scale(1,1)' },
        ],
        duration: 1400,
        easing: 'ease-in-out',
    },
    // drives off one side, blurred, and skids back in from the other (the
    // prototype's), with its exhaust puffs
    drive: {
        keyframes: [
            { transform: 'translateX(0) skewX(0) scale(1,1)', filter: 'none' },
            { transform: 'translateX(4%) skewX(-3deg) scale(1.03,0.96)', filter: 'none', offset: 0.1 },
            { transform: 'translateX(-140%) skewX(12deg) scale(1.04,0.98)', filter: 'blur(2px)', offset: 0.36 },
            { transform: 'translateX(140%) skewX(12deg) scale(1,1)', filter: 'blur(2px)', offset: 0.37 },
            { transform: 'translateX(-7%) skewX(-7deg) scale(1.02,0.97)', filter: 'none', offset: 0.74 },
            { transform: 'translateX(2%) skewX(2deg) scale(1,1)', filter: 'none', offset: 0.87 },
            { transform: 'translateX(0) skewX(0) scale(1,1)', filter: 'none' },
        ],
        duration: 1500,
        easing: 'ease-in-out',
        fx: 'exhaust',
    },
    // a crouch, a high hop with one full turn in the air, a squash on
    // landing. The hop, the turn and the squash are the separate
    // `translate`, `rotate` and `scale` properties, each with its own
    // keyframes, so the turn ends before the landing. It turns about the
    // picture's middle (`pivot`); each squash is shifted down by what it
    // lifts a subject standing on the bottom pivot (88%), so its feet stay
    // on the ground ((1 - scaleY) * 38%).
    'hop-spin': {
        keyframes: [
            { offset: 0, translate: '0% 0%', rotate: '0deg', scale: '1 1', easing: 'ease-out' },
            { offset: 0.1, translate: '0% 4.6%', scale: '1.12 0.88', easing: 'ease-in' },
            { offset: 0.18, rotate: '0deg', easing: 'ease-in-out' },
            { offset: 0.2, translate: '0% -12%', scale: '0.9 1.12', easing: 'ease-out' },
            { offset: 0.36, scale: '1 1' },
            { offset: 0.44, translate: '0% -30%', easing: 'ease-in' },
            { offset: 0.58, scale: '1 1', easing: 'ease-in' },
            { offset: 0.62, rotate: '360deg' },
            { offset: 0.66, translate: '0% 6.1%', scale: '1.16 0.84', easing: 'ease-out' },
            { offset: 0.8, translate: '0% -1.9%', scale: '0.96 1.05', easing: 'ease-in-out' },
            { offset: 0.9, translate: '0% 0.8%', scale: '1.02 0.98', easing: 'ease-out' },
            { offset: 1, translate: '0% 0%', rotate: '360deg', scale: '1 1' },
        ],
        duration: 1600,
        pivot: 'center',
    },
    // wobbles, topples over to one side from its base, lies there a
    // moment, springs back up past upright and settles
    'wobble-flop': {
        keyframes: [
            { transform: 'rotate(0deg)', easing: 'ease-in-out' },
            { transform: 'rotate(-8deg)', offset: 0.08, easing: 'ease-in-out' },
            { transform: 'rotate(9deg)', offset: 0.18, easing: 'ease-in-out' },
            { transform: 'rotate(-5deg)', offset: 0.27, easing: 'ease-in' },
            { transform: 'rotate(-84deg)', offset: 0.42, easing: 'ease-out' },
            { transform: 'rotate(-74deg)', offset: 0.48, easing: 'ease-in' },
            { transform: 'rotate(-82deg)', offset: 0.54, easing: 'ease-in-out' },
            { transform: 'rotate(-82deg)', offset: 0.66, easing: 'ease-out' },
            { transform: 'rotate(14deg)', offset: 0.78, easing: 'ease-in-out' },
            { transform: 'rotate(-6deg)', offset: 0.88, easing: 'ease-in-out' },
            { transform: 'rotate(2deg)', offset: 0.95, easing: 'ease-in-out' },
            { transform: 'rotate(0deg)' },
        ],
        duration: 1800,
    },
    // dips, leaps up in an arc (tilting up as it rises, down as it falls)
    // and splashes back in, throwing teal and cream drops as it leaves
    // and as it lands
    splash: {
        keyframes: [
            { transform: 'translate(0%, 0%) rotate(0deg) scale(1, 1)', easing: 'ease-in-out' },
            { transform: 'translate(0%, 7%) rotate(0deg) scale(1.1, 0.9)', offset: 0.14, easing: 'ease-in' },
            { transform: 'translate(2%, -16%) rotate(-14deg) scale(0.92, 1.1)', offset: 0.26, easing: 'ease-out' },
            { transform: 'translate(5%, -34%) rotate(-2deg) scale(1, 1)', offset: 0.44, easing: 'ease-in' },
            { transform: 'translate(4%, -16%) rotate(16deg) scale(0.95, 1.06)', offset: 0.6 },
            { transform: 'translate(0%, 6%) rotate(3deg) scale(1.12, 0.88)', offset: 0.74, easing: 'ease-out' },
            { transform: 'translate(0%, -3%) rotate(-2deg) scale(0.97, 1.03)', offset: 0.86, easing: 'ease-in-out' },
            { transform: 'translate(0%, 0%) rotate(0deg) scale(1, 1)' },
        ],
        duration: 1700,
        fx: 'drops',
    },
    // a squash, a big bouncy pop to 1.25, and settles (also the whole
    // picture's, for a word without `motion`)
    pop: {
        keyframes: [
            { transform: 'scale(1, 1)', easing: 'ease-out' },
            { transform: 'scale(1.12, 0.86)', offset: 0.12, easing: 'ease-out' },
            { transform: 'scale(1.25, 1.25)', offset: 0.32, easing: 'ease-in-out' },
            { transform: 'scale(0.92, 0.94)', offset: 0.5, easing: 'ease-in-out' },
            { transform: 'scale(1.09, 1.07)', offset: 0.66, easing: 'ease-in-out' },
            { transform: 'scale(0.97, 0.98)', offset: 0.8, easing: 'ease-in-out' },
            { transform: 'scale(1.02, 1.01)', offset: 0.9, easing: 'ease-out' },
            { transform: 'scale(1, 1)' },
        ],
        duration: 1200,
    },
    // a crouch, then it shoots off the top, stretched and blurred; a beat
    // (about 350ms) with the TV empty; it drops back in from above and
    // lands squashed
    zoom: {
        keyframes: [
            { transform: 'translateY(0%) scale(1, 1)', filter: 'none', easing: 'ease-in-out' },
            { transform: 'translateY(5%) scale(1.12, 0.86)', filter: 'none', offset: 0.12, easing: 'ease-in' },
            { transform: 'translateY(-110%) scale(0.85, 1.3)', filter: 'blur(3px)', offset: 0.28 },
            { transform: 'translateY(-110%) scale(0.85, 1.3)', filter: 'blur(3px)', offset: 0.38, easing: 'ease-in' },
            { transform: 'translateY(4%) scale(1.14, 0.84)', filter: 'none', offset: 0.66, easing: 'ease-out' },
            { transform: 'translateY(-5%) scale(0.95, 1.06)', filter: 'none', offset: 0.78, easing: 'ease-in-out' },
            { transform: 'translateY(1%) scale(1.03, 0.97)', filter: 'none', offset: 0.9, easing: 'ease-out' },
            { transform: 'translateY(0%) scale(1, 1)', filter: 'none' },
        ],
        duration: 1500,
    },
};

// The win move `name` for Element.animate, played once: { keyframes,
// options, origin (its own pivot's transform-origin, else null: the
// word's), fx (its puffs or drops, else null) }, or null for none.
export function winOf(name) {
    if (!has(WIN, name)) return null;
    const { keyframes, pivot, fx, ...timing } = WIN[name];
    return { keyframes, options: timing, origin: pivot ? PIVOTS[pivot] : null, fx: fx || null };
}

// The drive's exhaust puffs (the prototype's puff calls in its
// celebrate): each at x, y (of the picture), drifting dx, dy and `size`
// wide (of the picture's width), over `duration` after `delay` ms. The
// first two blow from the exhaust as it drives off; the last two, at 72%
// and 76% of the move (1500ms), from the front as it skids back in.
export const EXHAUST = [
    { x: 0.86, y: 0.84, dx: 0.1, dy: -0.03, size: 0.06, duration: 900, delay: 80 },
    { x: 0.92, y: 0.8, dx: 0.14, dy: -0.06, size: 0.05, duration: 1000, delay: 160 },
    { x: 0.3, y: 0.86, dx: 0.1, dy: -0.04, size: 0.06, duration: 900, delay: 1080 },
    { x: 0.22, y: 0.84, dx: 0.06, dy: -0.06, size: 0.05, duration: 900, delay: 1140 },
];

// The splash's drops: a burst of `count` at each `at` of the move (as it
// leaps out, as it splashes back in), from the water line (`y`, x in
// `x.least` + up to `x.range`, of the picture), each `size` wide (of the
// picture's width), flying up `rise` and out `spread` (away from the
// middle) and falling back, over `duration` ms; teal and cream in turn.
export const DROPS = {
    bursts: [{ at: 0.16, count: 8 }, { at: 0.74, count: 6 }],
    x: { least: 0.3, range: 0.4 },
    y: 0.82,
    rise: { least: 0.1, range: 0.16 },
    spread: { least: 0.06, range: 0.16 },
    size: { least: 0.026, range: 0.016 },
    duration: { least: 550, range: 300 },
    colours: ['teal', 'cream'],
};

// The drops of a splash `duration` ms long, each { x, y, dx, rise, size
// (of the picture), duration, delay (ms), colour }, drawn from `rand`.
export function dropSpecs(duration, rand = Math.random) {
    const { bursts, x, y, rise, spread, size, colours } = DROPS;
    const out = [];
    for (const burst of bursts) {
        for (let i = 0; i < burst.count; i++) {
            const at = x.least + rand() * x.range;
            out.push({
                x: at,
                y,
                dx: (at < 0.5 ? -1 : 1) * (spread.least + rand() * spread.range),
                rise: rise.least + rand() * rise.range,
                size: size.least + rand() * size.range,
                duration: DROPS.duration.least + rand() * DROPS.duration.range,
                delay: burst.at * duration,
                colour: colours[out.length % colours.length],
            });
        }
    }
    return out;
}

// A puff (EXHAUST) on a picture `w` px wide, as the prototype's puff():
// { className, left, top, size, keyframes, options }.
export function puffOf(spec, w) {
    return {
        className: 'tv-puff',
        left: `${spec.x * 100}%`,
        top: `${spec.y * 100}%`,
        size: px(spec.size * w),
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.95, offset: 0.2 },
            { transform: `translate(calc(-50% + ${px(spec.dx * w)}), calc(-50% + ${px(spec.dy * w)})) scale(1.5)`, opacity: 0 },
        ],
        options: { duration: spec.duration, delay: spec.delay, easing: 'ease-out', fill: 'both' },
    };
}

// A drop (dropSpecs) on a picture `w` px wide: it pops up out of the
// water, rises (easing out), falls back past where it started (easing in)
// and fades: { className, left, top, size, keyframes, options }.
export function dropOf(spec, w) {
    const dx = spec.dx * w;
    const rise = spec.rise * w;
    return {
        className: `tv-drop ${spec.colour}`,
        left: `${spec.x * 100}%`,
        top: `${spec.y * 100}%`,
        size: px(spec.size * w),
        keyframes: [
            { offset: 0, transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0, easing: 'ease-out' },
            { offset: 0.15, opacity: 1 },
            { offset: 0.45, transform: `translate(calc(-50% + ${px(dx / 2)}), calc(-50% - ${px(rise)})) scale(1)`, easing: 'ease-in' },
            { offset: 0.7, opacity: 1 },
            { offset: 1, transform: `translate(calc(-50% + ${px(dx)}), calc(-50% + ${px(rise * 0.2)})) scale(0.7)`, opacity: 0 },
        ],
        options: { duration: spec.duration, delay: spec.delay, fill: 'both' },
    };
}

// The pieces a win move's `fx` throws on a picture `w` px wide, `duration`
// ms long: the drive's puffs, the splash's drops, or none.
export function fxOf(fx, duration, w, rand = Math.random) {
    if (fx === 'exhaust') return EXHAUST.map((s) => puffOf(s, w));
    if (fx === 'drops') return dropSpecs(duration, rand).map((s) => dropOf(s, w));
    return [];
}

// The TV's warm flash (.tv-flash, as it was in celebrate.js until B-222):
// from 0.9 to nothing in 200ms, easing out (GSAP's power2.out). It is a
// fade, so reduced motion keeps it.
export const FLASH = {
    keyframes: [{ opacity: 0.9 }, { opacity: 0 }],
    duration: 200,
    easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
};

// Reduced motion's win (the prototype's): the picture's opacity dips to
// 0.7 and back in 400ms.
export const PULSE = {
    keyframes: [{ opacity: 1 }, { opacity: 0.7 }, { opacity: 1 }],
    duration: 400,
};

// The sparks (as they were in celebrate.js until B-222; game.css
// .confetti-piece, its colour roles amber, teal glow and cream): `count`
// pieces start in the middle half of the TV picture and fly out past its
// edge, evenly spread (with a little jitter), drifting down a little,
// turning, over `duration` ms, easing out (GSAP's power2.out); each fades
// out over the last 40% (`fadeAt`), easing in (power1.in).
export const SPARKS = {
    count: 40,
    duration: 600,
    easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
    fadeAt: 0.6,
    fadeEasing: 'cubic-bezier(0.11, 0, 0.5, 0)',
    colours: ['accent', 'primary', 'error'],
};

// The sparks from a TV picture at `rect` ({ left, top, width, height },
// page px), each { x0, y0, x1, y1 (px), turn0, turn1 (deg), scale,
// colour }, drawn from `rand` in celebrate.js's order.
export function sparkSpecs(rect, rand = Math.random) {
    const between = (min, max) => min + rand() * (max - min);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Array.from({ length: SPARKS.count }, (_, i) => {
        const angle = (i / SPARKS.count) * Math.PI * 2 + between(-0.3, 0.3);
        const dist = between(rect.width * 0.55, rect.width * 1.1);
        const x0 = cx + between(-rect.width / 4, rect.width / 4);
        const y0 = cy + between(-rect.height / 4, rect.height / 4);
        const turn0 = between(0, 360);
        const scale = between(0.7, 1.2);
        const y1 = y0 + Math.sin(angle) * dist + between(10, 40);
        const turn1 = turn0 + between(90, 360);
        return { x0, y0, x1: x0 + Math.cos(angle) * dist, y1, turn0, turn1, scale, colour: SPARKS.colours[i % SPARKS.colours.length] };
    });
}

const deg = (v) => `${Math.round(v * 100) / 100}deg`;

// A spark's flight for Element.animate: { keyframes, options }; it stays
// faded out at its end until its layer goes.
export function sparkOf(spec) {
    const at = (x, y, turn) => `translate(${px(x)}, ${px(y)}) rotate(${deg(turn)}) scale(${Math.round(spec.scale * 1000) / 1000})`;
    return {
        keyframes: [
            { offset: 0, transform: at(spec.x0, spec.y0, spec.turn0), opacity: 1, easing: SPARKS.easing },
            { offset: SPARKS.fadeAt, opacity: 1, easing: SPARKS.fadeEasing },
            { offset: 1, transform: at(spec.x1, spec.y1, spec.turn1), opacity: 0 },
        ],
        options: { duration: SPARKS.duration, fill: 'forwards' },
    };
}

// --- Render ---

// Render cache: the word the TV shows (round, index and word, as tv.js
// keys it; null off the play screen), its life (lifeOf), whether its
// picture has locked (state.tuned, as last heard), whether its two layers
// have decoded, whether its life is running, and whether its win has
// played (once a word, BACKLOG B-222). Not game state; nothing else reads
// it.
let shown = { key: null, life: null, tuned: false, ready: false, running: false, won: false };

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
    const fx = card.querySelector('.tv-fx');
    const still = card.querySelector('#play-image');
    const flash = card.querySelector('.tv-flash');
    if (!life || !plate || !motes || !actor || !subject || !fx || !still || !flash) return null;
    dom = { card, life, plate, motes, actor, subject, fx, still, flash };
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
        shown = { key, life, tuned: false, ready: false, running: false, won: false };
        const d = parts();
        if (d) {
            halt(d);
            stopWin(d);
            d.card.classList.remove('life-on');
            if (life) load(d, life, key);
        }
        if (key) prefetch(state.data, state.words[round.index + 1]);
    }
    shown.tuned = !!state.tuned;
    sync();
    // the word just checked correct: its win, once (BACKLOG B-222)
    if (key && current.status === 'correct' && !shown.won) {
        shown.won = true;
        const d = parts();
        if (d) win(d);
    }
    // a hidden page: the win's flash, pop and sparks stop too (sync has
    // stopped the life, the subject's move with it)
    if (document.hidden) {
        const d = parts();
        if (d) stopWin(d);
    }
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

// Every animation of the life is cancelled (the layers are back at rest;
// a win move on the subject, its puffs and drops too) and the specks and
// the puffs or drops are gone.
function halt(d) {
    d.life.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    d.motes.textContent = '';
    d.fx.textContent = '';
}

// --- Render: the win (BACKLOG B-222) ---

// The word's win, as it is checked correct: the TV's warm flash; then, on
// the layers (when they show), the subject's win move from its pivot
// (WIN), its idle paused until the move ends and then played on, with
// the move's puffs or drops; with no layers showing (a word without
// `motion`, or its layers not decoded or the picture not locked yet), the
// whole picture's pop; and the sparks from the TV. Reduced motion: the
// flash and the picture's opacity pulse (PULSE), no move and no sparks.
function win(d) {
    const layers = !!(shown.life && shown.tuned && shown.ready);
    d.flash.animate(FLASH.keyframes, { duration: FLASH.duration, easing: FLASH.easing });
    const target = layers ? d.subject : d.still;
    if (reducedMotion()) {
        target.animate(PULSE.keyframes, { duration: PULSE.duration });
        return;
    }
    const move = winOf(layers ? shown.life.win : 'pop');
    if (layers) {
        d.subject.style.transformOrigin = move.origin || shown.life.origin;
        const idle = d.actor.getAnimations();
        idle.forEach((a) => a.pause());
        d.subject.animate(move.keyframes, move.options).finished
            .then(() => idle.forEach((a) => a.play()), () => {});
        throwFx(d, fxOf(move.fx, move.options.duration, d.card.clientWidth));
    } else {
        d.still.animate(move.keyframes, move.options);
    }
    sparks(d.card);
}

// The move's puffs or drops, in .tv-fx over the subject (inside the TV's
// mask); each goes when its flight ends.
function throwFx(d, pieces) {
    for (const p of pieces) {
        const el = document.createElement('div');
        el.className = p.className;
        el.style.left = p.left;
        el.style.top = p.top;
        el.style.width = p.size;
        el.style.height = p.size;
        d.fx.appendChild(el);
        el.animate(p.keyframes, p.options).finished.then(() => el.remove(), () => {});
    }
}

// The sparks fly from the TV picture over the page, in a fixed,
// click-through layer on <body> (game.css .confetti) that goes when the
// last one lands.
function sparks(card) {
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const flights = sparkSpecs(card.getBoundingClientRect()).map((s) => {
        const el = document.createElement('span');
        el.className = `confetti-piece ${s.colour}`;
        layer.appendChild(el);
        const m = sparkOf(s);
        return el.animate(m.keyframes, m.options).finished;
    });
    Promise.all(flights).then(() => layer.remove(), () => {});
}

// The win's parts outside the life stop (halt stops the subject's move
// and its puffs or drops): the flash, the whole picture's pop, the sparks.
function stopWin(d) {
    d.still.getAnimations().forEach((a) => a.cancel());
    d.flash.getAnimations().forEach((a) => a.cancel());
    document.querySelectorAll('.confetti').forEach((layer) => {
        layer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        layer.remove();
    });
}
