// drag.js — GSAP Draggable for letter tiles.
// Reads the tile id from the element, hit-tests against the letter boxes,
// and calls setState. Rendering the result is card.js's job.

import { state, setState } from './state.js';

const draggables = new Map();   // tile element -> Draggable instance
let enabled = true;

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
        },
        // onRelease fires before onDragEnd and also after a plain tap.
        onRelease() {
            this.target.classList.remove('gsap-dragging');
            document.body.classList.remove('dragging-active');
        },
        onDragEnd() {
            dropTile(this.target);
        },
        // Press + release without movement: a tap.
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

// --- Drop handling ---

function dropTile(el) {
    const tileId = el.dataset.tileId;
    const boxes = Array.from(document.querySelectorAll('#letter-boxes .letter-box'));
    const boxIndex = boxes.findIndex((box) => Draggable.hitTest(el, box, '50%'));

    if (boxIndex !== -1 && placeTile(tileId, boxIndex)) {
        gsap.set(el, { x: 0, y: 0 });
        return;
    }

    // A placed tile dragged back over the tray returns to the tray.
    const tray = document.getElementById('letter-tray');
    if (boxIndex === -1 && placedIndex(tileId) !== -1 && Draggable.hitTest(el, tray, '30%')) {
        returnToTray(tileId);
        gsap.set(el, { x: 0, y: 0 });
        return;
    }

    // Dropped anywhere else: animate back to where it came from.
    gsap.to(el, { x: 0, y: 0, duration: 0.3, ease: 'back.out(1.4)' });
}

function tapTile(el) {
    const tileId = el.dataset.tileId;
    if (placedIndex(tileId) !== -1) returnToTray(tileId);
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
    setState({ current: { ...current, placed, tray } });
    return true;
}

function returnToTray(tileId) {
    const { current } = state;
    const from = placedIndex(tileId);
    if (from === -1) return;
    const placed = [...current.placed];
    placed[from] = null;
    const tray = current.tray.map((t) => (t.id === tileId ? { ...t, used: false } : { ...t }));
    setState({ current: { ...current, placed, tray } });
}
