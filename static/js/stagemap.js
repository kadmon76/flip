// stagemap.js — the stage screen (#screen-stages, BACKLOG B-217,
// PROGRESSION.md "Replay"): a tapped theme card opens it. The theme's
// picture at the top, then one station per stage the theme's data has
// words in, climbing from stage 1 at the bottom (game.css). The interim
// look (DESIGN "Other screens (interim)"; a design pass will replace it,
// and all of it is this render and game.css's "Stage screen" rules): a
// cream panel button holding the stage number as a split-flap digit
// (flaps.js), or for `long` a small brass joint between two chunks (the
// rail joint of a word in two rows, BACKLOG B-213), and one bulb.
// Cleared: the bulb lit, tappable. The current stage: the bulb pulsing
// amber, the button raised and glowing, tappable, the obvious start.
// Not open yet: the bulb dark, the button dimmed and disabled. With every
// stage cleared all bulbs are lit and the last station also gets the
// raised glow. No text: the stage is only in aria-label.
//
// Renders from state.theme (the theme whose map shows), state.themes (its
// picture and `stages`) and state.progress (its cleared stages, through
// progress.js stations); it never mutates state and keeps no module
// state. A tap on an open station calls `onPick(stage)` (main.js
// onStation, which starts the round).

import { stations } from './progress.js';
import { renderFlaps } from './flaps.js';

const $ = (id) => document.getElementById(id);

// A station button for `stage`, its mark inside: the stage number as one
// split-flap digit, or for `long` two chunks (dark slot holes) with the
// brass joint between them. Its state (classes, bulb, disabled, label,
// tap) is set by renderStageMap on every render.
function station(stage) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.stage = String(stage);
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    if (stage === 'long') {
        mark.className = 'station-mark station-long';
        for (const part of ['chunk', 'rail-joint', 'chunk']) {
            const el = document.createElement('span');
            el.className = part;
            mark.appendChild(el);
        }
    } else {
        mark.className = 'station-mark flaps';
        renderFlaps(mark, String(stage));
        mark.removeAttribute('aria-label');
    }
    btn.appendChild(mark);
    const bulb = document.createElement('span');
    bulb.className = 'bulb';
    btn.appendChild(bulb);
    return btn;
}

// What a station says to a screen reader (never shown).
function label({ stage, cleared, open }) {
    if (cleared) return `stage ${stage}: cleared`;
    return open ? `stage ${stage}: play` : `stage ${stage}: not open yet`;
}

export function renderStageMap(state, onPick) {
    if (state.screen !== 'stages') return;
    const theme = state.themes.find((t) => t.name === state.theme);
    if (!theme) return;

    const pic = $('stages-pic');
    pic.setAttribute('aria-label', theme.name);
    const img = $('stages-picture');
    if (img.getAttribute('src') !== (theme.image || '')) img.setAttribute('src', theme.image || '');

    const list = stations(theme.stages, (state.progress || {})[theme.name]);
    // DOM cache: the station buttons. They are rebuilt only when the
    // stages differ from the ones they show, and otherwise updated in
    // place, so a re-render (a mute tap) never restarts the current
    // bulb's pulse. Nothing reads them to decide what a tap does: that
    // comes from `list`, on every render.
    const el = $('stage-stations');
    const same = el.children.length === list.length
        && list.every((s, i) => el.children[i].dataset.stage === String(s.stage));
    if (!same) {
        el.innerHTML = '';
        list.forEach((s) => el.appendChild(station(s.stage)));
    }
    list.forEach((s, i) => {
        const btn = el.children[i];
        const current = s.start && !s.cleared;
        btn.className = ['station', 'panel',
            s.cleared ? 'is-cleared' : '', current ? 'is-current' : '',
            s.start ? 'is-start' : '', s.open ? '' : 'is-closed'].filter(Boolean).join(' ');
        btn.disabled = !s.open;
        btn.setAttribute('aria-label', label(s));
        btn.onclick = s.open ? () => onPick(s.stage) : null;
        btn.lastElementChild.className = s.cleared || current ? 'bulb' : 'bulb off';
    });
    el.setAttribute('aria-label', `stages cleared: ${list.filter((s) => s.cleared).length} / ${list.length}`);
}
