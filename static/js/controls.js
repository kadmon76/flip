// controls.js — the console's controls (DESIGN "Controls and states"):
// the check dome (#check-btn, also "next"), the reset lever (#reset-btn)
// and the speaker (#speak-btn). Each is a stack of the image assets and
// shows one of them, chosen from state on every render; main.js handles
// the taps. The functions above renderControls are pure (no DOM) and a
// Django test runs them through node.

import { levelRules } from './level.js';

// How long a control stays down after a tap, in ms: the dome shows
// `dome-pressed` before the result, the lever `lever-down` before it
// springs back.
export const PRESS_MS = { dome: 120, lever: 250 };

// What a press on the dome does now: 'check' when every slot is filled
// and the arrangement has not been checked yet, 'next' after a correct
// answer or a reveal, null otherwise (slots empty or partly filled, or
// just checked wrong and not changed since).
export function domeAction(current) {
    if (!current || !current.word) return null;
    if (current.status === 'correct' || current.status === 'revealed') return 'next';
    const filled = current.placed.length > 0 && current.placed.every(Boolean);
    if (current.status === 'playing' && filled) return 'check';
    return null;
}

// The dome's image: 'pressed' while held; 'ready' (glow pulsing slowly)
// when a press would check; 'next' (lit, blinking on and off in a glow
// that reaches past its rim, BACKLOG B-212) when a press goes to the next
// word, after a correct answer or a reveal; 'off' otherwise.
export function domeState(current, pressed) {
    if (pressed === 'dome') return 'pressed';
    const action = domeAction(current);
    if (action === 'next') return 'next';
    return action ? 'ready' : 'off';
}

// The lever works while blocks can still move (not after a correct answer
// or a reveal).
export function canReset(current) {
    return !!(current && current.word) && (current.status === 'playing' || current.status === 'wrong');
}

export function leverState(pressed) {
    return pressed === 'lever' ? 'down' : 'up';
}

// The speaker: 'cap' (blanked, taps ignored) when the word has no audio
// file, 'on' while the word plays, 'off' otherwise. It looks the same
// whether or not a tap would play the word (BACKLOG B-203: no lock icon).
export function speakerState(current, speaking) {
    if (!current || !current.audio) return 'cap';
    return speaking ? 'on' : 'off';
}

// What a tap on the speaker does on `level` (the round's level,
// state.round.level; BACKLOG B-203): 'word' plays the word, 'locked'
// holds it back (normal and hard before the word is answered: the robot
// says "hmm no" instead), null does nothing (no audio file: capped).
// Once the word is answered (correct or revealed) it plays on every level.
export function speakerAction(current, level) {
    if (!current || !current.word || !current.audio) return null;
    if (current.status === 'correct' || current.status === 'revealed') return 'word';
    return levelRules(level).hearBefore ? 'word' : 'locked';
}

// --- Render ---

const STATES = {
    dome: ['off', 'ready', 'next', 'pressed'],
    lever: ['up', 'down'],
    speaker: ['off', 'on', 'cap'],
};

// Show image `name` of a control: the button gets class `is-<name>` (CSS
// shows the matching image) and drops the other state classes.
function show(btn, kind, name) {
    for (const s of STATES[kind]) btn.classList.toggle(`is-${s}`, s === name);
}

export function renderControls(state) {
    if (state.screen !== 'play' || !state.current.word) return;
    const { current, pressed, speaking } = state;

    const dome = document.getElementById('check-btn');
    show(dome, 'dome', domeState(current, pressed));
    dome.disabled = !domeAction(current);
    dome.setAttribute('aria-label', domeAction(current) === 'next' ? 'Next' : 'Check');

    const lever = document.getElementById('reset-btn');
    show(lever, 'lever', leverState(pressed));
    lever.disabled = !canReset(current);

    const speaker = document.getElementById('speak-btn');
    const s = speakerState(current, speaking);
    show(speaker, 'speaker', s);
    speaker.disabled = s === 'cap';
}
