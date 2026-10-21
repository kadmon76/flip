// drag.js — GSAP Draggable for letter tiles: drag, tap and the motion
// around them (DESIGN "Motion"). Reads the tile id from the element,
// hit-tests against the letter boxes, and calls setState. Rendering the
// result is card.js's job; the tweens here only move a tile from where it
// was to where the render put it.

import { state, setState } from './state.js';
import { motionFor } from './motion.js';
import { followBlock } from './character.js';
import { slotLayout, dropsIn } from './layout.js';

const draggables = new Map();   // tile element -> Draggable instance

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function makeDraggable(el) {
    // Stop the page from scrolling under a touch drag.
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Hardware-acceleration hints: promote the tile to its own layer.
    gsap.set(el, { willChange: 'transform', z: 0.01, backfaceVisibility: 'hidden' });

    const [d] = Draggable.create(el, {
        type: 'x,y',
        inertia: false,
        zIndexBoost: true,
        dragClickables: true,
        lockAxis: false,
        cursor: 'grab',
        allowContextMenu: false,
        onPress(e) {
            if (e.pointerType === 'touch') e.preventDefault();
            // A block picked up while feedback.js still moves it (the
            // second-miss hint's wiggle and hop back, BACKLOG B-206)
            // stays where it is and follows the finger: its x, y and
            // scale tweens end here, also the ones of its motion not yet
            // started (Draggable itself only stops the running x/y ones).
            // A turn to its tilt (and a reduced-motion fade) still
            // finishes, so a block let go away from a slot lies at the
            // tilt the render set; pickUp / putDown own the scale.
            gsap.killTweensOf(this.target, 'x,y,scale');
            this.target.classList.add('gsap-dragging');
            document.body.classList.add('dragging-active');
            pickUp(this.target);
        },
        // The robot's eyes and head follow the block while it is dragged
        // (BACKLOG B-210, character.js followBlock): its centre on screen,
        // passed on as it moves, never kept.
        onDrag() {
            followBlock(centre(this.target));
        },
        // Fires on every release, before onDragEnd and before onClick.
        onRelease() {
            this.target.classList.remove('gsap-dragging');
            document.body.classList.remove('dragging-active');
            putDown(this.target);
            followBlock(null);
        },
        onDragEnd() {
            dropTile(this.target);
        },
        // Press + release without movement, or a script-dispatched click.
        onClick() {
            tapTile(this.target);
        },
    });
    draggables.set(el, d);
}

export function destroyDraggable(el) {
    const d = draggables.get(el);
    if (d) d.kill();
    draggables.delete(el);
}

// Called by card.js on every render: blocks can move while `on` (the
// word is being spelled), except the ones in `locked` (tile ids of the
// letters in locked slots, BACKLOG B-204), which never can. A tile
// created in the same render is set here too.
export function setDragEnabled(on, locked = new Set()) {
    draggables.forEach((d, el) => {
        const want = on && !locked.has(el.dataset.tileId);
        if (d.enabled() !== want) d.enabled(want);
    });
}

// --- Motion ---

// Tween `el` to `vars` with the spec `m`; instant when the spec says so.
function tween(el, vars, m) {
    if (m.duration === 0) gsap.set(el, vars);
    else gsap.to(el, { ...vars, duration: m.duration, ease: m.ease });
}

// Pick-up: scale up (the lifted shadow is the .gsap-dragging CSS rule).
function pickUp(el) {
    const m = motionFor('pickup', reducedMotion());
    gsap.killTweensOf(el, 'scale');
    tween(el, { scale: m.scale }, m);
}

// Release: scale back. Only touches scale so a snap or return tween
// started right after (onDragEnd, onClick) keeps its own x/y motion.
function putDown(el) {
    const m = motionFor('pickup', reducedMotion());
    gsap.killTweensOf(el, 'scale');
    tween(el, { scale: 1 }, m);
}

// Centre of an element on screen; feedback.js uses it for the reveal
// fly-in and the reset hop too.
export function centre(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Apply a state change that moves `el` between tray and boxes, then
// animate it from where it was to where the render put it (FLIP). The
// centre is used so the pick-up scale does not skew the offset. The tilt
// the render set (a bench spot's, or upright in a slot) is eased in too.
function moveTile(el, change) {
    const before = centre(el);
    const tiltBefore = gsap.getProperty(el, 'rotation');
    if (!change()) return false;
    const after = centre(el);
    const tiltAfter = gsap.getProperty(el, 'rotation');
    const m = motionFor('snap', reducedMotion());
    gsap.killTweensOf(el);
    if (m.duration === 0) {
        gsap.set(el, { x: 0, y: 0, scale: 1 });
        return true;
    }
    gsap.fromTo(
        el,
        { x: before.x - after.x, y: before.y - after.y, rotation: tiltBefore },
        { x: 0, y: 0, rotation: tiltAfter, scale: m.scale, duration: m.duration, ease: m.ease },
    );
    return true;
}

// Drop anywhere that is not a box or the tray: slide back to where the
// tile came from. Only x, y and scale are taken over: a turn to its tilt
// still under way or still to come (a snap, or the second-miss hop back,
// BACKLOG B-206) finishes, so the block lies at the tilt the render set.
function springBack(el) {
    const m = motionFor('return', reducedMotion());
    gsap.killTweensOf(el, 'x,y,scale');
    tween(el, { x: 0, y: 0, scale: m.scale }, m);
}

// --- Drop and tap handling ---

function dropTile(el) {
    const tileId = el.dataset.tileId;
    const boxIndex = nearestHitBox(el);

    if (boxIndex !== -1 && moveTile(el, () => placeTile(tileId, boxIndex))) return;

    // A placed tile dragged back over the tray returns to the tray.
    const tray = document.getElementById('letter-tray');
    if (boxIndex === -1 && placedIndex(state.current, tileId) !== -1 && Draggable.hitTest(el, tray, '30%')) {
        if (moveTile(el, () => returnToTray(tileId))) return;
    }

    springBack(el);
}

// Index of the box whose centre is closest to the tile's, among the
// boxes the tile lands in: it covers half of the smaller of the two with
// the box's drop area (layout.js dropsIn). That area is the box itself,
// or on a 7-8 letter word, whose slots are smaller (36-46px), the box
// grown to the rail's full height and halfway into the gaps (slotLayout
// `hit`; BACKLOG B-213). Boxes are smaller than tiles, so a tile may
// land in two; nearest centre wins. A locked slot takes nothing, so it
// is not a target: a block dropped across it and the next slot goes into
// the next one.
function nearestHitBox(el) {
    const rail = document.getElementById('letter-boxes');
    const boxes = rail.querySelectorAll('.letter-box');
    const { hit } = slotLayout(state.current.placed.length, rail.clientWidth, state.current.break);
    const t = el.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const cy = t.top + t.height / 2;
    let best = -1;
    let bestDist = Infinity;
    boxes.forEach((box, i) => {
        if (isLocked(state.current.placed[i])) return;
        const b = box.getBoundingClientRect();
        if (!dropsIn(t, b, hit)) return;
        const dist = Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy);
        if (dist < bestDist) {
            best = i;
            bestDist = dist;
        }
    });
    return best;
}

// Tap: a tray tile goes to the first empty box; a placed tile goes back
// to the tray. Both use the drop motion.
function tapTile(el) {
    const tileId = el.dataset.tileId;
    if (placedIndex(state.current, tileId) !== -1) {
        moveTile(el, () => returnToTray(tileId));
        return;
    }
    const empty = state.current.placed.findIndex((p) => !p);
    if (empty !== -1) moveTile(el, () => placeTile(tileId, empty));
}

// --- State transitions (pure functions over state.current) ---

function placedIndex(current, tileId) {
    return current.placed.findIndex((p) => p && p.tileId === tileId);
}

// A slot holding a locked letter (round.js makeWord: the given first
// letter on stage 1, BACKLOG B-204, B-215; a right letter the lever kept
// after a wrong check, B-205, leverResult; the robot's letter on the
// second miss, B-206, giveHint): it stays where it is.
export function isLocked(slot) {
    return !!(slot && slot.locked);
}

// Put tile into box `index`: the new current, or null when nothing
// changes (no such tile, already there, a locked slot, a locked tile).
export function placeIn(current, tileId, index) {
    const placed = [...current.placed];
    const tray = current.tray.map((t) => ({ ...t }));
    const tile = tray.find((t) => t.id === tileId);
    if (!tile) return null;

    const occupant = placed[index];
    if (occupant && occupant.tileId === tileId) return null;
    if (isLocked(occupant)) return null;

    const from = placedIndex(current, tileId);
    if (from !== -1 && isLocked(placed[from])) return null;
    if (from !== -1) placed[from] = null;

    if (occupant) {
        // Swap: the tile already in the box goes back to the tray.
        const old = tray.find((t) => t.id === occupant.tileId);
        if (old) old.used = false;
    }

    placed[index] = { letter: tile.letter, tileId };
    tile.used = true;
    return { ...current, placed, tray, status: afterMove(current.status) };
}

// Take the tile out of its box, back to its spot on the bench: the new
// current, or null when it was not in a box or its slot is locked.
export function takeOut(current, tileId) {
    const from = placedIndex(current, tileId);
    if (from === -1 || isLocked(current.placed[from])) return null;
    const placed = [...current.placed];
    placed[from] = null;
    const tray = current.tray.map((t) => (t.id === tileId ? { ...t, used: false } : { ...t }));
    return { ...current, placed, tray, status: afterMove(current.status) };
}

// Apply a transition to state; false when nothing changed.
function commit(next) {
    if (!next) return false;
    setState({ current: next });
    return true;
}

function placeTile(tileId, index) {
    return commit(placeIn(state.current, tileId, index));
}

function returnToTray(tileId) {
    return commit(takeOut(state.current, tileId));
}

// Moving a tile after a wrong check reopens the word: the wrong check
// belongs to the arrangement that was checked, not to the one the kid is
// now building, so the check dome lights up again once every slot is
// filled (DESIGN "Controls and states").
export function afterMove(status) {
    return status === 'wrong' ? 'playing' : status;
}

// What a pull on the reset lever does (BACKLOG B-205): { back, lock },
// the tile ids of the placed letters that go back to the bench and of the
// ones that stay in their slot, locked. The given first letter (stage 1;
// its tray tile is `given`, BACKLOG B-204) and the robot's second-miss
// letter (its slot is `hint`, B-206, giveHint) are in neither: they
// always stay, locked. On every stage (B-215: easy's rule until B-215b
// brings PROGRESSION.md's lever rule):
//   - Right after a wrong check (status 'wrong': the checked letters have
//     not moved since): only the letters in wrong slots go back; the ones
//     in right slots lock.
//   - Otherwise (before any wrong check, after a block moved since the
//     check, the next pull after a wrong-letters pull): every placed
//     letter goes back, a locked one too (it unlocks), and nothing locks.
export function leverResult(current) {
    const given = new Set(current.tray.filter((t) => t.given).map((t) => t.id));
    const placed = current.placed
        .map((p, i) => ({ p, right: !!p && p.letter === current.word[i] }))
        .filter(({ p }) => p && !given.has(p.tileId) && !p.hint);
    const ids = (list) => list.map(({ p }) => p.tileId);
    if (current.status === 'wrong') {
        return { back: ids(placed.filter((s) => !s.right)), lock: ids(placed.filter((s) => s.right)) };
    }
    return { back: ids(placed), lock: [] };
}

// The reset lever's pull (leverResult): the letters it sends back leave
// their slot (unlocked, as the slot is emptied) for their start spot on
// the bench, the ones it locks stay with `locked: true`, and the given
// letter and the robot's letter stay as they are. Pure (main.js applies
// it through setState, feedback.js hops the blocks that left a slot); a
// wrong check is reopened as by any other move.
export function returnAll(current) {
    const { back, lock } = leverResult(current);
    const goBack = new Set(back);
    const locks = new Set(lock);
    const placed = current.placed.map((p) => {
        if (!p || goBack.has(p.tileId)) return null;
        return locks.has(p.tileId) ? { ...p, locked: true } : p;
    });
    const stay = new Set(placed.filter(Boolean).map((p) => p.tileId));
    return {
        ...current,
        placed,
        tray: current.tray.map((t) => ({ ...t, used: stay.has(t.id) })),
        status: afterMove(current.status),
    };
}

// The robot's letter on the second miss (BACKLOG B-206): the wrong check
// that leaves one lives bulb lit also places one letter, on every stage.
// { index, tileId, back }: the first slot that is empty or holds a wrong
// letter (`index`; a locked slot is always right and is skipped), the
// block that gets its right letter (`tileId`) and the block already in
// that slot, which goes back to the bench (`back`, null when the slot is
// empty). The block is one with that letter lying on the bench if there
// is one, else the one in the first wrong slot holding that letter (that
// slot is emptied); never one in a right slot. On a stage without extras
// every block is in a slot when a check is made, so it comes from a wrong
// slot. On a stage with extras the bench also holds extra letters
// (BACKLOG B-207, B-215, round.js makeWord): they are never the letter
// given; one in the slot goes back like any wrong letter. null when
// there is nothing to give (every slot right).
export function hintFor(current) {
    const { word, placed, tray } = current;
    const right = (p, i) => !!p && p.letter === word[i];
    const index = placed.findIndex((p, i) => !isLocked(p) && !right(p, i));
    if (index === -1) return null;
    const letter = word[index];
    const onBench = tray.find((t) => t.letter === letter && !t.used && !t.extra);
    let tileId = onBench ? onBench.id : null;
    if (!tileId) {
        const from = placed.findIndex((p, i) => !!p && p.letter === letter && !right(p, i) && !isLocked(p));
        if (from === -1) return null;
        tileId = placed[from].tileId;
    }
    const occupant = placed[index];
    return { index, tileId, back: occupant ? occupant.tileId : null };
}

// The second-miss hint applied (hintFor): the block leaves the bench or
// its wrong slot for slot `index`, where it is locked (`locked: true`,
// the same lock as the given letter: no drag, tap out or drop on it) and
// marked `hint` (the reset lever leaves it, leverResult; the robot's
// `hintGiven` and feedback.js's fly-in key on it); the block that was
// there goes back to its spot on the bench. The status is kept: main.js
// applies it in the same setState as the wrong check, so the word stays
// 'wrong' (the dome off until a block moves; with extras afterHint may
// reopen it right after, when his letter finished the word, BACKLOG
// B-207). Pure; `current` itself when there is nothing to give.
export function giveHint(current) {
    const hint = hintFor(current);
    if (!hint) return current;
    const { index, tileId, back } = hint;
    const placed = current.placed.map((p) => (p && p.tileId === tileId ? null : p));
    placed[index] = { letter: current.word[index], tileId, locked: true, hint: true };
    const tray = current.tray.map((t) => {
        if (t.id === tileId) return { ...t, used: true };
        if (t.id === back) return { ...t, used: false };
        return { ...t };
    });
    return { ...current, placed, tray };
}

// After the robot's letter (giveHint): with extras it can finish the word,
// when the only wrong slot held an extra letter and the right block lay
// on the bench (BACKLOG B-207). Every slot then holds its right letter,
// an arrangement that was never checked, so the word reopens ('playing'):
// the dome lights at once and the kid checks it (a word counts as
// mastered only when checked correct). Otherwise `current` itself: a
// slot is empty or a wrong letter is left, and the check's 'wrong' stays
// until a block moves. Pure; main.js applies it in a setState of its own
// right after the check's, so the robot, the sound and the motion see
// the miss first.
export function afterHint(current) {
    const solved = current.placed.length > 0 && current.placed.every((p, i) => !!p && p.letter === current.word[i]);
    return current.status === 'wrong' && solved ? { ...current, status: 'playing' } : current;
}

// The third miss (main.js onCheck): every slot gets its right letter from
// the word's own blocks. A block already in its right slot stays there (a
// locked one stays locked: the given letter, a lever-locked one, the
// robot's letter), so on the reveal only the others fly in (feedback.js).
// The extra letters (BACKLOG B-207) are never used: one in a slot
// goes back to its bench spot (`used` is whether a block is in a slot).
export function revealed(current) {
    const letters = current.word.split('');
    const placed = letters.map((ch, i) => {
        const p = current.placed[i];
        return p && p.letter === ch ? { ...p } : null;
    });
    const taken = new Set(placed.filter(Boolean).map((p) => p.tileId));
    letters.forEach((ch, i) => {
        if (placed[i]) return;
        const tile = current.tray.find((t) => t.letter === ch && !t.extra && !taken.has(t.id));
        taken.add(tile.id);
        placed[i] = { letter: tile.letter, tileId: tile.id };
    });
    const tray = current.tray.map((t) => ({ ...t, used: taken.has(t.id) }));
    return { ...current, tray, placed, status: 'revealed' };
}
