// drag.js — GSAP Draggable for letter tiles: drag, tap and the motion
// around them (DESIGN "Motion"). Reads the tile id from the element,
// hit-tests against the letter boxes, and calls setState. Rendering the
// result is card.js's job; the tweens here only move a tile from where it
// was to where the render put it.

import { state, setState } from './state.js';
import { motionFor } from './motion.js';

const draggables = new Map();   // tile element -> Draggable instance
let enabled = true;

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
    if (!enabled) d.disable();
    draggables.set(el, d);
}

export function destroyDraggable(el) {
    const d = draggables.get(el);
    if (d) d.kill();
    draggables.delete(el);
}

export function setDragEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    draggables.forEach((d) => (on ? d.enable() : d.disable()));
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

function centre(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Apply a state change that moves `el` between tray and boxes, then
// animate it from where it was to where the render put it (FLIP). The
// centre is used so the pick-up scale does not skew the offset.
function moveTile(el, change) {
    const before = centre(el);
    if (!change()) return false;
    const after = centre(el);
    const m = motionFor('snap', reducedMotion());
    gsap.killTweensOf(el);
    if (m.duration === 0) {
        gsap.set(el, { x: 0, y: 0, scale: 1 });
        return true;
    }
    gsap.fromTo(
        el,
        { x: before.x - after.x, y: before.y - after.y },
        { x: 0, y: 0, scale: m.scale, duration: m.duration, ease: m.ease },
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
    if (boxIndex === -1 && placedIndex(tileId) !== -1 && Draggable.hitTest(el, tray, '30%')) {
        if (moveTile(el, () => returnToTray(tileId))) return;
    }

    springBack(el);
}

// Index of the box whose centre is closest to the tile's, among boxes the
// tile overlaps by at least half of either area. Boxes can be smaller than
// tiles (long words), so a tile may overlap two boxes; nearest centre wins.
function nearestHitBox(el) {
    const boxes = document.querySelectorAll('#letter-boxes .letter-box');
    const t = el.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const cy = t.top + t.height / 2;
    let best = -1;
    let bestDist = Infinity;
    boxes.forEach((box, i) => {
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
    if (placedIndex(tileId) !== -1) {
        moveTile(el, () => returnToTray(tileId));
        return;
    }
    const empty = state.current.placed.findIndex((p) => !p);
    if (empty !== -1) moveTile(el, () => placeTile(tileId, empty));
}

// --- State transitions (pure functions over state.current) ---

function placedIndex(tileId) {
    return state.current.placed.findIndex((p) => p && p.tileId === tileId);
}

// Put tile into box `index`. Returns false when nothing changed.
function placeTile(tileId, index) {
    const { current } = state;
    const placed = [...current.placed];
    const tray = current.tray.map((t) => ({ ...t }));
    const tile = tray.find((t) => t.id === tileId);
    if (!tile) return false;

    const occupant = placed[index];
    if (occupant && occupant.tileId === tileId) return false;

    const from = placedIndex(tileId);
    if (from !== -1) placed[from] = null;

    if (occupant) {
        // Swap: the tile already in the box goes back to the tray.
        const old = tray.find((t) => t.id === occupant.tileId);
        if (old) old.used = false;
    }

    placed[index] = { letter: tile.letter, tileId };
    tile.used = true;
    setState({ current: { ...current, placed, tray, status: afterMove(current.status) } });
    return true;
}

// Returns false when the tile was not in a box.
function returnToTray(tileId) {
    const { current } = state;
    const from = placedIndex(tileId);
    if (from === -1) return false;
    const placed = [...current.placed];
    placed[from] = null;
    const tray = current.tray.map((t) => (t.id === tileId ? { ...t, used: false } : { ...t }));
    setState({ current: { ...current, placed, tray, status: afterMove(current.status) } });
    return true;
}

// Moving a tile after a wrong check reopens the word: the "try again"
// line and the error-coloured heart belong to the arrangement that was
// checked, not to the one the kid is now building.
function afterMove(status) {
    return status === 'wrong' ? 'playing' : status;
}
