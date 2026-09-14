// screens.js — shows the container matching state.screen, hides the rest.

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
}
