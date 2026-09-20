// main.js — wiring: theme selection, round flow, check/next, screen renders.

import { state, setState, subscribe } from './state.js';
import { renderScreens } from './screens.js';
import { renderCard } from './card.js';
import { HEARTS, checkWord, revealPlacement, resultText } from './check.js';

const $ = (id) => document.getElementById(id);

const ROUND_SIZE = 5;
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
        lives: HEARTS,
    });
}

// --- Play screen: check / next ---

// Check is enabled only while every box holds a tile and the word is
// still open; Next is always enabled (an unchecked word counts as wrong).
function renderActions(state) {
    if (state.screen !== 'play' || !state.current.word) return;
    const { current } = state;
    const allFilled = current.placed.every(Boolean);
    const open = current.status === 'playing' || current.status === 'wrong';
    $('check-btn').disabled = !(allFilled && open);
    $('result-line').textContent = resultText(current.status, current.word);
}

// Mistake rules live in check.js; this only records the outcome. On the
// third miss the boxes are filled with the right tiles (status 'revealed').
function onCheck() {
    const { current, round, lives } = state;
    if (!current.placed.every(Boolean)) return;
    if (current.status === 'correct' || current.status === 'revealed') return;

    const letters = current.placed.map((p) => p.letter);
    const result = checkWord(current.word, letters, lives);
    const results = [...round.results];
    results[round.index] = { word: current.word, correct: result.correct };

    const next = { ...current, status: result.status };
    if (result.status === 'revealed') Object.assign(next, revealPlacement(current.word, current.tray));
    setState({ lives: result.lives, round: { ...round, results }, current: next });
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
            lives: HEARTS,
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
        round: { index: 0, size: ROUND_SIZE, results: [] },
        current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },
        lives: HEARTS,
    });
}

// --- Wiring ---

subscribe(renderScreens);
subscribe(renderThemeButtons);
subscribe(renderCard);
subscribe(renderActions);
subscribe(renderRoundEnd);

$('check-btn').addEventListener('click', onCheck);
$('next-btn').addEventListener('click', onNext);
$('play-again-btn').addEventListener('click', onPlayAgain);

renderScreens(state);
loadThemes();

// Box sizing depends on the row width (layout.js); re-render on rotate.
window.addEventListener('resize', () => renderCard(state));

// Dev hook for tools/shot.mjs --eval only: lets a screenshot script drive
// screens through setState. Nothing in the game reads window.flip.
window.flip = { state, setState };
