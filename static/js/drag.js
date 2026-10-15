// drag.js — GSAP Draggable for letter tiles: drag, tap and the motion
// around them (DESIGN "Motion"). Reads the tile id from the element,
// hit-tests against the letter boxes, and calls setState. Rendering the
// result is card.js's job; the tweens here only move a tile from where it
// was to where the render put it.

import { state, setState } from './state.js';
import { motionFor } from './motion.js';

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
            this.target.classList.add('gsap-dragging');
            document.body.classList.add('dragging-active');
            pickUp(this.target);
        },
        // Fires on every release, before onDragEnd and before onClick.
        onRelease() {
            this.target.classList.remove('gsap-dragging');
            document.body.classList.remove('dragging-active');
            putDown(this.target);
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
// tile came from.
function springBack(el) {
    const m = motionFor('return', reducedMotion());
    gsap.killTweensOf(el);
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

// Index of the box whose centre is closest to the tile's, among boxes the
// tile overlaps by at least half of either area. Boxes can be smaller than
// tiles (long words), so a tile may overlap two boxes; nearest centre wins.
// A locked slot takes nothing, so it is not a target: a block dropped
// across it and the next slot goes into the next one.
function nearestHitBox(el) {
    const boxes = document.querySelectorAll('#letter-boxes .letter-box');
    const t = el.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const cy = t.top + t.height / 2;
    let best = -1;
    let bestDist = Infinity;
    boxes.forEach((box, i) => {
        if (isLocked(state.current.placed[i])) return;
        if (!Draggable.hitTest(el, box, '50%')) return;
        const b = box.getBoundingClientRect();
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
// letter on easy, BACKLOG B-204): it stays where it is.
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

// The reset lever: every placed tile goes back to its start spot on the
// bench, except a locked one (the easy given letter, BACKLOG B-204),
// which stays in its slot. Pure (main.js applies it through setState,
// feedback.js animates the hop); a wrong check is reopened as by any
// other move.
export function returnAll(current) {
    const placed = current.placed.map((p) => (isLocked(p) ? p : null));
    const stay = new Set(placed.filter(Boolean).map((p) => p.tileId));
    return {
        ...current,
        placed,
        tray: current.tray.map((t) => ({ ...t, used: stay.has(t.id) })),
        status: afterMove(current.status),
    };
}
