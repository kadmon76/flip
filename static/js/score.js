// score.js — stars for a finished round (BACKLOG B-107). No DOM: main.js
// renders the result and a Django test runs this module through node.

// Bands for the 5-word round: 5/5 -> 3, 4/5 -> 2, 2-3/5 -> 1, 0-1/5 -> 0.
// Written against `size` so a different round length keeps the same
// shape: all right -> 3, one short -> 2, at least 40% -> 1, else 0.
export function starsFor(correct, size) {
    if (!Number.isInteger(correct) || !Number.isInteger(size) || size <= 0 || correct < 0 || correct > size) {
        throw new Error(`starsFor: bad score ${correct} / ${size}`);
    }
    if (correct === size) return 3;
    if (correct === size - 1) return 2;
    if (correct >= size * 0.4) return 1;
    return 0;
}
