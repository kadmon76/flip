// main.js — wiring: theme selection, round flow, the console controls
// (check dome, reset lever, speaker), the kid-idle timer for the robot,
// screen renders.

import { state, setState, subscribe } from './state.js';
import { renderScreens } from './screens.js';
import { renderCard } from './card.js';
import { returnAll } from './drag.js';
import { renderFeedback } from './feedback.js';
import { renderControls, domeAction, canReset, speakerState, PRESS_MS } from './controls.js';
import { speakWord, stopWord } from './audio.js';
import { starsFor } from './score.js';
import { renderCelebrate } from './celebrate.js';
import { add as addSticker } from './stickers.js';
import { renderGallery } from './gallery.js';
import { renderRobot, idleWait, wordKey, IDLE_MS } from './character.js';

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

// Fill every box with the right letter using the word's own tiles. A
// block already in its right slot stays there, so on the reveal only the
// others fly in (feedback.js).
function revealed(current) {
    const tray = current.tray.map((t) => ({ ...t, used: true }));
    const letters = current.word.split('');
    const placed = letters.map((ch, i) => {
        const p = current.placed[i];
        return p && p.letter === ch ? { letter: ch, tileId: p.tileId } : null;
    });
    const taken = new Set(placed.filter(Boolean).map((p) => p.tileId));
    letters.forEach((ch, i) => {
        if (placed[i]) return;
        const tile = tray.find((t) => t.letter === ch && !taken.has(t.id));
        taken.add(tile.id);
        placed[i] = { letter: tile.letter, tileId: tile.id };
    });
    return { ...current, tray, placed, status: 'revealed' };
}

// --- Theme screen ---

// themes.json shape: { "animals": "/static/data/animals.json", ... }.
// Each data file: { "duck": { image, audio, difficulty }, ... }; the
// theme card shows the image of the first word, and the gallery
// (gallery.js) lists every word, so each theme keeps its word list.
async function loadThemes() {
    const index = await fetch('/static/config/themes.json').then((r) => r.json());
    const themes = await Promise.all(Object.entries(index).map(async ([name, dataUrl]) => {
        const data = await fetch(dataUrl).then((r) => r.json());
        const words = Object.keys(data).map((word) => ({ word, image: data[word].image }));
        return { name, dataUrl, image: words.length ? words[0].image : null, words };
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
    stopWord();
    setState({
        theme: name,
        words,
        screen: 'play',
        round: { index: 0, size: ROUND_SIZE, results: [] },
        current: makeCurrent(words[0]),
        lives: LIVES,
        pressed: null,
        speaking: false,
        roundsStarted: state.roundsStarted + 1,
        lastInput: performance.now(),
        idleBeat: null,
    });
    armIdle();
}

// --- Play screen: the console (DESIGN "Controls and states") ---

// Check dome, also "next": it shows `dome-pressed` for 120ms, then the
// result. What the press does is decided again when the 120ms are up (a
// block may have been taken out meanwhile). `pressed` is cleared in the
// same setState as the result.
function onDome() {
    if (state.screen !== 'play' || state.pressed || !domeAction(state.current)) return;
    setState({ pressed: 'dome' });
    setTimeout(() => {
        const action = state.screen === 'play' ? domeAction(state.current) : null;
        if (action === 'check') onCheck({ pressed: null });
        else if (action === 'next') onNext({ pressed: null });
        if (state.pressed === 'dome') setState({ pressed: null });
    }, PRESS_MS.dome);
}

// Reset lever: down for 250ms, and every placed block goes back to its
// start spot at once (feedback.js shakes the rail and hops the blocks).
// Input is not blocked; tapping a single placed block still returns only
// that block (drag.js).
function onLever() {
    if (state.screen !== 'play' || state.pressed || !canReset(state.current)) return;
    setState({ pressed: 'lever', current: returnAll(state.current) });
    setTimeout(() => {
        if (state.pressed === 'lever') setState({ pressed: null });
    }, PRESS_MS.lever);
}

// Speaker: plays the word's audio file through audio.js; `speaking` shows
// `speaker-on` until it ends. A word without an audio file shows
// `speaker-cap` and the tap is ignored.
function onSpeak() {
    const { current } = state;
    if (state.screen !== 'play' || speakerState(current, state.speaking) === 'cap') return;
    setState({ speaking: true });
    speakWord(current.audio, () => setState({ speaking: false }));
}

// `extra` is merged into the result's setState (the dome passes
// `pressed: null`).
function onCheck(extra = {}) {
    const { current, round, lives } = state;
    if (!current.placed.every(Boolean)) return;
    if (current.status !== 'playing') return;

    const answer = current.placed.map((p) => p.letter).join('');
    const correct = answer === current.word;
    const results = [...round.results];
    results[round.index] = { word: current.word, correct };

    if (correct) {
        // Mastered (correct with a heart left): into the sticker book.
        // newSticker is true only if the book did not have the word yet.
        results[round.index].newSticker = addSticker(state.theme, current.word);
        setState({ round: { ...round, results }, current: { ...current, status: 'correct' }, ...extra });
    } else if (lives - 1 <= 0) {
        setState({ lives: 0, round: { ...round, results }, current: revealed(current), ...extra });
    } else {
        setState({ lives: lives - 1, round: { ...round, results }, current: { ...current, status: 'wrong' }, ...extra });
    }
}

// Next word, or the round-end screen after the fifth. The dome offers it
// only after a correct answer or a reveal, so every word has a result by
// then; one without would count as wrong. The word clip stops with its
// word.
function onNext(extra = {}) {
    const { round, current } = state;
    const results = [...round.results];
    if (!results[round.index]) results[round.index] = { word: current.word, correct: false };

    stopWord();
    const nextIndex = round.index + 1;
    if (nextIndex >= round.size) {
        setState({ round: { ...round, results }, screen: 'round-end', speaking: false, idleBeat: null, ...extra });
    } else {
        setState({
            round: { ...round, index: nextIndex, results },
            current: makeCurrent(state.words[nextIndex]),
            lives: LIVES,
            speaking: false,
            lastInput: performance.now(),
            idleBeat: null,
            ...extra,
        });
        armIdle();
    }
}

// --- The kid-idle beat (CHARACTER "Kid idle 10s", character.js) ---

// Any input on the play screen: while the beat has not come yet, note
// when (the idle timer counts from it); if the robot has sunk out of
// boredom, the beat is over and he pops back up. After that, inputs on
// this word are not recorded.
function onInput() {
    if (state.screen !== 'play' || !state.current.word) return;
    if (state.idleBeat === 'sunk') setState({ idleBeat: 'over' });
    else if (state.idleBeat === null) setState({ lastInput: performance.now() });
}

// The idle timer of the word now showing: it checks when the kid could
// first have been idle IDLE_MS, and again for what is left if there was
// input since; it ends when the beat comes or when the word or the
// screen changes. Nothing is kept outside state: the word it belongs to
// lives in the timer's own closure.
function armIdle() {
    const word = wordKey(state);
    const tick = () => {
        if (wordKey(state) !== word) return;
        const wait = idleWait(state, performance.now());
        if (wait === null) return;
        if (wait > 0) setTimeout(tick, wait);
        else setState({ idleBeat: 'sunk' });
    };
    setTimeout(tick, IDLE_MS);
}

// --- Round-end screen ---

const TICK = 'M5 12.5l4.5 4.5L19 7';
const CROSS = 'M6 6l12 12M18 6L6 18';
const STAR = 'M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z';

// Stars, score, "New stickers: N" and one row per word (thumbnail, word,
// a sticker badge if the word is new in the book, tick or cross).
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
    const fresh = results.filter((r) => r.correct && r.newSticker).length;
    $('round-new').textContent = `New stickers: ${fresh}`;

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

        if (ok && results[i].newSticker) {
            const badge = document.createElement('span');
            badge.className = 'sticker';
            badge.setAttribute('aria-label', 'new sticker');
            badge.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg>`;
            li.appendChild(badge);
        }

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
    stopWord();
    setState({
        screen: 'theme',
        theme: null,
        words: [],
        round: { index: 0, size: ROUND_SIZE, results: [] },
        current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },
        pressed: null,
        speaking: false,
        idleBeat: null,
    });
}

// --- Gallery (sticker book) screen ---

// Opened from the theme screen only; Back returns there. Nothing else in
// state changes: the book is read by gallery.js through stickers.js.
function onStickers() {
    setState({ screen: 'gallery' });
}

function onGalleryBack() {
    setState({ screen: 'theme' });
}

// --- Wiring ---

subscribe(renderScreens);
subscribe(renderThemeButtons);
subscribe(renderCard);
subscribe(renderFeedback);    // after the card render: keys off its DOM
subscribe(renderControls);
subscribe(renderRobot);
subscribe(renderRoundEnd);
subscribe(renderGallery);
subscribe(renderCelebrate);   // after the card and round-end renders: keys off their DOM

$('check-btn').addEventListener('click', onDome);
$('reset-btn').addEventListener('click', onLever);
$('speak-btn').addEventListener('click', onSpeak);
$('play-again-btn').addEventListener('click', onPlayAgain);
$('themes-btn').addEventListener('click', onThemes);
$('stickers-btn').addEventListener('click', onStickers);
$('gallery-back-btn').addEventListener('click', onGalleryBack);
// Any touch, click or key counts as input for the idle timer (capture:
// seen before a block or a control handles it).
document.addEventListener('pointerdown', onInput, true);
document.addEventListener('keydown', onInput, true);

renderScreens(state);
loadThemes();

// Box sizing depends on the row width (layout.js); re-render on rotate.
window.addEventListener('resize', () => renderCard(state));

// Dev hook for tools/shot.mjs --eval only: lets a screenshot script drive
// screens through setState. Nothing in the game reads window.flip.
window.flip = { state, setState };
