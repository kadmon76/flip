# Flip — contract for agents

## What this is
A web spelling game for kids aged 9–10, native Hebrew speakers, beginners
in English, playing alone on a phone at home. A card shows a picture; the
player drags letter tiles into boxes to spell the English word. A round is
5 words and ends with stars. Mastered words become stickers in a sticker
book. Each theme climbs through stages of harder words; playing earns
gears that buy help from the robot (PROGRESSION.md). The game is playful
and quirky; the character (voice clips now, a visual mascot later) is
the reason the kid keeps playing.
"Done" for M1: theme → 5-word round → round-end with stars → juice
(sounds, wiggle, confetti) → sticker book in localStorage, all working on
a phone.

## Stack and hard constraints
- Stack: Django 4.2 (Python 3.12, `venv/`), SQLite, django.contrib.auth.
  Frontend is vanilla JS ES modules, no build step, no framework.
  Drag-and-drop is GSAP Draggable loaded from cdnjs (already in the template).
- Server Python is 3.8 (the Linode serves the preview and the live site); local dev is 3.12. Python code must stay 3.8-compatible (no `match`, no `X | Y` type unions, no 3.9+ stdlib APIs) and requirements must install on 3.8. A branch that breaks this shows "preview failed" in the run ping.
- Runs on: phone browser, portrait, 360px wide and up (primary). Desktop
  must work but is not optimised.
- Browser floor: iOS Safari 16.2+ / Chrome 111+. CSS or JS newer than the floor needs a fallback or a DECISIONS entry naming the browsers it drops.
- Content for M1: `static/config/themes.json` (theme index) and `static/data/*.json` (words) plus the existing images and sounds
  under `static/images/` and `static/sounds/`. Read-only: do not add, edit,
  regenerate or rename content or assets in M1.
- Never: a build step; new dependencies (pip, npm or CDN) without a
  DECISIONS entry; login required to play; analytics or tracking; editing
  code on the server; `fix*.js` or patch files (fix the source); Python
  outside `venv/`.
- Frontend architecture (static/js/):
  - `state.js` is the only place state is mutated (`setState`). No game state on DOM elements, in classes or in module globals. A module may keep a render cache (what it last rendered, e.g. `tiles` in card.js, `last` in celebrate.js) so it can tell a transition from a re-render; nothing reads such a cache as truth.
    Subscribers may keep a memo of the last state they rendered or heard (`builtThemes` in main.js, `last` in audio.js); a memo is overwritten on every setState, is never read by another module, and is never a source of truth.
  - A render module may hold a DOM cache (an element map or the last-rendered reference) that is rebuilt from state on every render and never read to decide game logic; mark it with a "DOM cache" comment. Anything else in a module global is state and belongs in state.js.
  - `audio.js` may hold audio engine handles: the word clip it is playing (`wordClip`) so it can stop or replace it, and for the pooled clips the Web Audio context (`ctx`), the downloaded bytes and decoded buffers (`bytes`, `buffers`) and the sources now playing (`live`; the TV's tune-in hiss, B-214, joins it so the mute stops it). They are not game state, no other module reads them, nothing decides game logic from them, and whether the word is playing lives in state (`speaking`).
  - Every screen is a render of state. `screens.js` shows/hides screens and mirrors `state.screen` onto `<body data-screen>` as a CSS-only hook (written on every render, never read by a script),
    `card.js` renders the card, boxes and tray, `drag.js` handles drag and
    snap, `main.js` wires it.
  - `layout.js` is pure sizing helpers (no DOM): `slotLayout` (the B-213 ladder: slot sizes, grid places, the brass joint), `blockLayout`, and `slotArea`/`dropsIn` (a slot's drop area); `card.js` and `drag.js` apply its results, a Django test runs it through `node`.
  - `score.js` is pure round scoring (`starsFor`), no DOM; a Django test runs it through `node`.
  - `flaps.js` `renderFlaps(el, text)` is the only helper that writes a number as split-flap `.flap` characters on the interim screens (round-end score, sticker book counts); no state, no module globals, rebuilt on every call; a Django test runs it through `node` with a fake DOM. `card.js`'s counter keeps its own `renderCounter` until folded.
  - `controls.js` renders the console controls (`#check-btn` dome, `#reset-btn` lever, `#speak-btn` speaker) from `current`, `pressed` and `speaking` in state; its rules (`domeAction`, `domeState`, `canReset`, `leverState`, `speakerState`, `speakerAction`, `PRESS_MS`) are pure, no DOM (`speakerAction(current)` plays the word on every stage, before and after it is answered, B-215), and a Django test runs them through `node`.
  - `stickers.js` is the only place the sticker book (localStorage key `flip.stickers.v1`) is read or written; no DOM, no module state. Other modules call `load()`/`has()`/`add()`/`remove()`/`all()`; nothing else touches that key.
  - `stage.js` is a theme's stages (B-215, PROGRESSION.md "Stages"): `STAGES` (`[1, 2, 3, 4, 5, 'long']`), `stagesOf(data)` (the stages a theme's data has words in, in that order), `isStage` and `stageRules(stage)` (PROGRESSION.md's table as `{ givenFirst, extras }`; anything that is not a stage gets stage 1's). A round's rules come from `stageRules(state.round.stage)`, for every word of the round. No DOM, no module state; a Django test runs it through `node`. Nothing reads or writes localStorage `flip.level` any more (a stale value is ignored).
  - `round.js` sets up a round: `pickRound(data, size, stage, missed, solved)` (which words, PROGRESSION.md "Rounds": the first `MISSED_BACK` (2) of the theme's missed words that the data still has, the other places by `pickWords(data, size, stage, solved)` over the theme's other words, where a missed word past the first two counts as any word of its stage; with no missed word it is `pickWords` exactly; `pickWords` takes the stage's words not in `solved` (progress.js), then its solved words, then the earlier stages' words (the nearest first), then, only while places are left, the later stages' words (the nearest first), then words with no stage, each group at random, all shuffled; by the data's `stage` only, never `difficulty`) and `makeWord(entry, stage, newId)` (a word's blocks and slots, and its `break` (B-213), with a console warning for a 9–10 letter word without one; by `stageRules(stage)`: `givenFirst` gives the first letter, locked; `extraLetters` adds `extras` blocks marked `extra`, letters not in the word, partners from `CONFUSIONS` first); it also exports `shuffle`. Pure, no DOM, no module state; a Django test runs it through `node`.
  - `missed.js` is the only place localStorage `flip.missed.v1` (the missed words per theme, `{ "<theme>": [word, ...] }`, the oldest miss first) is read or written (`load`/`wordsFor`/`record`; `afterRound(words, results)` is the pure part). No DOM, no module state; a Django test runs it through `node`. main.js reads `wordsFor(theme)` in `startRound` and calls `record(theme, results)` once, in `onNext`'s round-end branch, so a round left with the back button records nothing.
  - `progress.js` is the only place localStorage `flip.progress.v1` (the kid's progress per theme, `{ "<theme>": { "solved": [word, ...], "cleared": [stage, ...] } }`) is read or written, every read and write in try/catch (`load`/`forTheme`/`record`); `currentStage(data, progress)` (the first stage of `stagesOf(data)` not cleared; all cleared, the last) and `afterRound(progress, data, stage, results)` (the words checked correct join `solved`; only the round's `stage` can join `cleared`, once all its words in the data are solved; returns `{ progress, justCleared }`) are the pure part. No DOM, no module state; a Django test runs it through `node`. main.js reads `forTheme(theme)` in `startRound` (the round's stage, and `solved` for `pickRound`) and calls `record(theme, data, stage, results)` once, in `onNext`'s round-end branch after missed.js `record`, so a round left with the back button records nothing; the round keeps `cleared` and `justCleared` in state for the round-end's stage bulbs.
  - drag.js's state transitions (`isLocked`, `placeIn`, `takeOut`, `afterMove`, `checkedWrong`, `returnAll`, `afterHint`, `revealed`) and the lever rule `leverResult(current)` (which placed letters a pull sends back and which lock) are pure, no DOM; a Django test runs them through `node`. The lever rule is PROGRESSION.md's, the same on every stage (B-215b), with no level or stage argument, from two facts on `current`: `rightAtCheck` (per slot, the tile id the word's last wrong check found right there, else null; null before any wrong check; set by `checkedWrong`, which main.js `onCheck` applies to a wrong check) and `justPulled` (true after a pull, `returnAll`; false after any block move, `placeIn`, `takeOut`, `giveHint`, and after a wrong check). With `justPulled` a pull starts over: everything goes back, letters a pull locked too, and `rightAtCheck` is cleared. Otherwise, after a wrong check, the blocks of `rightAtCheck` still in their own slot stay and lock and everything else goes back, also blocks moved or placed since; before any wrong check everything goes back. The given letter, the hint letter and a boost's letter (`boost`, B-219) never go back.
  - `gallery.js` renders the sticker book screen (`#screen-gallery`) from `state.themes[].words` and `stickers.load()` on every render while `state.screen === 'gallery'`; it never mutates state and keeps no cache. `themeProgress(book, theme, words)` is the pure part (no DOM); a Django test runs it through `node`.
  - `feedback.js` is the only place one-shot motion keyed on a state transition starts (wrong wiggle, bulb flicker, TV static, reveal fly-in, the second-miss hop-back and fly-in (B-206), reset-lever rail shake and hop, the lock clunk (B-211), the brass joint's glow on a new broken word (B-213) now; correct pulse, confetti and star pop in B-110), except the robot's poses and slides, which start in `character.js` (B-115), and the TV's tune-in on a new word, which starts in `tv.js` (B-214). It is a subscriber after `renderCard`, keeps only a render cache of the current word's key and the last status, lives, `pressed` and placement, and never mutates state. `newlyLocked(prevPlaced, placed)` is pure (no DOM, no GSAP); a Django test runs it through `node`. It may put the motion-only class `landing` on a block (the robot's letter in flight, a letter during its clunk) and always removes it by the end of that motion; game.css reads it, no script does.
  - `tv.js` is the TV's motion (B-214; `design/reference/tv-motion.html` layer 1, its numbers): `renderTv(state, onLock)`, a subscriber after `renderCard`, starts the tune-in only on a new word (a transition against its render cache, the word it last showed) and draws it into the `.tv-tune` canvas, one frame per animation frame until the lock and no longer, calling audio.js `hiss` as it starts; at the lock it calls `onLock` (main.js `onTuned`, which sets `tuned`: the robot's "Picture shown" plays on that change) and starts the quiet bar (`.tv-roll`) and dim flicker, which stop when the word or the screen changes. It never mutates state. Besides its render cache and DOM cache it may hold one drawing handle, the running tune-in (`run`: its frame request, its waiting call, the reduced-motion fade); no other module reads it, nothing decides game logic from it, and whether the picture has locked lives in state (`tuned`). Its numbers (`TUNE`, `QUIET`) and drawing helpers (`levels`, `drawTune`, `clockStep`, `barStep`, `canvasSize`, `fitRect`, `tubeEllipse`, `shade`, `quietWait`, `flickers`) are pure, no DOM; a Django test runs them through `node`.
  - `audio.js` is the only place sounds play. Its subscriber `renderSound` plays `MOMENTS[moment].sound` (through character.js `momentsFor`/`soundsFor`) and keeps no trigger list of its own; `hiss(ms)` is the TV's tune-in hiss, made in code, which tv.js calls as a tune-in starts (B-214). It is the only module that reads or writes localStorage `flip.muted` (`loadMuted`/`saveMuted`).
  - `celebrate.js` is the only place the correct-check and round-end celebrations run (box pulse, confetti, star pop, and the pop of the stage bulb a round just cleared, B-216). It is a state subscriber that fires only on a transition it detects against what it last rendered (status became 'correct', screen became 'round-end'); a re-render in the same state must not replay a celebration.
  - `character.js` is the only place the robot's poses and moves are decided: tables of the puppet's numbers from `design/reference/robot-puppet.html` (`HANDS`, `EYES`, `BROWS`, `TIMING`, `AMBIENT`, `FX`, `PEEK`, `AIM`, `TALK`), one moment table (`MOMENTS`: moment → timed steps or random variants, plus a sound) and pure helpers (`snapshot`, `momentsFor`, `blockEntered`, `soundsFor`, `idleWait`, `nudgeWait`, `variantsOf`, `pickVariant`, `stepsOf`, `scriptFor`, `isChange`, `startDelay`, `reducedStep`, `fxFor`, `handPose`, `handsSink`, `eyeShape`, `browPose`, `pct`, `aimAt`, `loudness`, `smoothLevel`, `browRide`, `scopeLine`, `talkLights`, `nodDue`) that a Django test runs through `node`. `renderRobot` is a subscriber that plays a moment only on a transition it detects against its render cache (the last snapshot and the time of its last pose change, used only to keep changes 300ms apart); it never mutates state, and his current pose lives only on the `.robot` class. main.js owns the kid-idle timer, the dome-nudge timer and the input listener that write `lastInput`, `idleBeat` and `nudges`.

## How to work
- Read BACKLOG.md, pick the first unblocked item, do only that item.
- Follow DESIGN.md for anything visual. Follow ~/agent-platform/docs/ask-rule.md
  and question-protocol.md for decisions and questions.
- Follow CHARACTER.md for anything the robot does.
- Branch: `agent/<backlog-id>-<slug>`. Never commit to main.
- Every change must be seen: run the app
  (`venv/bin/python manage.py runserver 0.0.0.0:8000`), take phone-size
  screenshots of the affected screens per DESIGN.md "Screenshots", attach
  them to the PR.
- Tests: `venv/bin/python manage.py check && venv/bin/python manage.py test`
  must pass before a PR is opened. Frontend logic that has no DOM
  dependency (round scoring, stars, mastery, tray/placement helpers) gets
  a Django test that runs it through `node` where practical; otherwise the
  acceptance criteria are verified by screenshots.
- Open PRs as drafts. PR body: what changed, screenshots, DECISIONS made,
  reviewer verdict. A human reviews and merges every PR; agents never merge.

## Definition of done for a backlog item
- Acceptance criteria in BACKLOG.md met and demonstrated in screenshots
- Reviewer subagent approved
- DECISIONS.md updated if any choice was made
- BACKLOG.md item marked `done: <pr-url>`

## Ownership of the tracking files
- DECISIONS.md is append-only. Add entries at the end; never edit or
  delete earlier entries. Use today's date and the backlog id.
- BACKLOG.md `status:` lines are written only by the orchestrator at ship
  time (`done: <pr-url>`) or when blocking (`blocked: #<issue>`). The
  implementer and reviewer never touch `status:`.
- The implementer may add items to "Later / not now" if it notices work
  that is out of scope, one line each, no acceptance criteria.

## Product rules
- Free to play without login. Login only to save progress or the sticker
  book to the server (not in M1).
- Mobile-first, touch-first. Drag must feel good on a phone.
- Short sessions: rounds of 5 words, then a round-end screen.
- Mistakes: 3 hearts per word. A wrong check costs one heart,
  tiles stay so the kid can fix them. Third miss reveals the word and it
  counts as not mastered. A word's sticker needs a clean spelling: correct
  on the first check, with no boost (PROGRESSION.md; from B-218, until
  then correct with a heart left).
- Progression (M4, PROGRESSION.md is the source): no level picker; each
  theme's stages open in order, and cleared stages stay open for replay.
  The word is always hearable, on every stage.
- Rewards: stars per round and stickers in the book (cosmetic), and gears,
  earned only by playing, never lost, spent only on boosts. All themes are
  open. No real money.
- No English on screen except the target word and the logo; numbers
  allowed. Everything else is an icon, light, sound, motion or the robot
  (DESIGN.md 'Words on screen').

## Project-specific rules (grow this from review feedback)
- Do not rename the existing DOM ids in `templates/spelling_game/index.html`
  (`screen-*`, `letter-boxes`, `letter-tray`, `word-counter`, `check-btn`,
  `play-again-btn`, `themes-btn`, `round-stars`, `round-score`, `round-new`, `round-words`,
  `stickers-btn`, `gallery-back-btn`, `gallery-empty`, `gallery-themes`,
  `reset-btn`, `speak-btn`, `mute-btn`, `play-back-btn`) without a DECISIONS entry; card.js, controls.js, main.js and gallery.js key on
  them. `next-btn` and `result-line` were removed by B-114 (the check dome is also next); `level-picker`, `level-easy`, `level-normal`, `level-hard` (and the nudge's `level-up-btn`) by B-215 (stages replace the level picker).
- Sound files under `static/sounds/` are the character's voice. Play the
  ones that exist; never add, trim or re-encode them in M1.
- The robot lives behind the console's left third, a puppet in two layers inside `.console`, which has no z-index (B-115, B-210): his body and head (`.robot`, z-index -2) are drawn under the console image (`.console-body`, z-index -1), the rail, the bench blocks and the controls; his hands (`.robot-hands`, z-index -1, after the console image) are drawn over the console's top edge, resting on it, and still under the rail, the bench blocks and the controls. Neither layer takes taps. He never covers the rail, a bench block or a console control's tap area. At rest no block overlaps him; only the top of his pop-up on 9–10 letter words passes under the second block row.
