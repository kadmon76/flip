// screens.js — shows the container matching state.screen, hides the rest,
// and mirrors state.screen onto <body data-screen> as a CSS hook (the lab
// scene, frame and header placement of the play screen). The attribute is
// render output, written on every render and never read by any script.
// The boss (BACKLOG B-232) is the play scene: 'boss' shows #screen-play,
// and game.css keyed on body[data-screen="boss"] swaps its parts.

const SCREENS = {
    'start': 'screen-start',
    'theme': 'screen-theme',
    'stages': 'screen-stages',
    'play': 'screen-play',
    'round-end': 'screen-round-end',
    'gallery': 'screen-gallery',
    'boss': 'screen-play',
};

export function renderScreens(state) {
    const shown = SCREENS[state.screen];
    for (const id of new Set(Object.values(SCREENS))) {
        const el = document.getElementById(id);
        if (el) el.style.display = id === shown ? '' : 'none';
    }
    document.body.dataset.screen = state.screen;
}
