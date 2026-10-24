// locks.js — what theme keys look like (human, 2026-10-24; keys.js holds
// the rules): on the theme screen a locked theme's card (its picture
// dimmed, a brass padlock over it), the locked cards glowing while the
// kid holds a key (a tap opens one, main.js onTheme), and the key holder
// at the top right (a brass key and the keys held as a split-flap digit,
// shown only while a key can open something); on the round-end screen
// the key a round earned (#round-key, popped in by celebrate.js). The
// key and the padlock are drawn in code (inline SVG, game.css "Theme
// keys"), interim scene objects like the gear counter's cog (DESIGN
// "The layer model", its exception for theme keys) until the Claude
// Design pass. No English: a key, a lock, a glow and a number.
//
// renderLocks is a subscriber after the theme cards' render; it renders
// from state on every render and never mutates state. Its only cache is
// in the DOM: the key icon made once in each host.

import { keysView } from './keys.js';
import { renderFlaps } from './flaps.js';

const $ = (id) => document.getElementById(id);

// A key pointing right in a 24x24 box: the bow (a ring) at the left, the
// shaft, two teeth down. Drawn three times as the cog is (a dark rim at
// the lower right, a light one at the upper left, the brass face), then
// the bow's hole.
const KEY_SHAPES = '<circle cx="6.5" cy="12" r="5"/>'
    + '<rect x="10.5" y="10.6" width="12" height="2.8" rx="0.8"/>'
    + '<rect x="17.4" y="12.5" width="2" height="4.2" rx="0.5"/>'
    + '<rect x="20.4" y="12.5" width="2.1" height="3.2" rx="0.5"/>';

export function keyIcon() {
    const el = document.createElement('span');
    el.className = 'key-icon';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24">'
        + `<g class="key-lo" transform="translate(0.6 0.8)">${KEY_SHAPES}</g>`
        + `<g class="key-hi" transform="translate(-0.4 -0.5)">${KEY_SHAPES}</g>`
        + `<g class="key-face">${KEY_SHAPES}</g>`
        + '<circle class="key-hole" cx="6.2" cy="11.8" r="2"/>'
        + '</svg>';
    return el;
}

// A padlock in a 24x24 box: the shackle, the brass body lit from the
// upper left, the keyhole.
export function padlock() {
    const el = document.createElement('span');
    el.className = 'padlock';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24">'
        + '<path class="lock-shackle" d="M7.6 11.5V8a4.4 4.4 0 0 1 8.8 0v3.5"/>'
        + '<rect class="key-lo" x="5.1" y="11.3" width="15" height="10.6" rx="2.2"/>'
        + '<rect class="key-hi" x="4.1" y="10.2" width="15" height="10.6" rx="2.2"/>'
        + '<rect class="key-face" x="4.5" y="10.6" width="15" height="10.6" rx="2.2"/>'
        + '<circle class="key-hole" cx="12" cy="15" r="1.7"/>'
        + '<rect class="key-hole" x="11.25" y="15.6" width="1.5" height="3.4" rx="0.6"/>'
        + '</svg>';
    return el;
}

// The key holder's or the round end's icon, made once (its first child).
function withKey(host) {
    if (!host.firstElementChild) host.appendChild(keyIcon());
}

export function renderLocks(state) {
    if (state.screen === 'theme') {
        const names = (state.themes || []).map((t) => t.name);
        const view = keysView(names, state.keys, state.progress);
        document.querySelectorAll('#theme-buttons .theme-btn').forEach((card) => {
            const locked = view.locked.includes(card.dataset.theme);
            card.classList.toggle('is-locked', locked);
            card.classList.toggle('can-open', locked && view.canOpen);
            card.setAttribute('aria-label', locked ? `${card.dataset.theme}: locked` : card.dataset.theme);
        });
        const holder = $('theme-keys');
        holder.hidden = !view.canOpen;
        if (view.canOpen) {
            withKey(holder);
            if (!holder.querySelector('.flaps')) {
                const count = document.createElement('span');
                count.className = 'flaps count';
                count.setAttribute('aria-hidden', 'true');
                holder.appendChild(count);
            }
            const text = String(view.held);
            const count = holder.querySelector('.flaps');
            if (count.getAttribute('aria-label') !== text) renderFlaps(count, text);
            holder.setAttribute('aria-label', `keys: ${text}`);
        }
    } else if (state.screen === 'round-end') {
        const host = $('round-key');
        host.hidden = !state.round.keyEarned;
        if (state.round.keyEarned) withKey(host);
    }
}
