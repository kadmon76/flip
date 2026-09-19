// layout.js — pure sizing helpers for the play screen. No DOM: card.js
// applies the result, and a Django test runs this through node.

export const TILE = 48;        // DESIGN "Type": tiles and boxes at least 48px
export const BOX_MIN = 40;     // boxes may shrink to this for 8+ letter words
export const SHRINK_FROM = 8;

// Box size and column count for a word of `count` letters in a row
// `width` px wide with `gap` px between boxes:
//   - one row of 48px boxes when that fits;
//   - 8+ letter words shrink toward 40px to stay on one row;
//   - otherwise the boxes stay 48px and wrap into rows as even as
//     possible (7 letters at 360px -> 4 + 3, 10 -> 5 + 5).
export function boxLayout(count, width, gap) {
    if (count <= 0) return { size: TILE, cols: 1 };
    const fit = (width - (count - 1) * gap) / count;
    if (fit >= TILE) return { size: TILE, cols: count };
    if (count >= SHRINK_FROM && fit >= BOX_MIN) return { size: Math.floor(fit), cols: count };
    const perRow = Math.max(1, Math.floor((width + gap) / (TILE + gap)));
    const rows = Math.ceil(count / perRow);
    return { size: TILE, cols: Math.ceil(count / rows) };
}
