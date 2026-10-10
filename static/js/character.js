// character.js — the robot behind the console (CHARACTER.md, BACKLOG
// B-115). The only place his poses and moves are decided: one table maps
// each moment of the CHARACTER.md "Moment map" to a pose, a movement and
// a sound, and renderRobot, a state subscriber, plays the moment it
// detects against what it last rendered (like feedback.js); a re-render
// in the same state does nothing. It never mutates state. The functions
// above "Render" are pure (no DOM) and a Django test runs them through
// node.
//
// The sound column is data only for now: the voice pools and the mute
// toggle are B-108, which plays these clips through audio.js.

import { starsFor } from './score.js';

// The poses on the play screen (static/images/ui/robot-<pose>.png).
// robot-hero is for the theme screen and is not used here.
export const POSES = ['idle', 'thinking', 'confused', 'excited', 'happy', 'oops'];

// Moment -> the steps he takes (pose and movement change together, one
// step at a time, CHANGE_MS apart) and the clip that goes with it
// (B-108's pools: 'swipe', 'error', 'correct', 'tada'; null for none).
// Where the map gives a choice, the moment is split in two and
// momentsFor() picks one:
//   - "All slots filled": excited (pointing at the dome) in the first
//     EARLY_ROUNDS rounds of the session, idle after that;
//   - "Wrong check ... peek, sometimes": he peeks when the miss leaves one
//     lives bulb lit, on the first miss he is only confused;
//   - "Round end": happy for 2-3 stars, idle for 0-1 (never sad).
// "wake" is the kid's next action after the idle sink ("pops back up").
export const MOMENTS = {
    roundStart: { steps: [{ pose: 'idle', move: 'pop' }], sound: null },
    picture: { steps: [{ pose: 'thinking', move: 'none' }], sound: null },
    blockPlaced: { steps: [{ pose: 'idle', move: 'none' }], sound: 'swipe' },
    filledEarly: { steps: [{ pose: 'excited', move: 'none' }], sound: null },
    filled: { steps: [{ pose: 'idle', move: 'none' }], sound: null },
    kidIdle: { steps: [{ pose: 'thinking', move: 'none' }, { pose: 'thinking', move: 'sink' }], sound: null },
    wake: { steps: [{ pose: 'idle', move: 'pop' }], sound: null },
    wrong: { steps: [{ pose: 'confused', move: 'none' }], sound: 'error' },
    wrongPeek: { steps: [{ pose: 'confused', move: 'peek' }], sound: 'error' },
    thirdMiss: { steps: [{ pose: 'oops', move: 'none' }, { pose: 'happy', move: 'none' }], sound: 'error' },
    correct: { steps: [{ pose: 'excited', move: 'pop' }], sound: 'correct' },
    streak: { steps: [{ pose: 'excited', move: 'doublePop' }], sound: 'correct' },
    roundEndGood: { steps: [{ pose: 'happy', move: 'none' }], sound: 'tada' },
    roundEnd: { steps: [{ pose: 'idle', move: 'none' }], sound: 'tada' },
};

// Movements: a vertical slide and nothing else (CHARACTER "Presence").
// Each is a list of segments: `y` is where he goes, in CSS px at 360
// wide (0 = at rest with ~75px of him above the console; positive is
// down, behind it), in `duration` seconds. Every movement except the
// sink ends at rest.
//   - pop: rises 20px in 180ms, ease-out, then settles (120ms)
//   - doublePop: two pops (3 correct in a row)
//   - sink: slides down in 400ms until only the top of his head shows
//     (14px of him)
//   - peek: down until only his eyes are above the edge (57px of him),
//     there for 600ms, then back
//   - none: no move of his own; back to rest if a move left him elsewhere
export const MOVES = {
    none: [{ y: 0, duration: 0.2, ease: 'power2.out' }],
    pop: [
        { y: -20, duration: 0.18, ease: 'power2.out' },
        { y: 0, duration: 0.12, ease: 'power1.inOut' },
    ],
    doublePop: [
        { y: -20, duration: 0.18, ease: 'power2.out' },
        { y: 0, duration: 0.12, ease: 'power1.inOut' },
        { y: -20, duration: 0.18, ease: 'power2.out' },
        { y: 0, duration: 0.12, ease: 'power1.inOut' },
    ],
    sink: [{ y: 61, duration: 0.4, ease: 'power2.out' }],
    peek: [
        { y: 18, duration: 0.15, ease: 'power2.out' },
        { y: 18, duration: 0.6, ease: 'none' },
        { y: 0, duration: 0.2, ease: 'power2.out' },
    ],
};

export const CHANGE_MS = 300;     // never more than one change per 300ms
export const IDLE_MS = 10000;     // kid idle 10s -> thinking, then sink
export const EARLY_ROUNDS = 2;    // he points at the dome in the first 2 rounds
export const STREAK = 3;          // 3 correct in a row -> double pop
export const ROBOT_H = 120;       // sprite height in CSS px at 360 wide (game.css)

// The movement for `kind`. prefers-reduced-motion: pose swaps only, no
// sliding, so he stays at rest.
export function moveFor(kind, reduced) {
    const segments = MOVES[kind];
    if (!segments) throw new Error(`character: unknown move "${kind}"`);
    if (reduced) return [{ y: 0, duration: 0, ease: 'none' }];
    return segments.map((s) => ({ ...s }));
}

// The current word: the round (counted over the session) and its index.
export function wordKey(state) {
    return `${state.roundsStarted}:${state.round.index}`;
}

// Words checked correct in a row, ending at word `index` of the round.
function streakOf(results, index) {
    let n = 0;
    for (let i = index; i >= 0 && results[i] && results[i].correct; i--) n++;
    return n;
}

// What the robot reacts to, read from state.
export function snapshot(state) {
    const { screen, current, round, lives } = state;
    const onWord = screen === 'play' && !!current.word;
    const results = round.results || [];
    return {
        screen,
        round: state.roundsStarted,
        key: onWord ? `${wordKey(state)}:${current.word}` : null,
        status: onWord ? current.status : null,
        lives,
        placed: onWord ? current.placed.map((p) => (p ? p.tileId : '-')).join(',') : '',
        filled: onWord && current.placed.length > 0 && current.placed.every(Boolean),
        idleBeat: state.idleBeat,
        streak: onWord ? streakOf(results, round.index) : 0,
        stars: screen === 'round-end' ? starsFor(results.filter((r) => r && r.correct).length, round.size) : null,
    };
}

// The moments between two snapshots, in the order they happen (a new
// round is also a new picture); [] when nothing he reacts to changed.
export function momentsFor(prev, now) {
    if (now.screen === 'round-end') {
        if (prev.screen === 'round-end') return [];
        return [now.stars >= 2 ? 'roundEndGood' : 'roundEnd'];
    }
    if (!now.key) return [];
    if (!prev.key || prev.round !== now.round) return ['roundStart', 'picture'];
    if (prev.key !== now.key) return ['picture'];
    if (now.status !== prev.status || now.lives < prev.lives) {
        if (now.status === 'revealed') return ['thirdMiss'];
        if (now.status === 'correct') return [now.streak >= STREAK ? 'streak' : 'correct'];
        if (now.status === 'wrong') return [now.lives === 1 ? 'wrongPeek' : 'wrong'];
    }
    if (now.idleBeat !== prev.idleBeat) {
        if (now.idleBeat === 'sunk') return ['kidIdle'];
        if (prev.idleBeat === 'sunk') return ['wake'];
    }
    if (now.placed !== prev.placed) {
        if (now.filled && now.status === 'playing') return [now.round <= EARLY_ROUNDS ? 'filledEarly' : 'filled'];
        return ['blockPlaced'];
    }
    return [];
}

export function stepsFor(moments) {
    return moments.flatMap((m) => MOMENTS[m].steps);
}

// When each of `count` steps starts (ms from now) if the last change was
// `sinceLast` ms ago: CHANGE_MS after the last change at the earliest,
// then CHANGE_MS apart.
export function stepDelays(count, sinceLast) {
    const first = Math.max(0, CHANGE_MS - sinceLast);
    return Array.from({ length: count }, (_, i) => first + i * CHANGE_MS);
}

// Ms until the kid has been idle IDLE_MS on this word (0 = now), counted
// from `state.lastInput`; null when the idle beat cannot come (not on a
// word, or it already came for this word: once per word).
export function idleWait(state, now) {
    if (state.screen !== 'play' || !state.current.word || state.idleBeat !== null) return null;
    return Math.max(0, state.lastInput + IDLE_MS - now);
}

// --- Render ---

// Render cache: the snapshot it last rendered (to tell a moment from a
// re-render) and when it last changed his pose (performance.now() ms, to
// keep changes CHANGE_MS apart). Not game state; nothing else reads it.
const NONE = { screen: null, round: 0, key: null, status: null, lives: null, placed: '', filled: false, idleBeat: null, streak: 0, stars: null };
let last = { snap: NONE, changedAt: -Infinity };

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function renderRobot(state) {
    const now = snapshot(state);
    const moments = momentsFor(last.snap, now);
    const wasOnPlay = last.snap.screen === 'play';
    last = { ...last, snap: now };
    if (now.screen !== 'play') {
        // He is only on the play screen; steps still waiting are dropped.
        if (wasOnPlay) gsap.killTweensOf(applyStep);
        return;
    }
    if (!moments.length) return;
    const steps = stepsFor(moments);
    const delays = stepDelays(steps.length, performance.now() - last.changedAt);
    // A new moment replaces the steps an earlier one still had waiting.
    gsap.killTweensOf(applyStep);
    steps.forEach((step, i) => {
        if (delays[i] === 0) applyStep(step);
        else gsap.delayedCall(delays[i] / 1000, applyStep, [step]);
    });
}

// Show `step.pose` (class is-<pose> on .robot; CSS shows that image) and
// start `step.move` on the sliding layer.
function applyStep(step) {
    const robot = document.querySelector('#screen-play .robot');
    if (!robot) return;
    last = { ...last, changedAt: performance.now() };
    for (const p of POSES) robot.classList.toggle(`is-${p}`, p === step.pose);
    slide(robot.querySelector('.robot-body'), moveFor(step.move, reducedMotion()));
}

// Play the segments on `el` as yPercent of its own height, so the px
// numbers (at 360 wide) scale with the sprite.
function slide(el, segments) {
    if (!el) return;
    gsap.killTweensOf(el);
    const tl = gsap.timeline();
    for (const s of segments) {
        const yPercent = (s.y / ROBOT_H) * 100;
        if (s.duration === 0) tl.set(el, { yPercent });
        else tl.to(el, { yPercent, duration: s.duration, ease: s.ease });
    }
}
