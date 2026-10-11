// audio.js — the only place sounds play (CLAUDE.md, DESIGN "Sound",
// BACKLOG B-108, B-114). Two kinds of sound:
//   - the target word: the per-word `audio` file from the content JSON,
//     played when the kid taps the speaker on the console (speakWord);
//   - the robot's voice and the block swipe: pools of the existing clips
//     under static/sounds/, downloaded once (init), decoded into Web
//     Audio buffers on the first gesture and played by
//     renderSound, a state subscriber, for the moments character.js's
//     table (MOMENTS[moment].sound) gives a state change. There is no
//     second trigger list here.
// `state.muted` (localStorage `flip.muted`, read and written only here
// through loadMuted / saveMuted) means no sound plays at all.
//
// Everything above "Playback" is pure (no DOM, no Audio) and a Django
// test runs it through node; the AudioContext is only created on the
// first gesture and Audio elements only inside speakWord().

import { state } from './state.js';
import { snapshot, momentsFor, soundsFor, NONE } from './character.js';

export const SOUND_BASE = '/static/sounds/';
export const MUTED_KEY = 'flip.muted';

// The clips of each pool (DESIGN "Sound": correct -> correct/, wrong ->
// error/, round end -> celebration/tada.mp3, block into slot -> swipe/).
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
};

// The robot's voice (correct, error, tada): one clip at a time, a new one
// cuts the one playing, and none starts over the target word (DESIGN
// "Sound", CHARACTER "Rules"). The swipe is an effect, not his voice: it
// plays whenever a block goes into a slot and may overlap anything.
export const CHANNEL = { correct: 'voice', error: 'voice', tada: 'voice', swipe: 'fx' };

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
// The target word stays an <audio> element (speakWord): one file per
// word, started by the kid's own tap on the speaker.
//
// Audio engine handles, not game state (CLAUDE.md "audio.js"): no other
// module reads them and nothing decides game logic from them.
let ctx = null;             // the AudioContext, made on the first gesture
const bytes = {};           // kind -> [Promise of the clip's bytes, or null]
const buffers = {};         // kind -> [decoded AudioBuffer, or null until decoded]
const live = new Set();     // pooled sources now playing: { src, kind }

// Handle to the word clip now playing (an HTMLAudioElement), or null. It
// is not game state and not a DOM cache: audio.js keeps it so a new tap or
// a word change can stop the clip, and reads it only to tell whether an
// ended clip is still the current one (a stopped or replaced clip must not
// call its `onEnd`). No other module reads it; whether the word is playing
// is `state.speaking`, set by main.js, and that is the truth.
let wordClip = null;

// Start downloading every clip and wait for the first gesture. Nothing
// plays and no AudioContext exists yet, so loading the page raises no
// autoplay-policy warning. A clip that fails to download is left out of
// its pool.
export function init() {
    for (const kind of Object.keys(FILES)) {
        buffers[kind] = FILES[kind].names.map(() => null);
        bytes[kind] = poolUrls(kind).map((url) => {
            try {
                return fetch(url)
                    .then((r) => (r.ok ? r.arrayBuffer() : null))
                    .catch(() => null);
            } catch (e) {
                return Promise.resolve(null);
            }
        });
    }
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

function decodeAll() {
    for (const kind of Object.keys(bytes)) {
        bytes[kind].forEach((p, i) => {
            p.then((data) => (data ? ctx.decodeAudioData(data) : null))
                .then((buf) => { if (buf) buffers[kind][i] = buf; })
                .catch(() => {});   // an undecodable clip is left out of its pool
        });
    }
}

function stopSource(entry) {
    live.delete(entry);
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

// Play a random clip of pool `kind` ('correct', 'error', 'tada', 'swipe').
// Muted, before the first gesture, or while the pool is still decoding:
// nothing. A voice clip cuts the voice clip playing, and does not start
// while the target word plays (`state.speaking`): the word is spoken
// clean and is never cut. The swipe may overlap anything.
export function play(kind) {
    if (state.muted || !ctx || !buffers[kind]) return;
    if (CHANNEL[kind] === 'voice') {
        if (state.speaking) return;
        stopVoice();
    }
    const ready = buffers[kind].filter(Boolean);
    if (ready.length === 0) return;
    try {
        if (ctx.state !== 'running') {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => {});
        }
        const src = ctx.createBufferSource();
        src.buffer = ready[pickIndex(ready.length)];
        src.connect(ctx.destination);
        const entry = { src, kind };
        live.add(entry);
        src.onended = () => live.delete(entry);
        src.start(0);
    } catch (e) {
        // stay silent, no console error
    }
}

// Play the word clip at `url`; `onEnd` runs once when it ends or fails to
// play (missing file, decode error, playback refused), or at once when
// muted. The word cuts the robot's voice. A clip stopped by stopWord() or
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

// State subscriber: plays the clip of each moment the state change makes
// (character.js's table), on every screen (the round-end tada too). On
// mute everything playing stops; while muted nothing plays.
export function renderSound(state) {
    const snap = snapshot(state);
    const prev = last;
    last = { snap, muted: state.muted };
    if (state.muted) {
        if (!prev.muted) silence();
        return;
    }
    for (const kind of soundsFor(momentsFor(prev.snap, snap))) play(kind);
}
