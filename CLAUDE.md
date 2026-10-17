# Flip — contract for agents

## What this is
A web spelling game for kids aged 9–10, native Hebrew speakers, beginners
in English, playing alone on a phone at home. A card shows a picture; the
player drags letter tiles into boxes to spell the English word. A round is
5 words and ends with stars. Mastered words become stickers in a sticker
book. The game is playful and quirky; the character (voice clips now, a
visual mascot later) is the reason the kid keeps playing.
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
  - `audio.js` may hold audio engine handles: the word clip it is playing (`wordClip`) so it can stop or replace it, and for the pooled clips the Web Audio context (`ctx`), the downloaded bytes and decoded buffers (`bytes`, `buffers`) and the sources now playing (`live`). They are not game state, no other module reads them, nothing decides game logic from them, and whether the word is playing lives in state (`speaking`).
  - Every screen is a render of state. `screens.js` shows/hides screens and mirrors `state.screen` onto `<body data-screen>` as a CSS-only hook (written on every render, never read by a script),
    `card.js` renders the card, boxes and tray, `drag.js` handles drag and
    snap, `main.js` wires it.
  - `layout.js` is pure sizing helpers (no DOM); `card.js` applies its result, a Django test runs it through `node`.
  - `score.js` is pure round scoring (`starsFor`), no DOM; a Django test runs it through `node`.
  - `flaps.js` `renderFlaps(el, text)` is the only helper that writes a number as split-flap `.flap` characters on the interim screens (round-end score, sticker book counts); no state, no module globals, rebuilt on every call; a Django test runs it through `node` with a fake DOM. `card.js`'s counter keeps its own `renderCounter` until folded.
  - `controls.js` renders the console controls (`#check-btn` dome, `#reset-btn` lever, `#speak-btn` speaker) from `current`, `pressed` and `speaking` in state; its rules (`domeAction`, `domeState`, `canReset`, `leverState`, `speakerState`, `speakerAction`, `PRESS_MS`) are pure, no DOM (`speakerAction` reads `levelRules` from level.js), and a Django test runs them through `node`.
  - `stickers.js` is the only place the sticker book (localStorage key `flip.stickers.v1`) is read or written; no DOM, no module state. Other modules call `load()`/`has()`/`add()`/`remove()`/`all()`; nothing else touches that key.
  - `level.js` is the only place localStorage `flip.level` is read or written (`loadLevel`/`saveLevel`, both in try/catch); `levelRules(level)` is the per-level rules table. Later items take a round's rules from `levelRules(state.round.level)`, not `state.level`. No DOM, no module state; a Django test runs it through `node`.
  - `round.js` sets up a round: `pickRound(data, size, level, missed)` (which words: the first `MISSED_BACK` (2) of the theme's missed words that the data still has, the other places by `pickWords(data, size, level)` (by the round's level) from the words not missed, then from the other missed words if those run out, all shuffled; with no missed word it is `pickWords` exactly) and `makeWord(entry, level, newId)` (a word's blocks and slots; on easy the first letter is given, locked; on hard `extraLetters` adds `levelRules(level).distractors` blocks marked `extra`, letters not in the word, partners from `CONFUSIONS` first); it also exports `shuffle`. Pure, no DOM, no module state; a Django test runs it through `node`.
  - `missed.js` is the only place localStorage `flip.missed.v1` (the missed words per theme, `{ "<theme>": [word, ...] }`, the oldest miss first) is read or written (`load`/`wordsFor`/`record`; `afterRound(words, results)` is the pure part). No DOM, no module state; a Django test runs it through `node`. main.js reads `wordsFor(theme)` in `startRound` and calls `record(theme, results)` once, in `onNext`'s round-end branch, so a round left with the back button records nothing.
  - drag.js's state transitions (`isLocked`, `placeIn`, `takeOut`, `afterMove`, `returnAll`, `afterHint`, `revealed`) and the lever rule `leverResult(level, current)` (which placed letters a pull sends back and which lock; reads `levelRules` from level.js; main.js calls it with `state.round.level`) are pure, no DOM; a Django test runs them through `node`.
  - `gallery.js` renders the sticker book screen (`#screen-gallery`) from `state.themes[].words` and `stickers.load()` on every render while `state.screen === 'gallery'`; it never mutates state and keeps no cache. `themeProgress(book, theme, words)` is the pure part (no DOM); a Django test runs it through `node`.
  - `feedback.js` is the only place one-shot motion keyed on a state transition starts (wrong wiggle, bulb flicker, TV static, reveal fly-in, the second-miss hop-back and fly-in (B-206), reset-lever rail shake and hop now; correct pulse, confetti and star pop in B-110), except the robot's poses and slides, which start in `character.js` (B-115). It is a subscriber after `renderCard`, keeps only a render cache of the current word's key and the last status, lives, `pressed` and placement, and never mutates state.
  - `audio.js` is the only place sounds play. Its subscriber `renderSound` plays `MOMENTS[moment].sound` (through character.js `momentsFor`/`soundsFor`) and keeps no trigger list of its own. It is the only module that reads or writes localStorage `flip.muted` (`loadMuted`/`saveMuted`).
  - `celebrate.js` is the only place the correct-check and round-end celebrations run (box pulse, confetti, star pop). It is a state subscriber that fires only on a transition it detects against what it last rendered (status became 'correct', screen became 'round-end'); a re-render in the same state must not replay a celebration.
  - `character.js` is the only place the robot's poses and moves are decided: tables of the puppet's numbers from `design/reference/robot-puppet.html` (`HANDS`, `EYES`, `BROWS`, `TIMING`, `AMBIENT`, `FX`, `PEEK`, `AIM`, `TALK`), one moment table (`MOMENTS`: moment → timed steps or random variants, plus a sound) and pure helpers (`snapshot`, `momentsFor`, `blockEntered`, `soundsFor`, `idleWait`, `variantsOf`, `pickVariant`, `stepsOf`, `scriptFor`, `isChange`, `startDelay`, `reducedStep`, `fxFor`, `handPose`, `handsSink`, `eyeShape`, `browPose`, `pct`, `aimAt`, `loudness`, `smoothLevel`, `browRide`, `scopeLine`, `talkLights`, `nodDue`) that a Django test runs through `node`. `renderRobot` is a subscriber that plays a moment only on a transition it detects against its render cache (the last snapshot and the time of its last pose change, used only to keep changes 300ms apart); it never mutates state, and his current pose lives only on the `.robot` class. main.js owns the kid-idle timer and the input listener that write `lastInput` and `idleBeat`.

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
- Mistakes (M1 mode): 3 hearts per word. A wrong check costs one heart,
  tiles stay so the kid can fix them. Third miss reveals the word and it
  counts as not mastered. A word counts as mastered only when checked
  correct with at least one heart left.
- Rewards are cosmetic only: stars per round, stickers in the book. All
  themes are always open. Nothing is gated.
- No English on screen except the target word and the logo; numbers
  allowed. Everything else is an icon, light, sound, motion or the robot
  (DESIGN.md 'Words on screen').

## Project-specific rules (grow this from review feedback)
- Do not rename the existing DOM ids in `templates/spelling_game/index.html`
  (`screen-*`, `letter-boxes`, `letter-tray`, `word-counter`, `check-btn`,
  `play-again-btn`, `themes-btn`, `round-stars`, `round-score`, `round-new`, `round-words`,
  `stickers-btn`, `gallery-back-btn`, `gallery-empty`, `gallery-themes`,
  `reset-btn`, `speak-btn`, `mute-btn`, `play-back-btn`, `level-picker`, `level-easy`, `level-normal`, `level-hard`) without a DECISIONS entry; card.js, controls.js, main.js and gallery.js key on
  them. `next-btn` and `result-line` were removed by B-114 (the check dome is also next).
- Sound files under `static/sounds/` are the character's voice. Play the
  ones that exist; never add, trim or re-encode them in M1.
- The robot lives behind the console's left third, a puppet in two layers inside `.console`, which has no z-index (B-115, B-210): his body and head (`.robot`, z-index -2) are drawn under the console image (`.console-body`, z-index -1), the rail, the bench blocks and the controls; his hands (`.robot-hands`, z-index -1, after the console image) are drawn over the console's top edge, resting on it, and still under the rail, the bench blocks and the controls. Neither layer takes taps. He never covers the rail, a bench block or a console control's tap area. At rest no block overlaps him; only the top of his pop-up on 7–10 letter words passes under the second block row.
