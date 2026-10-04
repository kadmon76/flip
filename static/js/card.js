// card.js — renders the play screen from state: the picture on the TV
// screen, the lives bulbs and split-flap counter on the brass plate, the
// slots on the rail (#letter-boxes) and the letter blocks on the bench
// (#letter-tray). Tile elements are keyed by tile id and kept alive
// across renders: they are moved between their bench spot and the slots,
// never recreated, so a re-render can't destroy a tile that is mid-drag.

import { makeDraggable, destroyDraggable, setDragEnabled } from './drag.js';
import { slotLayout, blockLayout } from './layout.js';

const $ = (id) => document.getElementById(id);

// DOM cache keyed by tile id. This mirrors state.current.tray; it is not
// game state and is rebuilt from state on every render.
const tiles = new Map();

export function renderCard(state) {
    if (state.screen !== 'play' || !state.current.word) {
        if (!state.current.word) removeStaleTiles([]);
        return;
    }
    const { current, lives, round } = state;

    renderImage(current);
    renderHearts(lives);
    renderCounter(round);
    renderBoxes(current.placed.length);
    const spots = renderSpots(current.tray.length);

    removeStaleTiles(current.tray);
    current.tray.forEach((t) => {
        if (!tiles.has(t.id)) tiles.set(t.id, createTile(t));
    });

    // Placed tiles live inside their box, upright…
    const boxes = $('letter-boxes').children;
    current.placed.forEach((slot, i) => {
        boxes[i].classList.toggle('filled', !!slot);
        if (slot) mount(tiles.get(slot.tileId), boxes[i], 0);
    });

    // …unused tiles lie on the bench, each in its own spot (tray order),
    // tilted as the layout says. A used tile leaves its spot empty, so the
    // other blocks never shuffle and a returned block lands where it was.
    const spotEls = $('letter-tray').children;
    current.tray.forEach((t, i) => {
        if (!t.used) mount(tiles.get(t.id), spotEls[i], spots[i].rot);
    });

    setDragEnabled(current.status === 'playing' || current.status === 'wrong');
}

// No alt text: it would be English on screen if the picture failed to
// load (DESIGN "Words on screen"), and the picture is the question itself.
function renderImage(current) {
    const img = $('play-image');
    if (img.getAttribute('src') !== current.image) img.src = current.image;
    img.alt = '';
}

function renderHearts(lives) {
    document.querySelectorAll('.hearts span').forEach((heart, i) => {
        heart.classList.toggle('lost', i >= lives);
    });
}

// Split-flap counter "2 / 5": one flap per character ("2", "/", "5").
// The flaps are rebuilt only when the text changes.
function renderCounter(round) {
    const el = $('word-counter');
    const text = `${round.index + 1}/${round.size}`;
    el.setAttribute('aria-label', `${round.index + 1} / ${round.size}`);
    if (el.textContent === text) return;
    el.innerHTML = '';
    for (const ch of text) {
        const flap = document.createElement('span');
        flap.className = ch === '/' ? 'flap flap-slash' : 'flap';
        flap.textContent = ch;
        el.appendChild(flap);
    }
}

function renderBoxes(count) {
    const container = $('letter-boxes');
    // Columns depend on the rail width, so this runs on every render
    // (main.js also re-renders on resize); the slots themselves are
    // rebuilt only when the letter count changes.
    const { size, gap, pad, cols } = slotLayout(count, container.clientWidth);
    container.style.setProperty('--slot-size', `${size}px`);
    container.style.setProperty('--slot-gap', `${gap}px`);
    container.style.setProperty('--rail-pad', `${pad}px`);
    container.style.setProperty('--cols', cols);
    if (container.children.length === count) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        container.appendChild(box);
    }
}

// One empty spot per tray tile on the bench, positioned from layout.js.
// The spots are a DOM cache: rebuilt when the tile count changes and
// repositioned on every render (the bench width can change on resize).
// Returns the layout so the caller can tilt each block.
function renderSpots(count) {
    const tray = $('letter-tray');
    const { size, spots, height } = blockLayout(count, tray.clientWidth);
    tray.style.setProperty('--block-size', `${size}px`);
    tray.style.height = `${height}px`;
    if (tray.children.length !== count) {
        // Old tiles still in a spot are re-mounted (or removed) below.
        tray.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const spot = document.createElement('div');
            spot.className = 'block-spot';
            tray.appendChild(spot);
        }
    }
    spots.forEach((s, i) => {
        tray.children[i].style.left = `${s.x}px`;
        tray.children[i].style.top = `${s.y}px`;
    });
    return spots;
}

function createTile(t) {
    const el = document.createElement('div');
    el.className = 'draggable-letter';
    el.textContent = t.letter;
    el.dataset.tileId = t.id;
    makeDraggable(el);
    return el;
}

function removeStaleTiles(tray) {
    const live = new Set(tray.map((t) => t.id));
    for (const [id, el] of tiles) {
        if (live.has(id)) continue;
        destroyDraggable(el);
        el.remove();
        tiles.delete(id);
    }
}

// Put `el` as the only child of `parent` (a slot or a bench spot), tilted
// by `rot` degrees; reset the drag transform whenever it actually moves.
// GSAP owns the tile's transform, so the tilt goes through it as well.
function mount(el, parent, rot = 0) {
    if (el.parentNode === parent) return;
    parent.insertBefore(el, parent.firstChild);
    gsap.set(el, { x: 0, y: 0, rotation: rot });
}
