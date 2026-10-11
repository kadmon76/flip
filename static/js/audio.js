// audio.js — the only place sounds play (CLAUDE.md, DESIGN "Sound",
// BACKLOG B-108, B-114). Two kinds of sound:
//   - the target word: the per-word `audio` file from the content JSON,
//     played when the kid taps the speaker on the console (speakWord);
//   - the robot's voice and the block swipe: pools of the existing clips
//     under static/sounds/, preloaded once (init) and played by
//     renderSound, a state subscriber, for the moments character.js's
//     table (MOMENTS[moment].sound) gives a state change. There is no
//     second trigger list here.
// `state.muted` (localStorage `flip.muted`, read and written only here
// through loadMuted / saveMuted) means no sound plays at all.
//
// Everything above "Playback" is pure (no DOM, no Audio) and a Django
// test runs it through node; Audio elements are only created inside
// init() and speakWord().

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

// The first user gesture unlocks playback (see unlock): events that count
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

// The preloaded clips: kind -> [HTMLAudioElement], built once by init()
// from FILES. Media elements, not game state: nothing reads them to
// decide game logic, and which clip plays is never remembered.
const pools = {};

// Handle to the word clip now playing (an HTMLAudioElement), or null. It
// is not game state and not a DOM cache: audio.js keeps it so a new tap or
// a word change can stop the clip, and reads it only to tell whether an
// ended clip is still the current one (a stopped or replaced clip must not
// call its `onEnd`). No other module reads it; whether the word is playing
// is `state.speaking`, set by main.js, and that is the truth.
let wordClip = null;

// Build the pools and wait for the first gesture. Nothing plays here, so
// loading the page raises no autoplay-policy error.
export function init() {
    for (const kind of Object.keys(FILES)) {
        pools[kind] = poolUrls(kind).map((url) => {
            const el = new Audio(url);
            el.preload = 'auto';
            return el;
        });
    }
    for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, true);
}

function allClips() {
    return Object.values(pools).flat();
}

// First user gesture: start every clip silently (element-muted) and stop
// it again as soon as it runs. Browsers that grant playback per element
// (iOS Safari) then allow the clips later, also from a timer (the dome's
// 120ms press). A clip that play() claims meanwhile is unmuted by it and
// left playing. A refused start is caught: no console error.
function unlock() {
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock, true);
    for (const el of allClips()) {
        el.muted = true;
        const release = () => {
            if (!el.muted) return;          // play() took it over
            el.pause();
            el.currentTime = 0;
            el.muted = false;
        };
        let p;
        try {
            p = el.play();
        } catch (e) {
            el.muted = false;
            continue;
        }
        if (p && p.then) p.then(release, () => { el.muted = false; });
        else release();
    }
}

function stop(el) {
    if (el.paused) return;
    el.pause();
    el.currentTime = 0;
}

// Cut the robot's voice (every clip of the voice pools).
function stopVoice() {
    for (const [kind, clips] of Object.entries(pools)) {
        if (CHANNEL[kind] === 'voice') clips.forEach(stop);
    }
}

// Play a random clip of pool `kind` ('correct', 'error', 'tada', 'swipe').
// Muted: nothing. A voice clip cuts the voice clip playing, and does not
// start while the target word plays (`state.speaking`): the word is
// spoken clean and is never cut.
export function play(kind) {
    if (state.muted) return;
    const clips = pools[kind];
    if (!clips || clips.length === 0) return;
    if (CHANNEL[kind] === 'voice') {
        if (state.speaking) return;
        stopVoice();
    }
    const el = clips[pickIndex(clips.length)];
    el.muted = false;
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});    // not unlocked yet: stay silent, no console error
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
    allClips().forEach(stop);
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
