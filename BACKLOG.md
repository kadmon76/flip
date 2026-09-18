# Flip — backlog

Agents take the first item that has no `blocked:` and no `done:`.
Keep items small: one PR, one sitting. Each needs acceptance criteria.
`status:` lines are written by the orchestrator only (see CLAUDE.md).
Screenshots: 360x740 per DESIGN.md "Screenshots", under
`.agent/screenshots/<id>/`.

## M0 — plumbing test
### B-000 Add a health endpoint
- why: prove the agent loop end to end
- acceptance: GET /health returns JSON {"ok": true}; a test covers it; screenshot of the JSON in a phone-size browser exists
- status: done: https://github.com/kadmon76/flip/pull/2

## M1 — Playable round on a phone
Build order: tooling → theme → 5-word round → round-end → juice → sticker book.

### B-101 Screenshot tool and dev hook
- why: every later item must prove specific screen states (wrong, correct, revealed, 3 stars) in 360x740 screenshots; a plain headless `--screenshot` flag cannot drive state.
- acceptance:
  - `tools/shot.mjs <url> <out.png> [--eval '<js>'] [--wait <ms>]` exists. Node 22 only, no npm packages. It launches the headless Chromium under `~/.cache/ms-playwright/`, connects over the DevTools protocol, sets viewport 360x740 at device scale 2, runs `--eval` JS in the page if given, waits for `document.fonts.ready` plus `--wait` (default 300ms), saves a 720x1480 PNG, and exits non-zero on any failure.
  - `main.js` exposes `window.flip = { state, setState }` so `--eval` can drive screens. Nothing else reads `window.flip`.
  - A 5-line usage comment at the top of `tools/shot.mjs`.
  - Screenshots produced by the tool: `theme.png` (fresh load) and `play.png` (after `--eval` starts a round). Non-UI item: DESIGN checklist skipped; existing look is not yet restyled.
  - `manage.py check` and `manage.py test` pass.
- status:

### B-102 Remove legacy frontend files
- why: `script.js`, `ui.js`, `style.css`, `mobile-fixes.css` are old code that agents may copy from by mistake; the new modules already replace them.
- acceptance:
  - The four files are deleted. `index.html` loads only `game.css` and `main.js`. `grep -rn "script.js\|ui.js\|style.css\|mobile-fixes" templates static` returns nothing.
  - `static/js/data.js` is deleted if nothing imports it; otherwise it stays and this is noted in the handoff.
  - The game still runs: `theme.png` and `play.png` show the same layout as B-101's screenshots.
  - `manage.py check` and `manage.py test` pass.
- status:

### B-103 Theme screen to DESIGN
- why: the first thing the kid sees; sets the palette and type for every later screen.
- acceptance:
  - `game.css` defines the DESIGN.md palette as CSS variables on `:root` and uses them; no other colour literals remain in `game.css`.
  - Page background is the paper colour; header shows "Flip" in Fredoka One; body text 16px or larger.
  - One button per theme from `themes.json` (both existing themes appear), each a full-width card with 16px side gutters, at least 120px tall, showing the capitalised theme name and the image of the theme's first word. Tapping it starts a round.
  - At 1024px wide the content is centred with max width 480px (screenshot `theme-desktop.png` at 1024x740).
  - Bottom-left 96x96 mascot corner is empty.
  - Screenshots: `theme.png`, `theme-desktop.png`. Checklist passes.
- status:

### B-104 Play screen layout to DESIGN
- why: the core screen; must fit a phone without scrolling and use the palette.
- acceptance:
  - Layout top to bottom: card with image, hearts, word counter ("2 / 5"), letter boxes, letter tray, result line, Check and Next buttons. All visible without scrolling at 360x740 for words up to 8 letters.
  - Tiles and boxes are at least 48x48px; boxes may shrink to 40px only for 8+ letter words. Tiles use Fredoka One, 28px or larger.
  - Card, tiles and boxes are white surfaces with the DESIGN shadow; filled boxes use the primary colour; disabled Check is visibly muted.
  - Mascot corner empty. Desktop centred at max width 480px.
  - Screenshots: `play-empty.png` (a 4-letter word), `play-long.png` (an 8+ letter word set via `--eval`), `play-desktop.png` at 1024x740. Checklist passes.
- status:

### B-105 Tap to place and drag feel
- why: touch-first; dragging alone is fiddly for a 9-year-old, tapping is faster and drag should feel tactile.
- acceptance:
  - Tapping a tray tile places it in the first empty box; tapping a placed tile returns it to the tray (existing). Both go through `setState`, no state on DOM.
  - Drag pick-up: scale 1.08 and lifted shadow in 120ms. Drop into a box: snap with `back.out(1.4)` in 200ms. Drop elsewhere: return in 300ms or less.
  - `prefers-reduced-motion`: no scale or overshoot, snaps are instant.
  - Screenshots: `play-tapped.png` (first box filled after one tap via `--eval` dispatching a click on a tile), `play-two-placed.png`. Checklist passes.
- status:

### B-106 Check, wrong and reveal states
- why: the mistake rules in CLAUDE.md must be visible and consistent.
- acceptance:
  - Wrong check: one heart turns to the error colour and fades to muted, result line says "Not quite, try again", placed tiles stay, dragging still works.
  - Third wrong check: boxes fill with the correct tiles, result line says `The word is "duck"`, dragging disabled, Check disabled, Next enabled.
  - Correct check: result line says "Correct!", boxes turn to the accent colour, dragging disabled.
  - Next always advances; an unchecked word counts as wrong. Word counter increments. After the fifth word Next shows the round-end screen.
  - A word is recorded as `correct: true` only when checked correct with at least one heart left.
  - Screenshots via `--eval`: `play-wrong.png`, `play-correct.png`, `play-revealed.png`. Checklist passes.
- status:

### B-107 Round-end screen with stars
- why: the session ends here; stars are the reward the kickoff asked for.
- acceptance:
  - `static/js/score.js` exports `starsFor(correct, size)` with no DOM dependency: 5/5 → 3, 4/5 → 2, 2–3/5 → 1, 0–1/5 → 0. A Django test runs it through `node` and checks all four bands.
  - Screen shows three star outlines with the earned ones filled in the accent colour, the score "4 / 5", and the five words each with its image thumbnail and a tick or cross.
  - "Play again" starts a new round in the same theme (new random words, hearts and results reset). "Themes" returns to the theme screen. Both buttons at least 48px tall.
  - Mascot corner empty. Fits 360x740 without scrolling.
  - Screenshots via `--eval`: `round-end-3.png`, `round-end-1.png`, `round-end-0.png`. Checklist passes. `manage.py test` passes.
- status:

### B-108 Character voice: audio.js and mute toggle
- why: the character's voice is the reason the kid keeps playing; it must be the only place sound is played.
- acceptance:
  - `static/js/audio.js` preloads pools from the existing files: `correct/*`, `error/*`, `celebration/tada.mp3`, `swipe/*`. `play(kind)` picks a random clip from the pool; a new voice clip stops the one playing. File names with spaces are URL-encoded.
  - Sounds fire on: correct check (correct), wrong check and reveal (error), round-end shown (tada), tile placed in a box (swipe). Nothing else in `static/js` constructs `Audio` (grep).
  - `state.muted` exists, persisted to localStorage key `flip.muted`. A mute toggle in the header top-right, at least 48x48px, switches icon between speaker and muted speaker. Muted means no sound plays at all.
  - First user gesture unlocks audio; no console errors from autoplay policy on load.
  - Screenshots: `header-sound-on.png`, `header-muted.png`. Checklist passes.
- status:

### B-109 Wrong feedback: wiggle and heart fade
- why: a mistake should feel gentle and clear, not punishing.
- acceptance:
  - On a wrong check, tiles sitting in a box with the wrong letter wiggle ±6px horizontally for 300ms, and those boxes get a `wrong` tint in the error colour that stays until the kid next moves a tile.
  - The lost heart fades out over 200ms. Input is never blocked.
  - `prefers-reduced-motion`: no wiggle, tint only.
  - Screenshots via `--eval`: `play-wrong-boxes.png` showing the tinted wrong boxes and a lost heart. Checklist passes.
- status:

### B-110 Correct feedback: confetti, box pulse, star pop
- why: the moment of success is the game's main reward beat.
- acceptance:
  - On a correct check the boxes pulse once and up to 40 confetti particles in palette colours burst from the card using GSAP (already loaded), total 600ms, removed from the DOM afterwards. Input is not blocked.
  - On the round-end screen the earned stars pop in one after another with `back.out(1.4)`, 200ms each.
  - `prefers-reduced-motion`: fades only, no confetti.
  - Screenshots: `play-correct-confetti.png` captured with `--wait 200` after the check, `round-end-3.png` after the stars settle. Checklist passes.
- status:

### B-111 Sticker storage and "new stickers" on round-end
- why: the sticker book needs persisted mastery before it can be shown.
- acceptance:
  - `static/js/stickers.js` exports `load()`, `add(theme, word)`, `has(theme, word)`, `all()` over localStorage key `flip.stickers.v1` with shape `{ "<theme>": ["duck", ...] }`. Corrupt or missing data yields an empty book. No DOM dependency.
  - A Django test runs the module through `node` with a fake localStorage and checks add, has, dedupe, and corrupt JSON.
  - A word is added when it is checked correct with at least one heart left.
  - The round-end screen shows "New stickers: N" (N counts only words not already in the book) and puts a sticker badge next to those words in the list.
  - Screenshots via `--eval` seeding localStorage: `round-end-new-stickers.png` (some new), `round-end-no-new.png`. Checklist passes. `manage.py test` passes.
- status:

### B-112 Sticker book screen
- why: the collection the kid walks away with; the M1 finish line.
- acceptance:
  - A "Stickers" button on the theme screen (at least 48px tall) shows `screen-gallery`; a "Back" button returns to the theme screen.
  - For each theme in `themes.json`: a heading with the count "3 / 12", then a 3-column grid at 360px. Mastered words show the image and the word; unmastered words show the image greyed out (CSS filter) with "?" instead of the word.
  - Empty state text when no stickers at all, in the character's tone (one short line).
  - The screen scrolls vertically; nothing is clipped horizontally. Mascot corner rule does not apply here.
  - Screenshots via `--eval` seeding localStorage: `gallery-empty.png`, `gallery-some.png`. Checklist passes.
- status:

## M2 — Modes, difficulty, word audio
Rough items; itemise with acceptance criteria after M1 is merged.
- Mode picker on the theme screen. Mode 1: 3 hearts, reveal on the third miss (M1 behaviour). Mode 2: hint on the third miss (place the first wrong letter), reveal after two more misses.
- Difficulty picker: easy (first letter given), normal, hard (distractor letters in the tray). Use the `difficulty` tags in the JSON.
- Tap the card to hear the word (the per-word `audio` in the JSON).
- Header shows the current theme and a way back mid-round.

## Later / not now
- Login and saving the sticker book to the DB (django.contrib.auth is already installed).
- Visual mascot in the reserved corner; character text lines on screens.
- Content in DB and generation pipeline (words, images in one cartoon style, TTS audio).
- PWA: `manifest.json` references icons that do not exist; icons and offline.
- Background music loop with its own toggle.
- Hebrew UI labels (RTL).
- Adaptive word selection (unmastered words return more often).
