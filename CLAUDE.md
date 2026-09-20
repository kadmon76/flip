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
  - `state.js` is the only place state is mutated (`setState`). No state on
    DOM elements, in classes or in module globals.
  - Every screen is a render of state. `screens.js` shows/hides screens,
    `card.js` renders the card, boxes and tray, `drag.js` handles drag and
    snap, `main.js` wires it.
  - `layout.js` is pure sizing helpers (no DOM); `card.js` applies its result, a Django test runs it through `node`.
  - `motion.js` is pure motion specs (durations, easings, scale; no DOM); `drag.js` and later animation code read them via `motionFor(kind, reduced)`, a Django test runs it through `node`.
  - `check.js` is the pure mistake rules (`HEARTS`, `checkWord`, `revealPlacement`, `resultText`; no DOM); `main.js` applies its result via `setState`, a Django test runs it through `node`.
  - `audio.js` (to be created) is the only place sounds play.
  - `script.js` and `ui.js` are old code for reference only. Do not import
    them. Delete each once nothing it does is still needed.

## How to work
- Read BACKLOG.md, pick the first unblocked item, do only that item.
- Follow DESIGN.md for anything visual. Follow ~/agent-platform/docs/ask-rule.md
  and question-protocol.md for decisions and questions.
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

## Project-specific rules (grow this from review feedback)
- Do not rename the existing DOM ids in `templates/spelling_game/index.html`
  (`screen-*`, `letter-boxes`, `letter-tray`, `word-counter`, `result-line`, `check-btn`, `next-btn`,
  `play-again-btn`) without a DECISIONS entry; card.js and main.js key on
  them.
- Sound files under `static/sounds/` are the character's voice. Play the
  ones that exist; never add, trim or re-encode them in M1.
- Keep the mascot corner free (see DESIGN.md "Mascot"). Do not put
  controls there.
