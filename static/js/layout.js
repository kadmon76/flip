// layout.js — pure sizing helpers for the play screen (DESIGN.md "Layout").
// No DOM: card.js applies the results, and a Django test runs this
// through node. The numbers live here only; card.js hands them to the CSS
// as custom properties.

// Slot rail: 46px slots, 6px apart, 8px of brass around them. At most six
// slots on a row (DESIGN: "Six slots fit one row; 7+ letters wrap into two
// even rows"); a rail too narrow for six holds as many as fit.
export const SLOT = 46;
export const SLOT_GAP = 6;
export const RAIL_PAD = 8;
export const SLOTS_PER_ROW = 6;

// Letter blocks: 52px clay blocks lying on the bench under the rail, in
// loose staggered rows of at most four (DESIGN "Layout"). Rows fill four
// at a time and the last row takes the rest, centred (the v5 reference
// lays six blocks out as 4 + 2).
export const BLOCK = 52;
export const BLOCK_GAP = 16;        // between blocks on a row
export const BLOCK_ROW_GAP = 12;    // between rows
export const BLOCKS_PER_ROW = 4;
export const STAGGER = 8;           // rows shift alternately left / right of centre
export const TRAY_PAD = 4;          // room above and below for nudges and tilt

// Fixed per-position tilt (degrees, within DESIGN's ±4) and nudge (px),
// so a block's spot is the same on every render and a block always goes
// back to its own spot.
const TILT = [-3, 2, -1.5, 3.5, -2.5, 1.5, 3, -3.5, 2.5, -1];
const NUDGE_X = [0, 3, -2, 2, -3, 1, -1, 3, -2, 2];
const NUDGE_Y = [2, -2, 3, 0, -3, 2, 1, -2, 3, -1];
const NUDGE_MAX = 3;

// Slot grid for a word of `count` letters on a rail `railWidth` px wide
// (outer width, padding included): one row when it fits six or fewer,
// otherwise rows as even as possible (7 -> 4 + 3, 10 -> 5 + 5).
export function slotLayout(count, railWidth) {
    const base = { size: SLOT, gap: SLOT_GAP, pad: RAIL_PAD };
    if (count <= 0) return { ...base, cols: 1, rows: 0 };
    const inner = railWidth - 2 * RAIL_PAD;
    const fit = Math.floor((inner + SLOT_GAP) / (SLOT + SLOT_GAP));
    const perRow = Math.max(1, Math.min(SLOTS_PER_ROW, fit));
    const rows = Math.ceil(count / perRow);
    return { ...base, cols: Math.ceil(count / rows), rows };
}

// Starting spots for `count` blocks on a bench `width` px wide: top-left
// x / y in px and a tilt in degrees for each block in tray order, plus the
// height the bench area needs. Rows hold four (fewer if the bench is too
// narrow), are centred, and shift alternately left and right when there
// is more than one row.
export function blockLayout(count, width) {
    const size = BLOCK;
    if (count <= 0) return { size, spots: [], height: 0 };
    const margin = STAGGER + NUDGE_MAX + 2;   // tilt adds ~2px to each side
    const fit = Math.floor((width - 2 * margin + BLOCK_GAP) / (size + BLOCK_GAP));
    const perRow = Math.max(1, Math.min(BLOCKS_PER_ROW, fit));
    const rows = Math.ceil(count / perRow);
    const spots = [];
    for (let r = 0; r < rows; r++) {
        const n = Math.min(perRow, count - r * perRow);
        const rowWidth = n * size + (n - 1) * BLOCK_GAP;
        const shift = rows > 1 ? (r % 2 === 0 ? -STAGGER : STAGGER) : 0;
        const x0 = (width - rowWidth) / 2 + shift;
        const y0 = TRAY_PAD + r * (size + BLOCK_ROW_GAP);
        for (let c = 0; c < n; c++) {
            const i = r * perRow + c;
            const k = i % TILT.length;
            spots.push({
                x: Math.round(x0 + c * (size + BLOCK_GAP) + NUDGE_X[k]),
                y: y0 + NUDGE_Y[k],
                rot: TILT[k],
            });
        }
    }
    const height = 2 * TRAY_PAD + rows * size + (rows - 1) * BLOCK_ROW_GAP;
    return { size, spots, height };
}
