// audio.js — the only place sounds play (CLAUDE.md, DESIGN "Sound",
// BACKLOG B-108, B-114). Its sounds:
//   - the target word: the per-word `audio` file from the content JSON,
//     played when the kid taps the speaker on the console (speakWord);
//   - the robot's voice and the block swipe: pools of the existing clips
//     under static/sounds/, downloaded a few at a time (see "Fetching"
//     below), decoded into Web Audio buffers on the first gesture and
//     played by renderSound, a state subscriber, for the moments
//     character.js's table (MOMENTS[moment].sound) gives a state change.
//     There is no second trigger list here;
//   - his new voice (BACKLOG M4b): the clips tools/voices.py makes into
//     static/voice/ (read-only content, never written here), listed in
//     static/voice/manifest.json, fetched once the page is idle. On each moment he
//     says a line of the pool the table names (MOMENTS[moment].lines,
//     B-224; the picture's: the word's Hebrew guess, else his look's
//     pool), else the moment's prototype clip; after his letter lands, its
//     name (`letters/`). On a correct check (the moments with
//     MOMENTS[moment].word, B-223) he says the word himself first, from
//     the word's `audio` decoded when the word started (sayPlan, speak),
//     once the TV's win has played (B-227: character.js waitFor); the
//     word's gag only after it (B-225: with the word not ready, a shared
//     line or the prototype clip plays alone).
//     His idle peeks whisper too (peekLine, told by character.js).
//     How often (BACKLOG B-226): per moment character.js saysLine, from
//     its CHATTER table: always, or sometimes / rare at a chance and never
//     within its TALK_GAP after his voice went quiet (`hushedAt`); a line
//     dropped drops only his voice (no prototype clip in its place), the
//     effects play;
//   - the TV's tune-in hiss and channel click (BACKLOG B-214): made in
//     code, no sound file (hiss), played when tv.js starts a tune-in;
//   - the win's chime (BACKLOG B-227): two bright notes made in code, no
//     sound file (chime), played with the TV's win on a correct check;
//   - the round end's fanfare (BACKLOG B-230): three bright notes made in
//     code, no sound file (fanfare), played as the round-end screen shows;
//     his end line, and the key line after it, start when it ends
//     (fanfareWait), so only one voice is heard there. The tada
//     (static/sounds/celebration/tada.mp3, a clip of the prototype
//     character's voice that played under his end line, B-224) is no
//     longer played;
//   - each word's own win's sounds (BACKLOG B-228): its `sfx` (the theme's
//     wins file, wins.js), effects made in code as the reference
//     design/reference/word-wins.html makes them (SFX), each at its time,
//     and the chime at the win's `peak`. picture.js tells winSound which
//     win it starts (main.js hands it over), the shared one (null: the
//     chime at once) or the word's own.
// On iPhone the silent switch would mute all of the Web Audio sound: at
// the first gesture the page asks to play like a media app
// (navigator.audioSession, where there is one) and a silent clip made in
// code loops in an <audio> element (keepAlive), so the page counts as
// playing media (B-227).
// `state.muted` (localStorage `flip.muted`, read and written only here
// through loadMuted / saveMuted) means no sound plays at all (the silent
// loop pauses too).
// Fetching (BACKLOG B-229: the game opens and plays without waiting for
// its sounds): nothing of his voice or the game sounds is fetched before
// the page has loaded and gone idle (afterIdle). Then the manifest, and
// one clip of each pool his moments use and of each prototype pool
// (firstFetches); a pool gets one more clip, not fetched yet, each time
// one of its clips plays (newClip), so variety builds up while the kid
// plays. A word's own clips (its clip, Hebrew guess, gags, letters'
// names; wordFetches) are fetched as the word starts, before any pool
// clip. Clips download two at a time, in that order (nextDownload), and
// no pool clip starts while a round is starting or a new word's picture
// is still tuning in (holdsPools; a word's own one at a time; the pools'
// clips on their way stop as a round starts, toStop), so the round's
// data, the word's picture, its layers, its win drawings and the next
// word's (fetched as its picture locks, tv.js and picture.js) come first.
// A clip not decoded yet is skipped when its moment comes, never waited
// for.
//
// Everything above "Playback" is pure (no DOM, no Audio) and a Django
// test runs it through node; the AudioContext is only created on the
// first gesture and Audio elements only inside speakWord().

import { state } from './state.js';
import { snapshot, momentsFor, NONE, MOMENTS, PEEK, linesOf, letterGiven, picksFor, waitFor, startsOf, chatterOf, saysLine } from './character.js';

export const SOUND_BASE = '/static/sounds/';
export const MUTED_KEY = 'flip.muted';
// His new voice (BACKLOG B-223): the folder tools/voices.py writes and the
// manifest listing every clip in it, { voice_id, model_id, output_format,
// clips: { "<file relative to static/voice/>": { id, text, made } } }.
export const VOICE_BASE = '/static/voice/';
export const MANIFEST_URL = `${VOICE_BASE}manifest.json`;

// The clips of each pool (DESIGN "Sound": correct -> correct/, wrong ->
// error/, block into slot -> swipe/); his voice's prototype clips where
// his new voice has no line yet. The round end has no clip since B-230
// (its fanfare is made in code; celebration/tada.mp3 stays on disk,
// unused).
// The browser cannot list a directory, so they are spelled out; a test
// checks this list against the files on disk. Read-only content in M1.
export const FILES = {
    correct: {
        dir: 'correct',
        names: [
            'bingo.mp3',
            'congratulations.mp3',
            'correct your brain deserve a high five.mp3',
            'correct1.mp3',
            'correct2.mp3',
            'correct3.mp3',
            'ding ding ding your on fire.mp3',
            'holy cow you got it right.mp3',
            'you are on fire.mp3',
            'you have a spelling superpower.mp3',
        ],
    },
    error: {
        dir: 'error',
        names: [
            'actually that is cleverly wrong.mp3',
            'correct amm nope.mp3',
            'error1.mp3',
            'error2.mp3',
            'hmm no.mp3',
            'in one word no way.mp3',
            'no no no.mp3',
            'so close but not really.mp3',
            'that one way to spell it.mp3',
            'you can do better.mp3',
        ],
    },
    swipe: { dir: 'swipe', names: ['swipe1.mp3', 'swipe2.mp3', 'swipe3.mp3', 'swipe4.mp3'] },
    // His "not yet" (moment speakerLocked, on a change of `lockedTaps`;
    // BACKLOG B-203; since B-219 a boost the kid can't afford, as the
    // speaker no longer holds the word back, B-215): the one "hmm no"
    // clip, a placeholder while his new voice has no `no-gears` line
    // (B-224). The file is also in the
    // error pool; it is downloaded and decoded once (one record per URL,
    // soundClips).
    locked: { dir: 'error', names: ['hmm no.mp3'] },
};

// The robot's voice (correct, error, locked; on a correct check, B-223,
// the word he says, `word`; and his new voice's lines, `line`, B-223,
// B-224: his shared lines, the gags, the Hebrew guess, the letter names):
// one clip at a time, a new one cuts the one playing (but a moment that
// comes on its own never cuts it, MOMENTS[moment].ifQuiet, and since
// B-226 a sometimes or rare line is dropped while he talks and for the
// quiet gap after, so only an always moment cuts him), and none
// starts over the target word, the speaker's or the one he says (DESIGN
// "Sound", CHARACTER "Rules"). The swipe is an effect, not his voice: it
// plays whenever a block goes into a slot and may overlap anything. So
// are the TV's hiss (B-214; made in code, not a pool), the win's chime
// (B-227; made in code too), a word's own win's sounds (B-228, `sfx`;
// made in code) and the round end's fanfare (B-230; made in code, before
// his end line, not under it).
export const CHANNEL = { correct: 'voice', error: 'voice', swipe: 'fx', locked: 'voice', hiss: 'fx', chime: 'fx', sfx: 'fx', fanfare: 'fx', word: 'voice', line: 'voice' };

// The TV's tune-in hiss (BACKLOG B-214, design/reference/tv-motion.html
// hiss()): white noise `tail` s longer than the hiss, its first samples
// the channel-change `click`, through a `highpass` and a `lowpass` filter
// (Hz); its gain rises from `floor` to `gain` in `attack` s, holds to
// `hold` of the hiss and falls back to `floor` at its end; the source
// stops `stop` s after that.
export const HISS = { gain: 0.09, floor: 0.0001, attack: 0.02, hold: 0.45, highpass: 1400, lowpass: 7000, tail: 0.1, stop: 0.05, click: [1, -1, 0.8] };

// The hiss's gain over a hiss `ms` long: [how, value, at s from its
// start], how 'set' (setValueAtTime) or 'ramp' (exponentialRampToValueAtTime).
export function hissEnvelope(ms) {
    const end = ms / 1000;
    return [
        ['set', HISS.floor, 0],
        ['ramp', HISS.gain, HISS.attack],
        ['set', HISS.gain, end * HISS.hold],
        ['ramp', HISS.floor, end],
    ];
}

// The win's chime (BACKLOG B-227, design/reference/word-wins.html
// SFX.chime): two bright `type` notes, about C6 then G6 (`f`, Hz), the
// second `at` 0.09 s after the first. Each one's gain rises from `floor`
// to its `peak` in `attack` s and falls back to `floor` by its `dur`; its
// oscillator stops `stop` s after that. The peaks are the reference's
// (0.28, 0.26) through its master gain (0.55), straight out.
export const CHIME = {
    type: 'triangle',
    floor: 0.0001,
    attack: 0.008,
    stop: 0.05,
    notes: [
        { f: 1046, at: 0, dur: 0.35, peak: 0.154 },
        { f: 1568, at: 0.09, dur: 0.5, peak: 0.143 },
    ],
};

// A chime note's gain: [how, value, at s from the chime's start], how
// 'set' (setValueAtTime) or 'ramp' (exponentialRampToValueAtTime).
export function chimeEnvelope(note) {
    return [
        ['set', CHIME.floor, note.at],
        ['ramp', note.peak, note.at + CHIME.attack],
        ['ramp', CHIME.floor, note.at + note.dur],
    ];
}

// The round end's fanfare (BACKLOG B-230): three bright `type` notes
// rising, about C5, E5 and G5 (`f`, Hz), each `at` 0.12 s after the one
// before, the last one held. Each one's gain rises from `floor` to its
// `peak` in `attack` s, stays there until `hold` and falls back to `floor`
// by its `dur` (both from its `at`); its oscillator stops `stop` s after
// that. Straight out, at about the chime's level (CHIME).
export const FANFARE = {
    type: 'triangle',
    floor: 0.0001,
    attack: 0.01,
    stop: 0.05,
    notes: [
        { f: 523, at: 0, hold: 0.06, dur: 0.16, peak: 0.15 },
        { f: 659, at: 0.12, hold: 0.06, dur: 0.16, peak: 0.15 },
        { f: 784, at: 0.24, hold: 0.3, dur: 0.4, peak: 0.15 },
    ],
};

// A fanfare note's gain: [how, value, at s from the fanfare's start], how
// 'set' (setValueAtTime) or 'ramp' (exponentialRampToValueAtTime).
export function fanfareEnvelope(note) {
    return [
        ['set', FANFARE.floor, note.at],
        ['ramp', note.peak, note.at + FANFARE.attack],
        ['set', note.peak, note.at + note.hold],
        ['ramp', FANFARE.floor, note.at + note.dur],
    ];
}

// Seconds from the fanfare's start until its last note has faded out.
export function fanfareLength(fanfare = FANFARE) {
    return Math.round(Math.max(...fanfare.notes.map((n) => n.at + n.dur)) * 1000) / 1000;
}

// Seconds his voice waits on a state change for the fanfare (BACKLOG
// B-230): when one of `moments` has it for its sound (MOMENTS[m].sound:
// the round end's), his line and the key line after it start when it has
// ended (fanfareLength), never under it; 0 for any other moments.
export function fanfareWait(moments) {
    return moments.some((m) => !!MOMENTS[m] && MOMENTS[m].sound === 'fanfare') ? fanfareLength() : 0;
}

// --- Each word's own win's sounds (BACKLOG B-228) ---

// They go out through one gain of SFX_GAIN (the reference's master gain,
// 0.55), and start SFX_LEAD s after the check (the reference's t0), each at
// its time in the word's `sfx`, the chime at its `peak`.
export const SFX_GAIN = 0.55;
export const SFX_LEAD = 0.03;

const hasOwn = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

// A gain's envelope, the reference's env(): from silence up to `peak` in
// `a` s, back down to silence by `dur`.
function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// What SFX's recipes make their sounds with, on AudioContext `c`: `ctx`;
// `out`, where every recipe's sound goes; `keep(...sources)`, told every
// source a recipe starts (audio.js keeps them in `live`, so the mute stops
// them); and the reference's two building blocks: `tone`, an oscillator
// through an envelope (a pitch glide from f0 to f1), and `noise`, white
// noise (one second, made once for the kit, as the reference's noiseBuf)
// through a filter (its frequency gliding from f to f1) and an envelope.
export function sfxKit(c, out, keep = () => {}) {
    let buf = null;
    const noiseBuf = () => {
        if (buf) return buf;
        const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return (buf = b);
    };
    return {
        ctx: c,
        out,
        keep,
        tone(t, { type = 'sine', f0, f1 = f0, dur, peak = 0.5, a = 0.008 }) {
            const o = c.createOscillator(), g = c.createGain();
            o.type = type; o.frequency.setValueAtTime(f0, t);
            if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
            env(g, t, a, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
            keep(o);
        },
        noise(t, { dur, peak = 0.4, type = 'bandpass', f = 1200, q = 1, f1 = f }) {
            const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
            s.buffer = noiseBuf(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
            if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
            env(g, t, 0.005, peak, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
            keep(s);
        },
    };
}

// Every sound a word's win can call, made in code: name -> (kit, t, ...the
// data's args), started at context time `t`. The reference's SFX, its
// recipes and numbers as they are (its chime is B-227's, chime() below).
export const SFX = {
    motor(k, t, dur) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(120, t + dur);
        lfo.frequency.setValueAtTime(18, t); lfo.frequency.linearRampToValueAtTime(34, t + dur); lg.gain.value = 0.5; am.gain.value = 0.5;
        fl.type = 'lowpass'; fl.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.04); g.gain.setValueAtTime(0.35, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        lfo.connect(lg); lg.connect(am.gain); o.connect(fl); fl.connect(am); am.connect(g); g.connect(k.out);
        o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        k.keep(o, lfo);
    },
    sputter(k, t, n = 2, gap = 0.08) { for (let i = 0; i < n; i++) { k.noise(t + i * gap, { dur: 0.07, peak: 0.5, type: 'lowpass', f: 900 }); k.tone(t + i * gap, { type: 'square', f0: 90, f1: 60, dur: 0.06, peak: 0.12 }); } },
    puff(k, t) { k.noise(t, { dur: 0.25, peak: 0.25, type: 'bandpass', f: 500, f1: 1800, q: 0.7 }); },
    boing(k, t, dur = 0.25) { k.tone(t, { type: 'sine', f0: 180, f1: 720, dur, peak: 0.4 }); },
    bawk(k, t) { k.tone(t, { type: 'square', f0: 520, f1: 760, dur: 0.06, peak: 0.16 }); k.tone(t + 0.07, { type: 'sawtooth', f0: 980, f1: 560, dur: 0.17, peak: 0.18 }); },
    flutter(k, t, dur) { for (let i = 0; i < Math.round(dur / 0.05); i++) k.noise(t + i * 0.05, { dur: 0.04, peak: 0.12, type: 'highpass', f: 2500 }); },
    thump(k, t) { k.tone(t, { type: 'sine', f0: 140, f1: 50, dur: 0.16, peak: 0.6 }); k.noise(t, { dur: 0.06, peak: 0.2, type: 'lowpass', f: 400 }); },
    softthud(k, t) { k.tone(t, { type: 'sine', f0: 110, f1: 55, dur: 0.14, peak: 0.45 }); },
    whirr(k, t, dur) { k.tone(t, { type: 'sawtooth', f0: 120, f1: 520, dur, peak: 0.12 }); k.tone(t, { type: 'sine', f0: 240, f1: 1040, dur, peak: 0.1 }); },
    twinkle(k, t, dur) { const n = [1568, 1760, 2093, 2349, 2637, 3136]; for (let i = 0; i < 6; i++) k.tone(t + i * dur / 6, { type: 'triangle', f0: n[i], dur: 0.18, peak: 0.13 }); },
    plink(k, t, f = 1300) { k.tone(t, { type: 'sine', f0: f, dur: 0.09, peak: 0.22 }); },
    clang(k, t) { for (const [f, p] of [[523, 0.3], [1187, 0.2], [1820, 0.14], [2640, 0.1]]) k.tone(t, { type: 'sine', f0: f, f1: f * 0.98, dur: 0.6, peak: p, a: 0.002 }); k.noise(t, { dur: 0.05, peak: 0.3, type: 'highpass', f: 3000 }); },
    taps(k, t, dur, gap = 0.045) { for (let i = 0; i * gap < dur; i++) k.noise(t + i * gap, { dur: 0.02, peak: 0.18, type: 'bandpass', f: 3500, q: 4 }); },
    skid(k, t) { k.tone(t, { type: 'sawtooth', f0: 1800, f1: 700, dur: 0.16, peak: 0.08 }); k.noise(t, { dur: 0.16, peak: 0.12, type: 'bandpass', f: 2500, f1: 900, q: 2 }); },
    buzz(k, t, dur) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(190, t);
        for (let i = 1; i <= 6; i++) o.frequency.linearRampToValueAtTime(i % 2 ? 260 : 170, t + dur * i / 6);
        fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 0.8;
        env(g, t, 0.03, 0.22, dur); o.connect(fl); fl.connect(g); g.connect(k.out); o.start(t); o.stop(t + dur + 0.05);
        k.keep(o);
    },
    bonk(k, t) { k.tone(t, { type: 'sine', f0: 420, f1: 300, dur: 0.12, peak: 0.5, a: 0.002 }); k.noise(t, { dur: 0.03, peak: 0.25, type: 'lowpass', f: 1500 }); },
    inflate(k, t, dur) { k.tone(t, { type: 'square', f0: 260, f1: 900, dur, peak: 0.07 }); },
    ribbit(k, t) { for (const d of [0, 0.11]) { k.tone(t + d, { type: 'square', f0: 170, f1: 140, dur: 0.08, peak: 0.16 }); k.noise(t + d, { dur: 0.08, peak: 0.12, type: 'bandpass', f: 600, q: 3 }); } },
    splat(k, t) { k.noise(t, { dur: 0.14, peak: 0.45, type: 'lowpass', f: 1200, f1: 300 }); k.tone(t, { type: 'sine', f0: 160, f1: 60, dur: 0.12, peak: 0.4 }); },
    clicks(k, t, dur, gap = 0.05) { for (let i = 0; i * gap < dur; i++) k.noise(t + i * gap, { dur: 0.015, peak: 0.22, type: 'highpass', f: 4000 }); },
    snap(k, t) { k.noise(t, { dur: 0.03, peak: 0.45, type: 'highpass', f: 2500 }); k.tone(t, { type: 'square', f0: 900, f1: 500, dur: 0.03, peak: 0.08 }); },
    pop(k, t) { k.tone(t, { type: 'sine', f0: 900, f1: 1600, dur: 0.05, peak: 0.3, a: 0.002 }); k.noise(t, { dur: 0.03, peak: 0.15, type: 'highpass', f: 3000 }); },
    pfff(k, t, dur) { k.noise(t, { dur, peak: 0.3, type: 'bandpass', f: 2500, f1: 700, q: 1.5 }); k.tone(t, { type: 'sawtooth', f0: 600, f1: 180, dur, peak: 0.06 }); },
    tweet(k, t) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(2200, t); o.frequency.linearRampToValueAtTime(3200, t + 0.25);
        lfo.frequency.value = 28; lg.gain.value = 220; lfo.connect(lg); lg.connect(o.frequency);
        env(g, t, 0.01, 0.45, 0.3); o.connect(g); g.connect(k.out); o.start(t); lfo.start(t); o.stop(t + 0.35); lfo.stop(t + 0.35);
        k.keep(o, lfo);
    },
    roar(k, t, dur) { k.noise(t, { dur, peak: 0.35, type: 'lowpass', f: 300, f1: 900 }); k.tone(t, { type: 'sawtooth', f0: 55, f1: 95, dur, peak: 0.16 }); },
    squeak(k, t) { k.tone(t, { type: 'sine', f0: 1500, f1: 2400, dur: 0.09, peak: 0.3 }); },
    hiss(k, t, dur) { k.noise(t, { dur, peak: 0.28, type: 'highpass', f: 4500 }); },
    clipclop(k, t, dur, gap = 0.1) { for (let i = 0; i * gap < dur; i++) k.tone(t + i * gap, { type: 'sine', f0: i % 2 ? 620 : 820, f1: i % 2 ? 500 : 650, dur: 0.05, peak: 0.3, a: 0.002 }); },
    ping(k, t) { k.tone(t, { type: 'sine', f0: 2637, dur: 0.3, peak: 0.25, a: 0.002 }); k.tone(t + 0.04, { type: 'sine', f0: 3520, dur: 0.25, peak: 0.15, a: 0.002 }); },
    splash(k, t) { k.noise(t, { dur: 0.3, peak: 0.35, type: 'bandpass', f: 1800, f1: 600, q: 0.8 }); },
    dizzy(k, t, dur) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(400, t + dur);
        lfo.frequency.value = 9; lg.gain.value = 80; lfo.connect(lg); lg.connect(o.frequency);
        env(g, t, 0.02, 0.18, dur); o.connect(g); g.connect(k.out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        k.keep(o, lfo);
    },
    yawn(k, t, dur) { k.tone(t, { type: 'sawtooth', f0: 260, f1: 130, dur, peak: 0.1, a: 0.06 }); k.noise(t, { dur, peak: 0.12, type: 'lowpass', f: 700, f1: 300 }); },
    howl(k, t, dur) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(760, t + dur * 0.4); o.frequency.linearRampToValueAtTime(560, t + dur);
        lfo.frequency.value = 6; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
        env(g, t, 0.08, 0.3, dur); o.connect(g); g.connect(k.out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        k.keep(o, lfo);
    },
    slide(k, t, dur, f0 = 400, f1 = 1400) { k.tone(t, { type: 'sine', f0, f1, dur, peak: 0.22, a: 0.02 }); },
    trumpet(k, t, dur) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(520, t + 0.08); o.frequency.linearRampToValueAtTime(480, t + dur);
        lfo.frequency.value = 7; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
        fl.type = 'bandpass'; fl.frequency.value = 1100; fl.Q.value = 1.2;
        env(g, t, 0.03, 0.4, dur); o.connect(fl); fl.connect(g); g.connect(k.out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        k.keep(o, lfo);
    },
    sprinkle(k, t, dur) { for (let i = 0; i * 0.035 < dur; i++) k.noise(t + i * 0.035 + Math.random() * 0.02, { dur: 0.03, peak: 0.12, type: 'highpass', f: 5000 }); },
    neigh(k, t, dur) {
        const ctx = k.ctx;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1100, t + dur * 0.25); o.frequency.linearRampToValueAtTime(450, t + dur);
        lfo.frequency.value = 14; lg.gain.value = 90; lfo.connect(lg); lg.connect(o.frequency);
        fl.type = 'bandpass'; fl.frequency.value = 1400; fl.Q.value = 1.5;
        env(g, t, 0.02, 0.3, dur); o.connect(fl); fl.connect(g); g.connect(k.out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        k.keep(o, lfo);
    },
    chomp(k, t) { k.tone(t, { type: 'sine', f0: 220, f1: 90, dur: 0.1, peak: 0.6, a: 0.002 }); k.noise(t, { dur: 0.05, peak: 0.4, type: 'bandpass', f: 2200, q: 2 }); },
    zip(k, t) { k.noise(t, { dur: 0.14, peak: 0.3, type: 'bandpass', f: 1200, f1: 5000, q: 3 }); k.tone(t, { type: 'sine', f0: 700, f1: 2200, dur: 0.12, peak: 0.12 }); },
    whoosh(k, t, dur = 0.2) { k.noise(t, { dur, peak: 0.2, type: 'bandpass', f: 600, f1: 2400, q: 1.2 }); },
};

// A win's sound schedule: [[name, at (s from the win's start), ...args]]:
// a word's own win (wins.js wordWin) its `sfx` that SFX has, in its order,
// then the chime at its `peak`; the shared win (null) the chime at once
// (B-227).
export function winSounds(win) {
    if (!win) return [['chime', 0]];
    const sfx = (Array.isArray(win.sfx) ? win.sfx : [])
        .filter((s) => Array.isArray(s) && hasOwn(SFX, s[0]) && typeof s[1] === 'number');
    return [...sfx, ['chime', win.peak]];
}

// The silent clip that loops while the sound is on (BACKLOG B-227, the
// iPhone's silent switch): `seconds` of zeros, 16-bit mono PCM at `rate`.
export const SILENT = { rate: 8000, seconds: 1 };

// The bytes of a WAV file of `seconds` of silence at `rate` samples a
// second (16-bit mono PCM: the 44-byte header, then the zeros).
export function silentWav(seconds = SILENT.seconds, rate = SILENT.rate) {
    const n = Math.round(seconds * rate);
    const bytes = new Uint8Array(44 + n * 2);
    const view = new DataView(bytes.buffer);
    const text = (at, t) => { for (let i = 0; i < t.length; i++) bytes[at + i] = t.charCodeAt(i); };
    text(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);       // the fmt chunk's size
    view.setUint16(20, 1, true);        // PCM
    view.setUint16(22, 1, true);        // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true); // bytes a second
    view.setUint16(32, 2, true);        // bytes a sample
    view.setUint16(34, 16, true);       // bits a sample
    text(36, 'data');
    view.setUint32(40, n * 2, true);
    return bytes;
}

// The analyser on the robot's voice (design/reference/robot-puppet.html):
// its FFT size and the samples of the waveform read each frame.
export const ANALYSER = { fftSize: 1024, samples: 512 };

// A user gesture unlocks playback (see unlock): events that count
// as a user activation in Chrome and as a user gesture in Safari.
export const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

// URL of clip `name` of pool `kind`; names with spaces are URL-encoded.
export function clipUrl(kind, name, base = SOUND_BASE) {
    const pool = FILES[kind];
    if (!pool) throw new Error(`audio: unknown kind "${kind}"`);
    return `${base}${pool.dir}/${encodeURIComponent(name)}`;
}

export function poolUrls(kind, base = SOUND_BASE) {
    return FILES[kind].names.map((name) => clipUrl(kind, name, base));
}

// A random index into a pool of `size` clips (-1 for an empty pool).
// `rand` is Math.random unless a test passes its own.
export function pickIndex(size, rand = Math.random) {
    if (size <= 0) return -1;
    return Math.min(size - 1, Math.floor(rand() * size));
}

// --- His new voice: the manifest (BACKLOG B-223) ---

// The files a manifest lists (the keys of its `clips`, relative to
// static/voice/). A missing or broken manifest (null, not an object, no
// `clips` map) lists none.
export function listedClips(manifest) {
    const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isMap(manifest) || !isMap(manifest.clips)) return [];
    return Object.keys(manifest.clips);
}

// URL of listed file `file`, each part of its path URL-encoded.
export function voiceUrl(file, base = VOICE_BASE) {
    return base + file.split('/').map(encodeURIComponent).join('/');
}

// The pool of one of his shared lines' files: `robot/<line id>.mp3`, the
// pool being the id without its `-NN` (robot/correct-02.mp3 -> 'correct',
// robot/end-low-01.mp3 -> 'end-low'); null for any other file.
export function poolOf(file) {
    const m = /^robot\/(.+)-\d+\.mp3$/.exec(file);
    return m ? m[1] : null;
}

// The files of pool `pool` that `files` lists, in their order.
export function poolClips(files, pool) {
    return files.filter((file) => poolOf(file) === pool);
}

// A word's gag clips that `files` lists: `gags/<theme>/<word>.mp3`, and
// its second gag `gags/<theme>/<word>-2.mp3` when it exists.
export function gagClips(files, theme, word) {
    if (!theme || !word) return [];
    return [`gags/${theme}/${word}.mp3`, `gags/${theme}/${word}-2.mp3`].filter((file) => files.includes(file));
}

// A word's Hebrew guess that `files` lists (BACKLOG B-224):
// `hebrew/<theme>/<word>.mp3`, or none.
export function hebrewClips(files, theme, word) {
    if (!theme || !word) return [];
    return [`hebrew/${theme}/${word}.mp3`].filter((file) => files.includes(file));
}

// The clip of a letter's name that `files` lists (BACKLOG B-224):
// `letters/<letter>.mp3` ("Eigh!" ... "Zee!"), or null.
export function letterClip(files, letter) {
    if (typeof letter !== 'string' || !/^[a-z]$/i.test(letter)) return null;
    const file = `letters/${letter.toLowerCase()}.mp3`;
    return files.includes(file) ? file : null;
}

// Names in a moment's lines that are the word's own clips, not a pool of
// his shared lines: its gags (B-223) and its Hebrew guess (B-224), and
// where `clips` keeps them.
export const WORD_LINES = { gag: 'gags', hebrew: 'hebrew' };

// Every line of `lines` (array, or { by, ... }) and of a moment's variants.
function allLines(spec) {
    const out = [];
    const add = (lines) => {
        if (Array.isArray(lines)) out.push(...lines);
        else if (lines) for (const [k, v] of Object.entries(lines)) if (k !== 'by') out.push(...v);
    };
    add(spec.lines);
    for (const v of Object.values(spec.variants || {})) add(v.lines);
    return out;
}

// The pools of his shared lines the moment table names (MOMENTS[m].lines,
// with its variants' and every pick of a fact, and PEEK.lines; the word's
// own clips aside), each fetched a clip at a time once the manifest is in
// (BACKLOG B-229: firstFetches, newClip).
export function linePools(moments = MOMENTS, peek = PEEK) {
    const pools = new Set();
    for (const spec of [...Object.values(moments), peek]) {
        for (const name of allLines(spec || {})) if (!(name in WORD_LINES)) pools.add(name);
    }
    return [...pools];
}

// A random ready clip of the first of `lines` that has one ('gag': the
// word's gags, `clips.gags`; 'hebrew': its Hebrew guess, `clips.hebrew`;
// any other name: that pool, `clips.pools[name]`), or null. `ready(url)`
// tells whether a clip is decoded now: one that is not is skipped, never
// waited for.
export function pickLine(lines, clips = {}, ready = () => true, rand = Math.random) {
    for (const name of lines) {
        const from = name in WORD_LINES ? clips[WORD_LINES[name]] : (clips.pools || {})[name];
        const group = (from || []).filter((url) => ready(url));
        if (group.length) return group[pickIndex(group.length, rand)];
    }
    return null;
}

// What he says on `moment`, from the clips decoded now (`ready`): `clips`
// is { word: the word's audio URL, gags, hebrew: the word's gag and Hebrew
// guess URLs, pools: { pool: its clips' URLs }, letter: the URL of the
// name of the letter he just placed, or null }; `how` picks the moment's
// lines (character.js linesOf: { variant, stars, boostKind }). Returns
// { fx, word, line, sound, letter }:
//   - fx: the moment's sound when it is an effect (the swipe, the round
//     end's fanfare, B-230), which plays whatever he says;
//   - word: on a moment that says the word (MOMENTS[moment].word, B-223),
//     the word's clip when it is ready;
//   - line: a ready clip of the first of its lines with one (pickLine);
//     the word's gag only when the plan says the word: with the word's
//     clip not ready (or none), the gag is skipped too and the next of
//     its lines plays alone (B-225, CHARACTER "Rules": a gag never plays
//     without the word);
//   - sound: with no line, the moment's sound when it is his voice (the
//     prototype clip), else null;
//   - letter: on a moment with MOMENTS[moment].letter, the letter's name
//     when it is ready.
// He says them in that order: the word, his line (or the prototype clip),
// the letter's name.
// `say` false (BACKLOG B-226: character.js saysLine dropped the moment's
// line, by its chance or the quiet gap): only the lines the moment says
// every time (CHATTER's `always`: the picture's Hebrew guess) may play,
// and no prototype clip plays in its place; its effect, the word and the
// letter's name are as ever (the moments that have them always speak).
export function sayPlan(moment, clips = {}, ready = () => true, rand = Math.random, how = {}, say = true) {
    const spec = MOMENTS[moment] || {};
    const sound = spec.sound || null;
    const fx = sound && CHANNEL[sound] === 'fx' ? sound : null;
    const word = spec.word && clips.word && ready(clips.word) ? clips.word : null;
    const always = chatterOf(moment).always;
    const lines = linesOf(moment, how).filter((name) => (word || name !== 'gag') && (say || always.includes(name)));
    const line = pickLine(lines, clips, ready, rand);
    const letter = spec.letter && clips.letter && ready(clips.letter) ? clips.letter : null;
    return { fx, word, line, sound: (line || fx || !say) ? null : sound, letter };
}

// The clips of his voice the plans of one state change say, one after the
// other: per plan the word, his line or the prototype pool, the letter's
// name; [{ url, kind: 'word' | 'line' }] or [{ pool }]. A plan's first
// clip starts no sooner than `starts[i]` seconds from the change (its
// moment's start, character.js startsOf, plus waitFor): `at`.
export function voiceChain(plans, starts = []) {
    const out = [];
    plans.forEach((p, i) => {
        const items = [];
        if (p.word) items.push({ url: p.word, kind: 'word' });
        if (p.line) items.push({ url: p.line, kind: 'line' });
        else if (p.sound) items.push({ pool: p.sound });
        if (p.letter) items.push({ url: p.letter, kind: 'line' });
        if (items.length && starts[i]) items[0].at = starts[i];
        out.push(...items);
    });
    return out;
}

// --- Fetching (BACKLOG B-229) ---

// When the clips start to download: in the first idle period after the
// page's `load` event (requestIdleCallback, `timeout` ms at most), or
// `wait` ms after it where the browser has no requestIdleCallback
// (Safari).
export const IDLE = { timeout: 1000, wait: 250 };

// Run `fn` once window `win` has loaded and gone idle (IDLE); a page that
// has loaded already only waits for the idle.
export function afterIdle(fn, win = globalThis) {
    const idle = () => {
        if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(() => fn(), { timeout: IDLE.timeout });
        else win.setTimeout(fn, IDLE.wait);
    };
    const doc = win.document;
    if (doc && doc.readyState !== 'complete' && typeof win.addEventListener === 'function') {
        win.addEventListener('load', idle, { once: true });
    } else {
        idle();
    }
}

// How many clips download at once: `free`, and `held` while the pools'
// clips wait (holdsPools: a round starting, a new word's picture tuning
// in), so a word's own clips leave the picture most of the network.
export const FETCH_AT_ONCE = { free: 2, held: 1 };

// A download's place in the queue, the lowest first: a word's own clips,
// then the first clip of each pool, then a pool's next clips.
export const RANK = { word: 0, first: 1, more: 2 };

// A random one of `urls` (a pool's clips) that `have` (the URLs already
// asked for) does not hold, or null when it holds every one: a pool's
// first clip, and its next one each time one of its clips plays. `rand`
// is Math.random unless a test passes its own.
export function newClip(urls, have = new Set(), rand = Math.random) {
    const left = urls.filter((url) => !have.has(url));
    return left.length ? left[pickIndex(left.length, rand)] : null;
}

// The clips fetched first, in order, one random clip a pool (newClip):
// { url, pool } for a pool of his shared lines (from `files`, the
// manifest's list), { url, kind } for a prototype pool (FILES). First the
// pools of a moment that waits for its clip (MOMENTS[m].waitReady: the
// greeting, which comes with the first tap), then the prototype pools
// (the swipe on every block, his fallbacks), then his other pools in the
// moment table's order (linePools). A file two pools name is fetched
// once; a pool with no clip has none.
export function firstFetches(files, rand = Math.random, moments = MOMENTS, peek = PEEK) {
    const early = linePools(Object.fromEntries(Object.entries(moments).filter(([, m]) => m && m.waitReady)), {});
    const later = linePools(moments, peek).filter((pool) => !early.includes(pool));
    const have = new Set();
    const out = [];
    const add = (item) => {
        if (!item.url) return;
        have.add(item.url);
        out.push(item);
    };
    const line = (pool) => add({ url: newClip(poolClips(files, pool).map((file) => voiceUrl(file)), have, rand), pool });
    early.forEach(line);
    for (const kind of Object.keys(FILES)) add({ url: newClip(poolUrls(kind), have, rand), kind });
    later.forEach(line);
    return out;
}

// A word's own clips (B-223, B-224) as URLs, in the order they are fetched
// as it starts: its Hebrew guess (said at the TV's lock), its clip
// `audio` (said at its correct check), its gags (after the word) and the
// names of its letters (after his letter lands), the ones `files` lists.
export function wordFetches(files, theme, word, audio) {
    const urls = (list) => list.map((file) => voiceUrl(file));
    const letters = typeof word === 'string' ? [...new Set(word)].map((letter) => letterClip(files, letter)).filter(Boolean) : [];
    return [...urls(hebrewClips(files, theme, word)), audio, ...urls(gagClips(files, theme, word)), ...urls(letters)].filter(Boolean);
}

// Whether the pools' clips wait (state `s`): while a round is starting
// (its data on its way) and while a new word's picture tunes in (not
// locked yet), so its picture, its life layers and win drawings and the
// next word's are fetched first. A word's own clips never wait (they go
// one at a time then, FETCH_AT_ONCE.held).
export function holdsPools(s) {
    if (!s) return false;
    if (s.startingRound) return true;
    return s.screen === 'play' && !!(s.current && s.current.word) && !s.tuned;
}

// The download to start next from `waiting` ([{ rank, seq }]: the queue,
// `seq` the order they were asked for in): the lowest rank, then the
// first asked for; while `held` (holdsPools), only a word's own. Its
// index, or -1 for none.
export function nextDownload(waiting, held = false) {
    let best = -1;
    waiting.forEach((job, i) => {
        if (held && job.rank > RANK.word) return;
        const top = waiting[best];
        if (best < 0 || job.rank < top.rank || (job.rank === top.rank && job.seq < top.seq)) best = i;
    });
    return best;
}

// The downloads on their way (`going`, [{ rank }]) that stop when a round
// starts (state `s`, its data on its way): the pools' clips, which go back
// to wait their turn, so the round's data and its first word's picture
// have the network (its picture was not fetched ahead). A word's own clips
// go on, and nothing stops while no round is starting.
export function toStop(going, s) {
    return s && s.startingRound ? going.filter((job) => job.rank > RANK.word) : [];
}

// The remembered mute flag: true only when the key holds 'true'; missing,
// anything else, or storage that cannot be read (private mode, no
// localStorage) is sound on, the DESIGN default.
export function loadMuted(storage = globalThis.localStorage) {
    try {
        return storage.getItem(MUTED_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

// Remember the flag as 'true' / 'false'. Storage that cannot be written
// is ignored: the toggle still works for this visit.
export function saveMuted(muted, storage = globalThis.localStorage) {
    try {
        storage.setItem(MUTED_KEY, muted ? 'true' : 'false');
    } catch (e) {
        // nothing to do
    }
}

// --- Playback ---

// The robot's clips and the swipe play through the Web Audio API, not
// <audio> elements. On a phone (every iOS browser is Safari underneath)
// an <audio> element takes a few hundred ms from play() to sound, iOS
// ignores `preload` so a clip's first play waits for its download, and
// iOS refuses some of the per-element unlocks, leaving those clips silent
// until a reload. So: the clips are downloaded (BACKLOG B-229: once the
// page is idle, a clip a pool at first, more as they play; "Fetching"
// above); the first user
// gesture creates one AudioContext, opens its output and decodes the
// clips into memory; play() then starts a decoded buffer at once.
// The target word the speaker plays stays an <audio> element (speakWord):
// one file per word, started by the kid's own tap on the speaker. It is
// not routed through the AudioContext (no MediaElementSource), so it
// plays however the context is (suspended, interrupted, iOS 16's silent
// switch) and the robot's analyser never hears it (BACKLOG B-210). On a
// correct check he says the word himself (B-223): the same file, fetched
// and decoded as the word starts (loadWord), played as his voice (speak).
//
// Audio engine handles, not game state (CLAUDE.md "audio.js"): no other
// module reads them and nothing decides game logic from them.
let ctx = null;             // the AudioContext, made on the first gesture
// The prototype pools' clips (FILES), per clip URL a record as his new
// voice's below ({ bytes, buffer, decoding }); only the ones asked for
// (BACKLOG B-229: a clip a pool at first, one more after each play), and a
// file two pools name ('hmm no' in error and locked) has one.
const soundClips = new Map();
const live = new Set();     // sources now playing (or due, B-224): the pooled clips, his new voice's (B-223, B-224), the TV's hiss (B-214), the win's chime (B-227), a word's own win's sounds (B-228) and the round end's fanfare (B-230), { src, kind }
// When his voice last went quiet (BACKLOG B-226): the performance.now() ms
// at which a clip of his voice last ended or was cut (-Infinity before he
// ever spoke), for the quiet gap (character.js CHATTER.TALK_GAP, saysLine).
let hushedAt = -Infinity;
// His new voice (BACKLOG B-223, B-224): the files static/voice/manifest.json
// lists (none until it is in, and none for a missing or broken one), and
// per clip URL { bytes: Promise of its bytes or null, buffer: its decoded
// AudioBuffer or null, decoding }: the clips of his line pools asked for
// so far (kept; each with its `pool`, B-229), and
// the current word's own clips: its clip, its gags, its Hebrew guess and
// the names of its letters (let go on a new word).
let listed = [];
const lineClips = new Map();
const wordClips = new Map();
// The downloads (BACKLOG B-229): `waiting`, the clips asked for that have
// not started ({ url, rank, seq, fill, failed }: `fill` hands its bytes,
// or null, to the clip's record; `failed` asks its pool for another),
// `going`, the ones on their way (FETCH_AT_ONCE; each with the
// AbortController that can stop it, `stop`), `seq`, the count asked for
// so far, and `open`, set once the page is idle (afterIdle): nothing
// downloads before.
const net = { open: false, going: [], waiting: [], seq: 0 };
// The robot's voice (the voice channel) plays through an AnalyserNode on
// its way out, so he can show it (BACKLOG B-210: character.js
// renderTalk, which main.js hands voiceWave() every frame). The swipe
// goes straight out. `wave` is the scratch array the analyser's samples
// are copied into.
let analyser = null;
const wave = new Uint8Array(ANALYSER.samples);

// Handle to the word clip now playing (an HTMLAudioElement), or null. It
// is not game state and not a DOM cache: audio.js keeps it so a new tap or
// a word change can stop the clip, and reads it only to tell whether an
// ended clip is still the current one (a stopped or replaced clip must not
// call its `onEnd`). No other module reads it; whether the word is playing
// is `state.speaking`, set by main.js, and that is the truth.
let wordClip = null;

// The looping silent clip (BACKLOG B-227): an HTMLAudioElement playing
// silentWav, made on the first gesture, playing while the sound is on and
// paused while muted, so iOS counts the page as playing media and its
// silent switch does not mute the Web Audio sound (his voice, the
// effects, the hiss, the chime). An engine handle, not game state: no
// other module reads it and nothing decides game logic from it.
let keepAlive = null;

function download(url, signal = null) {
    try {
        return fetch(url, signal ? { signal } : undefined)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
}

// Clip `url`'s bytes, asked for at `rank` (RANK): a Promise of them (null
// when the download fails), filled when its turn in the queue comes
// (pump). `failed` runs when the download fails.
function ask(url, rank, failed = null) {
    return new Promise((fill) => {
        net.waiting.push({ url, rank, seq: ++net.seq, fill, failed });
        pump();
    });
}

// The next downloads start (nextDownload), FETCH_AT_ONCE at most at once:
// none before the page is idle (`net.open`), and no pool clip (and a
// word's own one at a time) while a round starts or a new word's picture
// tunes in (holdsPools). As a round starts the pools' clips on their way
// stop and wait their turn again (toStop).
function pump() {
    if (!net.open) return;
    for (const job of toStop(net.going, state)) {
        if (job.stop) job.stop.abort();
    }
    const held = holdsPools(state);
    while (net.going.length < (held ? FETCH_AT_ONCE.held : FETCH_AT_ONCE.free)) {
        const i = nextDownload(net.waiting, held);
        if (i < 0) return;
        const [job] = net.waiting.splice(i, 1);
        net.going.push(job);
        job.stop = typeof AbortController === 'function' ? new AbortController() : null;
        download(job.url, job.stop && job.stop.signal).then((data) => {
            net.going = net.going.filter((j) => j !== job);
            if (job.stop && job.stop.signal.aborted) {
                net.waiting.push(job);
            } else {
                job.fill(data);
                if (!data && job.failed) job.failed();
            }
            pump();
        });
    }
}

// A clip let go before its download started (the word changed) leaves
// the queue, with no bytes.
function drop(url) {
    net.waiting = net.waiting.filter((job) => {
        if (job.url !== url) return true;
        job.fill(null);
        return false;
    });
}

// A clip (a record, with `extra`): its download asked for at `rank` (ask),
// and its decode once its bytes are in and the context exists (else on
// the first gesture, decodeAll).
function fetchClip(url, rank, failed = null, extra = {}) {
    const clip = { bytes: ask(url, rank, failed), buffer: null, decoding: false, ...extra };
    decodeClip(clip);
    return clip;
}

// One clip more of his line pool `pool`, at `rank`: a random one of its
// clips not asked for yet (newClip), if it has one; one whose download
// fails asks for another.
function moreLine(pool, rank = RANK.more) {
    const url = newClip(poolClips(listed, pool).map((file) => voiceUrl(file)), new Set(lineClips.keys()));
    if (url) lineClips.set(url, fetchClip(url, rank, () => moreLine(pool, rank), { pool }));
}

// One clip more of prototype pool `kind` (FILES), as moreLine.
function moreSound(kind, rank = RANK.more) {
    const url = newClip(poolUrls(kind), new Set(soundClips.keys()));
    if (url) soundClips.set(url, fetchClip(url, rank, () => moreSound(kind, rank)));
}

// Decode a clip once (his new voice's, a prototype pool's); one that
// fails to download or decode stays without a buffer (never ready:
// skipped).
function decodeClip(clip) {
    if (!ctx || clip.decoding) return;
    clip.decoding = true;
    clip.done = clip.bytes
        .then((data) => (data ? ctx.decodeAudioData(data) : null))
        .then((buf) => { if (buf) clip.buffer = buf; return !!buf; })
        .catch(() => false);
}

// Resolves true as soon as one clip of his shared-line pool `pool` is
// decoded, false when none can be (none listed or asked for yet, none
// decodes). For a
// moment the table marks `waitReady` (the greeting, human 2026-10-24).
function poolDecoded(pool) {
    const clips = poolClips(listed, pool).map((file) => lineClips.get(voiceUrl(file))).filter(Boolean);
    return new Promise((resolve) => {
        let left = clips.length;
        if (!left) resolve(false);
        for (const clip of clips) {
            const done = clip.buffer ? Promise.resolve(true) : (clip.done || Promise.resolve(false));
            done.then((ok) => {
                if (ok) resolve(true);
                else if (--left === 0) resolve(false);
            });
        }
    });
}

// The decoded buffer of a clip of his new voice, or null while not ready.
function bufferOf(url) {
    const clip = wordClips.get(url) || lineClips.get(url);
    return (clip && clip.buffer) || null;
}

// The manifest, fetched once, as the page goes idle (open; BACKLOG B-223,
// B-229): then the word showing, if any, gets its own clips, and one clip
// of each pool is asked for (firstFetches: his line pools' and the
// prototype pools'). A missing or broken manifest counts as an empty one,
// with no console error (the prototype pools still get theirs).
function loadManifest() {
    let got;
    try {
        got = fetch(MANIFEST_URL).then((r) => (r.ok ? r.json() : null));
    } catch (e) {
        got = Promise.resolve(null);
    }
    return got.catch(() => null).then((manifest) => {
        listed = listedClips(manifest);
        loadWord(state);
        for (const item of firstFetches(listed)) {
            if (item.pool) {
                if (!lineClips.has(item.url)) lineClips.set(item.url, fetchClip(item.url, RANK.first, () => moreLine(item.pool, RANK.first), { pool: item.pool }));
            } else if (!soundClips.has(item.url)) {
                soundClips.set(item.url, fetchClip(item.url, RANK.first, () => moreSound(item.kind, RANK.first)));
            }
        }
    }).catch(() => {});
}

// The word now showing (BACKLOG B-223, B-224): its own clip (its `audio`),
// its Hebrew guess, its gags and the names of its letters are asked for
// now, as it starts, ahead of any pool clip (wordFetches, RANK.word), so
// they are ready at the TV's lock, at its check and when his letter
// lands; the clips of the word before are let go (and leave the queue if
// they have not started). Off the play screen, none.
function loadWord(s) {
    const { current } = s;
    const onWord = s.screen === 'play' && current && current.word;
    const want = onWord ? wordFetches(listed, s.theme, current.word, current.audio) : [];
    for (const url of [...wordClips.keys()]) {
        if (want.includes(url)) continue;
        wordClips.delete(url);
        drop(url);
    }
    for (const url of want) {
        if (!wordClips.has(url)) wordClips.set(url, fetchClip(url, RANK.word));
    }
}

// Wait for the first gesture, and for the page to go idle before any clip
// downloads (BACKLOG B-229: afterIdle, open). Nothing plays and no
// AudioContext exists yet, so loading the page raises no autoplay-policy
// warning.
export function init() {
    for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, true);
    afterIdle(open);
}

// The page is idle (BACKLOG B-229): the downloads may start, his new
// voice's manifest first (loadManifest).
function open() {
    if (net.open) return;
    net.open = true;
    loadManifest();
    pump();
}

// The silent loop's element (keepAlive), or null where it cannot be made.
function silentLoop() {
    try {
        const el = new Audio(URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' })));
        el.loop = true;
        return el;
    } catch (e) {
        return null;
    }
}

// The silent loop plays, unless muted or already playing; a play the
// browser refuses is tried again on the next gesture.
function keepAwake() {
    if (!keepAlive || !keepAlive.paused || state.muted) return;
    try {
        const p = keepAlive.play();
        if (p && p.catch) p.catch(() => {});
    } catch (e) {
        // the next gesture tries again
    }
}

// Every gesture (capture phase, so a drop's own pointerup comes first):
// the first one makes the context and decodes the clips, asks to play like
// a media app and makes the silent loop (B-227: the iPhone's silent switch
// then mutes none of it); any one finds the silent loop playing (unless
// muted); any one finding the context not running (not yet started, or
// suspended / interrupted after the phone switched apps) resumes it and
// plays one silent sample, which is what really opens the output on iOS.
function unlock() {
    if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;            // no Web Audio: the game stays silent, no error
        try {
            ctx = new AC();
        } catch (e) {
            return;
        }
        try {
            analyser = ctx.createAnalyser();
            analyser.fftSize = ANALYSER.fftSize;
            analyser.connect(ctx.destination);
        } catch (e) {
            analyser = null;        // no analyser: his voice goes straight out, he just does not show it
        }
        decodeAll();
        // iOS 17+: play like a media app, heard with the silent switch on.
        // Older iOS and other browsers lack it; the silent loop covers them.
        try {
            if (globalThis.navigator && navigator.audioSession) navigator.audioSession.type = 'playback';
        } catch (e) {
            // nothing to do
        }
        keepAlive = silentLoop();
    }
    keepAwake();
    if (ctx.state === 'running') return;
    try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
    } catch (e) {
        // the next gesture tries again
    }
}

// The clips asked for before the context existed decode now, each record
// once (decodeAudioData takes over the bytes it is given; a file two
// pools name has one record). An undecodable clip is left out of its pool.
function decodeAll() {
    for (const clip of [...soundClips.values(), ...lineClips.values(), ...wordClips.values()]) decodeClip(clip);
}

// A source leaves `live`: one of his voice notes when he went quiet
// (`hushedAt`, B-226), whether it ended or was cut.
function gone(entry) {
    if (!live.delete(entry)) return false;
    if (CHANNEL[entry.kind] === 'voice') hushedAt = performance.now();
    return true;
}

function stopSource(entry) {
    gone(entry);
    try {
        entry.src.stop();
    } catch (e) {
        // already ended
    }
}

// Cut the robot's voice (every playing clip of the voice pools).
function stopVoice() {
    for (const entry of [...live]) {
        if (CHANNEL[entry.kind] === 'voice') stopSource(entry);
    }
}

// Whether he is saying the word now (BACKLOG B-223, speak).
function saying() {
    return [...live].some((entry) => entry.kind === 'word');
}

// Whether a clip of his voice is playing, or due (BACKLOG B-224).
function talking() {
    return [...live].some((entry) => CHANNEL[entry.kind] === 'voice');
}

// Seconds his voice has been quiet (BACKLOG B-226, character.js saysLine):
// 0 while a clip of his plays or is due; Infinity before he ever spoke.
function quietFor() {
    return talking() ? 0 : (performance.now() - hushedAt) / 1000;
}

// Start `buffer` as a clip of `kind`, `wait` s from now (0: now): his
// voice (CHANNEL) through the analyser, an effect straight out. `then`
// runs when the clip has played to its end, never when it was stopped
// (stopSource takes it out of `live` first; a clip still due is stopped
// before it starts).
function start(buffer, kind, then = null, wait = 0) {
    try {
        if (ctx.state !== 'running') {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => {});
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(CHANNEL[kind] === 'voice' && analyser ? analyser : ctx.destination);
        const entry = { src, kind };
        live.add(entry);
        src.onended = () => {
            if (gone(entry) && then) then();
        };
        src.start(wait > 0 ? ctx.currentTime + wait : 0);
    } catch (e) {
        // stay silent, no console error
    }
}

// A random decoded clip of pool `kind`, started (`then`, `wait` as for
// start); false while none is decoded. The pool asks for one clip more
// (BACKLOG B-229).
function startPool(kind, then = null, wait = 0) {
    const ready = poolUrls(kind).map((url) => soundClips.get(url)).filter((clip) => clip && clip.buffer);
    if (!ready.length) return false;
    start(ready[pickIndex(ready.length)].buffer, kind, then, wait);
    moreSound(kind);
    return true;
}

// Play a random clip of pool `kind` ('correct', 'error', 'swipe',
// 'locked').
// Muted, before the first gesture, or while the pool is still decoding:
// nothing. A voice clip cuts the voice clip playing, and does not start
// while the target word plays (`state.speaking`, or the word he says on a
// correct check, B-223): the word is spoken clean and is never cut. The
// effect (the swipe) may overlap anything.
export function play(kind) {
    if (state.muted || !ctx || !FILES[kind]) return;
    if (CHANNEL[kind] === 'voice') {
        if (state.speaking || saying()) return;
        stopVoice();
    }
    startPool(kind);
}

// Say `items` (voiceChain: his new voice's clips and prototype pools) one
// after the other, each when the one before has played to its end, and
// one with `at` no sooner than `at` s after `t0` (the context's time at
// the state change). A clip no longer decoded is skipped. Nothing more
// once muted or while the speaker's word plays: the rest is dropped. A
// clip of his line pools that starts has its pool ask for one more
// (BACKLOG B-229).
function chain(items, t0) {
    if (!items.length || state.muted || state.speaking || !ctx) return;
    const [item, ...rest] = items;
    const wait = item.at ? Math.max(0, t0 + item.at - (ctx.currentTime || 0)) : 0;
    const next = () => chain(rest, t0);
    const then = rest.length ? next : null;
    if (item.pool) {
        if (!startPool(item.pool, then, wait)) next();
        return;
    }
    const buf = bufferOf(item.url);
    if (!buf) {
        next();
        return;
    }
    start(buf, item.kind, then, wait);
    const clip = lineClips.get(item.url);
    if (clip && clip.pool) moreLine(clip.pool);
}

// His voice on a state change (BACKLOG B-223, B-224): `items` said one
// after the other (chain), cutting the clip of his voice playing; but
// `ifQuiet` (a moment that comes on its own, MOMENTS[moment].ifQuiet) never
// cuts one: while a clip of his plays or is due, they are dropped. Nothing
// over the speaker's word (`state.speaking`) or the word he says; muted or
// before the first gesture, nothing. A line that cannot play now is
// dropped, never queued.
function voice(items, ifQuiet = false) {
    if (!items.length || state.muted || !ctx || state.speaking || saying()) return;
    if (ifQuiet && talking()) return;
    stopVoice();
    chain(items, ctx.currentTime || 0);
}

// The clips of his new voice for the word in state `s`, as URLs (sayPlan's
// `clips`), with the name of `letter` when there is one.
function clipsFor(s, letter = null) {
    const { current } = s;
    const urls = (files) => files.map((file) => voiceUrl(file));
    const name = letter && letterClip(listed, letter);
    return {
        word: (current && current.audio) || null,
        gags: urls(gagClips(listed, s.theme, current && current.word)),
        hebrew: urls(hebrewClips(listed, s.theme, current && current.word)),
        pools: Object.fromEntries(linePools().map((pool) => [pool, urls(poolClips(listed, pool))])),
        letter: name ? voiceUrl(name) : null,
    };
}

// Prefers-reduced-motion, for when a boost's moment starts (waitFor).
function reducedMotion() {
    try {
        return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
        return false;
    }
}

// What he says on the moments of one state change (`moments`, from
// snapshot `prev` to `now`, read from state `s`): per moment its plan
// (sayPlan, from the clips decoded now: a clip not ready is skipped, never
// waited for): its effect at once (the swipe; the round end's fanfare,
// B-230; the win's chime and a word's own win's sounds are not here:
// picture.js starts them with the TV's win, winSound, B-228); his voice,
// the word (B-223), his line or the prototype clip, and the name of the
// letter he placed (B-224), one after the other, each moment's no sooner
// than the moment starts in his script (waitFor: a boost's when its letter
// lands, a correct check's when the TV's win ends, B-227; fanfareWait: the
// round end's when its fanfare ends, B-230; startsOf: the second miss's
// letter when his peek is over, the key line after the end line). The
// picture's line is the one of his look (picksFor), the round end's by its
// stars, a boost's by its kind. Whether each moment says its line
// (BACKLOG B-226): character.js saysLine, its tier and chance, and the
// quiet gap, from how long his voice has been quiet as the change comes
// (quietFor); one it drops plays only its effect (and the lines it always
// says).
function speak(moments, s, prev, now) {
    const picks = picksFor(moments, now);
    const ready = (url) => !!bufferOf(url);
    const word = s.current && s.current.word;
    const quiet = quietFor();
    const plans = moments.map((m) => sayPlan(m, clipsFor(s, letterGiven(m, prev, now, word)), ready, Math.random,
        { variant: picks[m], stars: now.stars, boostKind: now.boostKind }, saysLine(m, now, quiet, Math.random)));
    for (const p of plans) {
        if (p.fx === 'fanfare') fanfare();
        else if (p.fx) play(p.fx);
    }
    const wait = waitFor(moments, prev, now, reducedMotion()) + fanfareWait(moments);
    const starts = startsOf(moments, picks).map((t) => wait + t);
    voice(voiceChain(plans, starts), moments.every((m) => MOMENTS[m].ifQuiet));
}

// His whisper as he peeks over the edge while sunk (BACKLOG B-224):
// character.js tells main.js, which calls this. A random ready clip of
// PEEK.lines, only while he is quiet (PEEK.ifQuiet), and rarely (B-226:
// saysLine for CHATTER's `peek`, its chance and the quiet gap); none:
// nothing.
export function peekLine() {
    if (state.screen !== 'play') return;
    if (!saysLine('peek', snapshot(state), quietFor(), Math.random)) return;
    const line = pickLine(PEEK.lines, clipsFor(state), (url) => !!bufferOf(url));
    if (line) voice([{ url: line, kind: 'line' }], !!PEEK.ifQuiet);
}

// The TV's hiss with its channel click, `ms` long (BACKLOG B-214): tv.js
// calls it as a tune-in starts. Noise made here, filtered and shaped
// (HISS, hissEnvelope); an effect, so it may overlap anything. Muted or
// before the first gesture: nothing. Kept with the playing sources, so
// the mute stops it.
export function hiss(ms) {
    if (state.muted || !ctx) return;
    try {
        if (ctx.state !== 'running') {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => {});
        }
        const len = Math.ceil(ctx.sampleRate * (ms / 1000 + HISS.tail));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        HISS.click.forEach((v, i) => { data[i] = v; });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = HISS.highpass;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = HISS.lowpass;
        const gain = ctx.createGain();
        const t = ctx.currentTime;
        for (const [how, value, at] of hissEnvelope(ms)) {
            if (how === 'set') gain.gain.setValueAtTime(value, t + at);
            else gain.gain.exponentialRampToValueAtTime(value, t + at);
        }
        src.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        gain.connect(ctx.destination);
        const entry = { src, kind: 'hiss' };
        live.add(entry);
        src.onended = () => live.delete(entry);
        src.start(t);
        src.stop(t + ms / 1000 + HISS.stop);
    } catch (e) {
        // no hiss here; the picture still tunes in
    }
}

// The win's chime (BACKLOG B-227): two notes made here (CHIME,
// chimeEnvelope), straight out, from context time `when` (now unless
// given: a word's own win's peak, B-228); an effect, so it may overlap
// anything. Muted or before the first gesture: nothing. Kept with the
// playing sources, so the mute stops it.
function chime(when = null) {
    if (state.muted || !ctx) return;
    try {
        if (ctx.state !== 'running') {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => {});
        }
        const t = when === null ? ctx.currentTime : when;
        for (const note of CHIME.notes) {
            const osc = ctx.createOscillator();
            osc.type = CHIME.type;
            osc.frequency.setValueAtTime(note.f, t + note.at);
            const gain = ctx.createGain();
            for (const [how, value, at] of chimeEnvelope(note)) {
                if (how === 'set') gain.gain.setValueAtTime(value, t + at);
                else gain.gain.exponentialRampToValueAtTime(value, t + at);
            }
            osc.connect(gain);
            gain.connect(ctx.destination);
            const entry = { src: osc, kind: 'chime' };
            live.add(entry);
            osc.onended = () => live.delete(entry);
            osc.start(t + note.at);
            osc.stop(t + note.at + note.dur + CHIME.stop);
        }
    } catch (e) {
        // no chime here; the win still plays
    }
}

// The round end's fanfare (BACKLOG B-230): three notes made here
// (FANFARE, fanfareEnvelope), straight out, from now; an effect, played as
// the round-end screen shows, his end line due when it ends (speak,
// fanfareWait). Muted or before the first gesture: nothing. Kept with the
// playing sources, so the mute stops it.
function fanfare() {
    if (state.muted || !ctx) return;
    try {
        if (ctx.state !== 'running') {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => {});
        }
        const t = ctx.currentTime || 0;
        for (const note of FANFARE.notes) {
            const osc = ctx.createOscillator();
            osc.type = FANFARE.type;
            osc.frequency.setValueAtTime(note.f, t + note.at);
            const gain = ctx.createGain();
            for (const [how, value, at] of fanfareEnvelope(note)) {
                if (how === 'set') gain.gain.setValueAtTime(value, t + at);
                else gain.gain.exponentialRampToValueAtTime(value, t + at);
            }
            osc.connect(gain);
            gain.connect(ctx.destination);
            const entry = { src: osc, kind: 'fanfare' };
            live.add(entry);
            osc.onended = () => live.delete(entry);
            osc.start(t + note.at);
            osc.stop(t + note.at + note.dur + FANFARE.stop);
        }
    } catch (e) {
        // no fanfare here; the round end still shows, his line still waits for its length
    }
}

// The sounds of the TV's win as it starts (BACKLOG B-228): picture.js
// calls it (main.js hands it over) with the win it plays, a word's own
// (wins.js wordWin) or null for the shared one. Its schedule (winSounds)
// from SFX_LEAD s on for a word's own win (the reference's t0), at once
// for the shared one: each of the word's `sfx` made in code (SFX, through
// one gain of SFX_GAIN), the chime (B-227) at the win's peak. Effects:
// they may overlap anything, each source is kept with the playing ones so
// the mute stops them. Muted or before the first gesture: nothing. They
// play under reduced motion too.
export function winSound(win) {
    if (state.muted || !ctx) return;
    try {
        if (ctx.state !== 'running') {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => {});
        }
        const t0 = (ctx.currentTime || 0) + (win ? SFX_LEAD : 0);
        let kit = null;
        for (const [name, at, ...args] of winSounds(win)) {
            if (name === 'chime') {
                chime(t0 + at);
                continue;
            }
            if (!kit) {
                const out = ctx.createGain();
                out.gain.value = SFX_GAIN;
                out.connect(ctx.destination);
                kit = sfxKit(ctx, out, keepSfx);
            }
            SFX[name](kit, t0 + at, ...args);
        }
    } catch (e) {
        // no sounds here; the win still plays
    }
}

// Each source of a word's own win's sounds joins the playing ones (`live`)
// until it ends, so the mute stops it.
function keepSfx(...sources) {
    for (const src of sources) {
        const entry = { src, kind: 'sfx' };
        live.add(entry);
        src.onended = () => live.delete(entry);
    }
}

// This frame's samples of the robot's voice (bytes, 128 = silence), or
// null while none of his clips plays (also while muted: nothing plays).
// main.js passes it to character.js renderTalk every frame; the array is
// refilled on each call. The word he says on a correct check (B-223) is
// his voice; the speaker's word is not and does not pass the analyser
// (see speakWord).
export function voiceWave() {
    if (!analyser) return null;
    let talking = false;
    for (const entry of live) {
        if (CHANNEL[entry.kind] === 'voice') talking = true;
    }
    if (!talking) return null;
    analyser.getByteTimeDomainData(wave);
    return wave;
}

// Play the word clip at `url`; `onEnd` runs once when it ends or fails to
// play (missing file, decode error, playback refused), or at once when
// muted. The word cuts the robot's voice (also whatever he is saying: on
// a correct check, B-223, the word starts again from the speaker, and his
// line after it is dropped, as is anything still to come of what he was
// saying, B-224). A clip stopped by stopWord() or
// replaced by a new speakWord() never calls its `onEnd`: whoever stopped
// it has already moved on. The target word is never cut by another clip;
// a new tap on the speaker starts it again from the beginning.
export function speakWord(url, onEnd) {
    stopWord();
    if (state.muted) {
        onEnd();
        return;
    }
    stopVoice();
    let el;
    try {
        el = new Audio(url);
    } catch (e) {
        onEnd();
        return;
    }
    wordClip = el;
    const done = () => {
        if (wordClip !== el) return;
        wordClip = null;
        onEnd();
    };
    el.addEventListener('ended', done);
    el.addEventListener('error', done);
    const p = el.play();
    if (p && p.catch) p.catch(done);
}

// Stop the word clip if one is playing (the word changed or the screen
// left the play screen).
export function stopWord() {
    if (!wordClip) return;
    const el = wordClip;
    wordClip = null;
    el.pause();
}

// Everything stops: the word, every pooled clip and the made sounds, and
// the silent loop pauses (B-227).
function silence() {
    stopWord();
    [...live].forEach(stopSource);
    if (keepAlive && !keepAlive.paused) keepAlive.pause();
}

// Memo of the last state heard (CLAUDE.md "Subscribers may keep a memo"):
// its robot snapshot, to tell a moment from a re-render, and whether it
// was muted. Overwritten on every setState; never read by another module.
let last = { snap: NONE, muted: false };

// State subscriber: says what each state change's moments call for
// (character.js's table; speak), on every screen (the round end's fanfare
// and line too). A new word (or none: the round end, the back arrow) stops
// his voice, whatever he was saying of the last one (B-223, B-224), also a
// clip still due (start(when): the word he says after the TV's win, his
// line after it), so nothing of the last word is heard over the round end
// (B-230), and loads its own clips (loadWord), muted or not. The
// downloads waiting go on
// once a round has started and the new word's picture has locked
// (BACKLOG B-229, pump: holdsPools). On mute everything playing
// stops and the silent loop pauses; while muted nothing plays; on unmute
// the silent loop plays again (B-227).
export function renderSound(state) {
    const snap = snapshot(state);
    const prev = last;
    last = { snap, muted: state.muted };
    if (snap.key !== prev.snap.key) {
        stopVoice();
        loadWord(state);
    }
    pump();
    if (state.muted) {
        if (!prev.muted) silence();
        return;
    }
    if (prev.muted) keepAwake();
    const moments = momentsFor(prev.snap, snap);
    if (!moments.length) return;
    // A moment the table marks `waitReady` (the greeting) comes with the
    // very tap that unlocks the sound, before his clips are decoded: it
    // waits for a clip of its pool (a few hundred ms; its pool's first clip
    // is the first asked for, B-229, and with none asked for yet, before
    // the page is idle, it says nothing), then says it if
    // the screen is still the same and the sound is on; never twice.
    const waiting = moments.find((m) => MOMENTS[m].waitReady && Array.isArray(MOMENTS[m].lines)
        && !MOMENTS[m].lines.some((pool) => poolClips(listed, pool).some((file) => !!bufferOf(voiceUrl(file)))));
    if (waiting) {
        Promise.all(MOMENTS[waiting].lines.map(poolDecoded)).then((ok) => {
            if (ok.some(Boolean) && state.screen === snap.screen && !state.muted) speak(moments, state, prev.snap, snap);
        });
        return;
    }
    speak(moments, state, prev.snap, snap);
}
