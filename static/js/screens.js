// screens.js — shows the container matching state.screen, hides the rest,
// and mirrors state.screen onto <body data-screen> as a CSS hook (the lab
// scene, frame and header placement of the play screen). The attribute is
// render output, written on every render and never read by any script.

const SCREENS = {
    'theme': 'screen-theme',
    'play': 'screen-play',
    'round-end': 'screen-round-end',
    'gallery': 'screen-gallery',
};

export function renderScreens(state) {
    for (const [name, id] of Object.entries(SCREENS)) {
        const el = document.getElementById(id);
        if (el) el.style.display = name === state.screen ? '' : 'none';
    }
    document.body.dataset.screen = state.screen;
}
