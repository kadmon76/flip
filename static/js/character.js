// character.js — the robot behind the console (CHARACTER.md, BACKLOG
// B-115, B-210). The only place his poses and moves are decided. He is a
// puppet of separate parts (BACKLOG B-210; the approved prototype is
// design/reference/robot-puppet.html, whose numbers are ported here as
// they are): a body, a head that turns about its neck, two eyebrows in
// the head, eyes drawn in the visor (SVG) and two mitten hands in a layer
// of their own over the console's top edge. One table maps each moment of
// the CHARACTER.md "Moment map" to the steps he takes (the parts' poses
// and moves at set times) and a sound, and renderRobot, a state
// subscriber, plays the moment it detects against what it last rendered
// (like feedback.js); a re-render in the same state does nothing. It
// never mutates state. Everything above "Render" is pure (no DOM) and a
// Django test runs it through node.
//
// The sound and lines columns are the robot's voice: audio.js (B-108), the
// only place sounds play, asks momentsFor() which moments a state change
// is and plays, per moment, a line of the pool its `lines` column names
// (his new voice, B-224; on a correct check the word first, the `word`
// column, B-223, once the TV's win has played, `win`, B-227), else the
// prototype clip of its `sound` column, then the name of the letter he
// placed (the `letter` column); nothing else
// triggers a clip, except his idle peeks, which renderRobot tells main.js
// about (`onPeek`). How often a moment's line is said is the CHATTER
// table's (BACKLOG B-226: always, sometimes or rare, and a quiet gap
// after he talks); a line it drops drops only his voice, never the pose.
// While one of his clips plays (the word he says on a
// correct check too, not the speaker's), audio.js's AnalyserNode hears it
// and main.js hands its samples to renderTalk() every frame (B-210, the
// talking effects below).

import { starsFor } from './score.js';
import { domeAction } from './controls.js';
import { motionFor } from './motion.js';
import { coachStep } from './coach.js';
import { WIN_MS } from './picture.js';
import { HINT_AT } from './bulbs.js';

// --- The puppet (design/reference/robot-puppet.html) ---

// Every part is drawn on one 505x505 canvas of "puppet px" (the images in
// static/images/ui/robot/ are that canvas, already aligned). The console's
// top edge crosses him at y EDGE. At 360 wide one puppet px is SCALE CSS
// px (game.css --ppx): his 318 puppet px above the edge (cap at the top of
// his float) come to the ~75px of head and body DESIGN keeps free of the
// bench blocks.
export const CANVAS = 505;
export const EDGE = 374;
export const SCALE = 0.24;

// Turning points: the head turns about its neck, the body breathes from
// its base, each eyebrow turns about its own middle.
export const PIVOT = { head: [241, 262], body: [241, 420], browL: [230, 126], browR: [308, 136] };

// Where each hand's layer puts its mitten at rest (the reference's #handL
// and #handR); a hand pose moves the layer from there and turns it about
// that point.
export const REST = { L: { x: 134, y: 338 }, R: { x: 350, y: 346 } };

// Hand poses: each hand's target centre, turn (degrees) and shape. The
// console edge is at y 374, so every pose keeps the hands above it;
// "rest" has the mittens resting on the edge.
export const HANDS = {
    rest: { L: { x: 150, y: 340, r: -8, s: 'rest' }, R: { x: 334, y: 344, r: 8, s: 'rest' } },
    chin: { L: { x: 150, y: 342, r: -8, s: 'rest' }, R: { x: 290, y: 270, r: -15, s: 'ball' } },
    point: { L: { x: 150, y: 340, r: -8, s: 'rest' }, R: { x: 398, y: 318, r: 32, s: 'point' } },
    scratch: { L: { x: 150, y: 342, r: -8, s: 'rest' }, R: { x: 368, y: 122, r: -150, s: 'ball' } },
    cover: { L: { x: 228, y: 194, r: 8, s: 'wave' }, R: { x: 310, y: 206, r: -8, s: 'wave' } },
    wave: { L: { x: 96, y: 262, r: -18, s: 'wave' }, R: { x: 400, y: 196, r: 14, s: 'wave' } },
    cheer: { L: { x: 84, y: 180, r: -12, s: 'wave' }, R: { x: 406, y: 168, r: 12, s: 'wave' } },
    clap: { L: { x: 212, y: 310, r: 20, s: 'wave' }, R: { x: 274, y: 314, r: -20, s: 'wave' } },
    shrug: { L: { x: 104, y: 292, r: -10, s: 'palm' }, R: { x: 382, y: 296, r: 10, s: 'palm' } },
    grip: { L: { x: 184, y: 360, r: 0, s: 'ball' }, R: { x: 302, y: 362, r: 0, s: 'ball' } },
    gasp: { L: { x: 196, y: 262, r: 10, s: 'wave' }, R: { x: 300, y: 270, r: -10, s: 'wave' } },
    giggle: { L: { x: 150, y: 340, r: -8, s: 'rest' }, R: { x: 298, y: 262, r: -10, s: 'ball' } },
    shock: { L: { x: 70, y: 214, r: -24, s: 'wave' }, R: { x: 414, y: 206, r: 24, s: 'wave' } },
    pointUp: { L: { x: 150, y: 340, r: -8, s: 'rest' }, R: { x: 356, y: 300, r: -30, s: 'point' } },
    pump: { L: { x: 150, y: 340, r: -8, s: 'rest' }, R: { x: 392, y: 226, r: -6, s: 'ball' } },
    pump2: { L: { x: 92, y: 226, r: 6, s: 'ball' }, R: { x: 392, y: 226, r: -6, s: 'ball' } },
};

// The mitten shapes (static/images/ui/robot/hand-<file>.png, 2x density,
// placed by their centre) and their width in puppet px. The left hand
// uses the right-hand shapes mirrored, except rest, which has its own.
export const HAND_SHAPES = {
    rest: { L: 'restL', R: 'restR', width: 86 },
    wave: { L: 'wave', R: 'wave', width: 83 },
    point: { L: 'point', R: 'point', width: 101 },
    ball: { L: 'ball', R: 'ball', width: 72 },
    palm: { L: 'palm', R: 'palm', width: 103 },
};

// Eye shapes in the visor's SVG units (1264 to the canvas): [left rx, ry,
// right rx, ry]; 'arc' is the happy "^ ^" (the balls fade out, idle size).
export const EYES = {
    idle: [34, 48, 30, 42],
    wide: [42, 56, 38, 52],
    squint: [32, 8, 28, 8],
    confused: [40, 54, 14, 16],
    dots: [12, 12, 11, 11],
    happy: 'arc',
};

// Eyebrows: [left y, left turn, right y, right turn] (puppet px, degrees).
export const BROWS = {
    calm: [0, 0, 0, 0],
    up: [-14, 0, -14, 0],
    frown: [8, 6, 10, -5],
    puzzled: [-12, -8, 6, 8],
    worried: [-12, -10, -12, 10],
    happy: [-6, -4, -6, 4],
};

// How each part moves to a new pose (seconds, GSAP eases), and his whole
// body's moves: a pop (body up 26, hands up 30 a beat later and trailing
// 10 down, so they follow his move instead of sliding like stickers), a
// sink (body, and hands hidden once he is more than 40 down; sunk past
// 60) and the head-shake (9° and back, three times, then the head settles
// on its pose).
export const TIMING = {
    hands: { duration: 0.35, ease: 'back.out(1.5)', lag: 0.04 },
    eyes: { duration: 0.25, ease: 'back.out(1.4)' },
    brows: { duration: 0.3, ease: 'back.out(2)' },
    head: { duration: 0.4, ease: 'back.out(1.5)' },
    look: { duration: 0.25, ease: 'power2.out' },
    sink: { duration: 0.4, ease: 'power2.out', hands: 0.3, hideHands: 40, sunk: 60 },
    pop: {
        body: { y: -26, up: 0.18, down: 0.14 },
        hands: { y: -30, delay: 0.04, up: 0.2, down: 0.18 },
        trail: { y: 10, delay: 0.05, down: 0.12, back: 0.3, ease: 'back.out(3)' },
        small: 0.5,
    },
    shake: { turn: 9, duration: 0.09, repeat: 5, ease: 'sine.inOut', settle: 0.15 },
};

// Ambient life while he is shown (every screen he is on: the play
// screen): he floats, breathes, his hands drift, his eyebrows bob out of
// step; he blinks (now and then twice), his eyes wander, and now and then
// one eyebrow lifts or wiggles on its own. Loops are sine in-out, back
// and forth, for ever; `every` is [least, extra at random] seconds.
// prefers-reduced-motion: none of it (pose and shape changes only).
export const AMBIENT = {
    float: { y: -6, duration: 1.7 },
    breathe: { scaleY: 1.012, scaleX: 0.996, duration: 1.3 },
    handL: { y: -8, x: 3, duration: 1.5, delay: 0.35 },
    handR: { y: -10, x: -3, duration: 1.8, delay: 0.6 },
    browL: { y: -3, duration: 1.9 },
    browR: { y: -3, rotation: 2, duration: 2.3, delay: 0.5 },
    blink: { every: [2.2, 3], scaleY: 0.08, close: 0.07, open: 0.1, twice: 0.2, gap: 0.25 },
    wander: { every: [1.6, 2.4], x: 34, y: 18 },
    browSolo: { every: [2.5, 3.5], lift: { y: -9, duration: 0.18, hold: 0.5 }, wiggle: { rotation: 7, duration: 0.09, repeat: 3 } },
};

// Flourishes: short moves within a pose (a step's `fx`), as tweens of a
// part: x / y in puppet px ('+=' / '-=' relative), rotation in degrees.
// `light` marks a change of light, not motion (kept under reduced
// motion).
export const FX = {
    giggle: [{ part: 'head', to: { rotation: '+=4' }, duration: 0.08, yoyo: true, repeat: 7 }],
    wag: [{ part: 'flipR', to: { x: 12 }, duration: 0.12, yoyo: true, repeat: 7 }],
    browJump: [{ part: 'browFloat', to: { y: '-=8' }, duration: 0.12, yoyo: true, repeat: 5 }],
    shiver: [{ part: 'pupIn', to: { x: 3 }, duration: 0.05, yoyo: true, repeat: 7 }],
    pump: [{ part: 'flipR', to: { y: -26 }, duration: 0.14, yoyo: true, repeat: 3, ease: 'power2.out' }],
    pump2: [
        { part: 'flipL', to: { y: -28 }, duration: 0.14, yoyo: true, repeat: 5, ease: 'power2.out' },
        { part: 'flipR', to: { y: -28 }, duration: 0.14, yoyo: true, repeat: 5, ease: 'power2.out', delay: 0.14 },
        { part: 'capFlash', from: { opacity: 1 }, to: { opacity: 0 }, duration: 0.9, light: true },
    ],
    clap: [
        { part: 'flipL', to: { x: 10 }, duration: 0.13, yoyo: true, repeat: 7 },
        { part: 'flipR', to: { x: -10 }, duration: 0.13, yoyo: true, repeat: 7 },
    ],
};

// Moment -> the steps he takes and the sound that goes with it (audio.js's
// pools: 'swipe', 'error', 'correct', 'locked'; or 'fanfare', the round
// end's, made in code, BACKLOG B-230; null for none).
// His voice (BACKLOG M4b; audio.js sayPlan plays it):
//   - `lines` (B-224): the pools of his new lines the moment plays, in
//     order: a random clip of the first that has one ready ('gag': the
//     word's own gag lines; 'hebrew': the word's Hebrew guess; any other
//     name: that pool of his shared lines, content/voice/robot-lines.json);
//     with none of them, its `sound` when that is his voice (the
//     prototype clip), or nothing. A moment with variants has `lines` per
//     variant (the picture's line is the one of his look); `lines` may be
//     { by, ... }, the lines picked by a fact of the moment (linesOf):
//     the round end's stars, the boost's kind. The swipe and the round
//     end's fanfare are effects: they play whatever his line is; the
//     fanfare first, his end line when it ends (B-230: audio.js
//     fanfareWait).
//   - `word: true` (a correct check: correct, streak; B-223): the target
//     word first, clean and complete, from the word's own clip, then,
//     when it ends, his line. 'gag' plays only after the word: with the
//     word's clip not ready at the check, the gag is skipped too and the
//     next of the lines plays alone (B-225; audio.js sayPlan).
//   - `win: true` (a correct check: correct, streak, tutorialDone;
//     B-227): the TV's win comes first (picture.js, WIN_MS). He watches it
//     (WATCH, leadOf: no pump, no talk), audio.js plays its chime with it
//     (at once, or at a word's own win's peak, B-228: picture.js tells
//     audio.js winSound), and the moment's steps and his voice start when
//     it ends (waitFor).
//   - `letter` (B-224): after his line he says the name of the letter he
//     just put in a slot (letterGiven: the snapshot field holding its
//     slot), or the name alone with no line.
//   - `ifQuiet: true` (B-224): a moment that comes on its own (the
//     picture at the TV's lock, kid idle and his peeks, the press nudge
//     and the dome nudge), not from the kid's action: its line never cuts
//     his voice; due while a clip of his plays, it is dropped.
//   - whether the line is said at all: the CHATTER table below (B-226).
// A step comes `at` seconds into the moment and sets any of: `sink`
// (puppet px down, 0 = up), `head` (turn), `eyes`, `brows`, `hands` (the
// tables above), `look` (where the eyes look, visor units), `pop` (1, 2,
// or 'small' at half height), `shake`, `fx` (a flourish) and `peek` (the
// idle peeking starts, PEEK). A moment with `variants` plays one of them,
// picked at random by `chance`.
// The reference's moments, as they are: round start, new picture (looking
// up at the TV: surprise, giggle or shock), letter placed, all slots
// filled (points at the dome; about 4 in 10 times extra excited), kid
// idle 10s (thinks, sinks, then peeks over the edge every few seconds
// with no hands showing, until the kid's next input), wake up, wrong
// (head-shake and shrug), wrong with peek (ducks to his eyes, looks left
// and right, shivers, comes back), third miss (covers his eyes, then
// relief), correct (fist pump), 3 in a row (two fists, double pop, cap
// sparks; only the third correct in a row, so the words after it say
// their gag again), round end (clap), speaker locked (head-shake, shrug).
// Since B-227 correct, 3 in a row and the tutorial's done first watch the
// TV's win (`win`, WATCH), then pump.
// Where the map gives a choice, momentsFor() picks the moment:
//   - "All slots filled": filledEarly (pointing at the dome, no line:
//     BACKLOG B-226) in the first EARLY_ROUNDS rounds of the session;
//     filled after that, which is "Letter placed";
//   - "Wrong check ... peek": he peeks on the word's own second miss,
//     the one that brings his letter (bulbs.js HINT_AT; since BACKLOG
//     B-231 the TV's bulbs are the round's, so it is no longer the miss
//     that leaves one bulb lit), on its first it is "Wrong";
//   - "Round end": clapping for 2-3 stars, his rest pose for 0-1 (never
//     sad). He is not on the round-end screen, so nothing shows it yet.
// Not in the reference: blockReturned (a block back to the bench, B-108)
// is "Letter placed" too, and hintGiven (his letter on the second miss,
// B-206: glad, not a win) is happy, a small pop and pointing up at his
// letter on the rail, when his peek is over (scriptFor). "wake" is the
// kid's next action after the idle sink. domeNudge (BACKLOG B-212: the
// word is answered and the dome, which now means "next", has not been
// pressed for a while) is the reference's "All slots filled" pointing at
// the dome, with a pop and the pointing finger wagging, then his rest
// pose; no prototype clip (none of the existing ones says "go on"), a
// `press` line of his new voice (B-224), only on the word's first nudge
// and rarely (B-226, CHATTER). filledNudge (BACKLOG B-226: every slot
// filled on a filledEarly word, and the kid has neither pressed the dome
// nor moved a block for a while, main.js's press timer, pressWait) is his
// point at the dome, as he already shows it, with a rare `press` line;
// at most once per word. boostGiven (BACKLOG B-219: a
// boost the kid paid for, his letter landing in its slot, or the extra
// blocks gone) takes hintGiven's steps, as his letter lands (boostLands);
// his line and the letter's name start then too (waitFor).
const LETTER_PLACED = [
    { at: 0, sink: 0, head: 0, eyes: 'idle', brows: 'calm', hands: 'rest', look: [-26, 22] },
    { at: 0.6, look: [0, 0] },
];

// He watches the TV's win on a correct check (BACKLOG B-227; the moments
// with `win`): he looks up at the TV with happy eyes, his hands at rest,
// until his moment starts as the win ends (waitFor, leadOf).
export const WATCH = [
    { at: 0, sink: 0, head: -8, look: [0, -22], eyes: 'happy', brows: 'happy', hands: 'rest' },
];

// His letter in the slot (hintGiven, and boostGiven): happy, a small pop,
// pointing up at it on the rail, then rest.
const LETTER_GIVEN = [
    { at: 0, sink: 0, head: 0, look: [0, 0], eyes: 'happy', brows: 'happy', hands: 'pointUp', pop: 'small' },
    { at: 1.2, hands: 'rest', eyes: 'idle', brows: 'calm' },
];

export const MOMENTS = {
    roundStart: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'idle', brows: 'up', hands: 'wave', pop: 1 },
            { at: 0.6, brows: 'calm', hands: 'rest' },
        ],
        sound: null,
        lines: ['start'],
    },
    picture: {
        variants: {
            surprise: {
                chance: 1 / 3,
                steps: [
                    { at: 0, sink: 0, head: -10, look: [0, -22], eyes: 'wide', brows: 'up', hands: 'gasp', pop: 1 },
                    { at: 1.4, hands: 'rest', eyes: 'idle', brows: 'calm', head: -4 },
                ],
                lines: ['hebrew', 'picture-surprise'],
            },
            giggle: {
                chance: 1 / 3,
                steps: [
                    { at: 0, sink: 0, head: -8, look: [0, -22], eyes: 'happy', brows: 'happy', hands: 'giggle' },
                    { at: 0.2, fx: 'giggle' },
                    { at: 1.8, hands: 'rest', eyes: 'idle', brows: 'calm', head: -4 },
                ],
                lines: ['hebrew', 'picture-giggle'],
            },
            shock: {
                chance: 1 / 3,
                steps: [
                    { at: 0, sink: 0, head: -12, look: [0, -24], eyes: 'dots', brows: 'worried', hands: 'shock', pop: 1 },
                    { at: 0.5, eyes: 'wide' },
                    { at: 1.9, hands: 'rest', eyes: 'idle', brows: 'calm', head: -4 },
                ],
                lines: ['hebrew', 'picture-shock'],
            },
        },
        sound: null,
        ifQuiet: true,
    },
    blockPlaced: { steps: LETTER_PLACED, sound: 'swipe' },
    blockReturned: { steps: LETTER_PLACED, sound: null },
    filledEarly: {
        variants: {
            point: {
                chance: 0.6,
                steps: [{ at: 0, sink: 0, head: 6, eyes: 'wide', brows: 'up', hands: 'point', look: [26, 22] }],
            },
            excited: {
                chance: 0.4,
                steps: [
                    { at: 0, sink: 0, head: 6, eyes: 'wide', brows: 'up', hands: 'point', look: [26, 22], pop: 2 },
                    { at: 0.3, fx: 'wag' },
                    { at: 0.6, fx: 'browJump' },
                ],
            },
        },
        // no line as the last slot fills (BACKLOG B-226): his press line
        // comes later, if at all (filledNudge)
        sound: 'swipe',
    },
    filled: { steps: LETTER_PLACED, sound: 'swipe' },
    // A while after every slot filled, nothing pressed or moved (B-226):
    // his point at the dome (filledEarly's), and a rare press line.
    filledNudge: {
        steps: [{ at: 0, sink: 0, head: 6, eyes: 'wide', brows: 'up', hands: 'point', look: [26, 22] }],
        sound: null,
        lines: ['press'],
        ifQuiet: true,
    },
    kidIdle: {
        steps: [
            { at: 0, sink: 0, head: -6, eyes: 'squint', brows: 'frown', hands: 'chin' },
            { at: 0.9, hands: 'rest', sink: 150 },
            { at: 1.4, peek: true },
        ],
        sound: null,
        lines: ['idle'],
        ifQuiet: true,
    },
    wake: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'wide', brows: 'up', hands: 'rest', pop: 1 },
            { at: 0.5, eyes: 'idle', brows: 'calm' },
        ],
        sound: null,
        lines: ['wake'],
    },
    // The first word's tutorial (human, 2026-10-24; coach.js): as the
    // picture tunes in, he points down at the bench and says how it goes
    // (instead of the picture's look); once every slot is full, he points
    // at the dome (as filledEarly) and says to press it; on its correct
    // check he says the word and then his tutorial-done line (else the
    // word's gag, only after the word, B-225).
    // the tutorial word's round start: his wave, with no line, so his
    // drag line comes as the picture tunes in
    tutorialWave: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'idle', brows: 'up', hands: 'wave', pop: 1 },
            { at: 0.6, brows: 'calm', hands: 'rest' },
        ],
        sound: null,
    },
    tutorialDrag: {
        steps: [
            { at: 0, sink: 0, head: -4, eyes: 'happy', brows: 'up', hands: 'point', look: [10, 30], pop: 1 },
            { at: 2.4, hands: 'rest', eyes: 'idle', brows: 'calm', look: [0, 0] },
        ],
        sound: null,
        lines: ['tutorial-drag'],
    },
    tutorialPress: {
        steps: [
            { at: 0, sink: 0, head: 6, eyes: 'wide', brows: 'up', hands: 'point', look: [26, 22], pop: 2 },
            { at: 0.3, fx: 'wag' },
        ],
        sound: 'swipe',
        lines: ['tutorial-press'],
    },
    tutorialDone: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'happy', brows: 'up', hands: 'pump2', pop: 2 },
            { at: 0.25, fx: 'pump2' },
            { at: 1.85, hands: 'rest', eyes: 'idle', brows: 'calm' },
        ],
        sound: 'correct',
        word: true,
        win: true,
        lines: ['tutorial-done', 'gag', 'correct'],
    },
    // A player picked on the start screen (human, 2026-10-24): the theme
    // screen comes up and he greets the kid. He is not drawn there yet, so
    // only his voice shows it; the steps are his wave for when he is.
    greet: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'happy', brows: 'up', hands: 'wave', pop: 1 },
            { at: 1.2, hands: 'rest', eyes: 'idle', brows: 'calm' },
        ],
        sound: null,
        lines: ['greet'],
        // it comes with the tap that unlocks the sound: audio.js waits
        // for a clip of the pool to decode instead of skipping it, once
        // one has been asked for (BACKLOG B-229: after the page is idle
        // and the manifest is in; before that, nothing)
        waitReady: true,
    },
    wrong: {
        steps: [
            { at: 0, sink: 0, head: 6, eyes: 'confused', brows: 'puzzled', hands: 'shrug', shake: true },
            { at: 1.8, hands: 'rest', eyes: 'idle', brows: 'calm', head: 0 },
        ],
        sound: 'error',
        lines: ['wrong', 'mumble'],
    },
    wrongPeek: {
        steps: [
            { at: 0, head: 4, eyes: 'confused', brows: 'worried', sink: 104, look: [-24, -6] },
            { at: 0.5, look: [24, -6] },
            { at: 1.4, fx: 'shiver' },
            { at: 2, look: [0, -10] },
            { at: 2.5, sink: 0, hands: 'rest', eyes: 'idle', brows: 'calm', head: 0, look: [0, 0] },
        ],
        sound: 'error',
        lines: ['mumble'],
    },
    thirdMiss: {
        steps: [
            { at: 0, sink: 0, head: -3, eyes: 'dots', brows: 'worried', hands: 'cover' },
            { at: 0.9, hands: 'rest', eyes: 'happy', brows: 'happy', head: 5 },
        ],
        sound: 'error',
        lines: ['reveal-open'],
    },
    correct: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'happy', brows: 'up', hands: 'pump', pop: 1 },
            { at: 0.3, fx: 'pump' },
            { at: 1.7, hands: 'rest', eyes: 'idle', brows: 'calm' },
        ],
        sound: 'correct',
        word: true,
        win: true,
        lines: ['gag', 'correct'],
    },
    streak: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'happy', brows: 'up', hands: 'pump2', pop: 2 },
            { at: 0.25, fx: 'pump2' },
            { at: 1.85, hands: 'rest', eyes: 'idle', brows: 'calm' },
        ],
        sound: 'correct',
        word: true,
        win: true,
        lines: ['streak', 'gag', 'correct'],
    },
    roundEndGood: {
        steps: [
            { at: 0, sink: 0, head: 5, eyes: 'happy', brows: 'happy', hands: 'clap' },
            { at: 0.3, fx: 'clap' },
            { at: 2.5, hands: 'rest' },
        ],
        sound: 'fanfare',
        lines: { by: 'stars', 2: ['end-mid'], 3: ['end-high'] },
    },
    roundEnd: { steps: [{ at: 0, sink: 0, head: 0, eyes: 'idle', brows: 'calm', hands: 'rest' }], sound: 'fanfare', lines: ['end-low'] },
    // Theme keys (human, 2026-10-24; keys.js): after his round-end line,
    // the round brought a key; on the theme screen, a key opened a theme.
    // He is not drawn on those screens yet, so only his voice shows them;
    // the steps are for when he is.
    keyEarned: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'wide', brows: 'up', hands: 'point', pop: 1 },
            { at: 2, hands: 'rest', eyes: 'happy', brows: 'calm' },
        ],
        sound: null,
        lines: ['key'],
    },
    themeOpen: {
        steps: [
            { at: 0, sink: 0, head: 0, eyes: 'wide', brows: 'up', hands: 'gasp', pop: 1 },
            { at: 1.6, hands: 'rest', eyes: 'happy', brows: 'calm' },
        ],
        sound: null,
        lines: ['theme-open'],
    },
    speakerLocked: {
        steps: [
            { at: 0, sink: 0, eyes: 'idle', brows: 'frown', hands: 'shrug', shake: true },
            { at: 1.6, hands: 'rest', brows: 'calm' },
        ],
        sound: 'locked',
        lines: ['no-gears'],
    },
    hintGiven: { steps: LETTER_GIVEN, sound: null, lines: ['hint'], letter: 'hint' },
    boostGiven: {
        steps: LETTER_GIVEN,
        sound: null,
        lines: { by: 'boostKind', remember: ['boost-slot'], first: ['boost-first'], cleanup: ['boost-clean'] },
        letter: 'boost',
    },
    domeNudge: {
        steps: [
            { at: 0, sink: 0, head: 6, eyes: 'wide', brows: 'up', hands: 'point', look: [26, 22], pop: 1 },
            { at: 0.3, fx: 'wag' },
            { at: 2, hands: 'rest', eyes: 'idle', brows: 'calm', head: 0, look: [0, 0] },
        ],
        sound: null,
        lines: ['press'],
        ifQuiet: true,
    },
};

// The kid-idle peek (kidIdle's `peek` step): PEEK.wait seconds after it,
// and every PEEK.every seconds after that until the next moment, he comes
// up from his sink to his eyes, looks left, right and ahead, eyebrows up,
// and sinks again. His hands stay hidden (the sink hides them). As he
// comes up he whispers a line of his `lines` (BACKLOG B-224; audio.js
// peekLine, through renderRobot's `onPeek`), only while he is quiet
// (`ifQuiet`, as the moments above), and rarely (CHATTER's `peek`, B-226).
export const PEEK = {
    wait: 1.6,
    every: 4.8,
    steps: [
        { at: 0, sink: 104, look: [-26, -8], brows: 'up' },
        { at: 0.9, look: [26, -8] },
        { at: 1.6, look: [0, -10] },
        { at: 2.2, sink: 150, brows: 'calm' },
    ],
    lines: ['peek'],
    ifQuiet: true,
};

export const CHANGE_MS = 300;     // never more than one change per 300ms
export const IDLE_MS = 10000;     // kid idle 10s -> thinking, then sink
// The word answered and the dome not pressed: he nudges toward it this
// long after the answer, then again this often (BACKLOG B-212: "after
// about 4 seconds", "at most every 8 seconds").
export const NUDGE_MS = { first: 4000, every: 8000 };
export const EARLY_ROUNDS = 2;    // he points at the dome in the first 2 rounds
// The 3rd correct in a row -> double pop and a streak line; the 4th and
// 5th are plain correct again, so they say their gag (human, 2026-10-24).
export const STREAK = 3;

// How often he talks (BACKLOG B-226: a quieter robot; starting values the
// human tunes, DECISIONS 2026-10-27). Per moment that has a line (and
// `peek`, his peeks' whisper), its tier and the chance its line is said:
//   - always: every time;
//   - sometimes, rare: a draw under `chance`, and never within TALK_GAP s
//     after a clip of his voice went quiet, nor while one plays (saysLine).
// A moment not in the table says its line always. `always` in a moment:
// lines of it said every time, whatever its tier (the picture's Hebrew
// guess: they exist only where funny). `first`: the snapshot field that
// counts the moment on the word; only its first (the field at 1) may
// speak (the dome nudge's `nudges`). A line dropped drops only his voice:
// the moment's pose, moves and effect sound (the swipe, the fanfare) play
// as ever, and no prototype clip plays in its place (audio.js sayPlan).
// PRESS_WAIT: seconds [least, most] the kid neither presses the dome nor
// moves a block, with every slot filled on a filledEarly word, before his
// press line may come (filledNudge; a random wait, pressWait).
export const CHATTER = {
    TALK_GAP: 8,
    PRESS_WAIT: [4, 7],
    moments: {
        correct: { tier: 'always', chance: 1 },
        streak: { tier: 'always', chance: 1 },
        thirdMiss: { tier: 'always', chance: 1 },
        hintGiven: { tier: 'always', chance: 1 },
        boostGiven: { tier: 'always', chance: 1 },
        speakerLocked: { tier: 'always', chance: 1 },
        roundEndGood: { tier: 'always', chance: 1 },
        roundEnd: { tier: 'always', chance: 1 },
        greet: { tier: 'always', chance: 1 },
        keyEarned: { tier: 'always', chance: 1 },
        themeOpen: { tier: 'always', chance: 1 },
        tutorialWave: { tier: 'always', chance: 1 },
        tutorialDrag: { tier: 'always', chance: 1 },
        tutorialPress: { tier: 'always', chance: 1 },
        tutorialDone: { tier: 'always', chance: 1 },
        roundStart: { tier: 'sometimes', chance: 1 / 2 },
        picture: { tier: 'sometimes', chance: 1 / 2, always: ['hebrew'] },
        wrong: { tier: 'sometimes', chance: 1 / 2 },
        wrongPeek: { tier: 'sometimes', chance: 1 / 2 },
        wake: { tier: 'sometimes', chance: 1 / 2 },
        kidIdle: { tier: 'rare', chance: 1 / 3 },
        peek: { tier: 'rare', chance: 1 / 4 },
        filledNudge: { tier: 'rare', chance: 1 / 3 },
        domeNudge: { tier: 'rare', chance: 1 / 3, first: 'nudges' },
    },
};

// The variants of moment `name` as [{ name, chance, steps }] (one, named
// 'only', for a moment without variants).
export function variantsOf(name) {
    const m = MOMENTS[name];
    if (!m) throw new Error(`character: unknown moment "${name}"`);
    if (m.steps) return [{ name: 'only', chance: 1, steps: m.steps }];
    return Object.entries(m.variants).map(([v, { chance, steps }]) => ({ name: v, chance, steps }));
}

// The variant of moment `name` that a random number `r` (0 <= r < 1)
// picks: each takes its `chance` of the range, in table order.
export function pickVariant(name, r) {
    const all = variantsOf(name);
    let upTo = 0;
    for (const v of all) {
        upTo += v.chance;
        if (r < upTo) return v.name;
    }
    return all[all.length - 1].name;
}

// The steps of variant `variant` of moment `name` (the first variant when
// none is named).
export function stepsOf(name, variant) {
    const all = variantsOf(name);
    const v = all.find((x) => x.name === variant) || all[0];
    return v.steps.map((s) => ({ ...s }));
}

// A step that changes his pose (rather than only his gaze or a flourish
// within the pose). CHARACTER "Presence": never more than one change per
// CHANGE_MS.
export function isChange(step) {
    return ['sink', 'head', 'eyes', 'brows', 'hands'].some((k) => k in step);
}

const round3 = (t) => Math.round(t * 1000) / 1000;

// The steps of `moments` (one state change: at most two, e.g. the miss
// that brings his letter is his peek and his letter) as one script,
// `at` seconds from now. The next moment starts when the one before takes
// its last step (but at least CHANGE_MS after the one before started),
// and that step and any later ones are dropped: every moment starts with
// a whole pose. So his letter's happy pop (hintGiven) comes when the peek
// of the second miss is over (CHARACTER "Moment map", B-206), and a new
// picture would follow a round start's wave (since B-214 the picture
// comes on its own, when the TV has tuned in). `picks` names the variant
// per moment.
export function scriptFor(moments, picks = {}) {
    return planOf(moments, picks).script;
}

// When each of `moments` starts in its script (scriptFor), seconds from
// the first: his voice says each moment's line no sooner (BACKLOG B-224:
// his letter's name with his pointing at it, when the second miss's peek
// is over).
export function startsOf(moments, picks = {}) {
    return planOf(moments, picks).starts;
}

function planOf(moments, picks) {
    let out = [];
    let start = 0;
    const starts = [];
    moments.forEach((m, i) => {
        const steps = stepsOf(m, picks[m]);
        if (i > 0) {
            const prev = out.length ? out[out.length - 1].at : start;
            start = round3(Math.max(start + CHANGE_MS / 1000, prev));
            out = out.filter((s) => s.at < start);
        }
        out.push(...steps.map((s) => ({ ...s, at: round3(start + s.at) })));
        starts.push(start);
    });
    return { script: out, starts };
}

// When the first step of a new moment may come (ms from now) if his last
// change was `sinceLast` ms ago: CHANGE_MS after it at the earliest.
export function startDelay(sinceLast) {
    return Math.max(0, CHANGE_MS - sinceLast);
}

// A step as played under prefers-reduced-motion: pose and shape changes
// only, so no pop and no head-shake (flourishes keep only their light,
// fxFor). Every change is instant (the render plays durations as 0).
export function reducedStep(step) {
    const { pop, shake, ...rest } = step;
    return rest;
}

// The tweens of flourish `name`; under reduced motion only its light.
export function fxFor(name, reduced) {
    const list = FX[name];
    if (!list) throw new Error(`character: unknown flourish "${name}"`);
    return list.filter((t) => !reduced || t.light).map((t) => ({ ...t }));
}

// How the hands' layer follows a sink to `px` (puppet px down): its
// tweens in order, `set` at once or `to` over `duration` after `delay`.
// Going below TIMING.sink.hideHands they vanish at once and then slide
// down hidden; coming back up they slide while hidden and fade in once
// there. So visible hands never cross the console's plate, where the
// lever's and the speaker's tap areas are (BACKLOG B-210; the prototype
// faded them while they slid). Under reduced motion every tween is
// instant, in the same order.
export function handsSink(px, reduced) {
    const t = reduced ? 0 : TIMING.sink.hands;
    if (px > TIMING.sink.hideHands) {
        return [{ set: { opacity: 0 } }, { to: { y: px }, duration: t, delay: 0 }];
    }
    return [{ to: { y: px }, duration: t, delay: 0 }, { to: { opacity: 1 }, duration: t, delay: t }];
}

// Hand pose `name` as moves of the two hand layers from REST: x / y in
// puppet px, the turn, and the mitten shape (its file and width, and
// whether it is mirrored).
export function handPose(name) {
    const pose = HANDS[name];
    if (!pose) throw new Error(`character: unknown hand pose "${name}"`);
    const out = {};
    for (const side of ['L', 'R']) {
        const p = pose[side];
        const shape = HAND_SHAPES[p.s];
        out[side] = {
            x: p.x - REST[side].x,
            y: p.y - REST[side].y,
            rotation: p.r,
            shape: p.s,
            file: `hand-${shape[side]}.png`,
            width: shape.width,
            mirror: side === 'L' && p.s !== 'rest',
        };
    }
    return out;
}

// Eye shape `name`: each eye's ball radii and whether the happy arcs show
// instead of the balls (at idle size).
export function eyeShape(name) {
    const e = EYES[name];
    if (!e) throw new Error(`character: unknown eyes "${name}"`);
    const v = e === 'arc' ? EYES.idle : e;
    return { L: { rx: v[0], ry: v[1] }, R: { rx: v[2], ry: v[3] }, arc: e === 'arc' };
}

// Eyebrow pose `name`: each brow's lift (puppet px) and turn.
export function browPose(name) {
    const b = BROWS[name];
    if (!b) throw new Error(`character: unknown brows "${name}"`);
    return { L: { y: b[0], rotation: b[1] }, R: { y: b[2], rotation: b[3] } };
}

// Puppet px as a percentage of the canvas: the parts are canvas-sized
// layers, so GSAP's xPercent / yPercent move them by puppet px at any
// size (game.css scales the canvas with the console).
export function pct(px) {
    return Math.round((px * 100 / CANVAS) * 10000) / 10000;
}

// Eyes and a small head turn follow the block the kid drags (BACKLOG
// B-210): from his head (at AIM.from of the canvas) to the block's centre
// is (dx, dy) screen px; the eyes look that way, further the further it
// is (up to AIM.x / AIM.y visor units), and the head turns up to
// AIM.turn degrees.
export const AIM = { from: [0.53, 0.37], x: 30, xPer: 5, y: 18, yPer: 7, turnPer: 25, turn: 8, duration: 0.3 };

export function aimAt(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const x = (dx / len) * Math.min(AIM.x, len / AIM.xPer);
    const y = (dy / len) * Math.min(AIM.y, len / AIM.yPer);
    const turn = Math.max(-AIM.turn, Math.min(AIM.turn, dx / AIM.turnPer));
    return { look: [round3(x), round3(y)], turn: round3(turn) };
}

// --- Talking (BACKLOG B-210) ---

// While one of his clips plays, audio.js's AnalyserNode gives its samples
// (bytes, 128 = silence) every frame, and all four effects follow the
// smoothed loudness: the scope mouth (a glowing line at the bottom of the
// visor drawing the live waveform, faint and flat when quiet), the eyes
// pulsing, the cap glowing with sparks on loud syllables, and the head
// bobbing on peaks; the eyebrows rise with it too. Muted, nothing plays,
// so nothing moves.
export const TALK = {
    gain: 4,                 // loudness = min(1, rms * gain)
    attack: 0.35,            // smoothing: level moves this share of the way each frame
    quiet: 0.02,             // below this the scope lies flat
    scope: { x0: 556, x1: 776, y: 548, points: 44, amp: 190, rest: 0.28, base: 0.55, span: 0.45 },
    eyes: 0.22,              // eye scale 1 + level * eyes
    cap: 1.6,                // cap glow opacity min(1, level * cap)
    sparks: { above: 0.45, turn: 20, show: 0.6, origin: '722 186' },
    brows: { lift: 12, ease: 0.3 },
    nod: { above: 0.5, gap: 220, turn: 3, y: -4, duration: 0.1 },
};

// Root mean square of a frame of byte samples (0 when there is none).
export function loudness(wave) {
    if (!wave || !wave.length) return 0;
    let sum = 0;
    for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128;
        sum += v * v;
    }
    return Math.sqrt(sum / wave.length);
}

// The next frame's smoothed level from the last one and this frame's
// loudness (0 while nothing plays): it rises and falls a share of the
// way each frame, so syllables read as pulses, not flicker.
export function smoothLevel(level, rms) {
    return level + (Math.min(1, rms * TALK.gain) - level) * TALK.attack;
}

// The eyebrows' lift next frame (puppet px, negative is up): toward
// level * TALK.brows.lift up while he talks, back to 0 when he stops.
export function browRide(brow, level, talking) {
    const target = talking ? -level * TALK.brows.lift : 0;
    return brow + (target - brow) * TALK.brows.ease;
}

// The scope mouth for a frame: the waveform across the visor's bottom
// (heavier in the middle), brighter when louder; a faint flat line when
// quiet or when nothing plays.
export function scopeLine(wave, level) {
    const s = TALK.scope;
    if (!wave || !wave.length || level <= TALK.quiet) {
        return { d: `M${s.x0} ${s.y} L${s.x1} ${s.y}`, opacity: s.rest };
    }
    let d = '';
    for (let i = 0; i <= s.points; i++) {
        const x = s.x0 + i * ((s.x1 - s.x0) / s.points);
        const v = (wave[Math.min(wave.length - 1, Math.floor((i * wave.length) / s.points))] - 128) / 128;
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${(s.y + v * s.amp * Math.sin((Math.PI * i) / s.points)).toFixed(1)}`;
    }
    return { d, opacity: Math.round((s.base + level * s.span) * 100) / 100 };
}

// The eyes' pulse, the cap's glow and whether the sparks jump, for a level.
export function talkLights(level) {
    return {
        eyes: 1 + level * TALK.eyes,
        cap: Math.round(Math.min(1, level * TALK.cap) * 100) / 100,
        sparks: level > TALK.sparks.above,
    };
}

// Whether his head bobs this frame: on a peak, at most every
// TALK.nod.gap ms.
export function nodDue(level, now, lastPeak) {
    return level > TALK.nod.above && now - lastPeak > TALK.nod.gap;
}

// --- Moments from state ---

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
        // the round's bulbs still lit (BACKLOG B-231) and the word's own
        // wrong checks
        lives,
        misses: onWord ? current.misses || 0 : 0,
        placed: onWord ? current.placed.map((p) => (p ? p.tileId : '-')).join(',') : '',
        filled: onWord && current.placed.length > 0 && current.placed.every(Boolean),
        idleBeat: state.idleBeat,
        lockedTaps: state.lockedTaps || 0,
        // the slot holding his second-miss letter (BACKLOG B-206), or -1
        hint: onWord ? current.placed.findIndex((p) => !!p && !!p.hint) : -1,
        // the slot holding a boost's letter (BACKLOG B-219), or -1, and the
        // boosts the word has taken (one more: boostGiven)
        boost: onWord ? current.placed.findIndex((p) => !!p && !!p.boost) : -1,
        boosts: onWord ? current.boosts || 0 : 0,
        // which boost the word took last ('remember', 'first', 'cleanup';
        // main.js pay), for his line (BACKLOG B-224), or null
        boostKind: onWord ? current.boostKind || null : null,
        // his nudges toward the dome on this word (BACKLOG B-212)
        nudges: onWord ? state.nudges || 0 : 0,
        // his press nudge has come on this word (BACKLOG B-226, filledNudge)
        filledNudged: onWord && !!state.filledNudged,
        // the TV has tuned in to this word's picture (BACKLOG B-214)
        tuned: onWord && !!state.tuned,
        streak: onWord ? streakOf(results, round.index) : 0,
        // the first word's tutorial (coach.js): whether this word has it,
        // and its step now ('drag', 'press' or null)
        tutorial: onWord && !!state.tutorial,
        tutor: onWord ? coachStep(state) : null,
        stars: screen === 'round-end' ? starsFor(results.filter((r) => r && r.correct).length, round.size) : null,
        // theme keys (keys.js): the round brought a key (round end), and
        // the themes opened with a key so far (one more: themeOpen)
        keyEarned: screen === 'round-end' && !!round.keyEarned,
        opened: state.keys && Array.isArray(state.keys.opened) ? state.keys.opened.length : 0,
    };
}

// The moments between two snapshots, in the order they happen; [] when
// nothing he reacts to changed. A new word's picture is shown when the TV
// has tuned in to it (BACKLOG B-214: tv.js's tune-in locks, about a
// second after the word came): "Picture shown" comes then, not with the
// word, so he looks up at the picture and not at the snow. A new round
// starts with his wave at once.
export function momentsFor(prev, now) {
    // The start screen's player tap (main.js onPlayer): he greets the kid.
    if (now.screen === 'theme' && prev.screen === 'start') return ['greet'];
    // a key opened a theme (main.js onTheme)
    if (now.screen === 'theme' && prev.screen === 'theme' && now.opened > prev.opened) return ['themeOpen'];
    if (now.screen === 'round-end') {
        if (prev.screen === 'round-end') return [];
        const end = now.stars >= 2 ? 'roundEndGood' : 'roundEnd';
        return now.keyEarned ? [end, 'keyEarned'] : [end];
    }
    if (!now.key) return [];
    // the tutorial's first word: his drag line in place of the round's
    // wave line and the picture's look (coach.js shows the mitten)
    const look = now.tutor === 'drag' ? 'tutorialDrag' : 'picture';
    if (!prev.key || prev.round !== now.round) {
        if (now.tutor === 'drag') return ['tutorialDrag'];
        if (now.tutorial) return ['tutorialWave'];
        return now.tuned ? ['roundStart', 'picture'] : ['roundStart'];
    }
    if (prev.key !== now.key) return now.tuned ? [look] : [];
    if (now.tuned && !prev.tuned) return [look];
    if (now.status !== prev.status || now.lives < prev.lives || now.misses > prev.misses) {
        // a reveal: the word's third miss, or the round's last bulb gone
        // (B-231)
        if (now.status === 'revealed') return ['thirdMiss'];
        if (now.status === 'correct') return [now.tutorial ? 'tutorialDone' : now.streak === STREAK ? 'streak' : 'correct'];
        if (now.status === 'wrong') {
            const miss = now.misses === HINT_AT ? 'wrongPeek' : 'wrong';
            // the word's second miss also gave his letter (B-206)
            return now.hint !== -1 && now.hint !== prev.hint ? [miss, 'hintGiven'] : [miss];
        }
    }
    // One more boost on the word (B-219): his letter lands in its slot, or
    // the extra blocks are gone (boostLands says when).
    if (now.boosts > prev.boosts) return ['boostGiven'];
    // One more `lockedTaps`: his head-shake (B-203; since B-215 the speaker
    // never holds the word back; main.js adds one for a boost the kid
    // can't afford, B-219).
    if (now.lockedTaps !== prev.lockedTaps) return ['speakerLocked'];
    // One more nudge toward the dome on the answered word (B-212).
    if (now.nudges > prev.nudges) return ['domeNudge'];
    // Every slot filled and nothing pressed or moved for a while (B-226:
    // main.js's press timer, pressWait): his press nudge, once per word.
    if (now.filledNudged && !prev.filledNudged) return ['filledNudge'];
    if (now.idleBeat !== prev.idleBeat) {
        if (now.idleBeat === 'sunk') return ['kidIdle'];
        if (prev.idleBeat === 'sunk') return ['wake'];
    }
    if (now.placed !== prev.placed) {
        if (now.filled && now.status === 'playing') {
            if (now.tutor === 'press') return ['tutorialPress'];
            return [now.round <= EARLY_ROUNDS ? 'filledEarly' : 'filled'];
        }
        return [blockEntered(prev.placed, now.placed) ? 'blockPlaced' : 'blockReturned'];
    }
    return [];
}

// Whether a block went into a slot between two snapshots' `placed`
// (tile ids per slot, '-' for an empty one): some slot now holds a block
// it did not hold before. A block taken back to the bench, or every block
// sent back by the reset lever, only empties slots.
export function blockEntered(before, after) {
    const was = before.split(',');
    return after.split(',').some((id, i) => id !== '-' && id !== '' && id !== was[i]);
}

// Seconds after a boost (between snapshots `prev` and `now`, BACKLOG
// B-219) until what it did has landed, when his boostGiven starts:
// feedback.js's motion, from motion.js's numbers. A boost's letter (its
// slot `now.boost`): already in its slot, it only locks there (the
// clunk's hit); from the bench or another slot, it flies in (flyIn),
// after the block that was in its slot has hopped back (hop). The
// clean-up: its blocks have puffed away (puff). Under `reduced` motion,
// when the fades are done.
export function boostLands(prev, now, reduced = false) {
    const m = (kind) => {
        const spec = motionFor(kind, reduced);
        return spec.duration || spec.fade || 0;
    };
    const k = now.boost;
    if (k === -1 || prev.boost === k) return m('puff');
    const was = (prev.placed || '').split(',')[k];
    const is = (now.placed || '').split(',')[k];
    if (was === is) return reduced ? m('clunk') : motionFor('clunk', false).press;
    return (was && was !== '-' ? m('hop') : 0) + m('flyIn');
}

// The clips `moments` call for, in order (MOMENTS' sound column; moments
// without one add nothing).
export function soundsFor(moments) {
    return moments.map((m) => MOMENTS[m].sound).filter(Boolean);
}

// --- His lines (BACKLOG B-224) ---

// The pools of his lines moment `moment` plays, in order (MOMENTS' lines
// column): its variant's when it has variants (`how.variant`, else its
// first), and for lines picked by a fact ({ by, ... }) the ones of
// `how[by]` (`stars`: the round end's stars; `boostKind`: the boost);
// [] for none.
export function linesOf(moment, how = {}) {
    const spec = MOMENTS[moment];
    if (!spec) return [];
    let lines = spec.lines;
    if (spec.variants) {
        const v = spec.variants[how.variant] || Object.values(spec.variants)[0];
        lines = v.lines || lines;
    }
    if (lines && !Array.isArray(lines)) lines = lines[how[lines.by]];
    return Array.isArray(lines) ? [...lines] : [];
}

// --- How often he talks (BACKLOG B-226) ---

// Moment `moment`'s row of CHATTER on snapshot `now`: { tier, chance,
// always: its lines said every time }. A moment not in the table:
// always. One with `first` past its first on the word: chance 0.
export function chatterOf(moment, now = {}) {
    const row = CHATTER.moments[moment] || { tier: 'always', chance: 1 };
    const later = row.first && (now[row.first] || 0) > 1;
    return { tier: row.tier, chance: later ? 0 : row.chance, always: [...(row.always || [])] };
}

// Whether moment `moment` (on snapshot `now`) says its line: an always
// moment, yes; a sometimes or rare one, not within CHATTER.TALK_GAP s of
// his voice going quiet (`quietFor`: seconds since a clip of his voice
// last ended or was cut, 0 while one plays or is due, Infinity before
// any), and then only when a draw of `rand` comes under its chance.
// audio.js asks it per moment (and for `peek`, his whisper); a line it
// drops drops only his voice.
export function saysLine(moment, now, quietFor, rand = Math.random) {
    const row = chatterOf(moment, now);
    if (row.tier === 'always') return true;
    if (!(quietFor >= CHATTER.TALK_GAP)) return false;
    return rand() < row.chance;
}

// The letter he has just put in a slot on moment `moment` (between
// snapshots `prev` and `now`; `word` the word): with MOMENTS[moment].letter
// the snapshot field holding its slot ('hint': his second-miss letter;
// 'boost': a boost's letter), that slot's letter when it is new there;
// null otherwise (the clean-up places none).
export function letterGiven(moment, prev, now, word) {
    const field = MOMENTS[moment] && MOMENTS[moment].letter;
    if (!field || !word || !now) return null;
    const k = now[field];
    if (!Number.isInteger(k) || k < 0 || k >= word.length || (prev && prev[field] === k)) return null;
    return word[k];
}

// A number in [0, 1) from `text`, always the same for the same text
// (FNV-1a with a final mix).
export function rollOf(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// The variants `moments` play on snapshot `now` that his voice must agree
// with: the picture's look is picked by its word's key (rollOf, each look
// a third of the time), so renderRobot's look and audio.js's line
// (picture-<look>) are the same one without either telling the other.
// Other moments' variants are picked at random as they play.
export function picksFor(moments, now) {
    return moments.includes('picture') && now && now.key ? { picture: pickVariant('picture', rollOf(now.key)) } : {};
}

// Whether moment `m` comes with the TV's win (MOMENTS' `win`, B-227).
const withWin = (m) => !!(MOMENTS[m] && MOMENTS[m].win);

// Seconds from the state change until `moments` start (his steps and his
// line): a boost's moment waits for what it did to land (boostLands); a
// correct check's for the TV's win to end (BACKLOG B-227: WIN_MS, under
// reduced motion too, whose pulse lasts as long); the others start at
// once. (The round end's line also waits for its fanfare, audio.js
// fanfareWait, B-230; he is not drawn there, so no step of his waits.)
export function waitFor(moments, prev, now, reduced = false) {
    if (moments.includes('boostGiven')) return boostLands(prev, now, reduced);
    return moments.some(withWin) ? WIN_MS / 1000 : 0;
}

// The steps he takes while `moments` wait to start (waitFor), `at`
// seconds from the change: on a correct check he watches the TV's win
// (BACKLOG B-227, WATCH); none otherwise. No voice of his goes with them.
export function leadOf(moments) {
    return moments.some(withWin) ? WATCH.map((s) => ({ ...s })) : [];
}

// Ms until the kid has been idle IDLE_MS on this word (0 = now), counted
// from `state.lastInput`; null when the idle beat cannot come (not on a
// word, or it already came for this word: once per word, or the word is
// answered: then the dome means "next" and his nudges toward it, below,
// are what a kid who does not go on gets, BACKLOG B-212).
export function idleWait(state, now) {
    if (state.screen !== 'play' || !state.current.word || state.idleBeat !== null) return null;
    if (domeAction(state.current) === 'next') return null;
    return Math.max(0, state.lastInput + IDLE_MS - now);
}

// Ms until his next nudge toward the dome (BACKLOG B-212): while the dome
// means "next" (the word answered, correct or revealed) and is not being
// pressed, NUDGE_MS.first after the answer and then every
// NUDGE_MS.every (`state.nudges` counts the ones already made); null when
// none can come (off the play screen, not on an answered word, or the
// dome just pressed: the next word is coming). main.js's nudge timer
// waits this long and then adds one to `state.nudges` (his point comes
// each time; only the first may say his press line, CHATTER, B-226).
export function nudgeWait(state) {
    if (state.screen !== 'play' || state.pressed === 'dome') return null;
    if (domeAction(state.current) !== 'next') return null;
    return state.nudges > 0 ? NUDGE_MS.every : NUDGE_MS.first;
}

// Ms until his press nudge (BACKLOG B-226, filledNudge): a random
// CHATTER.PRESS_WAIT seconds (`rand`), from when every slot is filled on
// a word he points at the dome on (filledEarly: the first EARLY_ROUNDS
// rounds; never the tutorial word, whose tutorialPress stays as it is),
// the word not checked yet (the dome would check) and not being pressed;
// null when it cannot come (that, or it already came on this word: at
// most once per word, `state.filledNudged`). main.js's press timer waits
// this long from the fill and then sets `filledNudged` if pressDue.
export function pressWait(state, rand = Math.random) {
    if (state.screen !== 'play' || state.tutorial || state.filledNudged || state.pressed) return null;
    if (state.roundsStarted > EARLY_ROUNDS || domeAction(state.current) !== 'check') return null;
    const [least, most] = CHATTER.PRESS_WAIT;
    return Math.round((least + rand() * (most - least)) * 1000);
}

// Whether his press nudge comes now, for a press timer armed on the word
// state `armed` (the `current` that filled the last slot): the word is
// still in that very state (no block moved, taken out or swapped, no
// check, no lever pull, no boost since: each makes a new `current`), and
// pressWait still holds (not pressed, not come yet on this word). A move
// or a press cancels it.
export function pressDue(state, armed) {
    return !!armed && state.current === armed && pressWait(state, () => 0) !== null;
}

// The snapshot before any state was seen: where renderRobot and audio.js's
// renderSound start comparing from.
export const NONE = { screen: null, round: 0, key: null, status: null, lives: null, misses: 0, placed: '', filled: false, idleBeat: null, lockedTaps: 0, hint: -1, boost: -1, boosts: 0, boostKind: null, nudges: 0, filledNudged: false, tuned: false, streak: 0, tutorial: false, tutor: null, stars: null, keyEarned: false, opened: 0 };

// --- Render ---

// Render cache: the snapshot it last rendered (to tell a moment from a
// re-render, and whether he was on screen) and when it last changed his
// pose (performance.now() ms, to keep changes CHANGE_MS apart). Not game
// state; nothing else reads it.
let last = { snap: NONE, changedAt: -Infinity };

// Render cache of the talking effects: the level, eyebrow lift and last
// head bob it last drew (each frame smooths from the one before), and
// whether it has drawn him quiet since he last talked. Not game state.
let talk = { level: 0, brow: 0, lastPeak: -Infinity, nod: 1, still: true };

// DOM cache: the puppet's parts in the template, looked up once (again if
// the page replaced them). Never read to decide game logic.
let dom = null;

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function parts() {
    if (dom && dom.robot.isConnected) return dom;
    const robot = document.querySelector('#screen-play .robot');
    const handsLayer = document.querySelector('#screen-play .robot-hands');
    if (!robot || !handsLayer) return null;
    const one = (root, sel) => root.querySelector(sel);
    const all = (root, sel) => [...root.querySelectorAll(sel)];
    const hand = (side) => one(handsLayer, `.hand-${side}`);
    dom = {
        robot,
        canvas: one(robot, '.puppet'),
        pupIn: one(robot, '.pup-in'),
        pupFloat: one(robot, '.pup-float'),
        body: one(robot, '.robot-torso'),
        head: one(robot, '.robot-head'),
        eyes: one(robot, '.visor-eyes'),
        eye: all(robot, '.visor-eye'),
        ball: { L: one(robot, '.visor-eye-L .ball'), R: one(robot, '.visor-eye-R .ball') },
        balls: all(robot, '.visor-eye .ball'),
        arcs: all(robot, '.visor-eye .arc'),
        scope: one(robot, '.scope'),
        cap: one(robot, '.cap'),
        sparks: one(robot, '.cap .sparks'),
        capFlash: one(robot, '.cap-flash'),
        brow: { L: one(robot, '.brow-L'), R: one(robot, '.brow-R') },
        browFloat: all(robot, '.brow-float'),
        browFloatOf: { L: one(robot, '.brow-L .brow-float'), R: one(robot, '.brow-R .brow-float') },
        browImgs: all(robot, '.brow-float img'),
        hands: handsLayer,
        handsIn: one(handsLayer, '.hands-in'),
        handsFloat: one(handsLayer, '.hands-float'),
        hand: { L: hand('L'), R: hand('R') },
        drift: { L: one(hand('L'), '.hand-drift'), R: one(hand('R'), '.hand-drift') },
        flip: { L: one(hand('L'), '.hand-flip'), R: one(hand('R'), '.hand-flip') },
        flipL: one(hand('L'), '.hand-flip'),
        flipR: one(hand('R'), '.hand-flip'),
    };
    return dom;
}

// His pose lives on .robot: class eyes-<name>, brows-<name>,
// hands-<name>, is-sunk and is-following, and the head's turn in
// data-head. Read back only to keep the ambient life and the talking
// true to the pose he is in (no blink on happy or squinting eyes, ...).
function mark(robot, part, name) {
    for (const c of [...robot.classList]) if (c.startsWith(`${part}-`)) robot.classList.remove(c);
    robot.classList.add(`${part}-${name}`);
}

function shows(robot, part, name) {
    return robot.classList.contains(`${part}-${name}`);
}

function headTurn(d) {
    return Number(d.robot.dataset.head) || 0;
}

// x / y in puppet px -> xPercent / yPercent of a canvas-sized part;
// '+=' / '-=' values keep their sign.
function moveVars(vars) {
    const out = {};
    for (const [k, v] of Object.entries(vars)) {
        if (k === 'x' || k === 'y') {
            const key = k === 'x' ? 'xPercent' : 'yPercent';
            out[key] = typeof v === 'string' ? `${v.slice(0, 2)}${pct(Number(v.slice(2)))}` : pct(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

const dur = (d, reduced) => (reduced ? 0 : d);

function setHands(d, name, duration, reduced) {
    const pose = handPose(name);
    mark(d.robot, 'hands', name);
    for (const side of ['L', 'R']) {
        const p = pose[side];
        for (const img of d.hand[side].querySelectorAll('img')) {
            img.classList.toggle('on', img.dataset.shape === p.shape);
        }
        gsap.to(d.hand[side], {
            xPercent: pct(p.x),
            yPercent: pct(p.y),
            rotation: p.rotation,
            duration: dur(duration, reduced),
            ease: TIMING.hands.ease,
            delay: side === 'L' || reduced ? 0 : TIMING.hands.lag,
            overwrite: 'auto',
        });
    }
}

function setEyes(d, name, duration, reduced) {
    const e = eyeShape(name);
    mark(d.robot, 'eyes', name);
    const t = dur(duration, reduced);
    for (const side of ['L', 'R']) {
        gsap.to(d.ball[side], { attr: { rx: e[side].rx, ry: e[side].ry }, opacity: e.arc ? 0 : 1, duration: t, ease: TIMING.eyes.ease });
    }
    gsap.to(d.arcs, { opacity: e.arc ? 1 : 0, duration: t });
}

function setBrows(d, name, reduced) {
    const b = browPose(name);
    mark(d.robot, 'brows', name);
    for (const side of ['L', 'R']) {
        gsap.to(d.brow[side], { yPercent: pct(b[side].y), rotation: b[side].rotation, duration: dur(TIMING.brows.duration, reduced), ease: TIMING.brows.ease });
    }
}

function setHead(d, turn, duration, reduced) {
    d.robot.dataset.head = String(turn);
    gsap.to(d.head, { rotation: turn, duration: dur(duration, reduced), ease: TIMING.head.ease });
}

function look(d, [x, y]) {
    gsap.to(d.eyes, { x, y, duration: TIMING.look.duration, ease: TIMING.look.ease });
}

function pop(d, kind) {
    const p = TIMING.pop;
    const k = kind === 'small' ? p.small : 1;
    const n = kind === 2 ? 2 : 1;
    const tl = gsap.timeline();
    for (let i = 0; i < n; i++) {
        tl.to(d.pupIn, { yPercent: pct(p.body.y * k), duration: p.body.up, ease: 'power2.out' })
            .to(d.pupIn, { yPercent: 0, duration: p.body.down, ease: 'power2.in' });
    }
    gsap.timeline({ delay: p.hands.delay })
        .to(d.handsIn, { yPercent: pct(p.hands.y * k), duration: p.hands.up, ease: 'power2.out' })
        .to(d.handsIn, { yPercent: 0, duration: p.hands.down, ease: 'power2.in' });
    // the hands trail the body a beat later and a bit further
    gsap.timeline({ delay: p.trail.delay })
        .to([d.flip.L, d.flip.R], { yPercent: pct(p.trail.y * k), duration: p.trail.down })
        .to([d.flip.L, d.flip.R], { yPercent: 0, duration: p.trail.back, ease: p.trail.ease });
}

function sink(d, px, reduced) {
    d.robot.classList.toggle('is-sunk', px > TIMING.sink.sunk);
    gsap.to(d.pupIn, { yPercent: pct(px), duration: dur(TIMING.sink.duration, reduced), ease: TIMING.sink.ease });
    // a fade still waiting from the last sink must not show them again
    gsap.killTweensOf(d.handsIn, 'opacity');
    for (const t of handsSink(px, reduced)) {
        if (t.set) gsap.set(d.handsIn, t.set);
        else gsap.to(d.handsIn, { ...moveVars(t.to), duration: t.duration, delay: t.delay, ease: TIMING.sink.ease });
    }
}

function shake(d) {
    const s = TIMING.shake;
    const base = headTurn(d);
    gsap.to(d.head, {
        rotation: base + s.turn,
        duration: s.duration,
        yoyo: true,
        repeat: s.repeat,
        ease: s.ease,
        onComplete: () => setHead(d, headTurn(d), s.settle, false),
    });
}

function flourish(d, name, reduced) {
    for (const t of fxFor(name, reduced)) {
        const target = t.part === 'browFloat' ? d.browFloat : d[t.part];
        const vars = { ...moveVars(t.to), duration: t.duration };
        for (const k of ['yoyo', 'repeat', 'ease', 'delay']) if (k in t) vars[k] = t[k];
        if (t.from) gsap.fromTo(target, moveVars(t.from), vars);
        else gsap.to(target, vars);
    }
}

// Apply one step of a moment (the reference's building blocks: sink,
// head, eyes, brows, hands, look, pop, shake, flourish, peek). `onPeek` is
// told each time he peeks (renderRobot's).
function applyStep(step, onPeek = null) {
    const d = parts();
    if (!d) return;
    const reduced = reducedMotion();
    const s = reduced ? reducedStep(step) : step;
    if (isChange(s)) last = { ...last, changedAt: performance.now() };
    if ('sink' in s) sink(d, s.sink, reduced);
    if ('head' in s) setHead(d, s.head, TIMING.head.duration, reduced);
    if ('eyes' in s) setEyes(d, s.eyes, TIMING.eyes.duration, reduced);
    if ('brows' in s) setBrows(d, s.brows, reduced);
    if ('hands' in s) setHands(d, s.hands, TIMING.hands.duration, reduced);
    if (s.look) look(d, s.look);
    if (s.pop) pop(d, s.pop);
    if (s.shake) shake(d);
    if (s.fx) flourish(d, s.fx, reduced);
    if (s.peek) gsap.delayedCall(PEEK.wait, peekOnce, [onPeek]);
}

// One round of the idle peek, then the next one PEEK.every seconds on,
// until a new moment (playMoments) or leaving the screen stops it. As he
// comes up `onPeek` is told (main.js hands audio.js's peekLine, his
// whisper; BACKLOG B-224).
function peekOnce(onPeek = null) {
    if (onPeek) onPeek();
    for (const step of PEEK.steps) {
        if (step.at === 0) applyStep(step);
        else gsap.delayedCall(step.at, applyStep, [step]);
    }
    gsap.delayedCall(PEEK.every, peekOnce, [onPeek]);
}

// Steps still waiting (and the idle peeking) are dropped.
function dropWaiting() {
    gsap.killTweensOf(applyStep);
    gsap.killTweensOf(peekOnce);
}

// Play `moments` from now: one script (scriptFor), each moment's variant
// picked at random unless `picks` names it, its first step no sooner than
// CHANGE_MS after his last change, nor than `delay` seconds from now (a
// boost's letter landing, boostLands; a correct check's win ending,
// B-227). Until then he takes their lead (leadOf: on a correct check he
// watches the win), no sooner than CHANGE_MS after his last change, and
// the script comes CHANGE_MS after it at the earliest. A newer moment
// replaces the steps an older one still had waiting. `onPeek` is told of
// each idle peek (applyStep). renderRobot calls it on a transition;
// exported so a screenshot script can show a moment the play screen never
// does (the round end).
export function playMoments(moments, picks = {}, delay = 0, onPeek = null) {
    const chosen = {};
    for (const m of moments) chosen[m] = picks[m] || pickVariant(m, Math.random());
    const script = scriptFor(moments, chosen);
    const lead = leadOf(moments);
    const first = startDelay(performance.now() - last.changedAt) / 1000;
    const wait = Math.max(first + (lead.length ? CHANGE_MS / 1000 : 0), delay);
    dropWaiting();
    const timed = [...lead.map((step) => [first + step.at, step]), ...script.map((step) => [wait + step.at, step])];
    for (const [t, step] of timed) {
        if (t === 0) applyStep(step, onPeek);
        else gsap.delayedCall(t, applyStep, [step, onPeek]);
    }
}

// --- Ambient life ---

const between = ([least, extra]) => least + Math.random() * extra;

function blinkOnce() {
    const d = parts();
    if (!d) return;
    const b = AMBIENT.blink;
    gsap.timeline()
        .to(d.eye, { scaleY: b.scaleY, duration: b.close, ease: 'power1.in', transformOrigin: '50% 50%' })
        .to(d.eye, { scaleY: 1, duration: b.open, ease: 'power1.out' });
}

function blink() {
    const d = parts();
    if (d && !shows(d.robot, 'eyes', 'happy') && !shows(d.robot, 'eyes', 'squint')) {
        blinkOnce();
        if (Math.random() < AMBIENT.blink.twice) gsap.delayedCall(AMBIENT.blink.gap, blinkOnce);
    }
    gsap.delayedCall(between(AMBIENT.blink.every), blink);
}

function wander() {
    const d = parts();
    if (d && !d.robot.classList.contains('is-following') && !shows(d.robot, 'hands', 'point')) {
        look(d, [(Math.random() - 0.5) * AMBIENT.wander.x, (Math.random() - 0.5) * AMBIENT.wander.y]);
    }
    gsap.delayedCall(between(AMBIENT.wander.every), wander);
}

function browSolo() {
    const d = parts();
    if (d && !d.robot.classList.contains('is-sunk')) {
        const one = Math.random() < 0.5 ? d.browFloatOf.L : d.browFloatOf.R;
        const { lift, wiggle } = AMBIENT.browSolo;
        if (Math.random() < 0.5) {
            gsap.to(one, { yPercent: `-=${pct(-lift.y)}`, duration: lift.duration, yoyo: true, repeat: 1, repeatDelay: lift.hold, ease: 'power2.out' });
        } else {
            gsap.to(one, { rotation: `+=${wiggle.rotation}`, duration: wiggle.duration, yoyo: true, repeat: wiggle.repeat, ease: 'sine.inOut', transformOrigin: '50% 50%' });
        }
    }
    gsap.delayedCall(between(AMBIENT.browSolo.every), browSolo);
}

// The canvas-sized layers the render moves (HTML), and the visor's SVG
// parts it moves, for stopping and resetting them.
function layers(d) {
    return [d.pupIn, d.pupFloat, d.body, d.head, d.brow.L, d.brow.R, ...d.browFloat, ...d.browImgs,
        d.handsIn, d.handsFloat, d.hand.L, d.hand.R, d.drift.L, d.drift.R, d.flip.L, d.flip.R];
}

function visorParts(d) {
    return [d.eyes, ...d.eye, ...d.balls, ...d.arcs, d.sparks, d.capFlash];
}

// He comes on screen: his rest pose, then (unless reduced motion) the
// ambient life starts.
function startLife() {
    const d = parts();
    if (!d) return;
    const reduced = reducedMotion();
    gsap.set(d.balls, { transformOrigin: '50% 50%' });
    setHands(d, 'rest', 0, true);
    setEyes(d, 'idle', 0, true);
    setBrows(d, 'calm', true);
    if (reduced) return;
    const loop = { ease: 'sine.inOut', yoyo: true, repeat: -1 };
    const a = AMBIENT;
    gsap.to([d.pupFloat, d.handsFloat], { yPercent: pct(a.float.y), duration: a.float.duration, ...loop });
    gsap.to(d.body, { scaleY: a.breathe.scaleY, scaleX: a.breathe.scaleX, duration: a.breathe.duration, ...loop });
    gsap.to(d.drift.L, { yPercent: pct(a.handL.y), xPercent: pct(a.handL.x), duration: a.handL.duration, delay: a.handL.delay, ...loop });
    gsap.to(d.drift.R, { yPercent: pct(a.handR.y), xPercent: pct(a.handR.x), duration: a.handR.duration, delay: a.handR.delay, ...loop });
    gsap.to(d.browFloatOf.L, { yPercent: pct(a.browL.y), duration: a.browL.duration, ...loop });
    gsap.to(d.browFloatOf.R, { yPercent: pct(a.browR.y), rotation: a.browR.rotation, duration: a.browR.duration, delay: a.browR.delay, ...loop });
    blink();
    wander();
    browSolo();
}

// He leaves the screen: everything he was doing stops and he is put back
// at rest, so the next round starts him fresh.
function stopLife() {
    const d = parts();
    dropWaiting();
    for (const fn of [blink, blinkOnce, wander, browSolo]) gsap.killTweensOf(fn);
    if (!d) return;
    gsap.killTweensOf([...layers(d), ...visorParts(d)]);
    gsap.set(layers(d), { xPercent: 0, yPercent: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    gsap.set(d.handsIn, { opacity: 1 });
    // the eye groups keep their place in the visor (their own translate)
    gsap.set(d.eyes, { x: 0, y: 0 });
    gsap.set(d.eye, { scaleY: 1 });
    gsap.set(d.balls, { scale: 1 });
    gsap.set(d.sparks, { rotation: 0, svgOrigin: TALK.sparks.origin });
    gsap.set(d.capFlash, { opacity: 0 });
    const flat = scopeLine(null, 0);
    d.scope.setAttribute('d', flat.d);
    d.scope.setAttribute('opacity', String(flat.opacity));
    d.cap.setAttribute('opacity', '0');
    d.robot.classList.remove('is-sunk', 'is-following');
    d.robot.dataset.head = '0';
}

// `onPeek` (main.js: audio.js peekLine) is told each time he peeks over
// the edge while sunk (BACKLOG B-224: his whisper).
export function renderRobot(state, onPeek = null) {
    const now = snapshot(state);
    const prev = last.snap;
    const moments = momentsFor(prev, now);
    const wasOnPlay = prev.screen === 'play';
    last = { ...last, snap: now };
    if (now.screen !== 'play') {
        // He is only on the play screen; steps still waiting are dropped.
        if (wasOnPlay) stopLife();
        return;
    }
    if (!wasOnPlay) startLife();
    if (!moments.length) return;
    // a boost's moment waits for its letter to land (BACKLOG B-219); the
    // picture's look is the one audio.js's line goes with (B-224)
    playMoments(moments, picksFor(moments, now), waitFor(moments, prev, now, reducedMotion()), onPeek);
}

// --- Following a dragged block (drag.js) ---

// `point` is the dragged block's centre on screen while the kid drags it,
// null when it is let go: his eyes and a small head turn follow it, then
// look ahead again and the head goes back to its pose. Transient render
// input from drag.js, not game state.
export function followBlock(point) {
    const d = parts();
    if (!d || last.snap.screen !== 'play') return;
    if (!point) {
        if (!d.robot.classList.contains('is-following')) return;
        d.robot.classList.remove('is-following');
        look(d, [0, 0]);
        setHead(d, headTurn(d), TIMING.head.duration, reducedMotion());
        return;
    }
    d.robot.classList.add('is-following');
    const r = d.canvas.getBoundingClientRect();
    const aim = aimAt(point.x - (r.left + r.width * AIM.from[0]), point.y - (r.top + r.height * AIM.from[1]));
    look(d, aim.look);
    gsap.to(d.head, { rotation: headTurn(d) + aim.turn, duration: dur(AIM.duration, reducedMotion()), overwrite: 'auto' });
}

// --- Talking (audio.js's AnalyserNode, every frame from main.js) ---

// `wave` is this frame's samples of his voice, or null while none of his
// clips plays. Draws the four effects from the smoothed level (pure
// helpers above); does nothing once he is quiet and drawn so.
export function renderTalk(wave) {
    const talking = !!wave;
    const level = smoothLevel(talk.level, loudness(wave));
    const brow = browRide(talk.brow, level, talking);
    const quiet = !talking && level < 0.001 && Math.abs(brow) < 0.01;
    if (quiet && talk.still) return;
    talk = { ...talk, level: quiet ? 0 : level, brow: quiet ? 0 : brow, still: quiet };
    const d = parts();
    if (!d || last.snap.screen !== 'play') return;
    const scope = scopeLine(wave, talk.level);
    d.scope.setAttribute('d', scope.d);
    d.scope.setAttribute('opacity', String(scope.opacity));
    const lights = talkLights(talk.level);
    gsap.set(d.balls, { scale: lights.eyes });
    d.cap.setAttribute('opacity', String(lights.cap));
    if (lights.sparks) {
        gsap.set(d.sparks, { rotation: (Math.random() - 0.5) * TALK.sparks.turn, svgOrigin: TALK.sparks.origin, opacity: Math.random() < TALK.sparks.show ? 1 : 0 });
    }
    gsap.set(d.browImgs, { yPercent: pct(talk.brow) });
    const now = performance.now();
    if (!reducedMotion() && nodDue(talk.level, now, talk.lastPeak)) {
        const nod = -talk.nod;
        talk = { ...talk, lastPeak: now, nod };
        const n = TALK.nod;
        gsap.to(d.head, { rotation: headTurn(d) + nod * n.turn, yPercent: pct(n.y), duration: n.duration, yoyo: true, repeat: 1 });
    }
}
