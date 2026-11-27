// main.js — wiring: theme selection and the theme's stage map (BACKLOG
// B-217: a theme card opens its stage screen, a station there starts a
// round of its stage), round flow (its progress recorded at the round
// end; the struggle help, BACKLOG B-220: after three words in a row that
// were not clean the next two are easier ones), the console controls
// (check dome, reset lever, speaker), the header's mute toggle and the
// play screen's back button, the kid-idle
// timer, the dome-nudge timer and the press timer (BACKLOG B-226) for the
// robot and his voice's frames,
// the TV's lock (tv.js) and the picture's life after it (picture.js,
// BACKLOG B-221) with its win on a correct check (BACKLOG B-222; each
// word's own, from the theme's wins file, B-228, its sounds audio.js's),
// screen renders. The kid's gears (gears.js,
// BACKLOG B-218): a word's at its correct check, the round's at its end,
// kept in state.gears for the gear counters (cogs.js); and spent on boosts
// (BACKLOG B-219, boost.js, boosttray.js): the boost button, its tray and
// the boost itself. The round's bulbs (bulbs.js, BACKLOG B-231): 3 and the
// player's spare bulbs for the whole round, one off per wrong check; the
// round ends when the last goes off; a perfect round earns a spare. The
// boss at the end of every stage (BACKLOG B-232, boss.js; the thief bot,
// a memory game against his clock): started from the stage map's station
// of a cleared stage whose boss waits, or the round end's thief button;
// its beats (flip, pair, miss and his swap, a fake caught, the ending,
// his escape) are timers here, its screen bossview.js's and bossfx.js's.
// The game slot (BACKLOG B-233, games.js; PROGRESSION.md "Games"): a
// round plays one game, picked as it starts (round.game); the play
// screen's taps and each word's start reach it through PLAYS, and every
// game writes a word's result through settle and ends the round through
// onNext. Only classic is built.

import { state, setState, subscribe } from './state.js';
import { renderScreens } from './screens.js';
import { renderCard } from './card.js';
import { checkedWrong, returnAll, giveHint, afterHint, revealed } from './drag.js';
import { renderFeedback } from './feedback.js';
import { renderTv } from './tv.js';
import { renderPicture } from './picture.js';
import { winsUrl } from './wins.js';
import { renderControls, domeAction, canReset, speakerAction, PRESS_MS } from './controls.js';
import { speakWord, stopWord, init as initAudio, renderSound, loadMuted, saveMuted, voiceWave, peekLine, winSound, bossTick } from './audio.js';
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
import { renderRobot, renderTalk, idleWait, nudgeWait, pressWait, pressDue, wordKey, IDLE_MS } from './character.js';
import { stagesOf } from './stage.js';
import { pickRound, makeWord, swapForStruggle } from './round.js';
import { wordsFor as missedWords, record as recordMissed } from './missed.js';
import { forTheme as progressFor, currentStage, record as recordProgress, load as loadProgress, stations, recordBoss, bossLossesOf } from './progress.js';
import { load as loadPlayers, add as addPlayer, select as selectPlayer, markTutored } from './players.js';
import { renderCoach, resetCoach } from './coach.js';
import { load as loadKeys, open as openTheme, record as recordKeys, isOpen, held as keysHeld } from './keys.js';
import { load as loadSpares, record as recordBulbs, startBulbs, afterCheck, missKind, roundOver, BULBS } from './bulbs.js';
import { renderLocks, padlock } from './locks.js';
import { rulesOf, dealDeck, judge, swapPick, swapCards, startClock, withEvent, hold, release, thiefAt, reachesAt,
    bossStars, pairGears, BOSS_GEARS, BEAT, KNOCK, PUSH, zapMs, pairMs, swapMs, fakeMs, entranceMs } from './boss.js';
import { renderBoss, renderBossClock } from './bossview.js';
import { renderBossFx } from './bossfx.js';
import { thiefFace } from './thief.js';
import { unlocked as unlockedGames, playable, pickGame, resultOf, CLASSIC } from './games.js';
import { load as loadLastGame, record as recordGame } from './lastgame.js';
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
            btn.dataset.theme = theme.name;
            btn.setAttribute('aria-label', theme.name);
            if (theme.image) {
                const img = document.createElement('img');
                img.src = theme.image;
                img.alt = '';
                btn.appendChild(img);
            }
            // shown while the theme is locked (locks.js, keys.js)
            btn.appendChild(padlock());
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
        screen: 'theme', players: players.list, player: players.current, picking: false, naming: null, theme: null,
        progress: loadProgress(), gears: loadGears(), keys: loadKeys(),
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

// A picture picked: the name step for it (start.js), the kid types their
// name (human, 2026-10-24).
function onPickPic(pic) {
    if (state.screen !== 'start') return;
    setState({ naming: pic });
}

// Go on the name step (or the keyboard's enter): a new player with the
// picture and the typed name (players.js cleans it; it may be empty),
// playing at once. The first player on the device takes over the saves
// made before players existed. The field's text is read only here, at
// the tap, as the kid's input; it is not game state.
function onNameOk() {
    if (state.screen !== 'start' || !state.naming) return;
    const name = $('player-name').value;
    const players = addPlayer(state.naming, [STICKERS_KEY, PROGRESS_KEY, GEARS_KEY, MISSED_KEY], name);
    if (players) startAs(players);
}

function onNameBack() {
    if (state.screen !== 'start') return;
    setState({ naming: null });
}

function onPickBack() {
    if (state.screen !== 'start') return;
    setState({ picking: false });
}

// The first word's tutorial (coach.js; human, 2026-10-24): for a player
// who has not seen it and has solved no word yet (a kid with progress
// from before players knows the game), on the first word of their round.
function needsTutorial() {
    const me = (state.players || []).find((p) => p.id === state.player);
    if (!me || me.tutored) return false;
    return Object.values(state.progress || {}).every((t) => !t || !Array.isArray(t.solved) || t.solved.length === 0);
}

// The tutorial's word is answered (correct or revealed): it never comes
// back for this player.
function tutorialSeen() {
    if (!state.tutorial) return;
    const players = markTutored(state.player);
    if (players) setState({ players: players.list });
}

// The theme screen's player button: back to the start screen, to switch.
function onSwitchPlayer() {
    if (state.screen !== 'theme') return;
    setState({ screen: 'start', picking: false, naming: null, players: loadPlayers().list });
}

const START = { onPlayer, onNew: onNewPlayer, onPick: onPickPic, onPickBack };

// --- Stage screen (BACKLOG B-217, stagemap.js) ---

// A theme card opens the theme's stage map; no round starts yet. A
// locked theme's card (keys.js; human, 2026-10-24) opens the theme
// instead while the kid holds a key: the key is used, the padlock pops
// off (celebrate.js) and the robot says his theme-open line; the kid taps
// again to play it. With no key, a locked card does nothing.
function onTheme(theme) {
    if (state.screen !== 'theme') return;
    if (!isOpen(theme.name, state.keys, state.progress)) {
        if (keysHeld(state.keys, state.progress) > 0) setState({ keys: openTheme(theme.name, state.progress) });
        return;
    }
    setState({ screen: 'stages', theme: theme.name });
}

// A station: a round of its stage, if the stage is open (cleared, or the
// theme's current stage; progress.js stations, from the same
// state.progress the map shows); a cleared stage whose boss is not beaten
// yet starts its boss instead (BACKLOG B-232: the thief on its station).
// A not-open station is disabled anyway.
function onStation(stage) {
    if (state.screen !== 'stages') return;
    const theme = state.themes.find((t) => t.name === state.theme);
    if (!theme) return;
    const station = stations(theme.stages, state.progress[theme.name]).find((s) => s.stage === stage && s.open);
    if (!station) return;
    if (station.boss) startBoss(theme, stage);
    else startRound(theme, stage);
}

// The theme's wins file (BACKLOG B-228: each word's own win, wins.js), at
// wins.js winsUrl beside its data file, or null when it has none (a
// missing or broken file is none: those words play the shared win).
function loadWins(dataUrl) {
    const url = winsUrl(dataUrl);
    if (!url) return Promise.resolve(null);
    try {
        return fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
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
    // data shape: { "duck": { image, audio, stage, break }, ... }; the
    // theme's wins file (BACKLOG B-228) comes with it, or none
    const winsFile = loadWins(dataUrl);
    let data;
    try {
        data = await fetch(dataUrl).then((r) => r.json());
    } catch (e) {
        setState({ startingRound: false });
        throw e;
    }
    const wins = await winsFile;
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
    // cleared, or whose boss is not beaten yet (BACKLOG B-232: the boss
    // guards the next stage; progress.js currentStage; all done: the last
    // one), so after a clear, play again replays the stage until its boss
    // is beaten, then starts the next one. A replay of a
    // cleared stage records its solved words at the round end and clears
    // nothing new (progress.js afterRound). Its rules (stage.js
    // stageRules) start every word of the round (round.js makeWord): on
    // stage 1 the first letter is given, on stages 3-5 extra letters lie
    // on the bench. The words (round.js pickRound, PROGRESSION.md
    // "Rounds"): up to two of the words this theme's earlier rounds
    // missed come back, in random places, if their stage is this one or
    // an earlier one (missed.js; BACKLOG B-208; human 2026-10-25), then
    // the stage's words not yet solved (progress.js), its solved words,
    // the earlier stages' words, and only while places are left the later
    // stages'.
    // A long word's `break` (BACKLOG B-213) says where its slots go to a
    // second row (round.js makeWord, layout.js slotLayout).
    const progress = progressFor(name);
    const stage = chosen === null ? currentStage(data, progress) : chosen;
    // The round's game (BACKLOG B-233, games.js pickGame; PROGRESSION.md
    // "Games"), fixed for the round (round.game): mostly classic, now and
    // then another game the player has unlocked (games.js unlocked, by the
    // stages open in any theme, state.progress; playable), never two
    // recognition rounds in a row and never the same game other than
    // classic twice (the last round's game, lastgame.js, kept per player
    // and recorded now). The tutorial word's round is always classic. The
    // game's first word starts through the slot (PLAYS); a game whose words
    // are the solved words ('solved') brings its own words with its item:
    // only classic, a 'round' game, is built.
    const tutorial = needsTutorial();
    const game = tutorial ? CLASSIC : pickGame(playable(unlockedGames(state.progress, state.themes), state.progress), loadLastGame());
    recordGame(game);
    const words = pickRound(data, ROUND_SIZE, stage, missedWords(name), progress.solved)
        .map((word) => ({ word, image: data[word].image, audio: data[word].audio, break: data[word].break }));
    // The round's bulbs (BACKLOG B-231, bulbs.js startBulbs): 3 and the
    // player's spare bulbs, for the whole round (state.lives, the ones
    // still lit; round.bulbs, how many the TV shows).
    const bulbs = startBulbs(loadSpares());
    stopWord();
    setState({
        theme: name,
        data,
        wins,
        words,
        screen: 'play',
        round: { index: 0, size: ROUND_SIZE, stage, bulbs, results: [], cleared: [], justCleared: false, keyEarned: false, spareEarned: false, game },
        current: playOf(game).word(words[0], stage),
        tutorial,
        lives: bulbs,
        pressed: null,
        speaking: false,
        roundsStarted: state.roundsStarted + 1,
        lastInput: performance.now(),
        idleBeat: null,
        nudges: 0,
        filledNudged: false,
        tuned: false,
        boostMenu: null,
        startingRound: false,
    });
    armIdle();
}

// --- The game slot (BACKLOG B-233, games.js) ---

// What each game of games.js GAMES plays: how a word of it starts
// (`word(entry, stage)`: its `current`) and the play screen's taps it
// handles. Only classic for now: its words are round.js makeWord's, its
// taps the console's (the dome, the lever, the speaker) and the boosts'
// (the boost button, its tray, its glowing slots and its scrim). Every
// game of GAMES has an entry; a later game adds its own.
const PLAYS = {
    classic: {
        word: (entry, stage) => makeWord(entry, stage, newTileId),
        dome: onDome,
        lever: onLever,
        speak: onSpeak,
        boost: onBoost,
        boostPick: onBoostPick,
        boostSlot: onBoostSlot,
        boostClose: onBoostClose,
    },
};

// The play of `game` (PLAYS); classic's for a game it has no entry for,
// and with no round in play (round.game null), where its taps find no
// round and do nothing, as before the slot.
function playOf(game) {
    return PLAYS[game] || PLAYS[CLASSIC];
}

// A tap on the play screen, handed to the round's game (round.game):
// its handler `name` with `args`, if it has one.
function tap(name, ...args) {
    const play = playOf(state.round.game);
    if (play[name]) play[name](...args);
}

// The one way every game writes a word's result (BACKLOG B-233): into
// round.results at the round's index (a wrong check's result is replaced
// by the word's next check), made by games.js resultOf from exactly
// classic's fields (word, correct, clean, boosted; a game that gives no
// `clean` or `boosted` gets false; a recognition game's result also gets
// counts: false). A correct word earns what it
// always did, now: its sticker when it is clean and counts (stickers.js
// add, PROGRESSION.md "Repetition and stickers": newSticker, true only if
// the book did not have it yet; never for a word that took a miss or a
// boost, BACKLOG B-218, B-219, nor for a recognition game's) and its gears
// (gears.js wordGears: 1, and 1 more when clean, a recognition game's
// too), so a round left with the back button keeps them (B-201 takes back
// only its stickers). Returns the patch for the game's own setState: the
// round with its results and, on a correct word, the gear count after
// them (celebrate.js flies cogs to it). Every game then ends the word
// with onNext, which ends the round as it always did (bulbs.js roundOver).
function settle({ word, correct, clean = false, boosted = false }) {
    const { round } = state;
    const results = [...round.results];
    const result = resultOf(round.game, { word, correct, clean, boosted });
    results[round.index] = result;
    if (!result.correct) return { round: { ...round, results } };
    result.newSticker = result.clean && result.counts !== false && addSticker(state.theme, result.word);
    return { round: { ...round, results }, gears: addGears(wordGears(result)) };
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
    const { current, lives } = state;
    if (!current.placed.every(Boolean)) return;
    if (current.status !== 'playing') return;

    const answer = current.placed.map((p) => p.letter).join('');
    const correct = answer === current.word;
    // clean (BACKLOG B-218, gears.js isClean): checked correct on the
    // word's first check (none of the word's own wrong checks yet,
    // `current.misses`; the round's bulbs are counted apart, BACKLOG
    // B-231), with no boost; boosted (BACKLOG B-219, boost.js isBoosted):
    // the word took a boost, so it still counts for its stage and earns
    // its correct-word gear, but no clean gear and no sticker. The result
    // goes into round.results through the slot's settle (BACKLOG B-233),
    // which on a correct word also adds its sticker and its gears.
    const misses = current.misses || 0;
    const boosted = isBoosted(current);
    const clean = isClean(correct, misses, boosted);
    const settled = settle({ word: current.word, correct, clean, boosted });
    // A wrong check (BACKLOG B-231, bulbs.js): one of the round's bulbs
    // goes off (afterCheck; none on the tutorial word) and the word counts
    // one more miss of its own; what it does to the word (missKind) is the
    // word's own rule: its second miss brings the robot's letter, its third
    // reveals it, and so does the round's last bulb going off (the round
    // then ends after it, onNext).
    const missed = misses + 1;
    const left = correct ? lives : afterCheck(lives, false, state.tutorial);
    const kind = correct ? null : missKind(missed, left);

    if (correct) {
        // settle added the word's sticker (only a clean word's) and its
        // gears; state.gears is the count after them.
        setState({ ...settled, current: { ...current, status: 'correct' }, ...extra });
        tutorialSeen();
        armNudge();
    } else if (kind === 'reveal') {
        setState({ lives: left, ...settled, current: { ...revealed(current), misses: missed }, ...extra });
        tutorialSeen();
        armNudge();
    } else {
        // The word's own second miss also gives one letter, on every
        // stage (BACKLOG B-206, drag.js giveHint): in the same setState,
        // so the robot (character.js hintGiven) and the fly-in
        // (feedback.js) see it with the miss. A word then checked correct
        // is solved as any other, but not clean: it earns no sticker and
        // no clean gear (BACKLOG B-218). The check notes the letters it
        // found right, the ones the lever keeps (drag.js checkedWrong,
        // BACKLOG B-215b).
        const checked = { ...checkedWrong(current), misses: missed };
        setState({ lives: left, ...settled, current: kind === 'hint' ? giveHint(checked) : checked, ...extra });
        // With extras his letter can finish the word, in place of an extra
        // letter (BACKLOG B-207, drag.js afterHint): the word then reopens
        // and the dome lights at once. Its own setState, after the
        // miss's, so the robot, the sound and the motion see the miss.
        const reopened = afterHint(state.current);
        if (reopened !== state.current) setState({ current: reopened });
    }
}

// Next word, or the round-end screen after the fifth, or sooner when the
// round's last bulb has gone off (BACKLOG B-231, bulbs.js roundOver: the
// word it went off on was revealed; the words not reached are not played,
// have no result and are recorded as nothing, not as missed). The dome
// offers it only after a correct answer or a reveal, so every word has a
// result by then; one without would count as wrong. The word clip stops
// with its word. At the round end the theme's missed words are recorded (missed.js,
// BACKLOG B-208): the words not checked correct are remembered, the ones
// checked correct come out (not in a recognition game, BACKLOG B-233:
// its results have counts: false); and so is its progress (progress.js,
// BACKLOG B-216): the words checked correct are solved (again not a
// recognition game's), and the round's stage is
// cleared once all its words are; the round keeps the theme's cleared
// stages and whether this round cleared its own, for the round-end's
// stage bulbs, and state.progress is read again for the theme cards and
// the stage map (BACKLOG B-217); and reaching the round end earns the
// round's gears (gears.js GEARS.round, BACKLOG B-218; its words' gears
// were added at their checks); and the spare bulbs (bulbs.js record,
// BACKLOG B-231): the round's spares still lit are kept and a perfect
// round earns one (round.spareEarned, popped in by celebrate.js). A
// round left with the back button never gets here, so it records
// nothing and earns no round gears (B-201). The round's bulbs carry on to
// the next word, which starts by the round's stage rules, as the first did (BACKLOG
// B-215). Before it starts, the struggle help (BACKLOG B-220, round.js
// swapForStruggle; PROGRESSION.md "Guardrails"): when this word and the
// two before it were not clean (a wrong check, a boost or a reveal), the
// next two words are swapped for solved words of the theme's earlier
// stages (progress.js: the solved words as the round started; nothing is
// recorded before its end), in the same setState as the next word, with
// no sign to the kid. Not on stage 1, nor when no earlier word is solved.
// The words swapped out have no result, so the round end records nothing
// about them: they stay unsolved and come back in a later round. Every
// game ends its words and its round here (BACKLOG B-233): a word without
// a result gets one as settle makes it (games.js resultOf), and the next
// word starts through the round's game (PLAYS).
function onNext(extra = {}) {
    const { round, current } = state;
    const results = [...round.results];
    if (!results[round.index]) results[round.index] = resultOf(round.game, { word: current.word, correct: false, clean: false });

    stopWord();
    const nextIndex = round.index + 1;
    if (roundOver(state.lives, round.index, round.size)) {
        recordMissed(state.theme, results);
        const { progress, justCleared } = recordProgress(state.theme, state.data, round.stage, results);
        // theme keys (keys.js; human, 2026-10-24): a first stage cleared,
        // or the safety key after rounds with none
        const all = loadProgress();
        const keys = recordKeys(state.progress, all, (state.themes || []).map((t) => t.name));
        const spare = recordBulbs(state.lives, results, round.size);
        setState({
            round: { ...round, results, cleared: progress.cleared, justCleared, keyEarned: keys.earned, spareEarned: spare.earned },
            progress: all,
            keys: keys.ring,
            gears: addGears(GEARS.round),
            screen: 'round-end',
            tutorial: false,
            speaking: false,
            idleBeat: null,
            nudges: 0,
            filledNudged: false,
            boostMenu: null,
            ...extra,
        });
    } else {
        const words = swapForStruggle(state.words, round.index, results, state.data, round.stage, progressFor(state.theme).solved);
        setState({
            words,
            round: { ...round, index: nextIndex, results },
            current: playOf(round.game).word(words[nextIndex], state.round.stage),
            tutorial: false,
            speaking: false,
            lastInput: performance.now(),
            idleBeat: null,
            nudges: 0,
            filledNudged: false,
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

// --- The robot's press nudge (BACKLOG B-226, character.js) ---

// Memo (CLAUDE.md "Subscribers may keep a memo"): the word state
// (`current`) this subscriber last heard, so only a new one arms the press
// timer. Overwritten on every setState; never read by another module.
let pressHeard = null;

// The press timer: when a new word state has every slot filled on a word
// the robot points at the dome on (character.js pressWait: the first
// rounds, not the tutorial word, not checked yet, his press nudge not come
// yet on this word), a random 4-7s later `filledNudged` is set (his
// filledNudge moment: a rare press line), if the word is still in that
// very state and the dome not pressed (pressDue): a block moved, a check,
// a lever pull or a boost since makes a new `current` and cancels it.
// Nothing else is kept outside state: the word state it was armed on
// lives in the timer's own closure.
function armPress(s) {
    const before = pressHeard;
    pressHeard = s.current;
    if (s.current === before) return;
    const wait = pressWait(s);
    if (wait === null) return;
    const armed = s.current;
    setTimeout(() => {
        if (pressDue(state, armed)) setState({ filledNudged: true });
    }, wait);
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

// Stars, the spare bulb a perfect round earned beside them (BACKLOG
// B-231, round.spareEarned; celebrate.js pops it in), the theme's stage
// bulbs, the score as split-flaps (the words solved out of the round's
// size, also when its bulbs ran out early), the
// new-sticker count (a sticker and "+N", the sticker dark at +0; only a
// clean word can be new in the book, BACKLOG B-218) and one row per word
// played (thumbnail, word, a sticker if the word is new in the book, a lit
// or dark bulb; a word the round did not reach, its bulbs gone, has no
// row); the round's gears beside the count are cogs.js's. No
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
    $('round-spare').hidden = !state.round.spareEarned;
    // the thief (BACKLOG B-232): a round that just cleared its stage
    // offers its boss straight away, his face drawn in code (made once)
    const bossBtn = $('boss-btn');
    bossBtn.hidden = !(state.round.justCleared && bossWaits(state, state.theme, state.round.stage));
    if (!bossBtn.hidden && !bossBtn.firstElementChild) bossBtn.appendChild(thiefFace());
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
        if (!results[i]) return;
        const ok = !!results[i].correct;
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

        // lit bulb: checked correct; dark bulb: missed (the TV's bulbs' look)
        const bulb = document.createElement('span');
        bulb.className = ok ? 'bulb' : 'bulb off';
        bulb.setAttribute('aria-label', ok ? 'correct' : 'wrong');
        li.appendChild(bulb);

        list.appendChild(li);
    });
}

// New round in the same theme: new random words, the round's bulbs (its
// spares too, BACKLOG B-231) and results reset by startRound, at the theme's current stage (progress.js
// currentStage, BACKLOG B-216), so after a round that cleared its stage
// it is that stage again until its boss is beaten (BACKLOG B-232: the
// round end's thief button starts the boss), then the next one; also
// after a replay of a cleared stage (B-217 leaves play again as B-216
// made it). Falls back to the theme screen if
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
        wins: null,
        words: [],
        round: { index: 0, size: ROUND_SIZE, stage: null, bulbs: BULBS, results: [], cleared: [], justCleared: false, keyEarned: false, spareEarned: false, game: null },
        current: { word: null, image: null, audio: null, placed: [], tray: [], status: 'playing' },
        pressed: null,
        speaking: false,
        idleBeat: null,
        nudges: 0,
        filledNudged: false,
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
    if (state.screen === 'boss') {
        leaveBoss();
        return;
    }
    if (state.screen !== 'play') return;
    for (const r of state.round.results) {
        if (r && r.correct && r.newSticker) removeSticker(state.theme, r.word);
    }
    leaveRound({ screen: 'stages' });
}

// --- The boss: the thief bot (BACKLOG B-232, PROGRESSION.md "Bosses") ---

// Whether the boss of `theme`'s `stage` waits (its stage cleared, its boss
// not beaten yet; progress.js stations), from state.progress.
function bossWaits(s, theme, stage) {
    const t = (s.themes || []).find((x) => x.name === theme);
    return !!t && stations(t.stages, (s.progress || {})[theme]).some((x) => x.stage === stage && x.boss);
}

// What the robot says reading a card (audio.js: the word's own clip, his
// voice), `at` seconds into its beat.
const sayOf = (card, at = 0) => ({ word: card.word, audio: card.audio, at });

// `fn` after `ms`, if the boss and its beat are still the ones playing
// now (a beat a newer one replaced, his escape, leaving the boss: nothing).
// Nothing is kept outside state: the run and the beat live in the timer's
// own closure, as armIdle's word does.
function bossLater(ms, fn) {
    const { run, beat } = state.boss;
    const seq = beat.seq;
    setTimeout(() => {
        const b = state.boss;
        if (state.screen === 'boss' && b && b.run === run && b.beat.seq === seq) fn();
    }, ms);
}

// The boss of `stage` in `theme` (a station of a cleared stage whose boss
// waits, the round end's thief button, play again on its end card): the
// theme's data file, the deck (boss.js dealDeck: the stage's words, its
// missed words first, its fakes; rulesOf, slower after losses, progress.js
// bossLossesOf), then the boss screen at once with its entrance; his clock
// starts once the cards are dealt (entranceMs). A round in play is
// dropped as the back arrow drops it (leaveRound). One start at a time,
// as startRound (`startingRound`); a kid who left meanwhile starts none.
async function startBoss({ name, dataUrl }, stage) {
    if (state.startingRound) return;
    const from = state.screen;
    setState({ startingRound: true });
    let data;
    try {
        data = await fetch(dataUrl).then((r) => r.json());
    } catch (e) {
        setState({ startingRound: false });
        throw e;
    }
    if (state.screen !== from || state.theme !== name) {
        setState({ startingRound: false });
        return;
    }
    const rules = rulesOf(stage, bossLossesOf(progressFor(name), stage));
    const known = (state.themes || []).flatMap((t) => (t.words || []).map((w) => w.word));
    const deck = dealDeck(data, stage, missedWords(name), known, rules);
    const run = (state.bossRuns || 0) + 1;
    leaveRound({
        screen: 'boss',
        theme: name,
        bossRuns: run,
        startingRound: false,
        boss: {
            run, theme: name, stage, rules, cards: deck.cards, pairs: deck.pairs,
            phase: 'entrance', busy: true, holds: [], clock: null,
            up: [], gone: [], found: 0, row: 0, gears: 0,
            caught: null, shown: [], fixed: [], stars: 0, card: false,
            beat: { kind: 'entrance', seq: 1 },
        },
    });
    bossLater(entranceMs(deck.cards.length), () => {
        const b = state.boss;
        const now = performance.now();
        const clock = startClock(now, b.rules.secs);
        setState({ boss: { ...b, phase: 'play', busy: false, clock: b.holds.length ? withEvent(clock, 'stop', now) : clock,
            beat: { kind: 'start', seq: b.beat.seq + 1 } } });
    });
}

// A card tapped: it flips (two at most; not while a beat plays). On
// stages 1-2 (rules.read 'flip') the robot reads a word card as it flips;
// a fake is never read. Two up: they are judged BEAT.flip later.
function onBossCard(id) {
    const b = state.boss;
    if (state.screen !== 'boss' || !b || b.phase !== 'play' || b.busy) return;
    if (b.up.includes(id) || b.gone.includes(id) || b.up.length >= 2) return;
    const card = b.cards.find((c) => c.id === id);
    if (!card) return;
    const up = [...b.up, id];
    const two = up.length === 2;
    const say = card.kind === 'word' && b.rules.read === 'flip' ? sayOf(card) : null;
    setState({ boss: { ...b, up, busy: two, beat: { kind: 'flip', seq: b.beat.seq + 1, id, say } } });
    if (two) bossLater(BEAT.flip, judgeBoss);
}

// The two cards up (boss.js judge): a pair, a fake caught or a miss.
function judgeBoss() {
    const b = state.boss;
    const [a, c] = b.up.map((id) => b.cards.find((x) => x.id === id));
    const kind = judge(a, c);
    const seq = b.beat.seq + 1;
    if (kind === 'pair') bossPair(b, a, c, seq);
    else if (kind === 'fake') bossFake(b, a.kind === 'fake' ? a : c, a.kind === 'fake' ? c : a, seq);
    else bossMiss(b, seq);
}

// A pair: the robot says the word, the zap flies (bossfx.js) and he is
// knocked back as it lands (a 'knock' dated then; boss.js thiefAt), further
// for a second pair in a row; the pair leaves the table; its gears now
// (gears.js add: boss.js pairGears). He stops for the beat and walks on
// after it (hold, release). The last pair: he is beaten, recorded now
// (progress.js recordBoss, so leaving during the ending keeps it) with the
// win's gears and the stars by where he was (bossStars), then the ending.
function bossPair(b, a, c, seq) {
    const now = performance.now();
    const row = b.row + 1;
    const found = b.found + 1;
    const last = found >= b.pairs;
    const big = row >= 2 || last;
    const ms = zapMs(big);
    const earned = pairGears(row) + (last ? BOSS_GEARS.win : 0);
    let next = hold({ ...b, found, row, gone: [...b.gone, a.id, c.id], gears: b.gears + earned }, 'pair', now);
    next = { ...next, clock: withEvent(next.clock, 'knock', now + ms, KNOCK.by * (big ? KNOCK.big : 1)) };
    const patch = { gears: addGears(earned) };
    if (last) {
        next = hold({ ...next, stars: bossStars(thiefAt(b.clock, now).p) }, 'end', now);
        recordBoss(b.theme, b.stage, true);
        patch.progress = loadProgress();
    }
    setState({ ...patch, boss: { ...next, beat: { kind: 'pair', seq, ids: [a.id, c.id], big, last, say: sayOf(a.kind === 'word' ? a : c) } } });
    if (last) bossLater(ms + KNOCK.ms, bossEnding);
    else bossLater(pairMs(big), () => setState({ boss: { ...release(state.boss, 'pair', performance.now()), up: [], busy: false } }));
}

// A fake with its own word's picture: its wrong letters red, the bubble
// with the right spelling (bossview.js), the robot says the right word,
// he laughs and jumps ahead (a 'push' as the fake's shake ends); then the
// two cards turn back, the fake stays on the table.
function bossFake(b, fake, pic, seq) {
    const f = BEAT.fake;
    const clock = withEvent(b.clock, 'push', performance.now() + f.shake, PUSH.by);
    setState({ boss: { ...b, row: 0, caught: fake.id, clock,
        beat: { kind: 'fake', seq, id: fake.id, pic: pic.id, say: sayOf(fake, f.shake / 1000) } } });
    bossLater(fakeMs(), () => {
        setState({ boss: { ...state.boss, caught: null, up: [] } });
        bossLater(f.turn, () => setState({ boss: { ...state.boss, busy: false } }));
    });
}

// Any other two: he laughs, they turn back, then he hops onto the table
// and swaps two face-down cards in plain sight (boss.js swapPick: none
// when fewer than 3 are face down), stopped meanwhile.
function bossMiss(b, seq) {
    const m = BEAT.miss;
    setState({ boss: { ...b, row: 0, beat: { kind: 'miss', seq } } });
    bossLater(m.laugh, () => {
        setState({ boss: { ...state.boss, up: [] } });
        bossLater(m.turn, () => {
            const w = state.boss;
            const pick = swapPick(w.cards, w.up, w.gone);
            if (!pick) {
                setState({ boss: { ...w, busy: false } });
                return;
            }
            const next = hold({ ...w, cards: swapCards(w.cards, pick[0], pick[1]) }, 'swap', performance.now());
            setState({ boss: { ...next, beat: { kind: 'swap', seq: w.beat.seq + 1, ids: pick } } });
            bossLater(swapMs(), () => setState({ boss: { ...release(state.boss, 'swap', performance.now()), busy: false } }));
        });
    });
}

// The end (BACKLOG B-232): the fakes still on the table turn face up
// together, their wrong letters red; one by one each fixes itself (its
// letters, the robot says the word, it zaps him); then the final big zap,
// he bursts, the part drops into the console's window ('won'), and the end
// card. With no fakes left, straight to the final zap.
function bossEnding() {
    const b = state.boss;
    const fakes = b.cards.filter((c) => c.kind === 'fake' && !b.gone.includes(c.id)).map((c) => c.id);
    setState({ boss: { ...b, phase: 'ending', up: [], caught: null, shown: fakes, beat: { kind: 'show', seq: b.beat.seq + 1 } } });
    if (fakes.length) bossLater(BEAT.ending.show, () => bossFix(fakes, 0));
    else bossBurst();
}

function bossFix(fakes, i) {
    const b = state.boss;
    const card = b.cards.find((c) => c.id === fakes[i]);
    setState({ boss: { ...b, fixed: [...b.fixed, card.id],
        beat: { kind: 'fix', seq: b.beat.seq + 1, id: card.id, say: sayOf(card, BEAT.ending.swap / 1000) } } });
    bossLater(BEAT.ending.fix, () => (i + 1 < fakes.length ? bossFix(fakes, i + 1) : bossBurst()));
}

function bossBurst() {
    const b = state.boss;
    const e = BEAT.ending;
    setState({ boss: { ...b, phase: 'burst', beat: { kind: 'burst', seq: b.beat.seq + 1 } } });
    bossLater(e.swell + e.drop, () => {
        const w = state.boss;
        setState({ boss: { ...w, phase: 'won', beat: { kind: 'won', seq: w.beat.seq + 1 } } });
        bossLater(e.card, () => setState({ boss: { ...state.boss, card: true } }));
    });
}

// He reached the vent: he dives in with the part. Lost (progress.js
// recordBoss: one more loss; the gears earned stay), the end card offers
// a retry.
function bossEscape() {
    const b = state.boss;
    const e = BEAT.escape;
    recordBoss(b.theme, b.stage, false);
    setState({ progress: loadProgress(), boss: { ...hold(b, 'end', performance.now()), phase: 'escape', busy: true, up: [], caught: null,
        beat: { kind: 'escape', seq: b.beat.seq + 1 } } });
    bossLater(e.laugh + e.dive, () => {
        const w = state.boss;
        setState({ boss: { ...w, phase: 'lost', beat: { kind: 'lost', seq: w.beat.seq + 1 } } });
        bossLater(e.card, () => setState({ boss: { ...state.boss, card: true } }));
    });
}

// Memo (CLAUDE.md "Subscribers may keep a memo"): the boss clock this
// subscriber last heard, so only a new one arms the escape timer.
// Overwritten on every setState; never read by another module.
let clockHeard = null;

// The escape timer: on every new clock of a boss in play (he started,
// stopped, walked on, was knocked back or pushed), when he would reach
// the vent if nothing else happened (boss.js reachesAt); then, if that
// clock is still the boss's and he is there (thiefAt), his escape. A new
// clock arms its own; nothing else is kept outside state.
function armEscape(s) {
    const b = s.screen === 'boss' ? s.boss : null;
    const clock = b && b.phase === 'play' ? b.clock : null;
    if (clock === clockHeard) return;
    clockHeard = clock;
    if (!clock) return;
    const wait = () => {
        const w = state.boss;
        if (state.screen !== 'boss' || !w || w.clock !== clock || w.phase !== 'play') return;
        const now = performance.now();
        if (thiefAt(clock, now).p >= 1) {
            bossEscape();
            return;
        }
        const at = reachesAt(clock, now);
        if (at !== null) setTimeout(wait, Math.max(16, at - now));
    };
    const at = reachesAt(clock, performance.now());
    if (at !== null) setTimeout(wait, Math.max(16, at - performance.now()));
}

// The page hidden (another app, the phone locked): the thief stops until
// it shows again (hold 'away'), so a boss is never lost away from it.
function onBossAway(hidden) {
    const b = state.boss;
    if (state.screen !== 'boss' || !b || (b.phase !== 'entrance' && b.phase !== 'play')) return;
    const now = performance.now();
    setState({ boss: hidden ? hold(b, 'away', now) : release(b, 'away', now) });
}

// Back to the theme's stage map (the header's back arrow, the end card's
// back): the boss dropped, nothing recorded that was not already (a win
// or a loss is recorded as it happens; the gears earned stay).
function leaveBoss() {
    setState({ screen: 'stages', boss: null });
}

function onBossBack() {
    if (state.screen === 'boss') leaveBoss();
}

// The end card's play again: the same boss again, a new deck.
function onBossAgain() {
    const b = state.boss;
    if (state.screen !== 'boss' || !b || !b.card) return;
    const theme = state.themes.find((t) => t.name === b.theme);
    if (theme) startBoss(theme, b.stage);
}

// The round end's thief button: the boss of the stage the round just
// cleared.
function onRoundBoss() {
    if (state.screen !== 'round-end') return;
    const theme = state.themes.find((t) => t.name === state.theme);
    if (theme) startBoss(theme, state.round.stage);
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

// The taps the boost tray hands back (boosttray.js), for the round's
// game (tap, BACKLOG B-233).
const BOOST_TAPS = { onPick: (kind) => tap('boostPick', kind), onSlot: (index) => tap('boostSlot', index) };
// The boss screen's card taps (bossview.js).
const BOSS_TAPS = { onCard: onBossCard };

subscribe(renderScreens);
subscribe((s) => renderStart(s, START));   // after renderScreens: focuses the name field once it shows
subscribe(renderPlayerButton);
subscribe(renderThemeButtons);
subscribe(renderCard);
subscribe((s) => renderBoost(s, BOOST_TAPS));   // after the card render: places the boost tray and the glowing slots on it
subscribe(renderFeedback);    // after the card render: keys off its DOM (and the boost tray's)
subscribe((s) => renderTv(s, onTuned));   // after the card render: tunes in to its picture
subscribe((s) => renderPicture(s, winSound));   // after the TV: the picture's life once it has locked (BACKLOG B-221), its win (B-222; a word's own, B-228) and the win's sounds
subscribe(renderControls);
subscribe(renderCoach);       // after the card and the controls: the ghost mitten finds the tiles, slots and dome
subscribe((s) => renderRobot(s, peekLine));   // his idle peeks whisper (audio.js, B-224)
subscribe(armPress);          // his press nudge, a while after every slot is filled (B-226)
subscribe(renderRoundEnd);
subscribe(renderLocks);       // after the theme cards and the round-end render, before celebrate.js (it pops the round's key)
subscribe(renderGears);       // before celebrate.js, which flies cogs to the console's counter
subscribe(renderGallery);
subscribe((s) => renderStageMap(s, onStation));
subscribe((s) => renderBoss(s, BOSS_TAPS));   // the boss screen (BACKLOG B-232)
subscribe(renderBossFx);      // after the boss render: its beats' motion
subscribe(armEscape);         // the thief reaching the vent
subscribe(renderCelebrate);   // after the card and round-end renders: keys off their DOM
subscribe(renderMute);
subscribe(renderSound);       // the robot's clips (character.js's table) and the mute

// Every frame, the robot shows his voice (BACKLOG B-210): audio.js's
// analyser samples of the clip he is saying, or null, to character.js.
// Render input only, never state.
gsap.ticker.add(() => renderTalk(voiceWave()));
// Every frame on the boss screen, the thief's place from his clock (BACKLOG
// B-232: a pure function of time, boss.js thiefAt; never a setState), the
// lamps behind him and his ticking (audio.js bossTick).
gsap.ticker.add(() => renderBossClock(state, performance.now(), bossTick));

// The play screen's console taps go to the round's game (tap, BACKLOG
// B-233).
$('check-btn').addEventListener('click', () => tap('dome'));
$('reset-btn').addEventListener('click', () => tap('lever'));
$('speak-btn').addEventListener('click', () => tap('speak'));
$('play-again-btn').addEventListener('click', onPlayAgain);
$('themes-btn').addEventListener('click', onThemes);
$('stickers-btn').addEventListener('click', onStickers);
$('gallery-back-btn').addEventListener('click', onGalleryBack);
$('stages-back-btn').addEventListener('click', onThemes);
$('mute-btn').addEventListener('click', onMute);
$('player-btn').addEventListener('click', onSwitchPlayer);
$('picker-back-btn').addEventListener('click', onPickBack);
$('namer-ok-btn').addEventListener('click', onNameOk);
$('namer-back-btn').addEventListener('click', onNameBack);
$('player-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onNameOk(); } });
$('play-back-btn').addEventListener('click', onPlayBack);
$('console-gears').addEventListener('click', () => tap('boost'));
$('boss-btn').addEventListener('click', onRoundBoss);
$('boss-back-btn').addEventListener('click', onBossBack);
$('boss-again-btn').addEventListener('click', onBossAgain);
$('boost-scrim').addEventListener('click', () => tap('boostClose'));
// Any touch, click or key counts as input for the idle timer (capture:
// seen before a block or a control handles it).
document.addEventListener('pointerdown', onInput, true);
document.addEventListener('keydown', onInput, true);

renderScreens(state);
// The players on this device, for the start screen's cards (players.js),
// first: the start screen's first render already shows them, so a
// returning player's start does not fetch the new-player picker's
// pictures (BACKLOG B-229).
setState({ players: loadPlayers().list });
// The sounds (audio.js; nothing plays until the first gesture, and since
// BACKLOG B-229 nothing downloads until the page is idle), then the
// remembered mute flag. No level is read any more (BACKLOG B-215): a
// `flip.level` left in the browser by an earlier version is ignored.
initAudio();
setState({ muted: loadMuted() });
// The kid's progress per theme (progress.js, BACKLOG B-217), for the
// theme cards' bulbs and the stage map.
setState({ progress: loadProgress() });
// The player's theme keys (keys.js; human, 2026-10-24), for the locked
// theme cards and the key holder.
setState({ keys: loadKeys() });
// The kid's gears (gears.js, BACKLOG B-218), for the gear counters.
setState({ gears: loadGears() });
loadThemes();

// Box sizing depends on the row width (layout.js); re-render on rotate,
// and the boost tray or its glowing slots follow (boosttray.js).
window.addEventListener('resize', () => {
    renderCard(state);
    resetCoach();
    renderCoach(state);
    renderBoost(state, BOOST_TAPS);
});

// The picture's life (picture.js, BACKLOG B-221) and its win (B-222,
// B-228) stop while the page is hidden; the life starts again when it
// shows.
document.addEventListener('visibilitychange', () => {
    renderPicture(state, winSound);
    onBossAway(document.hidden);
});

// Dev hook for tools/shot.mjs --eval only: lets a screenshot script drive
// screens through setState. Nothing in the game reads window.flip.
window.flip = { state, setState };
