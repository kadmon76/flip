// audio.js — the only place sounds play (CLAUDE.md, DESIGN "Sound",
// BACKLOG B-108, B-114). Its sounds:
//   - the target word: the per-word `audio` file from the content JSON,
//     played when the kid taps the speaker on the console (speakWord);
//   - the robot's voice and the effects (the block swipe, the round end's
//     tada): pools of the existing clips under static/sounds/, downloaded
//     once (init), decoded into Web Audio buffers on the first gesture and
//     played by renderSound, a state subscriber, for the moments
//     character.js's table (MOMENTS[moment].sound) gives a state change.
//     There is no second trigger list here;
//   - his new voice (BACKLOG M4b): the clips tools/voices.py makes into
//     static/voice/ (read-only content, never written here), listed in
//     static/voice/manifest.json, fetched once at init. On each moment he
//     says a line of the pool the table names (MOMENTS[moment].lines,
//     B-224; the picture's: the word's Hebrew guess, else his look's
//     pool), else the moment's prototype clip; after his letter lands, its
//     name (`letters/`). On a correct check (the moments with
//     MOMENTS[moment].word, B-223) he says the word himself first, from
//     the word's `audio` decoded when the word started (sayPlan, speak);
//     the word's gag only after it (B-225: with the word not ready, a
//     shared line or the prototype clip plays alone).
//     His idle peeks whisper too (peekLine, told by character.js).
//     How often (BACKLOG B-226): per moment character.js saysLine, from
//     its CHATTER table: always, or sometimes / rare at a chance and never
//     within its TALK_GAP after his voice went quiet (`hushedAt`); a line
//     dropped drops only his voice (no prototype clip in its place), the
//     effects play;
//   - the TV's tune-in hiss and channel click (BACKLOG B-214): made in
//     code, no sound file (hiss), played when tv.js starts a tune-in.
// `state.muted` (localStorage `flip.muted`, read and written only here
// through loadMuted / saveMuted) means no sound plays at all.
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
// error/, round end -> celebration/tada.mp3, block into slot -> swipe/);
// his voice's prototype clips where his new voice has no line yet.
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
    tada: { dir: 'celebration', names: ['tada.mp3'] },
    swipe: { dir: 'swipe', names: ['swipe1.mp3', 'swipe2.mp3', 'swipe3.mp3', 'swipe4.mp3'] },
    // His "not yet" (moment speakerLocked, on a change of `lockedTaps`;
    // BACKLOG B-203; since B-219 a boost the kid can't afford, as the
    // speaker no longer holds the word back, B-215): the one "hmm no"
    // clip, a placeholder while his new voice has no `no-gears` line
    // (B-224). The file is also in the
    // error pool; it is downloaded and decoded once (init, decodeAll).
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
// are the round end's tada (B-224: under his end line) and the TV's hiss
// (B-214; made in code, not a pool).
export const CHANNEL = { correct: 'voice', error: 'voice', tada: 'fx', swipe: 'fx', locked: 'voice', hiss: 'fx', word: 'voice', line: 'voice' };

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
// own clips aside), downloaded once the manifest is in.
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
//   - fx: the moment's sound when it is an effect (the swipe, the tada),
//     which plays whatever he says;
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
// until a reload. So: init() downloads every clip once; the first user
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
const bytes = {};           // kind -> [Promise of the clip's bytes, or null]
const buffers = {};         // kind -> [decoded AudioBuffer, or null until decoded]
const live = new Set();     // sources now playing (or due, B-224): the pooled clips, his new voice's (B-223, B-224) and the TV's hiss (B-214), { src, kind }
// When his voice last went quiet (BACKLOG B-226): the performance.now() ms
// at which a clip of his voice last ended or was cut (-Infinity before he
// ever spoke), for the quiet gap (character.js CHATTER.TALK_GAP, saysLine).
let hushedAt = -Infinity;
// His new voice (BACKLOG B-223, B-224): the files static/voice/manifest.json
// lists (none until it is in, and none for a missing or broken one), and
// per clip URL { bytes: Promise of its bytes or null, buffer: its decoded
// AudioBuffer or null, decoding }: the clips of his line pools (kept), and
// the current word's own clips: its clip, its gags, its Hebrew guess and
// the names of its letters (let go on a new word).
let listed = [];
const lineClips = new Map();
const wordClips = new Map();
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

function download(url) {
    try {
        return fetch(url)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
}

// A clip of his new voice: its download starts now, and its decode too
// once the context exists (else on the first gesture, decodeAll).
function fetchClip(url) {
    const clip = { bytes: download(url), buffer: null, decoding: false };
    decodeClip(clip);
    return clip;
}

// Decode a clip of his new voice once; one that fails to download or
// decode stays without a buffer (never ready: skipped).
function decodeClip(clip) {
    if (!ctx || clip.decoding) return;
    clip.decoding = true;
    clip.done = clip.bytes
        .then((data) => (data ? ctx.decodeAudioData(data) : null))
        .then((buf) => { if (buf) clip.buffer = buf; return !!buf; })
        .catch(() => false);
}

// Resolves true as soon as one clip of his shared-line pool `pool` is
// decoded, false when none can be (none listed, none decodes). For a
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

// The manifest, fetched once (init): then the clips of his line pools are
// downloaded, and the word showing, if any, gets its gags. A missing or
// broken manifest counts as an empty one, with no console error.
function loadManifest() {
    let got;
    try {
        got = fetch(MANIFEST_URL).then((r) => (r.ok ? r.json() : null));
    } catch (e) {
        got = Promise.resolve(null);
    }
    return got.catch(() => null).then((manifest) => {
        listed = listedClips(manifest);
        for (const pool of linePools()) {
            for (const file of poolClips(listed, pool)) {
                const url = voiceUrl(file);
                if (!lineClips.has(url)) lineClips.set(url, fetchClip(url));
            }
        }
        loadWord(state);
    }).catch(() => {});
}

// The word now showing (BACKLOG B-223, B-224): its own clip (its `audio`),
// its gags, its Hebrew guess and the names of its letters are fetched and
// decoded now, as it starts, so they are ready at the TV's lock, at its
// check and when his letter lands; the clips of the word before are let
// go. Off the play screen, none.
function loadWord(s) {
    const { current } = s;
    const onWord = s.screen === 'play' && current && current.word;
    const files = onWord
        ? [...gagClips(listed, s.theme, current.word), ...hebrewClips(listed, s.theme, current.word),
            ...[...new Set(current.word)].map((letter) => letterClip(listed, letter))].filter(Boolean)
        : [];
    const want = onWord ? [current.audio, ...files.map((file) => voiceUrl(file))].filter(Boolean) : [];
    for (const url of [...wordClips.keys()]) {
        if (!want.includes(url)) wordClips.delete(url);
    }
    for (const url of want) {
        if (!wordClips.has(url)) wordClips.set(url, fetchClip(url));
    }
}

// Start downloading every clip and wait for the first gesture. Nothing
// plays and no AudioContext exists yet, so loading the page raises no
// autoplay-policy warning. A clip that fails to download is left out of
// its pool. A file named by two pools ('hmm no' is in error and locked)
// is downloaded once; both pools share its bytes. His new voice's
// manifest is fetched once (BACKLOG B-223).
export function init() {
    const byUrl = new Map();    // url -> its download, for this call only
    for (const kind of Object.keys(FILES)) {
        buffers[kind] = FILES[kind].names.map(() => null);
        bytes[kind] = poolUrls(kind).map((url) => {
            if (!byUrl.has(url)) byUrl.set(url, download(url));
            return byUrl.get(url);
        });
    }
    loadManifest();
    // iOS 17+: play like a media app (heard with the silent switch on, as
    // the <audio> clips were). Older iOS and other browsers lack it.
    try {
        if (globalThis.navigator && navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {
        // nothing to do
    }
    for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, true);
}

// Every gesture (capture phase, so a drop's own pointerup comes first):
// the first one makes the context and decodes the clips; any one finding
// the context not running (not yet started, or suspended / interrupted
// after the phone switched apps) resumes it and plays one silent sample,
// which is what really opens the output on iOS.
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
    }
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

// Decode each download once (decodeAudioData takes over the bytes it is
// given, so shared bytes cannot be decoded twice) and give the buffer to
// every pool slot that names the file. His new voice's clips fetched
// before the context existed decode now too.
function decodeAll() {
    const decoded = new Map();  // download -> its decode, for this call only
    for (const kind of Object.keys(bytes)) {
        bytes[kind].forEach((p, i) => {
            if (!decoded.has(p)) decoded.set(p, p.then((data) => (data ? ctx.decodeAudioData(data) : null)));
            decoded.get(p)
                .then((buf) => { if (buf) buffers[kind][i] = buf; })
                .catch(() => {});   // an undecodable clip is left out of its pool
        });
    }
    for (const clip of [...lineClips.values(), ...wordClips.values()]) decodeClip(clip);
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
// start); false while none is decoded.
function startPool(kind, then = null, wait = 0) {
    const ready = (buffers[kind] || []).filter(Boolean);
    if (!ready.length) return false;
    start(ready[pickIndex(ready.length)], kind, then, wait);
    return true;
}

// Play a random clip of pool `kind` ('correct', 'error', 'tada', 'swipe',
// 'locked').
// Muted, before the first gesture, or while the pool is still decoding:
// nothing. A voice clip cuts the voice clip playing, and does not start
// while the target word plays (`state.speaking`, or the word he says on a
// correct check, B-223): the word is spoken clean and is never cut. The
// effects (the swipe, the tada) may overlap anything.
export function play(kind) {
    if (state.muted || !ctx || !buffers[kind]) return;
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
// once muted or while the speaker's word plays: the rest is dropped.
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
    if (buf) start(buf, item.kind, then, wait);
    else next();
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
// waited for): its effect at once; his voice, the word (B-223), his line or
// the prototype clip, and the name of the letter he placed (B-224), one
// after the other, each moment's no sooner than the moment starts in his
// script (waitFor: a boost's when its letter lands; startsOf: the second
// miss's letter when his peek is over). The picture's line is the one of
// his look (picksFor), the round end's by its stars, a boost's by its
// kind. Whether each moment says its line (BACKLOG B-226): character.js
// saysLine, its tier and chance, and the quiet gap, from how long his
// voice has been quiet as the change comes (quietFor); one it drops plays
// only its effect (and the lines it always says).
function speak(moments, s, prev, now) {
    const picks = picksFor(moments, now);
    const ready = (url) => !!bufferOf(url);
    const word = s.current && s.current.word;
    const quiet = quietFor();
    const plans = moments.map((m) => sayPlan(m, clipsFor(s, letterGiven(m, prev, now, word)), ready, Math.random,
        { variant: picks[m], stars: now.stars, boostKind: now.boostKind }, saysLine(m, now, quiet, Math.random)));
    for (const p of plans) if (p.fx) play(p.fx);
    const wait = waitFor(moments, prev, now, reducedMotion());
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

// Everything stops: the word and every pooled clip.
function silence() {
    stopWord();
    [...live].forEach(stopSource);
}

// Memo of the last state heard (CLAUDE.md "Subscribers may keep a memo"):
// its robot snapshot, to tell a moment from a re-render, and whether it
// was muted. Overwritten on every setState; never read by another module.
let last = { snap: NONE, muted: false };

// State subscriber: says what each state change's moments call for
// (character.js's table; speak), on every screen (the round end's tada and
// line too). A new word (or none: the round end, the back arrow) stops his
// voice, whatever he was saying of the last one (B-223, B-224), and loads
// its own clips (loadWord), muted or not. On mute everything playing
// stops; while muted nothing plays.
export function renderSound(state) {
    const snap = snapshot(state);
    const prev = last;
    last = { snap, muted: state.muted };
    if (snap.key !== prev.snap.key) {
        stopVoice();
        loadWord(state);
    }
    if (state.muted) {
        if (!prev.muted) silence();
        return;
    }
    const moments = momentsFor(prev.snap, snap);
    if (!moments.length) return;
    // A moment the table marks `waitReady` (the greeting) comes with the
    // very tap that unlocks the sound, before his clips are decoded: it
    // waits for a clip of its pool (a few hundred ms), then says it if
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
