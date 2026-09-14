// main.js — wiring: theme selection, round flow, screen renders.

import { state, setState, subscribe } from './state.js';
import { renderScreens } from './screens.js';

const $ = (id) => document.getElementById(id);

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function makeCurrent(entry) {
    return {
        word: entry.word,
        image: entry.image,
        audio: entry.audio,
        tray: shuffle(entry.word.split('')),
        placed: new Array(entry.word.length).fill(null),
    };
}

// --- Theme screen ---

async function renderThemeButtons() {
    // themes.json shape: { "animals": "/static/data/animals.json", ... }
    const themes = await fetch('/static/config/themes.json').then((r) => r.json());
    const container = $('theme-buttons');
    container.innerHTML = '';
    for (const [name, dataUrl] of Object.entries(themes)) {
        const btn = document.createElement('button');
        btn.className = 'theme-btn';
        btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        btn.addEventListener('click', () => startRound(name, dataUrl));
        container.appendChild(btn);
    }
}

async function startRound(theme, dataUrl) {
    // data shape: { "duck": { image, audio, difficulty }, ... }
    const data = await fetch(dataUrl).then((r) => r.json());
    const words = shuffle(Object.keys(data))
        .slice(0, 5)
        .map((word) => ({ word, image: data[word].image, audio: data[word].audio }));
    setState({
        theme,
        words,
        screen: 'play',
        round: { index: 0, size: 5, results: [] },
        current: makeCurrent(words[0]),
    });
}

// --- Play screen ---

function renderPlay(state) {
    if (state.screen !== 'play' || !state.current.word) return;

    $('play-image').src = state.current.image;
    $('play-image').alt = 'Guess the word image';

    const boxes = $('letter-boxes');
    boxes.innerHTML = '';
    state.current.placed.forEach(() => {
        const box = document.createElement('div');
        box.className = 'letter-box';
        boxes.appendChild(box);
    });

    const tray = $('letter-tray');
    tray.innerHTML = '';
    state.current.tray.forEach((letter) => {
        const tile = document.createElement('div');
        tile.className = 'draggable-letter';
        tile.textContent = letter;
        tray.appendChild(tile);
    });
}

function onNext() {
    const results = [...state.round.results, { word: state.current.word, correct: true }];
    const nextIndex = state.round.index + 1;
    if (nextIndex >= state.round.size) {
        setState({
            round: { ...state.round, results },
            screen: 'round-end',
        });
    } else {
        setState({
            round: { ...state.round, index: nextIndex, results },
            current: makeCurrent(state.words[nextIndex]),
        });
    }
}

// --- Round-end screen ---

function renderRoundEnd(state) {
    if (state.screen !== 'round-end') return;
    const correct = state.round.results.filter((r) => r.correct).length;
    $('round-score').textContent = `${correct} / ${state.round.size}`;
}

function onPlayAgain() {
    setState({
        screen: 'theme',
        theme: null,
        words: [],
        round: { index: 0, size: 5, results: [] },
        current: { word: null, image: null, audio: null, placed: [], tray: [] },
        lives: 3,
    });
}

// --- Wiring ---

subscribe(renderScreens);
subscribe(renderPlay);
subscribe(renderRoundEnd);

$('next-btn').addEventListener('click', onNext);
$('play-again-btn').addEventListener('click', onPlayAgain);

renderScreens(state);
renderThemeButtons();
