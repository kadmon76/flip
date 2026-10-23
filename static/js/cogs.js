// cogs.js — the gear counter (BACKLOG B-218, PROGRESSION.md "Gears"): a
// brass cog drawn in code (inline SVG, game.css "Gear counter") with a
// count in split-flap digits (flaps.js). Interim look, a new scene object
// drawn in code (DESIGN "The layer model", its exception for the cog
// counter) until the Claude Design pass replaces it; all of it is this
// module and game.css's "Gear counter" rules.
// Three places, each a host element in the template that this render
// fills (the cog once, then the count):
//   - #theme-gears, in the header, shown on the theme screen only: the
//     kid's gears (state.gears);
//   - #console-gears, on the play screen's console between the speaker
//     and the dome (the face of the boost button B-219 builds; not
//     tappable yet): the kid's gears;
//   - #round-gears, on the round-end screen: the round's gears as "+N"
//     (gears.js roundGears over state.round.results).
// It renders from state on every render and never mutates state.
// celebrate.js flies small cogs (cog()) from the TV to the console's
// counter on a correct word and, as they land, flips its count up
// (showCount), holding the count from before the word until then.

import { renderFlaps } from './flaps.js';
import { roundGears } from './gears.js';

const $ = (id) => document.getElementById(id);

// An 8-tooth cog in a 24x24 box, centred at (12, 12): teeth out to 11,
// the rim between them at 8.3.
const COG = 'M9.85 3.98L10.28 1.14A11 11 0 0 1 13.72 1.14L14.15 3.98A8.3 8.3 0 0 1 16.15 4.81L18.47 3.10'
    + 'A11 11 0 0 1 20.90 5.53L19.19 7.85A8.3 8.3 0 0 1 20.02 9.85L22.86 10.28A11 11 0 0 1 22.86 13.72'
    + 'L20.02 14.15A8.3 8.3 0 0 1 19.19 16.15L20.90 18.47A11 11 0 0 1 18.47 20.90L16.15 19.19'
    + 'A8.3 8.3 0 0 1 14.15 20.02L13.72 22.86A11 11 0 0 1 10.28 22.86L9.85 20.02A8.3 8.3 0 0 1 7.85 19.19'
    + 'L5.53 20.90A11 11 0 0 1 3.10 18.47L4.81 16.15A8.3 8.3 0 0 1 3.98 14.15L1.14 13.72'
    + 'A11 11 0 0 1 1.14 10.28L3.98 9.85A8.3 8.3 0 0 1 4.81 7.85L3.10 5.53A11 11 0 0 1 5.53 3.10'
    + 'L7.85 4.81A8.3 8.3 0 0 1 9.85 3.98Z';

// A brass cog lit from the upper left (DESIGN "Assets": every sprite is):
// the outline three times, a light rim showing at its upper left, a dark
// one at its lower right and the brass face over both, then a raised hub
// with its axle hole. Flat fills from game.css (no gradient ids, so any
// number of cogs can be on the page). A new element each call.
export function cog() {
    const el = document.createElement('span');
    el.className = 'cog';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24">'
        + `<path class="cog-lo" transform="translate(0.7 0.9)" d="${COG}"/>`
        + `<path class="cog-hi" transform="translate(-0.5 -0.6)" d="${COG}"/>`
        + `<path class="cog-face" d="${COG}"/>`
        + '<circle class="cog-hub" cx="12" cy="12" r="4.6"/>'
        + '<circle class="cog-hole" cx="12.2" cy="12.3" r="1.9"/>'
        + '</svg>';
    return el;
}

// The count's text: the kid's gears as a whole number, 0 or more.
export function countText(gears) {
    return String(Number.isSafeInteger(gears) && gears >= 0 ? gears : 0);
}

// Write `text` ("12", or "+4" on the round end) into a counter host: the
// cog (made once, the host's first child), a "+" in ink when the text
// has one (its second child, empty and hidden otherwise; on a flap the
// hinge line would cross it), and the digits as split-flaps (its last
// child, rebuilt by flaps.js); --digits tells game.css how many flaps
// share the counter's width. The whole text also goes on the host's
// aria-label (never shown).
export function showCount(host, text) {
    if (!host.firstElementChild) {
        host.appendChild(cog());
        const sign = document.createElement('span');
        sign.className = 'sign';
        sign.setAttribute('aria-hidden', 'true');
        host.appendChild(sign);
        const count = document.createElement('span');
        count.className = 'flaps count';
        count.setAttribute('aria-hidden', 'true');
        host.appendChild(count);
    }
    const sign = text.startsWith('+') ? '+' : '';
    const digits = text.slice(sign.length);
    host.children[1].textContent = sign;
    renderFlaps(host.lastElementChild, digits);
    host.style.setProperty('--digits', String(digits.length));
    host.setAttribute('aria-label', `gears: ${text}`);
}

// DOM cache: the text each counter host was last rendered with here (not
// what celebrate.js shows for a moment while cogs fly), so a re-render
// writes a counter only when its count in state changed and never undoes
// a count celebrate.js is holding. Rebuilt from state; nothing reads it
// to decide anything else.
const rendered = new Map();

export function renderGears(state) {
    const show = (id, text) => {
        const host = $(id);
        if (!host || rendered.get(host) === text) return;
        rendered.set(host, text);
        showCount(host, text);
    };
    if (state.screen === 'theme') show('theme-gears', countText(state.gears));
    else if (state.screen === 'play') show('console-gears', countText(state.gears));
    else if (state.screen === 'round-end') show('round-gears', `+${roundGears(state.round.results)}`);
}
