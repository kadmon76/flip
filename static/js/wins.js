// wins.js — each word's own win on a correct word (BACKLOG B-228): the pure
// part. A theme's wins are read-only content, static/data/wins/<theme>.json
// (`ms`, and per word `pivot`, `peak`, optional `clip`, `frame`, `parts`,
// `shake`, and `subject`, `fx`, `sfx`; its `story` is for people, never
// shown), approved by the human on the Word Win Preview page; main.js
// fetches the round's theme's file with its data file (winsUrl) into
// state.wins. The reference player is design/reference/word-wins.html: its
// engine (`play()`, the `FX` particle kinds and their drawn `SHAPES`) is
// the spec, and this module turns a word's win into what picture.js plays,
// as the reference plays it:
//   - wordWin reads a word's win from the file (null: the word has none,
//     and B-227's shared win plays);
//   - drawingsOf names the drawings it shows (`<word>-body.webp` and one
//     per part for a word with parts, else its cutout; `<word>-win.webp`
//     for a word with a `frame`), beside its cutout;
//   - subjectFrames, partFrames, frameFrames and shakeFrames are the
//     keyframe lists of the subject's track, a part's, the frame swaps and
//     a jolt of the TV picture, as the reference's play() builds them;
//   - FX (one function per particle kind) and fxPieces give the particles a
//     win's `fx` throws, each { shape, x, y, scale, keyframes, options }, and
//     shapeBox where its drawn SHAPES sits on the TV picture, as the
//     reference's shape().
// The sounds (`sfx`) are made in code in audio.js (SFX, winSounds).
// No DOM, no module state; a Django test runs it through node with the real
// animals.json and against the reference's own code.

// --- The data ---

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isObj(o) && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => typeof v === 'string' && v.length > 0;

// The wins file of a theme whose data file is at `dataUrl`: `wins/` beside
// it, under the same name (/static/data/animals.json ->
// /static/data/wins/animals.json); null for no data file.
export function winsUrl(dataUrl) {
    if (!str(dataUrl)) return null;
    const cut = dataUrl.lastIndexOf('/') + 1;
    return `${dataUrl.slice(0, cut)}wins/${dataUrl.slice(cut)}`;
}

// A track: [[t, transform, extra?], ...], t from 0 to 1 (the data's
// seconds of a 1 s win) in order.
function isTrack(kf) {
    if (!Array.isArray(kf) || kf.length < 2) return false;
    if (!kf.every((k) => Array.isArray(k) && num(k[0]) && str(k[1]))) return false;
    if (kf[0][0] !== 0 || kf[kf.length - 1][0] !== 1) return false;
    return kf.every((k, i) => i === 0 || k[0] >= kf[i - 1][0]);
}

// A part: its drawing's `name` (a file name's part), its `pivot` (a CSS
// transform-origin) and its track `kf`, a step's third value its opacity.
function isPart(p) {
    return isObj(p) && str(p.name) && /^[a-z0-9-]+$/.test(p.name) && str(p.pivot) && isTrack(p.kf)
        && p.kf.every((k) => k[2] === undefined || num(k[2]));
}

// Word `word`'s win in wins file `file`: { ms (the file's, the length of a
// win in ms, or null), pivot, peak (s), clip, subject, parts, frame (or
// null), shake, fx, sfx }, or null when the file has none for it or its
// win cannot be played (no pivot, peak or subject track). Parts, frame
// swaps, jolts and particles the player cannot read are left out (a
// particle kind FX does not have too); the sounds are audio.js's to read.
export function wordWin(file, word) {
    if (!isObj(file) || !has(file.words, word)) return null;
    const w = file.words[word];
    if (!isObj(w) || !str(w.pivot) || !num(w.peak) || !isTrack(w.subject)) return null;
    const list = (v) => (Array.isArray(v) ? v : []);
    return {
        ms: num(file.ms) && file.ms > 0 ? file.ms : null,
        pivot: w.pivot,
        peak: w.peak,
        clip: w.clip === true,
        subject: w.subject,
        parts: list(w.parts).filter(isPart),
        frame: Array.isArray(w.frame)
            ? w.frame.filter((f) => Array.isArray(f) && num(f[0]) && (f[1] === 'win' || f[1] === 'rest'))
            : null,
        shake: list(w.shake).filter((s) => Array.isArray(s) && num(s[0]) && num(s[1])),
        fx: list(w.fx).filter((f) => Array.isArray(f) && has(FX, f[0]) && isObj(f[1]) && num(f[1].at)),
        sfx: list(w.sfx).filter((s) => Array.isArray(s) && str(s[0]) && num(s[1])),
    };
}

// The drawings word `word`'s win `win` shows, beside its cutout `subject`
// (its data's motion.subject, in the same folder): { rest (the drawing at
// rest: `<word>-body.webp` for a word with parts, else the cutout), parts:
// [{ name, src (`<word>-<name>.webp`), pivot, fixed, opacity (its first
// step's, or undefined) }], frame (`<word>-win.webp` for a word with frame
// swaps, else null) }, as the reference's setWord; null for none.
export function drawingsOf(word, win, subject) {
    if (!win || !str(word) || !str(subject)) return null;
    const dir = subject.slice(0, subject.lastIndexOf('/') + 1);
    const file = (name) => `${dir}${word}-${name}.webp`;
    return {
        rest: win.parts.length ? file('body') : subject,
        parts: win.parts.map((p) => ({ name: p.name, src: file(p.name), pivot: p.pivot, fixed: p.fixed === true, opacity: p.kf[0][2] })),
        frame: win.frame ? file('win') : null,
    };
}

// Every drawing of drawingsOf's `look`, the rest drawing first.
export function drawingUrls(look) {
    if (!look) return [];
    return [look.rest, ...look.parts.map((p) => p.src), look.frame].filter(Boolean);
}

// --- The tracks (the reference's play()) ---

// The subject's track for Element.animate over the win, from its pivot:
// each step eases out to the next, with its `extra` properties (filter,
// opacity).
export function subjectFrames(win) {
    return win.subject.map(([t, tf, extra]) => ({ offset: t, transform: tf, easing: 'ease-out', ...(isObj(extra) ? extra : {}) }));
}

// A part's track, from its own pivot: eased in and out, or stepped where
// the step sets the part's opacity.
export function partFrames(part) {
    return part.kf.map(([t, tf, op]) => ({
        offset: t,
        transform: tf,
        ...(op === undefined ? {} : { opacity: op }),
        easing: op === undefined ? 'ease-in-out' : 'step-end',
    }));
}

// The frame swaps, stepped: the opacity of the win drawing (`on` true) or
// of the rest drawing (false), each shown in turn as `frame` says.
export function frameFrames(frame, on) {
    return [
        { offset: 0, opacity: on ? 0 : 1, easing: 'step-end' },
        ...frame.map(([t, f]) => ({ offset: t, opacity: (f === 'win') === on ? 1 : 0, easing: 'step-end' })),
        { offset: 1, opacity: on ? 0 : 1 },
    ];
}

// A jolt of the TV picture lasts SHAKE_MS (the reference's 220ms).
export const SHAKE_MS = 220;

// A jolt of `px` (game px, the reference's) on a TV picture `u` times as
// wide as on a 360px screen, as the CSS `translate` property (the
// reference's translates): there and back, then a smaller one. `sign` -1
// gives the opposite moves (picture.js holds a subject that left the
// screen still with them, as the reference's, which is not in its TV).
export function shakeFrames(px, u = 1, sign = 1) {
    const at = (x, y) => `${x * sign}px ${y * sign}px`;
    return [
        { translate: 'none' },
        { translate: at(px * u, -px * u * 0.5) },
        { translate: at(-px * u, px * u * 0.5) },
        { translate: at(px * 0.5 * u, 0) },
        { translate: 'none' },
    ];
}

// --- The particles (the reference's FX and SHAPES) ---

// Their outline, the game's --ink.
const INK = '#2a1c10';

// Each particle's drawing: [width, height (in game px at 360), its SVG
// markup], the reference's own, colours and all (DECISIONS 2026-10-28).
export const SHAPES = {
    puff: [40, 32, `<g fill="#e9e2d2" stroke="${INK}" stroke-width="1.6"><circle cx="14" cy="18" r="8"/><circle cx="24" cy="12" r="9"/><circle cx="31" cy="20" r="7"/><circle cx="20" cy="22" r="7"/></g>`],
    dust: [30, 20, `<g fill="#c8a978" stroke="${INK}" stroke-width="1.3"><circle cx="9" cy="12" r="6"/><circle cx="17" cy="9" r="7"/><circle cx="23" cy="13" r="5"/></g>`],
    feather: [20, 15, `<path d="M3 13 C7 4 15 1 19 3 C17 8 11 13 3 13 Z" fill="#f4ecdc" stroke="${INK}" stroke-width="1.3"/><path d="M4 12 L16 4" stroke="${INK}" stroke-width="1"/>`],
    spark: [16, 16, `<path d="M8 0 L10 6 L16 8 L10 10 L8 16 L6 10 L0 8 L6 6 Z" fill="#ffd36a" stroke="${INK}" stroke-width="1"/>`],
    star: [14, 14, `<path d="M7 0 L8.8 4.6 L14 5 L10 8.2 L11.3 13.4 L7 10.6 L2.7 13.4 L4 8.2 L0 5 L5.2 4.6 Z" fill="#ffe27a" stroke="${INK}" stroke-width="1"/>`],
    drop: [10, 14, `<path d="M5 1 C8 6 9 8 9 10 A4 4 0 0 1 1 10 C1 8 2 6 5 1 Z" fill="#8fd3e0" stroke="${INK}" stroke-width="1.1"/>`],
    greendrop: [10, 14, `<path d="M5 1 C8 6 9 8 9 10 A4 4 0 0 1 1 10 C1 8 2 6 5 1 Z" fill="#9cc46a" stroke="${INK}" stroke-width="1.1"/>`],
    clang: [40, 24, `<g stroke="${INK}" stroke-width="2.2" stroke-linecap="round"><path d="M20 2 L20 9"/><path d="M8 6 L12 11"/><path d="M32 6 L28 11"/><path d="M2 15 L9 15"/><path d="M38 15 L31 15"/></g>`],
    ink: [40, 32, `<g fill="#3a2440" stroke="${INK}" stroke-width="1.6"><circle cx="14" cy="18" r="8"/><circle cx="24" cy="12" r="9"/><circle cx="31" cy="20" r="7"/><circle cx="20" cy="22" r="7"/></g>`],
    moon: [36, 36, `<circle cx="18" cy="18" r="15" fill="#f3e6b8" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="14" r="3" fill="#e2cf92"/><circle cx="22" cy="23" r="4" fill="#e2cf92"/><circle cx="23" cy="11" r="2" fill="#e2cf92"/>`],
    tangle: [40, 30, `<path d="M3 20 C 9 3, 25 3, 21 16 C 17 28, 5 22, 13 12 C 21 2, 33 8, 37 22" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`],
    bubble: [14, 14, `<circle cx="7" cy="7" r="5.6" fill="rgba(220,245,250,.35)" stroke="${INK}" stroke-width="1.1"/><path d="M4.5 5 A3 3 0 0 1 7 3.2" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`],
    rings: [40, 40, `<g fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"><path d="M14 12 A10 10 0 0 1 14 28"/><path d="M21 7 A16 16 0 0 1 21 33"/><path d="M28 2 A22 22 0 0 1 28 38"/></g>`],
    swoosh: [36, 18, `<path d="M2 14 C12 2 26 2 34 10" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 4"/>`],
};

// The TV picture on a 360px screen (game px): what a shape's size and
// place are measured against, as in the reference.
export const TV = { width: 151.2, height: 110 };

// Where shape `name` sits on the TV picture, `scale` times its size,
// centred on x%, y% of it: its SVG `viewBox` and its `width`, `left` and
// `top` (CSS, in % of the picture), as the reference's shape().
export function shapeBox(name, x, y, scale = 1) {
    const [w, h] = SHAPES[name];
    const ww = w * scale / TV.width * 100;
    return {
        viewBox: `0 0 ${w} ${h}`,
        width: ww + '%',
        left: `calc(${x}% - ${ww / 2}%)`,
        top: `calc(${y}% - ${h * scale / TV.height * 50}%)`,
    };
}

const piece = (shape, x, y, scale, keyframes, options) => ({ shape, x, y, scale, keyframes, options });

// The particle kinds, as the reference's FX: kind(spec, u) -> the pieces
// it throws, each a SHAPES drawing at x, y (% of the TV picture) and
// `scale`, with its keyframes and timing (`at` and `dur` in s; its px
// scaled by `u`, the TV picture's width over TV.width, where the
// reference scales them).
export const FX = {
    puff({ at, x, y, s = 1, grow = 1.6, dur = 0.55 }, u = 1) {
        return [piece('puff', x, y, s, [
            { transform: 'scale(.2)', opacity: 0, easing: 'ease-out' },
            { transform: 'scale(1)', opacity: 1, offset: 0.2, easing: 'ease-out' },
            { transform: `translateY(${-38 * u}px) scale(${grow})`, opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    dust({ at, x, y, dir = 1, dur = 0.45 }, u = 1) {
        return [0, 1].map((k) => piece('dust', x + k * dir * 8, y, 0.9 - k * 0.2, [
            { transform: 'scale(.3)', opacity: 0, easing: 'ease-out' },
            { transform: 'scale(1)', opacity: 1, offset: 0.25, easing: 'ease-out' },
            { transform: `translate(${-dir * (24 + k * 14) * u}px, ${-8 * u}px) scale(1.4)`, opacity: 0 },
        ], { duration: dur * 1000, delay: (at + k * 0.05) * 1000, fill: 'both' }));
    },
    feathers({ at, n = 6, x = 50, y = 28, dur = 0.7 }, u = 1) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const r = (k) => ((Math.sin((i + 1) * k * 12.9898) * 43758.5453) % 1 + 1) % 1;
            const dx = ((i / (n - 1)) - 0.5) * 170 * u * (0.7 + 0.6 * r(3)), up = -70 * u * (0.5 + 0.9 * r(1)), down = 40 * u * (0.4 + 1.2 * r(2));
            const rot = (i % 2 ? 1 : -1) * (30 + 140 * r(4)), sz = 0.9 + 0.7 * r(5);
            out.push(piece('feather', x - 4 + (i % 3) * 4, y + (i % 2) * 10, 1, [
                { transform: 'translate(0,0) scale(.4)', opacity: 0, easing: 'ease-out' },
                { transform: `translate(${dx * 0.6}px, ${up}px) rotate(${rot}deg) scale(${sz})`, opacity: 1, offset: 0.25 },
                { transform: `translate(${dx * 0.85}px, ${up * 0.4}px) rotate(${-rot / 2}deg) scale(${sz})`, opacity: 1, offset: 0.6 },
                { transform: `translate(${dx}px, ${down}px) rotate(${rot / 3}deg) scale(${sz * 0.9})`, opacity: 0 },
            ], { duration: dur * 1000, delay: at * 1000, fill: 'both' }));
        }
        return out;
    },
    sparks({ at, n = 8, big = true }, u = 1) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + 0.3, r = (big ? 120 : 85) * u;
            out.push(piece('spark', 50, 50, 1, [
                { transform: 'translate(0,0) scale(.3)', opacity: 0 },
                { transform: 'translate(0,0) scale(.6)', opacity: 1, offset: 0.1, easing: 'cubic-bezier(.2,.7,.3,1)' },
                { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r * 0.8}px) scale(1) rotate(90deg)`, opacity: 1, offset: 0.7 },
                { transform: `translate(${Math.cos(a) * r * 1.1}px, ${Math.sin(a) * r * 0.9 + 10}px) scale(.4) rotate(140deg)`, opacity: 0 },
            ], { duration: 650, delay: at * 1000, fill: 'both' }));
        }
        return out;
    },
    stars({ at, x, y, n = 4, dur = 0.5, r = 22 }, u = 1) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            out.push(piece('star', x, y, 1, [
                { transform: 'scale(0)', opacity: 0 },
                { transform: `translate(${Math.cos(a) * r * u}px, ${Math.sin(a) * r * 0.5 * u}px) scale(1)`, opacity: 1, offset: 0.2 },
                { transform: `translate(${Math.cos(a + 2) * r * u}px, ${Math.sin(a + 2) * r * 0.5 * u}px) scale(1)`, opacity: 1, offset: 0.7 },
                { transform: `translate(${Math.cos(a + 3) * r * u}px, ${Math.sin(a + 3) * r * 0.5 * u}px) scale(.6)`, opacity: 0 },
            ], { duration: dur * 1000, delay: at * 1000, fill: 'both' }));
        }
        return out;
    },
    drops({ at, x, y, n = 6, green = false, dur = 0.5, spread = 60 }, u = 1) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const dx = ((i / (n - 1)) - 0.5) * spread * 2 * u, up = -(30 + (i % 3) * 14) * u;
            out.push(piece(green ? 'greendrop' : 'drop', x, y, 1, [
                { transform: 'translate(0,0) scale(.4)', opacity: 0, easing: 'ease-out' },
                { transform: `translate(${dx * 0.6}px, ${up}px) scale(1)`, opacity: 1, offset: 0.4, easing: 'ease-in' },
                { transform: `translate(${dx}px, ${-up * 0.4}px) scale(.8)`, opacity: 0 },
            ], { duration: dur * 1000, delay: at * 1000, fill: 'both' }));
        }
        return out;
    },
    clang({ at, x, y, dur = 0.35 }) {
        return [piece('clang', x, y, 1.2, [
            { transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'scale(1.2)', opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    tangle({ at, x, y, dur = 0.34 }) {
        return [piece('tangle', x, y, 1.3, [
            { transform: 'scale(.3) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.05) rotate(20deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(.4) rotate(90deg)', opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    // its rise's last px is not scaled, as the reference's
    ink({ at, x, y, s = 1.6, dur = 0.55 }) {
        return [piece('ink', x, y, s, [
            { transform: 'scale(.2)', opacity: 0, easing: 'ease-out' }, { transform: 'scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'scale(1.2)', opacity: 0.9, offset: 0.6 }, { transform: 'translateY(-10px) scale(1.5)', opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    // it comes up from 30px below, not scaled, as the reference's
    moon({ at, x, y, dur = 0.65 }, u = 1) {
        return [piece('moon', x, y, 1.4, [
            { transform: 'translateY(30px)', opacity: 0, easing: 'ease-out' }, { transform: `translateY(${-10 * u}px)`, opacity: 1, offset: 0.4 }, { transform: `translateY(${-14 * u}px)`, opacity: 1, offset: 0.8 }, { transform: `translateY(${-16 * u}px)`, opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    bubble({ at, x, y, rise = 40, dur = 0.32, s = 1 }, u = 1) {
        return [piece('bubble', x, y, s, [
            { transform: 'translateY(0) scale(.3)', opacity: 0, easing: 'ease-out' },
            { transform: `translateY(${-rise * 0.4 * u}px) scale(1)`, opacity: 1, offset: 0.3 },
            { transform: `translateY(${-rise * u}px) scale(1.15)`, opacity: 1, offset: 0.85 },
            { transform: `translateY(${-rise * u}px) scale(1.8)`, opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    rings({ at, x, y, s = 1, dur = 0.4, flip = false }) {
        return [piece('rings', x, y, s, [
            { transform: `scaleX(${flip ? -1 : 1}) scale(.4)`, opacity: 0 }, { transform: `scaleX(${flip ? -1 : 1}) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `scaleX(${flip ? -1 : 1}) scale(1.6)`, opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    ping({ at, x, y, s = 1.4, dur = 0.35 }) {
        return [piece('spark', x, y, s, [
            { transform: 'scale(0) rotate(0)', opacity: 0 }, { transform: 'scale(1.2) rotate(45deg)', opacity: 1, offset: 0.35 }, { transform: 'scale(0) rotate(90deg)', opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
    swoosh({ at, x, y, flip = false, dur = 0.3 }) {
        return [piece('swoosh', x, y, 1.1, [
            { transform: `scaleX(${flip ? -1 : 1}) scale(.6)`, opacity: 0 }, { transform: `scaleX(${flip ? -1 : 1}) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `scaleX(${flip ? -1 : 1}) scale(1.1)`, opacity: 0 },
        ], { duration: dur * 1000, delay: at * 1000, fill: 'both' })];
    },
};

// Every piece a win's `fx` ([[kind, spec], ...]) throws on a TV picture `u`
// times as wide as TV.width, in the data's order.
export function fxPieces(fx, u = 1) {
    const out = [];
    for (const [kind, spec] of fx || []) {
        if (has(FX, kind) && isObj(spec)) out.push(...FX[kind](spec, u));
    }
    return out;
}
