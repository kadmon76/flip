// main.js — wiring: theme selection and the theme's stage map (BACKLOG
// B-217: a theme card opens its stage screen, a station there starts a
// round of its stage), round flow (its progress recorded at the round
// end; the struggle help, BACKLOG B-220: after three words in a row that
// were not clean the next two are easier ones), the console controls
// (check dome, reset lever, speaker), the header's mute toggle and the
// play screen's back button, the kid-idle
// timer and the dome-nudge timer for the robot and his voice's frames,
// the TV's lock (tv.js) and the picture's life after it (picture.js,
// BACKLOG B-221) with its win on a correct check (BACKLOG B-222), screen
// renders. The kid's gears (gears.js,
// BACKLOG B-218): a word's at its correct check, the round's at its end,
// kept in state.gears for the gear counters (cogs.js); and spent on boosts
// (BACKLOG B-219, boost.js, boosttray.js): the boost button, its tray and
// the boost itself.

import { state, setState, subscribe } from './state.js';
import { renderScreens } from './screens.js';
import { renderCard } from './card.js';
import { checkedWrong, returnAll, giveHint, afterHint, revealed } from './drag.js';
import { renderFeedback } from './feedback.js';
import { renderTv } from './tv.js';
import { renderPicture } from './picture.js';
import { renderControls, domeAction, canReset, speakerAction, PRESS_MS } from './controls.js';
import { speakWord, stopWord, init as initAudio, renderSound, loadMuted, saveMuted, voiceWave, peekLine } from './audio.js';
import { starsFor } from './score.js';
import { renderCelebrate } from './celebrate.js';
import { add as addSticker, remove as removeSticker } from './stickers.js';
import { load as loadGears, add as addGears, spend as spendGears, isClean, wordGears, GEARS } from './gears.js';
import { renderGears } from './cogs.js';
import { boostOn, offered, pickable, canAfford, giveLetter, cleanUp, isBoosted, COSTS } from './boost.js';
import { renderBoost } from './boosttray.js';
import { renderGallery } from './gallery.js';
import { renderStageMap } from './stagemap.js';
import { renderFlaps } from './flaps.js';
import { renderRobot, renderTalk, idleWait, nudgeWait, wordKey, IDLE_MS } from './character.js';
import { stagesOf } from './stage.js';
import { pickRound, makeWord, swapForStruggle } from './round.js';
import { wordsFor as missedWords, record as recordMissed } from './missed.js';
import { forTheme as progressFor, currentStage, record as recordProgress, load as loadProgress, stations } from './progress.js';
import { load as loadPlayers, add as addPlayer, select as selectPlayer } from './players.js';
// The save modules' keys, for the first player to take over the saves
// made before players existed (players.js add); each key stays named only
// in its own module.
import { KEY as STICKERS_KEY } from './stickers.js';
import { KEY as GEARS_KEY } from './gears.js';
import { KEY as MISSED_KEY } from './missed.js';
import { KEY as PROGRESS_KEY } from './progress.js';
import { renderStart, renderPlayerButton } from './start.js';

const $ = (id) => document.getElementById(id);

const ROUND_SIZE = 5;
const LIVES = 3;
let tileSeq = 0;

// A fresh tile id for round.js makeWord, unique over the session (card.js
// keys the DOM tiles by id).
const newTileId = () => `t${++tileSeq}`;

// --- Theme screen ---

// themes.json shape: { "animals": "/static/data/animals.json", ... }.
// Each data file: { "duck": { image, audio, stage }, ... }; the
// theme card shows the image of the first word (the theme's picture),
// and the gallery (gallery.js) lists every word, so each theme keeps its
// word list; and its stages (stage.js stagesOf: the stages its data has
// words in, in order), for the bulbs on its card and its stage map
// (BACKLOG B-217).
async function loadThemes() {
    const index = await fetch('/static/config/themes.json').then((r) => r.json());
    const themes = await Promise.all(Object.entries(index).map(async ([name, dataUrl]) => {
        const data = await fetch(dataUrl).then((r) => r.json());
        const words = Object.keys(data).map((word) => ({ word, image: data[word].image }));
        return { name, dataUrl, image: words.length ? words[0].image : null, words, stages: stagesOf(data) };
    }));
    setState({ themes });
}

// The stages a theme has cleared, from state.progress (progress.js
// load(), BACKLOG B-217); none for a theme never finished.
function clearedOf(state, name) {
    const progress = (state.progress || {})[name];
    return progress && Array.isArray(progress.cleared) ? progress.cleared : [];
}

// DOM cache: the themes array the buttons were last built from. Not game
// state; the buttons are rebuilt whenever state.themes is replaced.
let builtThemes = null;

// One cream card per theme showing the theme's picture, not its name
// (DESIGN "Other screens (interim)"); the name is only the aria-label.
// Under the picture, the theme's progress as a small row of bulbs, one
// per stage, lit when cleared (BACKLOG B-217, renderStageBulbs); the
// rows are updated in place on every render, so they follow
// state.progress. A tap opens the theme's stage screen.
function renderThemeButtons(state) {
    const container = $('theme-buttons');
    if (state.themes !== builtThemes) {
        builtThemes = state.themes;
        container.innerHTML = '';
        for (const theme of state.themes) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-btn panel';
            btn.setAttribute('aria-label', theme.name);
            if (theme.image) {
                const img = document.createElement('img');
                img.src = theme.image;
                img.alt = '';
                btn.appendChild(img);
            }
            const row = document.createElement('span');
            row.className = 'stage-bulbs';
            row.setAttribute('aria-hidden', 'true');
            btn.appendChild(row);
            btn.addEventListener('click', () => onTheme(theme));
            container.appendChild(btn);
        }
    }
    state.themes.forEach((theme, i) => {
        renderStageBulbs(container.children[i].lastElementChild, theme.stages || [], clearedOf(state, theme.name));
    });
}

// --- Start screen: who's playing (human, 2026-10-24; players.js, start.js) ---

// A player starts: the theme screen with their own saves (players.js
// keyOf scopes the save modules to the current player), and the robot's
// greeting (character.js greet, on the start -> theme change). The tap
// that got here is the first gesture, so his voice can play.
function startAs(players) {
    setState({
        screen: 'theme', players: players.list, player: players.current, picking: false, theme: null,
        progress: loadProgress(), gears: loadGears(),
    });
}

function onPlayer(id) {
    if (state.screen !== 'start') return;
    const players = selectPlayer(id);
    if (players) startAs(players);
}

function onNewPlayer() {
    if (state.screen !== 'start') return;
    setState({ picking: true });
}

// A picture picked: a new player with it, playing at once. The first
// player on the device takes over the saves made before players existed.
function onPickPic(pic) {
    if (state.screen !== 'start') return;
    const players = addPlayer(pic, [STICKERS_KEY, PROGRESS_KEY, GEARS_KEY, MISSED_KEY]);
    if (players) startAs(players);
}

function onPickBack() {
    if (state.screen !== 'start') return;
    setState({ picking: false });
}

// The theme screen's player button: back to the start screen, to switch.
function onSwitchPlayer() {
    if (state.screen !== 'theme') return;
    setState({ screen: 'start', picking: false, players: loadPlayers().list });
}

const START = { onPlayer, onNew: onNewPlayer, onPick: onPickPic, onPickBack };

// --- Stage screen (BACKLOG B-217, stagemap.js) ---

// A theme card opens the theme's stage map; no round starts yet.
function onTheme(theme) {
    if (state.screen !== 'theme') return;
    setState({ screen: 'stages', theme: theme.name });
}

// A station: a round of its stage, if the stage is open (cleared, or the
// theme's current stage; progress.js stations, from the same
// state.progress the map shows). A not-open station is disabled anyway.
function onStation(stage) {
    if (state.screen !== 'stages') return;
    const theme = state.themes.find((t) => t.name === state.theme);
    if (!theme) return;
    const open = stations(theme.stages, state.progress[theme.name]).some((s) => s.stage === stage && s.open);
    if (open) startRound(theme, stage);
}

// `chosen`: the stage picked on the stage map (BACKLOG B-217); none for
// play again, which plays the theme's current stage.
async function startRound({ name, dataUrl }, chosen = null) {
    // One round at a time: while the data file of a round just started is
    // on its way, another tap (a second tap on a station, or play again)
    // starts nothing (BACKLOG B-209, review fix).
    if (state.startingRound) return;
    // Where the tap came from: the theme's stage screen (a station) or
    // its round end (play again).
    const from = state.screen;
    setState({ startingRound: true });
    // data shape: { "duck": { image, audio, stage, break }, ... }
    let data;
    try {
        data = await fetch(dataUrl).then((r) => r.json());
    } catch (e) {
        setState({ startingRound: false });
        throw e;
    }
    // The kid left while the data file was on its way (the stage screen's
    // back arrow, the round end's themes, then maybe another theme's
    // card): no round starts (BACKLOG B-217, review fix).
    if (state.screen !== from || state.theme !== name) {
        setState({ startingRound: false });
        return;
    }
    // The round's stage (BACKLOG B-216, B-217; round.stage below, fixed
    // for the round): the stage picked on the stage map (a cleared stage,
    // replayed, or the current one), else the theme's current stage, the
    // first of the stages its data has words in that the kid has not
    // cleared (progress.js currentStage; all cleared: the last one), so
    // after a clear, play again starts the next one. A replay of a
    // cleared stage records its solved words at the round end and clears
    // nothing new (progress.js afterRound). Its rules (stage.js
    // stageRules) start every word of the round (round.js makeWord): on
    // stage 1 the first letter is given, on stages 3-5 extra letters lie
    // on the bench. The words (round.js pickRound, PROGRESSION.md
    // "Rounds"): up to two of the words this theme's earlier rounds
    // missed come back, in random places (missed.js; BACKLOG B-208), then
    // the stage's words not yet solved (progress.js), its solved words,
    // the earlier stages' words, and only while places are left the later
    // stages'.
    // A long word's `break` (BACKLOG B-213) says where its slots go to a
    // second row (round.js makeWord, layout.js slotLayout).
    const progress = progressFor(name);
    const stage = chosen === null ? currentStage(data, progress) : chosen;
    const words = pickRound(data, ROUND_SIZE, stage, missedWords(name), progress.solved)
        .map((word) => ({ word, image: data[word].image, audio: data[word].audio, break: data[word].break }));
    stopWord();
    setState({
        theme: name,
        data,
        words,
        screen: 'play',
        round: { index: 0, size: ROUND_SIZE, stage, results: [], cleared: [], justCleared: false },
        current: makeWord(words[0], stage, newTileId),
        lives: LIVES,
        pressed: null,
        speaking: false,
        roundsStarted: state.roundsStarted + 1,
        lastInput: performance.now(),
        idleBeat: null,
        nudges: 0,
        tuned: false,
        boostMenu: null,
        startingRound: false,
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

// Reset lever: down for 250ms, and the placed blocks go back to their
// start spots at once (feedback.js shakes the rail and hops the blocks).
// Which ones go (BACKLOG B-215b, drag.js leverResult; the same on every
// stage): after a wrong check the letters it found right that are still
// in their own slot stay and lock, every other one goes; a pull again
// right after a pull starts the word over; before any wrong check every
// one goes. The given letter, the robot's letter and a boost's letter
// always stay. Input is not blocked; tapping a single placed block still
// returns only that block (drag.js).
function onLever() {
    if (state.screen !== 'play' || state.pressed || !canReset(state.current)) return;
    setState({ pressed: 'lever', current: returnAll(state.current) });
    setTimeout(() => {
        if (state.pressed === 'lever') setState({ pressed: null });
    }, PRESS_MS.lever);
}

// Speaker: plays the word's audio file through audio.js; `speaking` shows
// `speaker-on` until it ends. A word without an audio file shows
// `speaker-cap` and the tap is ignored. On every stage, before and after
// the word is answered, a tap plays the word (BACKLOG B-215,
// controls.js speakerAction); a tap while muted is ignored (nothing would
// play).
function onSpeak() {
    const { current } = state;
    if (state.screen !== 'play') return;
    if (speakerAction(current) !== 'word' || state.muted) return;
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
    // clean (BACKLOG B-218, gears.js isClean): checked correct on the
    // word's first check (no bulb lost to a wrong check yet), with no
    // boost; boosted (BACKLOG B-219, boost.js isBoosted): the word took a
    // boost, so it still counts for its stage and earns its correct-word
    // gear, but no clean gear and no sticker.
    const boosted = isBoosted(current);
    const clean = isClean(correct, LIVES - lives, boosted);
    results[round.index] = { word: current.word, correct, clean, boosted };

    if (correct) {
        // Only a clean word goes into the sticker book (PROGRESSION.md
        // "Repetition and stickers"; stickers.js add is not called for a
        // word solved after a miss, which still counts for its stage).
        // newSticker is true only if the book did not have the word yet.
        // The word's gears (gears.js wordGears: 1, and 1 more when clean)
        // are added now, so a round left with the back button keeps them
        // (B-201 takes back only its stickers); state.gears is the count
        // after them, which celebrate.js flies cogs to.
        results[round.index].newSticker = clean && addSticker(state.theme, current.word);
        const gears = addGears(wordGears(results[round.index]));
        setState({ round: { ...round, results }, current: { ...current, status: 'correct' }, gears, ...extra });
        armNudge();
    } else if (lives - 1 <= 0) {
        setState({ lives: 0, round: { ...round, results }, current: revealed(current), ...extra });
        armNudge();
    } else {
        // The miss that leaves one bulb lit also gives one letter, on
        // every stage (BACKLOG B-206, drag.js giveHint): in the same
        // setState, so the robot (character.js hintGiven) and the fly-in
        // (feedback.js) see it with the miss. A word then checked correct
        // is solved as any other (a bulb is left), but not clean: it earns
        // no sticker and no clean gear (BACKLOG B-218). The check notes the
        // letters it found right, the ones the lever keeps (drag.js
        // checkedWrong, BACKLOG B-215b).
        const checked = checkedWrong(current);
        const left = lives - 1;
        setState({ lives: left, round: { ...round, results }, current: left === 1 ? giveHint(checked) : checked, ...extra });
        // With extras his letter can finish the word, in place of an extra
        // letter (BACKLOG B-207, drag.js afterHint): the word then reopens
        // and the dome lights at once. Its own setState, after the
        // miss's, so the robot, the sound and the motion see the miss.
        const reopened = afterHint(state.current);
        if (reopened !== state.current) setState({ current: reopened });
    }
}

// Next word, or the round-end screen after the fifth. The dome offers it
// only after a correct answer or a reveal, so every word has a result by
// then; one without would count as wrong. The word clip stops with its
// word. At the round end the theme's missed words are recorded (missed.js,
// BACKLOG B-208): the words not checked correct are remembered, the ones
// checked correct come out; and so is its progress (progress.js, BACKLOG
// B-216): the words checked correct are solved, and the round's stage is
// cleared once all its words are; the round keeps the theme's cleared
// stages and whether this round cleared its own, for the round-end's
// stage bulbs, and state.progress is read again for the theme cards and
// the stage map (BACKLOG B-217); and reaching the round end earns the
// round's gears (gears.js GEARS.round, BACKLOG B-218; its words' gears
// were added at their checks). A round left with the back button never
// gets here, so it records nothing and earns no round gears (B-201). The
// next word starts by the round's stage rules, as the first did (BACKLOG
// B-215). Before it starts, the struggle help (BACKLOG B-220, round.js
// swapForStruggle; PROGRESSION.md "Guardrails"): when this word and the
// two before it were not clean (a wrong check, a boost or a reveal), the
// next two words are swapped for solved words of the theme's earlier
// stages (progress.js: the solved words as the round started; nothing is
// recorded before its end), in the same setState as the next word, with
// no sign to the kid. Not on stage 1, nor when no earlier word is solved.
// The words swapped out have no result, so the round end records nothing
// about them: they stay unsolved and come back in a later round.
function onNext(extra = {}) {
    const { round, current } = state;
    const results = [...round.results];
    if (!results[round.index]) results[round.index] = { word: current.word, correct: false, clean: false };

    stopWord();
    const nextIndex = round.index + 1;
    if (nextIndex >= round.size) {
        recordMissed(state.theme, results);
        const { progress, justCleared } = recordProgress(state.theme, state.data, round.stage, results);
        setState({
            round: { ...round, results, cleared: progress.cleared, justCleared },
            progress: loadProgress(),
            gears: addGears(GEARS.round),
            screen: 'round-end',
            speaking: false,
            idleBeat: null,
            nudges: 0,
            boostMenu: null,
            ...extra,
        });
    } else {
        const words = swapForStruggle(state.words, round.index, results, state.data, round.stage, progressFor(state.theme).solved);
        setState({
            words,
            round: { ...round, index: nextIndex, results },
            current: makeWord(words[nextIndex], state.round.stage, newTileId),
            lives: LIVES,
            speaking: false,
            lastInput: performance.now(),
            idleBeat: null,
            nudges: 0,
            tuned: false,
            boostMenu: null,
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

// --- The robot's nudge toward the dome (BACKLOG B-212, character.js) ---

// Armed when the word is answered (onCheck: correct or revealed), when
// the dome starts to mean "next": if it is not pressed within
// NUDGE_MS.first, one more `nudges` (the robot points at it, character.js
// domeNudge), and again every NUDGE_MS.every (character.js nudgeWait). It
// ends when the word or the screen changes or the dome is pressed;
// nothing is kept outside state: the word it belongs to lives in the
// timer's own closure, as armIdle's does.
function armNudge() {
    const word = wordKey(state);
    const tick = () => {
        if (wordKey(state) !== word || nudgeWait(state) === null) return;
        setState({ nudges: state.nudges + 1 });
        const next = nudgeWait(state);
        if (next !== null) setTimeout(tick, next);
    };
    const wait = nudgeWait(state);
    if (wait !== null) setTimeout(tick, wait);
}

// --- Boosts (BACKLOG B-219, PROGRESSION.md "Boosts", "Guardrails") ---

// The boost button (the console's gear counter): while it is on (boost.js
// boostOn: the word's first try made, no boost on it yet, not answered)
// a tap opens the tray (boosttray.js). Not while a control is held: the
// dome's check or the lever's pull is under way.
function onBoost() {
    if (state.screen !== 'play' || state.pressed || state.boostMenu || !boostOn(state.current)) return;
    setState({ boostMenu: 'tray' });
}

// A tap anywhere but the tray or a glowing slot closes them, costing
// nothing.
function onBoostClose() {
    if (state.boostMenu) setState({ boostMenu: null });
}

// A boost tapped in the tray. One the kid can't afford is not spent: the
// tray closes and `lockedTaps` goes up by one (the robot shakes his head
// with his `no-gears` line, else "hmm no", character.js speakerLocked;
// the gear counter flickers, feedback.js). "Remember this one" makes the
// slots that aren't locked glow for the kid to pick one (onBoostSlot);
// "First letter" and "Clean-up" happen at once.
function onBoostPick(kind) {
    if (state.screen !== 'play' || state.boostMenu !== 'tray') return;
    const { current } = state;
    if (!boostOn(current) || !offered(current).includes(kind)) {
        setState({ boostMenu: null });
        return;
    }
    if (!canAfford(state.gears, kind)) {
        setState({ boostMenu: null, lockedTaps: state.lockedTaps + 1 });
        return;
    }
    if (kind === 'remember') setState({ boostMenu: 'pick' });
    else pay(kind, kind === 'first' ? giveLetter(current, 0) : cleanUp(current));
}

// A glowing slot tapped after "Remember this one": the robot puts its
// right letter there (boost.js giveLetter), also when it was already
// there.
function onBoostSlot(index) {
    if (state.screen !== 'play' || state.boostMenu !== 'pick') return;
    if (!boostOn(state.current) || !pickable(state.current).includes(index)) {
        setState({ boostMenu: null });
        return;
    }
    pay('remember', giveLetter(state.current, index));
}

// The boost happens: its gears are taken (gears.js spend) and `next`
// (the word after it) is shown, in one setState with the count after it.
// The word notes which boost it took (`boostKind`: his line, B-224). The
// robot's boostGiven (character.js) and the motion (feedback.js) key on
// the change. Not enough gears in the store after all: nothing is spent,
// as onBoostPick.
function pay(kind, next) {
    const gears = spendGears(COSTS[kind]);
    if (gears === null) setState({ boostMenu: null, lockedTaps: state.lockedTaps + 1 });
    else setState({ boostMenu: null, gears, current: { ...next, boostKind: kind } });
}

// --- The TV (BACKLOG B-214, tv.js) ---

// tv.js tells when a new word's picture has locked at the end of its
// tune-in (or of its fade in under reduced motion): the robot's "Picture
// shown" moment plays on the change (character.js). tv.js stops a tune-in
// when the word or the screen changes, so the call is always about the
// word now showing.
function onTuned() {
    if (state.screen === 'play' && !state.tuned) setState({ tuned: true });
}

// --- Round-end screen ---

const STAR = 'M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z';

// A sticker (amber disc with a light star; class `off`: dark), the icon
// for "sticker" on every screen.
function sticker(off = false) {
    const el = document.createElement('span');
    el.className = off ? 'sticker off' : 'sticker';
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg>`;
    return el;
}

// The theme's stages as a row of bulbs (BACKLOG B-216; DESIGN "Other
// screens" conventions): one bulb per stage in `stages` (stage.js
// stagesOf: the stages the theme's data has words in), lit when it is in
// `cleared`, dark when not. The bulbs are kept and updated in place
// (made or removed only when the count changes), so a re-render never
// replaces a bulb celebrate.js is popping; each carries its stage in
// data-stage for it. No text: the stage is only in aria-label.
function renderStageBulbs(el, stages, cleared) {
    while (el.children.length > stages.length) el.lastElementChild.remove();
    while (el.children.length < stages.length) el.appendChild(document.createElement('span'));
    stages.forEach((stage, i) => {
        const lit = cleared.includes(stage);
        const bulb = el.children[i];
        bulb.className = lit ? 'bulb' : 'bulb off';
        bulb.dataset.stage = String(stage);
        bulb.setAttribute('aria-label', `stage ${stage}: ${lit ? 'cleared' : 'not cleared'}`);
    });
    el.setAttribute('aria-label', `stages cleared: ${stages.filter((s) => cleared.includes(s)).length} / ${stages.length}`);
}

// Stars, the theme's stage bulbs, the score as split-flaps, the
// new-sticker count (a sticker and "+N", the sticker dark at +0; only a
// clean word can be new in the book, BACKLOG B-218) and one row per word
// (thumbnail, word, a sticker if the word is new in the book, a lit or
// dark bulb); the round's gears beside the count are cogs.js's. No
// English (DESIGN "Words on screen"): only the words and numbers.
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
    renderStageBulbs($('round-stages'), stagesOf(state.data), state.round.cleared || []);
    renderFlaps($('round-score'), `${correct} / ${size}`);
    const fresh = results.filter((r) => r.correct && r.newSticker).length;
    const news = $('round-new');
    news.innerHTML = '';
    news.setAttribute('aria-label', `new stickers: ${fresh}`);
    news.appendChild(sticker(fresh === 0));
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `+${fresh}`;
    news.appendChild(count);

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
            const badge = sticker();
            badge.setAttribute('aria-label', 'new sticker');
            li.appendChild(badge);
        }

        // lit bulb: checked correct; dark bulb: missed (the lives bulbs' look)
        const bulb = document.createElement('span');
        bulb.className = ok ? 'bulb' : 'bulb off';
        bulb.setAttribute('aria-label', ok ? 'correct' : 'wrong');
        li.appendChild(bulb);

        list.appendChild(li);
    });
}

// New round in the same theme: new random words, hearts and results
// reset by startRound, at the theme's current stage (progress.js
// currentStage, BACKLOG B-216), so after a round that cleared its stage
// it is the next one; also after a replay of a cleared stage (B-217
// leaves play again as B-216 made it). Falls back to the theme screen if
// the theme is somehow missing from state.themes.
function onPlayAgain() {
    const theme = state.themes.find((t) => t.name === state.theme);
    if (theme) startRound(theme);
    else onThemes();
}

// The theme screen, from the round-end (themes) or the stage screen's
// back arrow (BACKLOG B-217): no theme, no round.
function onThemes() {
    leaveRound({ screen: 'theme', theme: null });
}

// No round in play any more: the word clip stops and the round's data,
// words, results and word are cleared, with `patch` (the screen to show,
// and on the theme screen no theme) in the same setState.
function leaveRound(patch) {
    stopWord();
    setState({
        ...patch,
        data: null,
        words: [],
        round: { index: 0, size: ROUND_SIZE, stage: null, results: [], cleared: [], justCleared: false },
        current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },
        pressed: null,
        speaking: false,
        idleBeat: null,
        nudges: 0,
        tuned: false,
        boostMenu: null,
    });
}

// --- Header: the play screen's back button (BACKLOG B-201, B-217) ---

// Leave the round for the theme's stage screen at once (B-217; it went
// to the theme screen until then), no confirmation. The unfinished round
// is dropped: the stickers it added to the book (words spelled clean
// this round that were not in the book before, marked `newSticker` by
// onCheck) come out again, and leaveRound stops the word clip and clears
// the round (words, results, current word), so no stars, stickers or
// results are kept; the theme stays, for its stage map. A sticker the
// book already had stays, and so do the gears its words earned (never
// lost, BACKLOG B-218); the round's own gears were never earned.
// Pending timers find the round gone: the dome's
// checks the screen, the idle timer ends off the play screen, and the
// robot drops his waiting steps when the screen changes (character.js).
function onPlayBack() {
    if (state.screen !== 'play') return;
    for (const r of state.round.results) {
        if (r && r.correct && r.newSticker) removeSticker(state.theme, r.word);
    }
    leaveRound({ screen: 'stages' });
}

// --- Header: the mute toggle (BACKLOG B-108, B-108b) ---

// The toggle shows the speaker glyph and the switch with its knob right,
// or the muted speaker and the knob left while muted (class is-muted; CSS
// shows one of the two icons and one of the two switch images). On every
// screen.
function renderMute(state) {
    const btn = $('mute-btn');
    btn.classList.toggle('is-muted', state.muted);
    btn.setAttribute('aria-pressed', String(state.muted));
}

// Flip the flag and remember it. Muting while the word plays ends it
// (audio.js stops every sound on mute), so the speaker goes back to off.
function onMute() {
    const muted = !state.muted;
    saveMuted(muted);
    setState(muted ? { muted, speaking: false } : { muted });
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

// The taps the boost tray hands back (boosttray.js).
const BOOST_TAPS = { onPick: onBoostPick, onSlot: onBoostSlot };

subscribe(renderScreens);
subscribe((s) => renderStart(s, START));
subscribe(renderPlayerButton);
subscribe(renderThemeButtons);
subscribe(renderCard);
subscribe((s) => renderBoost(s, BOOST_TAPS));   // after the card render: places the boost tray and the glowing slots on it
subscribe(renderFeedback);    // after the card render: keys off its DOM (and the boost tray's)
subscribe((s) => renderTv(s, onTuned));   // after the card render: tunes in to its picture
subscribe(renderPicture);     // after the TV: the picture's life once it has locked (BACKLOG B-221), its win (B-222)
subscribe(renderControls);
subscribe((s) => renderRobot(s, peekLine));   // his idle peeks whisper (audio.js, B-224)
subscribe(renderRoundEnd);
subscribe(renderGears);       // before celebrate.js, which flies cogs to the console's counter
subscribe(renderGallery);
subscribe((s) => renderStageMap(s, onStation));
subscribe(renderCelebrate);   // after the card and round-end renders: keys off their DOM
subscribe(renderMute);
subscribe(renderSound);       // the robot's clips (character.js's table) and the mute

// Every frame, the robot shows his voice (BACKLOG B-210): audio.js's
// analyser samples of the clip he is saying, or null, to character.js.
// Render input only, never state.
gsap.ticker.add(() => renderTalk(voiceWave()));

$('check-btn').addEventListener('click', onDome);
$('reset-btn').addEventListener('click', onLever);
$('speak-btn').addEventListener('click', onSpeak);
$('play-again-btn').addEventListener('click', onPlayAgain);
$('themes-btn').addEventListener('click', onThemes);
$('stickers-btn').addEventListener('click', onStickers);
$('gallery-back-btn').addEventListener('click', onGalleryBack);
$('stages-back-btn').addEventListener('click', onThemes);
$('mute-btn').addEventListener('click', onMute);
$('player-btn').addEventListener('click', onSwitchPlayer);
$('picker-back-btn').addEventListener('click', onPickBack);
$('play-back-btn').addEventListener('click', onPlayBack);
$('console-gears').addEventListener('click', onBoost);
$('boost-scrim').addEventListener('click', onBoostClose);
// Any touch, click or key counts as input for the idle timer (capture:
// seen before a block or a control handles it).
document.addEventListener('pointerdown', onInput, true);
document.addEventListener('keydown', onInput, true);

renderScreens(state);
// Preload the clips (nothing plays until the first gesture), then the
// remembered mute flag. No level is read any more (BACKLOG B-215): a
// `flip.level` left in the browser by an earlier version is ignored.
initAudio();
setState({ muted: loadMuted() });
// The players on this device, for the start screen's cards (players.js).
setState({ players: loadPlayers().list });
// The kid's progress per theme (progress.js, BACKLOG B-217), for the
// theme cards' bulbs and the stage map.
setState({ progress: loadProgress() });
// The kid's gears (gears.js, BACKLOG B-218), for the gear counters.
setState({ gears: loadGears() });
loadThemes();

// Box sizing depends on the row width (layout.js); re-render on rotate,
// and the boost tray or its glowing slots follow (boosttray.js).
window.addEventListener('resize', () => {
    renderCard(state);
    renderBoost(state, BOOST_TAPS);
});

// The picture's life (picture.js, BACKLOG B-221) and its win (B-222) stop
// while the page is hidden; the life starts again when it shows.
document.addEventListener('visibilitychange', () => renderPicture(state));

// Dev hook for tools/shot.mjs --eval only: lets a screenshot script drive
// screens through setState. Nothing in the game reads window.flip.
window.flip = { state, setState };
