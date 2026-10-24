// coach.js — the first word's tutorial (human, 2026-10-24): on a
// player's first word ever (`state.tutorial`, main.js), a ghost mitten
// shows what to do, with no words: it carries a letter from the bench to
// the first empty slot, over and over, until the kid places a letter;
// then, once every slot is full, it taps the check dome until the kid
// does. The robot says his tutorial lines at those moments (character.js
// tutorialDrag, tutorialPress, tutorialDone). After the word the tutorial
// never comes back for that player (players.js markTutored).
//
// coachStep and dragTarget are pure (no DOM), so character.js reads the
// same step for the robot and a Django test runs them through node.
// renderCoach is a subscriber; it never mutates state. Its DOM cache is
// the mitten (one fixed image on <body>) and its render cache the step
// and target it last showed, so a re-render in the same step does not
// restart the motion; neither is read to decide game logic.

// The ghost mitten: the robot's pointing mitten (a puppet part), its
// fingertip at the target. Its numbers: shown this wide (CSS px), the
// fingertip's place in the image (fractions), its turn per step, one
// loop's length.
export const COACH = {
    src: '/static/images/ui/robot/hand-point.png',
    width: 72,
    tip: [0.95, 0.42],
    turn: { drag: -40, press: 30 },
    loop: { drag: 2200, press: 1400 },
};

// The tutorial's step for `state`: 'drag' (the word is on the TV, the kid
// has placed no letter yet), 'press' (every slot is full, the word not
// checked yet) or null (no tutorial, not on the play screen, the picture
// not tuned in yet, a letter placed but slots still empty, a wrong check
// waiting for a move, the word answered).
export function coachStep(state) {
    const current = state && state.current;
    if (!state || !state.tutorial || state.screen !== 'play' || !current || !current.word || !state.tuned) return null;
    if (current.status !== 'playing') return null;
    const placed = current.placed || [];
    if (placed.length && placed.every(Boolean)) return 'press';
    if (!placed.some((p) => p && !p.locked)) return 'drag';
    return null;
}

// Where the drag shows a letter going: the first empty slot and a bench
// tile holding that slot's right letter (not placed, not gone; the
// first such tile in tray order), else any free tile. Null when there is
// no empty slot or no free tile.
export function dragTarget(current) {
    if (!current || !current.word) return null;
    const index = (current.placed || []).findIndex((p) => !p);
    if (index === -1) return null;
    const free = (current.tray || []).filter((t) => !t.used && !t.gone);
    const tile = free.find((t) => t.letter === current.word[index]) || free[0];
    return tile ? { index, tileId: tile.id } : null;
}

// DOM cache: the mitten image. Render cache: the step and target it shows.
let hand = null;
let shown = null;

function reducedMotion() {
    try {
        return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

function centre(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function mitten() {
    if (hand) return hand;
    hand = document.createElement('img');
    hand.className = 'coach-hand';
    hand.src = COACH.src;
    hand.alt = '';
    hand.setAttribute('aria-hidden', 'true');
    hand.style.width = `${COACH.width}px`;
    document.body.appendChild(hand);
    return hand;
}

// Place the mitten so its fingertip is at `at`, turned `turn` degrees.
function frame(at, turn, extra = '') {
    const w = COACH.width;
    const h = w * (118 / 203);
    const x = at.x - w * COACH.tip[0];
    const y = at.y - h * COACH.tip[1];
    return `translate(${x}px, ${y}px) rotate(${turn}deg) ${extra}`;
}

function stop() {
    if (!hand) return;
    hand.getAnimations().forEach((a) => a.cancel());
    hand.style.opacity = '0';
}

export function renderCoach(state) {
    const step = coachStep(state);
    const target = step === 'drag' ? dragTarget(state.current) : null;
    const key = step ? `${step}:${state.current.word}:${target ? `${target.index}:${target.tileId}` : ''}` : null;
    if (key === shown) return;
    shown = key;
    stop();
    if (!step) return;
    const el = mitten();
    el.style.transformOrigin = `${COACH.tip[0] * 100}% ${COACH.tip[1] * 100}%`;
    const still = reducedMotion();
    if (step === 'drag' && target) {
        const tile = document.querySelector(`.draggable-letter[data-tile-id="${target.tileId}"]`);
        const slot = document.querySelectorAll('#letter-boxes .letter-box')[target.index];
        if (!tile || !slot) return;
        const from = centre(tile);
        const to = centre(slot);
        const t = COACH.turn.drag;
        el.style.opacity = '1';
        if (still) {
            el.style.transform = frame(to, t);
            el.animate([{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }], { duration: COACH.loop.drag, iterations: Infinity });
            return;
        }
        el.animate([
            { transform: frame(from, t), opacity: 0, offset: 0 },
            { transform: frame(from, t, 'scale(0.9)'), opacity: 0.95, offset: 0.15 },
            { transform: frame(to, t, 'scale(0.9)'), opacity: 0.95, offset: 0.65, easing: 'ease-in-out' },
            { transform: frame(to, t), opacity: 0.95, offset: 0.8 },
            { transform: frame(to, t), opacity: 0, offset: 1 },
        ], { duration: COACH.loop.drag, iterations: Infinity, easing: 'ease-in-out' });
        return;
    }
    if (step === 'press') {
        const dome = document.getElementById('check-btn');
        if (!dome) return;
        const at = centre(dome);
        const t = COACH.turn.press;
        el.style.opacity = '1';
        if (still) {
            el.style.transform = frame(at, t);
            return;
        }
        el.animate([
            { transform: frame(at, t, 'translate(-10px, -10px)'), opacity: 0.95, offset: 0 },
            { transform: frame(at, t, 'scale(0.88)'), opacity: 0.95, offset: 0.35 },
            { transform: frame(at, t, 'translate(-10px, -10px)'), opacity: 0.95, offset: 0.7 },
            { transform: frame(at, t, 'translate(-10px, -10px)'), opacity: 0.95, offset: 1 },
        ], { duration: COACH.loop.press, iterations: Infinity, easing: 'ease-in-out' });
    }
}

// The window was resized: the targets moved, so show the step again.
export function resetCoach() {
    shown = null;
}
