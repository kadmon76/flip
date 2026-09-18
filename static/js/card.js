// card.js — renders the card image, hearts, letter boxes and letter tray
// from state. Tile elements are keyed by tile id and kept alive across
// renders: they are moved between tray and boxes, never recreated, so a
// re-render can't destroy a tile that is mid-drag.

import { makeDraggable, destroyDraggable, setDragEnabled } from './drag.js';

const $ = (id) => document.getElementById(id);

// DOM cache keyed by tile id. This mirrors state.current.tray; it is not
// game state and is rebuilt from state on every render.
const tiles = new Map();

export function renderCard(state) {
    if (state.screen !== 'play' || !state.current.word) {
        if (!state.current.word) removeStaleTiles([]);
        return;
    }
    const { current, lives } = state;

    renderImage(current);
    renderHearts(lives);
    renderBoxes(current.placed.length);

    removeStaleTiles(current.tray);
    current.tray.forEach((t) => {
        if (!tiles.has(t.id)) tiles.set(t.id, createTile(t));
    });

    // Placed tiles live inside their box…
    const boxes = $('letter-boxes').children;
    current.placed.forEach((slot, i) => {
        boxes[i].classList.toggle('filled', !!slot);
        if (slot) mount(tiles.get(slot.tileId), boxes[i], 0);
    });

    // …unused tiles live in the tray, in tray order.
    const tray = $('letter-tray');
    let pos = 0;
    current.tray.forEach((t) => {
        if (!t.used) mount(tiles.get(t.id), tray, pos++);
    });

    setDragEnabled(current.status === 'playing' || current.status === 'wrong');
}

function renderImage(current) {
    const img = $('play-image');
    if (img.getAttribute('src') !== current.image) img.src = current.image;
    img.alt = 'Guess the word image';
}

function renderHearts(lives) {
    document.querySelectorAll('.hearts span').forEach((heart, i) => {
        heart.classList.toggle('lost', i >= lives);
    });
}

function renderBoxes(count) {
    const container = $('letter-boxes');
    if (container.children.length === count) return;
    // Lets the CSS shrink boxes for words too long to fit one row.
    container.style.setProperty('--letter-count', count);
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        container.appendChild(box);
    }
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

// Put `el` at child position `index` of `parent`; reset the drag transform
// whenever it actually moves.
function mount(el, parent, index) {
    const ref = parent.children[index] || null;
    if (el.parentNode === parent && ref === el) return;
    parent.insertBefore(el, ref);
    gsap.set(el, { x: 0, y: 0 });
}
