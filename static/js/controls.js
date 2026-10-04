// controls.js — the console's controls (DESIGN "Controls and states"):
// the check dome (#check-btn, also "next"), the reset lever (#reset-btn)
// and the speaker (#speak-btn). Each is a stack of the image assets and
// shows one of them, chosen from state on every render; main.js handles
// the taps. The functions above renderControls are pure (no DOM) and a
// Django test runs them through node.

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

// The dome's image: 'pressed' while held, 'ready' (glow pulsing) when a
// press would do something, 'off' otherwise.
export function domeState(current, pressed) {
    if (pressed === 'dome') return 'pressed';
    return domeAction(current) ? 'ready' : 'off';
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
// file, 'on' while the word plays, 'off' otherwise.
export function speakerState(current, speaking) {
    if (!current || !current.audio) return 'cap';
    return speaking ? 'on' : 'off';
}

// --- Render ---

const STATES = {
    dome: ['off', 'ready', 'pressed'],
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
