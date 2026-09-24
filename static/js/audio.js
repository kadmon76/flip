// audio.js — the character's voice (DESIGN "Sound", BACKLOG B-108). The
// only module that constructs Audio. Pools are preloaded from the files
// under static/sounds/; play(kind) picks a random clip. Sounds are cued
// from state changes (cuesFor), never from DOM events, so tap-to-place,
// drag-drop and --eval all sound the same.
//
// Everything above `init` is DOM-free (a Django test runs it through
// node); Audio elements are only created inside init().

export const SOUND_BASE = '/static/sounds/';
export const MUTED_KEY = 'flip.muted';

// The existing clips, read-only in M1 (CLAUDE.md). Names with spaces
// are URL-encoded by clipUrl; the browser cannot list a directory, so
// the pools are spelled out here.
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

// Two channels: the character's voice (correct, error, tada) where a new
// clip cuts the one playing, and effects (swipe) that may overlap it.
export const CHANNEL = { correct: 'voice', error: 'voice', tada: 'voice', swipe: 'fx' };

export function clipUrl(kind, name, base = SOUND_BASE) {
    const pool = FILES[kind];
    if (!pool) throw new Error(`audio: unknown kind "${kind}"`);
    return `${base}${pool.dir}/${encodeURIComponent(name)}`;
}

export function poolUrls(kind, base = SOUND_BASE) {
    return FILES[kind].names.map((name) => clipUrl(kind, name, base));
}

// Random index into a pool of `size`, never the same as `last` when the
// pool has more than one clip (so the kid does not hear one line twice
// in a row). `rand` is Math.random unless a test passes its own.
export function pickIndex(size, last = -1, rand = Math.random) {
    if (size <= 0) return -1;
    if (size === 1) return 0;
    const avoid = last >= 0 && last < size;
    let i = Math.floor(rand() * (avoid ? size - 1 : size));
    if (avoid && i >= last) i += 1;
    return i;
}

// Which sounds a state change calls for, from the previous and the new
// state. Rules (BACKLOG B-108):
// - tada: the screen became 'round-end' (once per transition, not on
//   every setState while it is showing)
// - correct: the current word was just checked correct
// - error: a heart was lost (wrong check, or the third miss that reveals)
// - swipe: a tile landed in a box (new or different tile in some slot);
//   not the reveal, which fills every box and already plays error
export function cuesFor(prev, next) {
    const cues = [];
    if (next.screen === 'round-end' && prev.screen !== 'round-end') cues.push('tada');
    if (next.current.status === 'correct' && prev.current.status !== 'correct') cues.push('correct');
    if (next.lives < prev.lives) cues.push('error');
    if (next.current.status !== 'revealed' && tileLanded(prev.current.placed, next.current.placed)) {
        cues.push('swipe');
    }
    return cues;
}

function tileLanded(before, after) {
    return after.some((slot, i) => {
        if (!slot) return false;
        const was = before[i];
        return !was || was.tileId !== slot.tileId;
    });
}

// localStorage flag: 'true' when muted; anything else (missing, corrupt,
// storage unavailable) means sound on, the DESIGN default.
export function readMuted(storage) {
    try {
        return storage.getItem(MUTED_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

export function writeMuted(storage, muted) {
    try {
        storage.setItem(MUTED_KEY, muted ? 'true' : 'false');
    } catch (e) {
        // private mode or full storage: the toggle still works for this visit
    }
}

// --- DOM side: pools, playback, unlock, state subscriber ---

const pools = {};        // kind -> [HTMLAudioElement]
const lastIndex = {};    // kind -> index last played, so pickIndex can avoid it
const playing = {};      // channel -> HTMLAudioElement now playing
const priming = new Set();
let muted = false;

// Build the pools. Nothing plays here: an Audio element with preload
// only fetches, so there is no autoplay-policy error on load.
export function init() {
    for (const kind of Object.keys(FILES)) {
        pools[kind] = poolUrls(kind).map((url) => {
            const el = new Audio(url);
            el.preload = 'auto';
            return el;
        });
        lastIndex[kind] = -1;
    }
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('keydown', unlock, { once: true, capture: true });
}

// First user gesture: start and at once pause every clip while muted, so
// browsers that tie playback permission to the element (iOS) allow the
// later play() calls. A clip that play() asks for meanwhile is left alone.
function unlock() {
    for (const kind of Object.keys(pools)) {
        for (const el of pools[kind]) {
            priming.add(el);
            el.muted = true;
            const p = el.play();
            if (!p) {
                priming.delete(el);
                el.muted = false;
                continue;
            }
            p.then(() => {
                if (!priming.delete(el)) return;
                el.pause();
                el.currentTime = 0;
                el.muted = false;
            }).catch(() => {
                priming.delete(el);
                el.muted = false;
            });
        }
    }
}

function stop(el) {
    if (!el) return;
    el.pause();
    el.currentTime = 0;
}

export function play(kind) {
    const pool = pools[kind];
    if (!pool || muted || pool.length === 0) return;
    const channel = CHANNEL[kind];
    const i = pickIndex(pool.length, lastIndex[kind]);
    lastIndex[kind] = i;
    const el = pool[i];
    stop(playing[channel]);
    playing[channel] = el;
    priming.delete(el);
    el.muted = false;
    el.currentTime = 0;
    const p = el.play();
    if (p) p.catch(() => {});   // not unlocked yet: stay silent, no console error
}

export function setMuted(on) {
    muted = !!on;
    if (muted) Object.values(playing).forEach(stop);
}

// State subscriber (main.js wires it). Keeps the slice of the previous
// state the cue rules compare against; it is a memo of what was last
// heard, not game state (like the render caches in main.js and card.js).
let last = null;

export function onState(state) {
    if (last === null) {
        last = snapshot(state);
        setMuted(state.muted);
        return;
    }
    if (state.muted !== last.muted) {
        setMuted(state.muted);
        writeMuted(localStorage, state.muted);
    }
    const cues = cuesFor(last, state);
    last = snapshot(state);
    cues.forEach(play);
}

function snapshot(state) {
    return { screen: state.screen, lives: state.lives, current: state.current, muted: state.muted };
}
