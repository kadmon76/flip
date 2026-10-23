// card.js — renders the play screen from state: the picture on the TV
// screen, the lives bulbs and split-flap counter on the brass plate, the
// slots on the rail (#letter-boxes) and the letter blocks on the bench
// (#letter-tray). Tile elements are keyed by tile id and kept alive
// across renders: they are moved between their bench spot and the slots,
// never recreated, so a re-render can't destroy a tile that is mid-drag.

import { makeDraggable, destroyDraggable, setDragEnabled, isLocked } from './drag.js';
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
    renderBoxes(current.placed.length, current.break);
    // The given letter's block (easy, BACKLOG B-204; round.js makeWord)
    // starts in its slot and has no spot on the bench.
    const bench = current.tray.filter((t) => !t.given);
    const spots = renderSpots(bench.length);

    removeStaleTiles(current.tray);
    // A block the clean-up boost took away (`gone`, BACKLOG B-219, boost.js
    // cleanUp) keeps its element until the word ends, hidden where it was
    // (class `gone`, game.css: out of the layout, no taps) and never moved
    // or dragged again; feedback.js puffs it away.
    const gone = new Set();
    current.tray.forEach((t) => {
        if (!tiles.has(t.id)) tiles.set(t.id, createTile(t));
        tiles.get(t.id).classList.toggle('gone', !!t.gone);
        if (t.gone) gone.add(t.id);
    });

    // Placed tiles live inside their box, upright; a locked one (class
    // `locked`: the riveted brass look in game.css, BACKLOG B-211) cannot
    // be moved…
    const boxes = $('letter-boxes').children;
    const locked = new Set();
    current.placed.forEach((slot, i) => {
        boxes[i].classList.toggle('filled', !!slot);
        boxes[i].classList.toggle('locked', isLocked(slot));
        if (isLocked(slot)) locked.add(slot.tileId);
        if (slot) mount(tiles.get(slot.tileId), boxes[i], 0);
    });

    // …unused tiles lie on the bench, each in its own spot (tray order),
    // tilted as the layout says. A used tile leaves its spot empty, so the
    // other blocks never shuffle and a returned block lands where it was;
    // so does a gone one.
    const spotEls = $('letter-tray').children;
    bench.forEach((t, i) => {
        if (!t.used && !t.gone) mount(tiles.get(t.id), spotEls[i], spots[i].rot);
    });

    setDragEnabled(current.status === 'playing' || current.status === 'wrong', new Set([...locked, ...gone]));
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

// The slots on the rail (layout.js slotLayout; BACKLOG B-213): their
// size, the letter's size in them, how far a placed letter's tap area
// reaches past its slot (game.css, from --hit-x / --hit-y), each slot's
// place in the rail's grid (two grid columns per slot of the longest
// row, so every row is centred) and the brass joint of a word in two
// rows. Sizes depend on the rail width, so this runs on every render
// (main.js also re-renders on resize); the slots themselves are rebuilt
// only when the letter count changes.
function renderBoxes(count, brk) {
    const container = $('letter-boxes');
    const { size, gap, pad, font, hit, cols, cells, joints } = slotLayout(count, container.clientWidth, brk);
    container.style.setProperty('--slot-size', `${size}px`);
    container.style.setProperty('--slot-gap', `${gap}px`);
    container.style.setProperty('--rail-pad', `${pad}px`);
    container.style.setProperty('--slot-font', `${font}px`);
    container.style.setProperty('--hit-x', `${hit.x}px`);
    container.style.setProperty('--hit-y', `${hit.y}px`);
    container.style.setProperty('--cols', 2 * cols);
    if (container.children.length !== count) {
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const box = document.createElement('div');
            box.className = 'letter-box';
            container.appendChild(box);
        }
    }
    cells.forEach(({ row, col }, i) => {
        const box = container.children[i];
        box.style.gridRow = String(row);
        box.style.gridColumn = `${col} / span 2`;
        renderJoint(box, joints.filter((j) => j.at === i).map((j) => j.side));
    });
}

// The brass joint of a word in two rows (BACKLOG B-213): one half at the
// end of the first row, one at the start of the second, showing it is one
// word in two chunks. Each half is a `.rail-joint` span with class `end`
// or `start` inside its slot, after the letter block (feedback.js reads
// a filled slot's block as its first child); its look is game.css
// `.rail-joint`, provisional and kept in that one rule set so it can be
// restyled or replaced. `sides` are the halves slot `box` has; the spans
// are a DOM cache, added and removed to match on every render.
function renderJoint(box, sides) {
    box.querySelectorAll('.rail-joint').forEach((el) => {
        if (!sides.includes(el.dataset.side)) el.remove();
    });
    sides.forEach((side) => {
        if (box.querySelector(`.rail-joint[data-side="${side}"]`)) return;
        const el = document.createElement('span');
        el.className = `rail-joint ${side}`;
        el.dataset.side = side;
        el.setAttribute('aria-hidden', 'true');
        box.appendChild(el);
    });
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

// Put `el` as the first child of `parent` (a slot or a bench spot), tilted
// by `rot` degrees; reset the drag transform whenever it actually moves.
// GSAP owns the tile's transform, so the tilt goes through it as well.
function mount(el, parent, rot = 0) {
    if (el.parentNode === parent) return;
    parent.insertBefore(el, parent.firstChild);
    gsap.set(el, { x: 0, y: 0, rotation: rot });
}
