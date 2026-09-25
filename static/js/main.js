// main.js — wiring: theme selection, round flow, check/next, screen renders.

import { state, setState, subscribe } from './state.js';
import { renderScreens } from './screens.js';
import { renderCard } from './card.js';
import { renderFeedback } from './feedback.js';
import { starsFor } from './score.js';

const $ = (id) => document.getElementById(id);

const ROUND_SIZE = 5;
const LIVES = 3;
let tileSeq = 0;

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function makeCurrent(entry) {
    const letters = entry.word.split('');
    return {
        word: entry.word,
        image: entry.image,
        audio: entry.audio,
        tray: shuffle(letters).map((letter) => ({ id: `t${++tileSeq}`, letter, used: false })),
        placed: new Array(letters.length).fill(null),
        status: 'playing',
    };
}

// Fill every box with the right letter using the word's own tiles.
function revealed(current) {
    const tray = current.tray.map((t) => ({ ...t, used: true }));
    const taken = new Set();
    const placed = current.word.split('').map((ch) => {
        const tile = tray.find((t) => t.letter === ch && !taken.has(t.id));
        taken.add(tile.id);
        return { letter: tile.letter, tileId: tile.id };
    });
    return { ...current, tray, placed, status: 'revealed' };
}

// --- Theme screen ---

// themes.json shape: { "animals": "/static/data/animals.json", ... }.
// Each data file: { "duck": { image, audio, difficulty }, ... }; the
// theme card shows the image of the first word.
async function loadThemes() {
    const index = await fetch('/static/config/themes.json').then((r) => r.json());
    const themes = await Promise.all(Object.entries(index).map(async ([name, dataUrl]) => {
        const data = await fetch(dataUrl).then((r) => r.json());
        const first = Object.keys(data)[0];
        return { name, dataUrl, image: first ? data[first].image : null };
    }));
    setState({ themes });
}

function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// DOM cache: the themes array the buttons were last built from. Not game
// state; the buttons are rebuilt whenever state.themes is replaced.
let builtThemes = null;

function renderThemeButtons(state) {
    if (state.themes === builtThemes) return;
    builtThemes = state.themes;
    const container = $('theme-buttons');
    container.innerHTML = '';
    for (const theme of state.themes) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-btn';
        if (theme.image) {
            const img = document.createElement('img');
            img.src = theme.image;
            img.alt = '';
            btn.appendChild(img);
        }
        const label = document.createElement('span');
        label.textContent = capitalise(theme.name);
        btn.appendChild(label);
        btn.addEventListener('click', () => startRound(theme));
        container.appendChild(btn);
    }
}

async function startRound({ name, dataUrl }) {
    // data shape: { "duck": { image, audio, difficulty }, ... }
    const data = await fetch(dataUrl).then((r) => r.json());
    const words = shuffle(Object.keys(data))
        .slice(0, ROUND_SIZE)
        .map((word) => ({ word, image: data[word].image, audio: data[word].audio }));
    setState({
        theme: name,
        words,
        screen: 'play',
        round: { index: 0, size: ROUND_SIZE, results: [] },
        current: makeCurrent(words[0]),
        lives: LIVES,
    });
}

// --- Play screen: check / next ---

const RESULT_TEXT = {
    playing: '',
    correct: 'Correct!',
    wrong: 'Not quite, try again',
    revealed: (word) => `The word is "${word}"`,
};

function renderActions(state) {
    if (state.screen !== 'play' || !state.current.word) return;
    const { current } = state;
    const allFilled = current.placed.every(Boolean);
    const canCheck = current.status === 'playing' || current.status === 'wrong';
    $('check-btn').disabled = !(allFilled && canCheck);
    const text = RESULT_TEXT[current.status];
    $('result-line').textContent = typeof text === 'function' ? text(current.word) : text;
}

function onCheck() {
    const { current, round, lives } = state;
    if (!current.placed.every(Boolean)) return;
    if (current.status === 'correct' || current.status === 'revealed') return;

    const answer = current.placed.map((p) => p.letter).join('');
    const correct = answer === current.word;
    const results = [...round.results];
    results[round.index] = { word: current.word, correct };

    if (correct) {
        setState({ round: { ...round, results }, current: { ...current, status: 'correct' } });
    } else if (lives - 1 <= 0) {
        setState({ lives: 0, round: { ...round, results }, current: revealed(current) });
    } else {
        setState({ lives: lives - 1, round: { ...round, results }, current: { ...current, status: 'wrong' } });
    }
}

function onNext() {
    const { round, current } = state;
    const results = [...round.results];
    // Skipping a word without checking counts as wrong.
    if (!results[round.index]) results[round.index] = { word: current.word, correct: false };

    const nextIndex = round.index + 1;
    if (nextIndex >= round.size) {
        setState({ round: { ...round, results }, screen: 'round-end' });
    } else {
        setState({
            round: { ...round, index: nextIndex, results },
            current: makeCurrent(state.words[nextIndex]),
            lives: LIVES,
        });
    }
}

// --- Round-end screen ---

const TICK = 'M5 12.5l4.5 4.5L19 7';
const CROSS = 'M6 6l12 12M18 6L6 18';

// Stars, score and one row per word (thumbnail, word, tick or cross).
// The rows are rebuilt from state.round.results on every render; the
// list is small and nothing on this screen is interactive per row.
function renderRoundEnd(state) {
    if (state.screen !== 'round-end') return;
    const { results, size } = state.round;
    const correct = results.filter((r) => r.correct).length;
    const stars = starsFor(correct, size);

    document.querySelectorAll('#round-stars span').forEach((star, i) => {
        star.classList.toggle('earned', i < stars);
    });
    $('round-score').textContent = `${correct} / ${size}`;

    const list = $('round-words');
    list.innerHTML = '';
    state.words.forEach((entry, i) => {
        const ok = !!(results[i] && results[i].correct);
        const li = document.createElement('li');
        li.className = ok ? 'correct' : 'wrong';

        const img = document.createElement('img');
        img.src = entry.image;
        img.alt = '';
        li.appendChild(img);

        const word = document.createElement('span');
        word.className = 'word';
        word.textContent = entry.word;
        li.appendChild(word);

        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.setAttribute('aria-label', ok ? 'correct' : 'wrong');
        mark.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ok ? TICK : CROSS}"/></svg>`;
        li.appendChild(mark);

        list.appendChild(li);
    });
}

// New round in the same theme: new random words, hearts and results
// reset by startRound. Falls back to the theme screen if the theme is
// somehow missing from state.themes.
function onPlayAgain() {
    const theme = state.themes.find((t) => t.name === state.theme);
    if (theme) startRound(theme);
    else onThemes();
}

function onThemes() {
    setState({
        screen: 'theme',
        theme: null,
        words: [],
        round: { index: 0, size: ROUND_SIZE, results: [] },
        current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },
    });
}

// --- Wiring ---

subscribe(renderScreens);
subscribe(renderThemeButtons);
subscribe(renderCard);
subscribe(renderFeedback);
subscribe(renderActions);
subscribe(renderRoundEnd);

$('check-btn').addEventListener('click', onCheck);
$('next-btn').addEventListener('click', onNext);
$('play-again-btn').addEventListener('click', onPlayAgain);
$('themes-btn').addEventListener('click', onThemes);

renderScreens(state);
loadThemes();

// Box sizing depends on the row width (layout.js); re-render on rotate.
window.addEventListener('resize', () => renderCard(state));

// Dev hook for tools/shot.mjs --eval only: lets a screenshot script drive
// screens through setState. Nothing in the game reads window.flip.
window.flip = { state, setState };
