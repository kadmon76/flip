// flaps.js — writes a number like "4 / 5" into `el` as split-flap
// characters (DESIGN "Type": Courier Prime Bold, cream on charcoal flaps;
// styles are game.css's .flap). One flap per character, spaces dropped,
// the slash on a narrower flap; the full text goes on aria-label. Used by
// the round-end score (main.js) and the sticker book counts (gallery.js).
// No state; the element is rebuilt on every call.

export function renderFlaps(el, text) {
    el.setAttribute('aria-label', text);
    el.innerHTML = '';
    for (const ch of text.replace(/\s+/g, '')) {
        const flap = document.createElement('span');
        flap.className = ch === '/' ? 'flap flap-slash' : 'flap';
        flap.textContent = ch;
        el.appendChild(flap);
    }
}
