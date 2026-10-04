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
- Runs on: phone browser, portrait, 360px wide and up (primary). Desktop
  must work but is not optimised.
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
  - Every screen is a render of state. `screens.js` shows/hides screens,
    `card.js` renders the card, boxes and tray, `drag.js` handles drag and
    snap, `main.js` wires it.
  - `layout.js` is pure sizing helpers (no DOM); `card.js` applies its result, a Django test runs it through `node`.
  - `score.js` is pure round scoring (`starsFor`), no DOM; a Django test runs it through `node`.
  - `stickers.js` is the only place the sticker book (localStorage key `flip.stickers.v1`) is read or written; no DOM, no module state. Other modules call `load()`/`has()`/`add()`/`all()`; nothing else touches that key.
  - `gallery.js` renders the sticker book screen (`#screen-gallery`) from `state.themes[].words` and `stickers.load()` on every render while `state.screen === 'gallery'`; it never mutates state and keeps no cache. `themeProgress(book, theme, words)` is the pure part (no DOM); a Django test runs it through `node`.
  - `feedback.js` is the only place one-shot motion keyed on a state transition starts (wrong wiggle now; correct pulse, confetti and star pop in B-110). It is a subscriber after `renderCard`, keeps only a render cache of the last status/lives, and never mutates state.
  - `audio.js` (to be created) is the only place sounds play.
  - `celebrate.js` is the only place the correct-check and round-end celebrations run (box pulse, confetti, star pop). It is a state subscriber that fires only on a transition it detects against what it last rendered (status became 'correct', screen became 'round-end'); a re-render in the same state must not replay a celebration.

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
  (`screen-*`, `letter-boxes`, `letter-tray`, `word-counter`, `result-line`, `check-btn`, `next-btn`,
  `play-again-btn`, `themes-btn`, `round-stars`, `round-score`, `round-new`, `round-words`,
  `stickers-btn`, `gallery-back-btn`, `gallery-empty`, `gallery-themes`,
  `reset-btn`, `speak-btn`) without a DECISIONS entry; card.js, main.js and gallery.js key on
  them. `next-btn` is removed by B-114 (the check dome is also next).
- Sound files under `static/sounds/` are the character's voice. Play the
  ones that exist; never add, trim or re-encode them in M1.
- The robot lives behind the console's left third; never place UI over
  him, the rail, the blocks or the console controls.
