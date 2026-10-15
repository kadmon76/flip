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
// loose staggered rows of at most four (DESIGN "Layout"; the one
// exception is hard's 12-block bench in a play column narrower than 462px,
// that is on every phone, whose first row holds five, BACKLOG B-207,
// below; the 480px column lays it out 4 + 4 + 4). Rows fill four at a
// time and the last row takes the rest, centred (the v5 reference lays
// six blocks out as 4 + 2).
export const BLOCK = 52;
export const BLOCK_GAP = 16;        // between blocks on a row
export const BLOCK_ROW_GAP = 10;    // between rows
export const BLOCKS_PER_ROW = 4;
export const STAGGER = 8;           // rows shift alternately left / right of centre
export const TRAY_PAD = 4;          // room above and below for nudges and tilt

// The robot (CHARACTER.md) stands behind the console's left third with
// his head and shoulders showing above it. At 360x740 only a word with a
// third row of blocks (9-10 letters) reaches down beside him, so rows from
// the third on are centred in the part of the bench right of ROBOT_ZONE
// (a fraction of the bench width; his head ends at about 36%). No block
// of such a row starts left of ROBOT_REACH: his widest pose (excited, a
// hand out) reaches about 42% of the bench at that height.
export const ROBOT_ZONE = 0.4;
export const ROBOT_REACH = 0.44;

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

// Hard puts two extra letters on the bench (BACKLOG B-207), so a
// 10-letter word has 12 blocks. The bench has room for three rows under a
// two-row rail at 360x740 (BACKLOG B-114), and only the first two rows
// lie above the robot, so: a row beside the robot holds what fits between
// his reach and the bench's edge (three in a column narrower than 462px,
// from ROBOT_REACH, its gaps narrowed, never under MIN_BLOCK_GAP), and
// blocks that would need a fourth row go on the first row, under the
// rail, which then holds more than four (five for 12 blocks in those
// columns, every phone's: centred, unshifted, its gaps narrowed to fit the
// bench; the 480px column holds four beside him and needs none of this).
export const MIN_BLOCK_GAP = 10;
export const BENCH_ROWS = 3;

// How many blocks of `size` fit in `span` px with `gap` between them.
function hold(span, size, gap) {
    return Math.floor((span + gap) / (size + gap));
}

// The gap that lays `n` blocks out in `span` px: BLOCK_GAP, or less when
// they would not fit with it.
function gapFor(n, span, size) {
    if (n < 2) return BLOCK_GAP;
    return Math.min(BLOCK_GAP, Math.floor((span - n * size) / (n - 1)));
}

// Starting spots for `count` blocks on a bench `width` px wide: top-left
// x / y in px and a tilt in degrees for each block in tray order, plus the
// height the bench area needs. Rows hold four (fewer if the bench is too
// narrow), are centred, and shift alternately left and right when there
// is more than one row. Rows from the third on are centred right of the
// robot's zone, so they stay clear of his head; one that would then start
// left of his reach runs from there to the bench's edge instead, and they
// hold what fits there. When that would take more than BENCH_ROWS rows,
// the first row takes the rest as far as the bench is wide (see above).
// A block's tilt and nudge come from its place (row times the row size,
// plus its column), so a layout with a longer first row keeps the other
// rows' spots.
export function blockLayout(count, width) {
    const size = BLOCK;
    if (count <= 0) return { size, spots: [], height: 0 };
    const edge = NUDGE_MAX + 2;               // tilt adds ~2px to each side
    const margin = STAGGER + edge;
    const zoneLeft = width * ROBOT_ZONE;
    const reach = width * ROBOT_REACH;
    const fullSpan = width - 2 * margin;
    const sideSpan = width - edge - reach;    // beside the robot, unshifted
    const perRow = Math.max(1, Math.min(BLOCKS_PER_ROW, hold(fullSpan, size, BLOCK_GAP)));
    const side = Math.max(1, Math.min(perRow, hold(sideSpan, size, MIN_BLOCK_GAP)));
    const counts = [];
    for (let left = count; left > 0;) {
        const n = Math.min(counts.length < 2 ? perRow : side, left);
        counts.push(n);
        left -= n;
    }
    if (counts.length > BENCH_ROWS) {
        let extra = Math.min(
            hold(width - 2 * edge, size, MIN_BLOCK_GAP) - counts[0],
            counts.slice(BENCH_ROWS).reduce((a, b) => a + b, 0),
        );
        if (extra > 0) {
            counts[0] += extra;
            for (let r = counts.length - 1; extra > 0; r--) {
                const take = Math.min(extra, counts[r]);
                counts[r] -= take;
                extra -= take;
            }
            while (counts[counts.length - 1] === 0) counts.pop();
        }
    }
    const rows = counts.length;
    const spots = [];
    const across = (n, gap) => n * size + (n - 1) * gap;
    counts.forEach((n, r) => {
        let gap = BLOCK_GAP;
        let x0;
        if (n > perRow) {
            // the first row with the blocks of a fourth: centred, unshifted
            gap = gapFor(n, width - 2 * edge, size);
            x0 = (width - across(n, gap)) / 2;
        } else if (r >= 2 && (zoneLeft + width - margin - across(n, gap)) / 2 >= reach) {
            x0 = (zoneLeft + width - margin - across(n, gap)) / 2;
        } else if (r >= 2 && across(n, gapFor(n, sideSpan, size)) <= sideSpan) {
            // beside the robot, but too long to centre there
            gap = gapFor(n, sideSpan, size);
            x0 = reach + (sideSpan - across(n, gap)) / 2;
        } else {
            x0 = (width - across(n, gap)) / 2 + (rows > 1 ? (r % 2 === 0 ? -STAGGER : STAGGER) : 0);
        }
        const y0 = TRAY_PAD + r * (size + BLOCK_ROW_GAP);
        for (let c = 0; c < n; c++) {
            const k = (r * perRow + c) % TILT.length;
            spots.push({
                x: Math.round(x0 + c * (size + gap) + NUDGE_X[k]),
                y: y0 + NUDGE_Y[k],
                rot: TILT[k],
            });
        }
    });
    const height = 2 * TRAY_PAD + rows * size + (rows - 1) * BLOCK_ROW_GAP;
    return { size, spots, height };
}
