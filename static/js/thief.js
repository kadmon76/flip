// thief.js — the thief bot and the stolen part, drawn in code (BACKLOG
// B-232; inline SVG, lit from the upper left, like locks.js's key and
// padlock and cogs.js's cog): new scene objects of the boss screen until a
// clay version comes as content (DESIGN "The layer model", its exception
// for the boss). No state and no DOM of its own: each call makes a new
// element; bossview.js, stagemap.js and main.js place them, game.css
// colours them from the palette (classes, no inline colours) and poses
// them (the thief's pose is a class on his element: bossview.js and
// bossfx.js set it).
//
// The thief: a wind-up tin robot that belongs in the lab, facing right
// (toward the vent): a red tin can of a body with brass rivets and a
// seam, one big lens eye (a brass rim, dark glass, an amber iris whose
// pupil looks where he looks: `.t-pupil`), a brass grille mouth, an
// antenna with a lamp on top, a wind-up key on his back (`.t-key`, it
// turns), thin tiptoeing legs (`.t-leg-l`, `.t-leg-r`), a claw holding the
// stolen part in front (`.t-claw`), an arm that points (`.t-point`, shown
// in the `point` pose), a spring that pops out of his head (`.t-spring`,
// `hit`), a squinting eye (`.t-squint`, `laugh`) and a spinning one
// (`.t-dizzy`, `hit`). His poses (game.css "Boss"): sneak (walking), laugh
// (eye squints, body shakes, key spins fast), hit (eye spins, the spring
// pops, a smoke puff), swap (the claw grabs), point, escape, burst.

// The stolen part, a plain brass horn in a 40x40 box (a later item makes
// the machine it goes into): its tube, its flared bell lit from the upper
// left, the bell's mouth.
const PART = '<path class="p-tube" d="M6 35 L19 22"/>'
    + '<path class="p-bell-lo" transform="translate(0.8 1)" d="M15 25 C21 19 27 11 35 4 C39 12 37 23 29 29 C23 31 19 30 15 25 Z"/>'
    + '<path class="p-bell" d="M15 25 C21 19 27 11 35 4 C39 12 37 23 29 29 C23 31 19 30 15 25 Z"/>'
    + '<path class="p-shine" d="M19 22 C23 18 27 13 32 8"/>'
    + '<ellipse class="p-mouth" cx="33" cy="16.5" rx="3.6" ry="12" transform="rotate(42 33 16.5)"/>';

// The part on its own, for the stage map's beaten boss, the console's
// window, the end card and its flight.
export function partIcon() {
    const el = document.createElement('span');
    el.className = 'boss-part';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 40 40">${PART}</svg>`;
    return el;
}

// The thief in a 130x150 box, facing right, his feet at the bottom.
const THIEF = '<g class="t-all">'
    // legs: thin, a little bend at the knee, small tin feet
    + '<g class="t-leg t-leg-l"><path class="t-limb-o" d="M54 112 L48 127 L52 140"/><path class="t-limb" d="M54 112 L48 127 L52 140"/>'
    + '<ellipse class="t-foot" cx="56" cy="141.5" rx="7" ry="3.4"/></g>'
    + '<g class="t-leg t-leg-r"><path class="t-limb-o" d="M76 112 L80 127 L77 140"/><path class="t-limb" d="M76 112 L80 127 L77 140"/>'
    + '<ellipse class="t-foot" cx="81" cy="141.5" rx="7" ry="3.4"/></g>'
    // the wind-up key on his back: a shaft and a bow of two lobes
    + '<g class="t-key"><rect class="t-brass" x="13" y="68" width="18" height="7" rx="2"/>'
    + '<path class="t-key-bow" d="M14 71.5 C6 58 0 60 2 71.5 C0 83 6 85 14 71.5 Z"/></g>'
    // the antenna and its lamp
    + '<path class="t-wire-o" d="M66 34 V14"/><path class="t-wire" d="M66 34 V14"/><circle class="t-lamp-halo" cx="66" cy="10" r="9"/><circle class="t-lamp" cx="66" cy="10" r="5.5"/>'
    // the spring that pops out on a hit
    + '<path class="t-spring" d="M86 34 l8 -4 l-8 -4 l8 -4 l-8 -4 l8 -4 l-8 -4"/>'
    // the arm that points along the track (pose `point`)
    + '<g class="t-point"><path class="t-limb-o t-arm" d="M100 56 L116 50 L128 50"/><path class="t-limb t-arm" d="M100 56 L116 50 L128 50"/><path class="t-brass t-tip" d="M126 45 L136 50 L126 55 Z"/></g>'
    // the body: a red tin can, a highlight down its lit side, a seam, rivets
    + '<rect class="t-tin" x="28" y="32" width="76" height="82" rx="15"/>'
    + '<path class="t-tin-hi" d="M37 44 V100"/>'
    + '<path class="t-seam" d="M29 80 H103"/>'
    + '<circle class="t-rivet" cx="38" cy="41" r="2.6"/><circle class="t-rivet" cx="94" cy="41" r="2.6"/>'
    + '<circle class="t-rivet" cx="38" cy="105" r="2.6"/><circle class="t-rivet" cx="94" cy="105" r="2.6"/>'
    // the lens eye: brass rim, dark glass, amber iris and pupil, a glint
    + '<circle class="t-rim" cx="66" cy="57" r="20"/><circle class="t-glass" cx="66" cy="57" r="14.5"/>'
    + '<g class="t-pupil"><circle class="t-iris" cx="68" cy="57" r="8"/><circle class="t-black" cx="68" cy="57" r="3.8"/></g>'
    + '<circle class="t-glint" cx="61" cy="51.5" r="2.6"/>'
    + '<path class="t-squint" d="M55 61 Q66 46 77 61"/>'
    + '<path class="t-dizzy" d="M66 57 m-2 0 a2 2 0 1 1 4 0 a4 4 0 1 1 -8 0 a6 6 0 1 1 12 0 a8 8 0 1 1 -16 0"/>'
    // the grille mouth
    + '<g class="t-mouth"><rect class="t-grille" x="47" y="87" width="38" height="14" rx="3"/>'
    + '<path class="t-bars" d="M53 88 V100 M59 88 V100 M65 88 V100 M71 88 V100 M77 88 V100"/></g>'
    // the claw holding the part in front
    + '<g class="t-claw"><path class="t-limb-o t-arm" d="M103 72 Q116 74 116 88"/><path class="t-limb t-arm" d="M103 72 Q116 74 116 88"/>'
    + `<g class="t-part" transform="translate(110 67) scale(0.8)">${PART}</g>`
    + '<path class="t-brass t-pincer" d="M110 88 L121 86 L117 95 Z M110 92 L113 103 L120 96 Z"/></g>'
    + '</g>';

// The thief (a new element each call): the SVG in a span that game.css
// sizes and bossview.js / bossfx.js place and pose.
export function thiefSvg() {
    const el = document.createElement('span');
    el.className = 'thief';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 134 150">${THIEF}</svg>`;
    return el;
}

// His face alone in a 40x40 box (the stage map's station of a boss not
// beaten yet, the round end's thief button): the red tin, the lens eye,
// the grille and the antenna lamp.
export function thiefFace() {
    const el = document.createElement('span');
    el.className = 'thief-face';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 40 40">'
        + '<path class="t-wire-o" d="M20 9 V4"/><path class="t-wire" d="M20 9 V4"/><circle class="t-lamp" cx="20" cy="4" r="3"/>'
        + '<rect class="t-tin" x="5" y="9" width="30" height="28" rx="7"/>'
        + '<circle class="t-rim" cx="20" cy="20" r="8.5"/><circle class="t-glass" cx="20" cy="20" r="6"/>'
        + '<circle class="t-iris" cx="21" cy="20" r="3.4"/><circle class="t-black" cx="21" cy="20" r="1.6"/>'
        + '<circle class="t-glint" cx="18" cy="17.6" r="1.2"/>'
        + '<rect class="t-grille" x="12" y="30" width="16" height="5" rx="1.2"/>'
        + '<path class="t-bars" d="M16 30.5 V34.5 M20 30.5 V34.5 M24 30.5 V34.5"/>'
        + '</svg>';
    return el;
}

// The vent at the end of his track (a grille box in the lab's metal) and
// its big alarm lamp on top, in a 56x76 box.
export function ventSvg() {
    const el = document.createElement('span');
    el.className = 'boss-vent-art';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 56 76">'
        + '<rect class="v-base" x="20" y="14" width="16" height="7" rx="2"/>'
        + '<circle class="v-halo" cx="28" cy="12" r="15"/>'
        + '<path class="v-lamp" d="M17 15 A11 11 0 0 1 39 15 Z"/>'
        + '<path class="v-lamp-hi" d="M22 11 A6 6 0 0 1 28 7"/>'
        + '<rect class="v-box" x="3" y="21" width="50" height="53" rx="7"/>'
        + '<rect class="v-hole" x="9" y="27" width="38" height="41" rx="4"/>'
        + '<path class="v-slats" d="M10 33 H46 M10 40 H46 M10 47 H46 M10 54 H46 M10 61 H46"/>'
        + '<circle class="v-rivet" cx="7.5" cy="25.5" r="1.8"/><circle class="v-rivet" cx="48.5" cy="25.5" r="1.8"/>'
        + '<circle class="v-rivet" cx="7.5" cy="69.5" r="1.8"/><circle class="v-rivet" cx="48.5" cy="69.5" r="1.8"/>'
        + '</svg>';
    return el;
}

// The console's middle window on the boss screen (a round brass-rimmed
// port, dark glass), where the part drops when he is beaten: in a 48x48
// box; the part goes in its `.w-glass` (bossview.js).
export function windowSvg() {
    const el = document.createElement('span');
    el.className = 'boss-window-art';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 48 48">'
        + '<circle class="w-rim-lo" cx="24.8" cy="25" r="21"/>'
        + '<circle class="w-rim" cx="24" cy="24" r="21"/>'
        + '<circle class="w-glass" cx="24" cy="24" r="15"/>'
        + '<path class="w-shine" d="M14 18 A12 12 0 0 1 22 11"/>'
        + '<circle class="w-rivet" cx="24" cy="6" r="1.6"/><circle class="w-rivet" cx="42" cy="24" r="1.6"/>'
        + '<circle class="w-rivet" cx="24" cy="42" r="1.6"/><circle class="w-rivet" cx="6" cy="24" r="1.6"/>'
        + '</svg>';
    return el;
}

// A card's back: a brass cog on amber stripes (game.css draws the
// stripes); the cog in a 40x40 box.
export function cardBackSvg() {
    return '<svg viewBox="0 0 40 40" aria-hidden="true">'
        + '<path class="cb-cog" d="M20 4l3 5 6-2 1 6 6 1-2 6 5 3-5 3 2 6-6 1-1 6-6-2-3 5-3-5-6 2-1-6-6-1 2-6-5-3 5-3-2-6 6-1 1-6 6 2z"/>'
        + '<circle class="cb-hub" cx="20" cy="20" r="6"/></svg>';
}
