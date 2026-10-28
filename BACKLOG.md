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
- status: done: https://github.com/kadmon76/flip/pull/4

### B-102 Remove legacy frontend files
- why: `script.js`, `ui.js`, `style.css`, `mobile-fixes.css` are old code that agents may copy from by mistake; the new modules already replace them.
- acceptance:
  - The four files are deleted. `index.html` loads only `game.css` and `main.js`. `grep -rn "script.js\|ui.js\|style.css\|mobile-fixes" templates static` returns nothing.
  - `static/js/data.js` is deleted if nothing imports it; otherwise it stays and this is noted in the handoff.
  - The game still runs: `theme.png` and `play.png` show the same layout as B-101's screenshots.
  - `manage.py check` and `manage.py test` pass.
- status: done: https://github.com/kadmon76/flip/pull/5

### B-103 Theme screen to DESIGN
- why: the first thing the kid sees; sets the palette and type for every later screen.
- acceptance:
  - `game.css` defines the DESIGN.md palette as CSS variables on `:root` and uses them; no other colour literals remain in `game.css`.
  - Page background is the paper colour; header shows "Flip" in Fredoka One; body text 16px or larger.
  - One button per theme from `themes.json` (both existing themes appear), each a full-width card with 16px side gutters, at least 120px tall, showing the capitalised theme name and the image of the theme's first word. Tapping it starts a round.
  - At 1024px wide the content is centred with max width 480px (screenshot `theme-desktop.png` at 1024x740).
  - Bottom-left 96x96 mascot corner is empty.
  - Screenshots: `theme.png`, `theme-desktop.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/6

### B-104 Play screen layout to DESIGN
- why: the core screen; must fit a phone without scrolling and use the palette.
- acceptance:
  - Layout top to bottom: card with image, hearts, word counter ("2 / 5"), letter boxes, letter tray, result line, Check and Next buttons. All visible without scrolling at 360x740 for words up to 8 letters.
  - Tiles and boxes are at least 48x48px; boxes may shrink to 40px only for 8+ letter words. Tiles use Fredoka One, 28px or larger.
  - Card, tiles and boxes are white surfaces with the DESIGN shadow; filled boxes use the primary colour; disabled Check is visibly muted.
  - Mascot corner empty. Desktop centred at max width 480px.
  - Screenshots: `play-empty.png` (a 4-letter word), `play-long.png` (an 8+ letter word set via `--eval`), `play-desktop.png` at 1024x740. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/8

### B-105 Tap to place and drag feel
- why: touch-first; dragging alone is fiddly for a 9-year-old, tapping is faster and drag should feel tactile.
- acceptance:
  - Tapping a tray tile places it in the first empty box; tapping a placed tile returns it to the tray (existing). Both go through `setState`, no state on DOM.
  - Drag pick-up: scale 1.08 and lifted shadow in 120ms. Drop into a box: snap with `back.out(1.4)` in 200ms. Drop elsewhere: return in 300ms or less.
  - `prefers-reduced-motion`: no scale or overshoot, snaps are instant.
  - Screenshots: `play-tapped.png` (first box filled after one tap via `--eval` dispatching a click on a tile), `play-two-placed.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/10

### B-106 Check, wrong and reveal states
- why: the mistake rules in CLAUDE.md must be visible and consistent.
- acceptance:
  - Wrong check: one heart turns to the error colour and fades to muted, result line says "Not quite, try again", placed tiles stay, dragging still works.
  - Third wrong check: boxes fill with the correct tiles, result line says `The word is "duck"`, dragging disabled, Check disabled, Next enabled.
  - Correct check: result line says "Correct!", boxes turn to the accent colour, dragging disabled.
  - Next always advances; an unchecked word counts as wrong. Word counter increments. After the fifth word Next shows the round-end screen.
  - A word is recorded as `correct: true` only when checked correct with at least one heart left.
  - Screenshots via `--eval`: `play-wrong.png`, `play-correct.png`, `play-revealed.png`. Checklist passes.
- status: done: superseded by B-114 (https://github.com/kadmon76/flip/pull/31); old PR closed

### B-107 Round-end screen with stars
- why: the session ends here; stars are the reward the kickoff asked for.
- acceptance:
  - `static/js/score.js` exports `starsFor(correct, size)` with no DOM dependency: 5/5 → 3, 4/5 → 2, 2–3/5 → 1, 0–1/5 → 0. A Django test runs it through `node` and checks all four bands.
  - Screen shows three star outlines with the earned ones filled in the accent colour, the score "4 / 5", and the five words each with its image thumbnail and a tick or cross.
  - "Play again" starts a new round in the same theme (new random words, hearts and results reset). "Themes" returns to the theme screen. Both buttons at least 48px tall.
  - Mascot corner empty. Fits 360x740 without scrolling.
  - Screenshots via `--eval`: `round-end-3.png`, `round-end-1.png`, `round-end-0.png`. Checklist passes. `manage.py test` passes.
- status: done: https://github.com/kadmon76/flip/pull/14

### B-108 Character voice: audio.js and mute toggle
- why: the character's voice is the reason the kid keeps playing; it must be the only place sound is played.
- acceptance:
  - `static/js/audio.js` preloads pools from the existing files: `correct/*`, `error/*`, `celebration/tada.mp3`, `swipe/*`. `play(kind)` picks a random clip from the pool; a new voice clip stops the one playing. File names with spaces are URL-encoded.
  - Sounds fire on: correct check (correct), wrong check and reveal (error), round-end shown (tada), tile placed in a box (swipe). Nothing else in `static/js` constructs `Audio` (grep).
  - The robot's clips come from `MOMENTS[moment].sound` in `static/js/character.js`, not from a second trigger list. The swipe plays whenever a block goes into a slot, including the block that fills the last slot (`filledEarly`/`filled`), and not when a block returns to the bench or the reset lever fires.
  - `state.muted` exists, persisted to localStorage key `flip.muted`. A mute toggle in the header top-right, at least 48x48px, switches icon between speaker and muted speaker. Muted means no sound plays at all.
  - First user gesture unlocks audio; no console errors from autoplay policy on load.
  - Screenshots: `header-sound-on.png`, `header-muted.png`. Checklist passes.
  - Mute look (issue #39, answer B): until switch images exist, ship the interim cream glyph (28px, in a 48x48 tap area, top-right, wave or cross), as already built on branch `agent/wip/B-108-20261011-020002`; start from that branch. The brass switch is B-108b.
- status: done: https://github.com/kadmon76/flip/pull/44

### B-108b Mute switch from images
- why: v5 shows the mute control as a brass switch with a cream knob (issue #39, answer B).
- acceptance:
  - Uses `static/images/ui/mute-switch-on.png` (knob right, sound on) and `mute-switch-off.png` (knob left, muted): same 180x59 canvas, transparent, lit from the upper left, no baked-in cast shadow (add the DESIGN contact shadow in CSS). Assets are read-only.
  - The toggle becomes the small cream speaker glyph (about 14px, code, wave or cross) followed by the switch, both on the logo's centre line at the top right as in v5. The switch keeps its 3:1 shape, about 60x20px at 360 wide. One button covers glyph and switch, tap area at least 84x48. The two images are stacked and swapped by class (as the lever and dome do), so there is no flash on the first toggle. No game logic changes.
  - Screenshots: `header-switch-on.png`, `header-switch-off.png`, plus a 3x zoom of both. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/47

### B-109 Wrong feedback: wiggle and heart fade
- why: a mistake should feel gentle and clear, not punishing.
- acceptance:
  - On a wrong check, tiles sitting in a box with the wrong letter wiggle ±6px horizontally for 300ms, and those boxes get a `wrong` tint in the error colour that stays until the kid next moves a tile.
  - The lost heart (already error-coloured from B-106) fades to muted over 200ms when the kid next moves a tile, alongside the wrong tint clearing. Input is never blocked.
  - `prefers-reduced-motion`: no wiggle, tint only.
  - Screenshots via `--eval`: `play-wrong-boxes.png` showing the tinted wrong boxes and a lost heart. Checklist passes.
- status: done: superseded by B-114 (https://github.com/kadmon76/flip/pull/31); old PR closed

### B-110 Correct feedback: confetti, box pulse, star pop
- why: the moment of success is the game's main reward beat.
- acceptance:
  - On a correct check the boxes pulse once and up to 40 confetti particles in palette colours burst from the card using GSAP (already loaded), total 600ms, removed from the DOM afterwards. Input is not blocked.
  - On the round-end screen the earned stars pop in one after another with `back.out(1.4)`, 200ms each.
  - `prefers-reduced-motion`: fades only, no confetti.
  - Screenshots: `play-correct-confetti.png` captured with `--wait 200` after the check, `round-end-3.png` after the stars settle. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/20

### B-111 Sticker storage and "new stickers" on round-end
- why: the sticker book needs persisted mastery before it can be shown.
- acceptance:
  - `static/js/stickers.js` exports `load()`, `add(theme, word)`, `has(theme, word)`, `all()` over localStorage key `flip.stickers.v1` with shape `{ "<theme>": ["duck", ...] }`. Corrupt or missing data yields an empty book. No DOM dependency.
  - A Django test runs the module through `node` with a fake localStorage and checks add, has, dedupe, and corrupt JSON.
  - A word is added when it is checked correct with at least one heart left.
  - The round-end screen shows "New stickers: N" (N counts only words not already in the book) and puts a sticker badge next to those words in the list.
  - Screenshots via `--eval` seeding localStorage: `round-end-new-stickers.png` (some new), `round-end-no-new.png`. Checklist passes. `manage.py test` passes.
- status: done: https://github.com/kadmon76/flip/pull/22

### B-112 Sticker book screen
- why: the collection the kid walks away with; the M1 finish line.
- acceptance:
  - A "Stickers" button on the theme screen (at least 48px tall) shows `screen-gallery`; a "Back" button returns to the theme screen.
  - For each theme in `themes.json`: a heading with the count "3 / 12", then a 3-column grid at 360px. Mastered words show the image and the word; unmastered words show the image greyed out (CSS filter) with "?" instead of the word.
  - Empty state text when no stickers at all, in the character's tone (one short line).
  - The screen scrolls vertically; nothing is clipped horizontally. Mascot corner rule does not apply here.
  - Screenshots via `--eval` seeding localStorage: `gallery-empty.png`, `gallery-some.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/24

## M1b — Restyle to the approved play screen (v5)
Build order: scene → controls → robot → other screens. Reference:
`design/reference/play-screen-v5.png`, rules in DESIGN.md and CHARACTER.md.

### B-113 Play screen scene and layout to v5
- why: the play screen still uses the old pastel look; v5 is approved.
- acceptance:
  - Background `bg-lab.jpg` full width, anchored top; frame overlay via
    border-image exactly as in DESIGN.md "Layout"; content inside the
    safe area.
  - The word picture is shown inside the TV screen area (x 28–70%,
    y 16.4–30.5% of the background), masked to rounded corners, with
    scanlines and teal glow.
  - Brass plate shows three lives bulbs (lit = `--amber`, lost =
    `--bulb-off`) and a split-flap counter "n / 5" in Courier Prime Bold.
  - Brass slot rail with 46px slots, 6px gap; 6 letters in one row at
    360px; 7–10 letters wrap into two even rows.
  - Clay letter blocks in Andika Bold, lowercase, 52px min, ±4° rotation,
    loose staggered rows of max 4. Fonts loaded from Google Fonts.
  - No English text on the play screen except the target word and the
    "flip" logo; the result line is removed (feedback comes in B-114).
  - Palette variables from DESIGN.md replace the old ones; no other
    colour literals.
  - Screenshots: `play-4.png` (duck), `play-6.png` (rabbit),
    `play-10.png` (helicopter). Each compared to the v5 reference.
- status: done: https://github.com/kadmon76/flip/pull/28

### B-114 Console controls: check/next dome, reset lever, speaker
- why: the controls are physical objects on one console (v5); the dome is
  both check and next; the kid asked for a hear-the-word button.
- acceptance:
  - `console.png` pinned to the bottom of the safe area; on its plate,
    left to right: reset lever, speaker, check dome, positioned as v5.
  - Dome states per DESIGN.md "Controls and states", including the slow
    ready pulse when all slots are filled, and next-word behaviour after
    a correct answer or a reveal. `#next-btn` is removed (DECISIONS entry).
  - Reset lever returns all placed blocks to their start spots with the
    lever, rail-shake and hop animation. Tapping a single placed block
    still returns only that block.
  - Speaker plays the word's audio file from the content JSON through
    `audio.js`; `speaker-on` while playing; if a word has no audio file,
    show `speaker-cap`. (Easy/normal gating comes with the modes item.)
  - Wrong / reveal / correct feedback per DESIGN.md "Feedback", with no
    text. Existing wiggle/confetti code is reused and restyled, not
    duplicated.
  - `prefers-reduced-motion` behaviour as in DESIGN.md.
  - At 360x740 a 10-letter word (two slot rows, three block rows) fits with the console and the robot's head and shoulders without overlap; if the DESIGN numbers cannot all fit, open a question issue before changing block size, blocks per row or the console.
  - Screenshots: `console-empty.png`, `console-ready.png` (all slots
    filled), `wrong.png`, `correct.png`, `revealed.png`.
- status: done: https://github.com/kadmon76/flip/pull/31

### B-115 Robot behind the console
- why: the character is the reason kids come back; he must react.
- acceptance:
  - Robot sprite behind the console's left third, z-order below the
    console, head and shoulders visible.
  - At 360x740, 7–10 letter words leave no room for the ~20px pop-up above the second block row: the robot is drawn below the bench blocks in z-order and never covers them (DECISIONS, B-114 10-letter fit entry).
  - Pose and pop/sink/peek movement driven from state per CHARACTER.md
    "Moment map", from a single data table in `static/js/character.js`
    (moment → pose, movement, sound). No pose logic elsewhere.
  - Idle timer: 10s without input → thinking then sink; any input pops
    him back.
  - Screenshots: `robot-idle.png`, `robot-confused.png`,
    `robot-excited.png`, `robot-sunk.png`.
- status: done: https://github.com/kadmon76/flip/pull/33

### B-116 Interim restyle of theme, round-end and sticker book
- why: these screens still use the old look and English labels.
- acceptance:
  - All three per DESIGN.md "Other screens (interim)": blurred darkened
    lab backdrop, same frame, cream panels with brass border, palette,
    fonts.
  - No English labels: theme cards show the theme picture; buttons are
    icons (▶ play again, ▦ themes, ★ stickers, ← back). Numbers allowed.
  - Round-end shows stars, the five words (picture + the word, which is
    allowed) with a lit or dark bulb each, and the new-sticker badges.
  - Screenshots: `theme.png`, `round-end-3.png`, `round-end-0.png`,
    `stickers-some.png`.
- status: done: https://github.com/kadmon76/flip/pull/35

## M2 — Levels and hints
Decided by the human on 2026-10-10 (DECISIONS.md, "M2 levels and hints").
Three levels, picked with icons (1, 2 or 3 lit bulbs, no text), default easy.
Each miss gives more help: 1st miss shows which letters are wrong (exists),
2nd miss the robot gives one letter, 3rd miss reveals the word (exists).
Build order: way out → level picker → speaker per level → easy start →
lever → 2nd-miss hint → hard distractors → missed words return → level-up nudge.

### B-201 Back to themes from the play screen
- why: there is no way out of a round.
- acceptance:
  - A back icon button (line arrow, the same SVG as the sticker book's back, at least 48x48px) on the play screen, in the header to the left of the mute toggle (B-108), clear of the logo and of the robot. No text.
  - Tapping it goes to the theme screen at once, no confirmation. The unfinished round is dropped: no stars, no stickers, no results kept.
  - Any word clip playing stops.
  - Screenshots: `play-back.png` (play screen with the button), `theme-after-back.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/51

### B-202 Level picker and level in state
- why: the kid chooses how hard a round is.
- acceptance:
  - `state.level` is `'easy' | 'normal' | 'hard'`, default `'easy'`, persisted in localStorage key `flip.level` (read/write wrapped in try/catch; a missing or bad value is `'easy'`).
  - Theme screen: a row of three panel buttons above the stickers button showing 1, 2 and 3 bulbs (the lives bulb look); the chosen one is lit and pressed (`aria-pressed`), the others dark. `aria-label`s "easy", "normal", "hard". No text on screen.
  - The level is fixed for the round once a theme is tapped; changing it affects the next round.
  - Pure helper `levelRules(level)` (no DOM) returns the per-level rules used by B-203…B-207 (`hearBefore`, `firstLetterGiven`, `leverDropsWrongFirst`, `distractors`, `shortWordsFirst`); a Django test runs it through `node`.
  - Screenshots: `theme-level-easy.png`, `theme-level-hard.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/51

### B-203 Speaker per level
- why: hearing the word is the main help on easy and a reward on every level.
- acceptance:
  - Easy: the speaker plays the word at any time (today's behaviour).
  - Normal and hard, before the word is answered: the speaker does not play the word. Instead it plays the "hmm no" voice clip (`static/sounds/error/hmm no.mp3`, a placeholder until new lines exist) and the robot does a short confused "no" (moment `speakerLocked` in `character.js`: confused pose, a small head-shake). The speaker looks the same as normal; no lock icon.
  - On every level, once the word is answered (correct or revealed), the speaker plays the word.
  - Mute (B-108) silences all of it.
  - Screenshots: `speaker-locked-robot.png` (normal, after tapping the speaker). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/51

### B-204 Easy: first letter given, short words first
- why: an easy start for beginners.
- acceptance:
  - On easy the word's first letter starts in the first slot, locked: it cannot be dragged, the lever never removes it, and it is drawn as placed with a small lit-edge "locked" look (DESIGN tokens). Its tile is not on the bench.
  - On easy a round prefers words tagged `"difficulty": "easy"` in the theme JSON, then fills up with the shortest remaining words. Normal and hard pick as today.
  - A word whose only missing letters are the given one still needs a check (the dome lights when all slots are full, as now).
  - Screenshots: `play-easy-start.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/56

### B-205 Lever: wrong letters first, pull again to start over
- why: the kid fixes only what was wrong, but can always start the word over.
- acceptance:
  - Easy, after a wrong check: the first pull sends back only the letters in wrong slots; the letters in right slots stay and lock with the same "locked" look as B-204. The next pull (any time later, while placed unlocked or locked letters remain besides the given first letter) sends back every letter except the given first letter and unlocks them.
  - Normal and hard: one pull sends back every placed letter (today's behaviour). Letters are never locked.
  - Before any wrong check, on every level, a pull sends back every placed letter (except the easy given letter).
  - Pure helper `leverResult(level, current)` (no DOM) returns the letters that go back and the ones that lock; a Django test covers easy-after-wrong, easy-second-pull, normal and before-check.
  - Screenshots: `lever-easy-after-wrong.png` (wrong letters gone, right ones locked), `lever-easy-second-pull.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/56

### B-206 Second miss: the robot gives one letter
- why: help grows with each mistake instead of jumping from "wrong" to "here is the word".
- acceptance:
  - On every level, the wrong check that leaves one bulb lit also places one letter: the first slot that is empty or wrong gets its correct letter, flown in from the bench like the reveal fly-in (a wrong letter in that slot goes back to the bench first). That letter locks.
  - The robot plays a new moment `hintGiven` (happy pose, small pop) after his confused reaction to the miss, per CHARACTER.md "Presence" spacing.
  - A word answered correctly after a hint still counts as mastered (bulbs left).
  - Screenshots: `hint-second-miss.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/56

### B-207 Hard: two extra letters on the bench
- why: hard means choosing the right letters, not only ordering them.
- acceptance:
  - On hard the bench gets 2 extra letters that are not in the word, picked from a confusion table in a pure helper (pairs such as b/d, p/q, c/k, s/z, m/n, i/e, a/e, u/o: prefer the partner of a letter in the word, else a random letter not in the word). Never a letter already in the word.
  - The check ignores the extras; they can be placed and are wrong where placed. Reveal and the second-miss hint never use them.
  - The bench still fits 10-letter words plus 2 extras at 360x740 without overlap (new rows if needed; layout.js test extended).
  - Screenshots: `play-hard-extras.png`, `play-hard-10-letters.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/59

### B-208 Missed words come back
- why: practice lands on the words that are hard for this kid.
- acceptance:
  - A word missed (revealed or skipped) is remembered per theme in localStorage (`flip.missed.v1`, only read/written in one module, like stickers.js).
  - The next round of that theme includes up to 2 remembered missed words, in random positions; a word spelled correctly is removed from the list.
  - Stickers only for correct words (unchanged).
  - A Django test runs the round-picking helper through `node`.
- status: done: https://github.com/kadmon76/flip/pull/59

### B-209 Level-up nudge
- why: kids move up when ready, never forced.
- acceptance:
  - After two rounds in a row with 3 stars on the same level (not stored across page loads), on the round-end screen the robot (or, if the robot is not on that screen, a pulsing glow) points at a "next level" icon button (the next level's bulbs). Tapping it sets the level and starts a new round of the same theme. On hard there is no nudge.
  - Screenshots: `round-end-level-up.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/59

### B-210 Robot as a puppet
- why: six still pictures feel stiff. A puppet of separate parts with code-drawn eyes and a voice-driven "mouth" feels alive and lets the kid connect his voice to him. Approved by the human on 2026-10-11 after several rounds on a test page.
- reference: `design/reference/robot-puppet.html` is the approved test page. Serve the repo root over http (e.g. `python3 -m http.server`) and open `/design/reference/robot-puppet.html`. Its numbers (positions in "puppet px" on a 505x505 canvas, rotations, timings, eye sizes, eyebrow offsets, hand poses per moment) are the spec; port them, don't reinvent them. It is a single-file prototype: split it to fit the frontend architecture in CLAUDE.md.
- assets (read-only): `static/images/ui/robot/` has `body.png` and `head.png` (505x505 canvas, already aligned; the visor is empty), `browL.png`, `browR.png` (same canvas), and the hand shapes `hand-restL.png`, `hand-restR.png`, `hand-wave.png`, `hand-point.png`, `hand-ball.png`, `hand-palm.png` (2x density, placed by their centre; the left hand uses the right-hand shapes mirrored, except rest). The old `robot-*.png` poses stay in place until this item replaces their use.
- acceptance:
  - Layers: body, head (rotates around its neck pivot), eyebrows (inside the head), two hands. Eyes are drawn in code (SVG) inside a visor clip, as in the reference.
  - Hands are drawn above the console's top edge (a separate layer over the console) so they stay visible; the body and head stay behind the console as today. Hands never cover a console control's tap area or a bench block; adjust the rest pose if the lever is in the way and note it in DECISIONS.
  - Ambient life on every screen where he is shown: float, breathing, blinking (with an occasional double blink), eyes wandering, hands drifting, eyebrows bobbing out of step plus an occasional solo lift or wiggle.
  - Eyes and a small head turn follow the block the kid is dragging.
  - Moments as in the reference, driven by `character.js`'s `MOMENTS` table: round start, new picture (random of surprise / giggle / shock, looking up at the TV), letter placed, all slots filled (point at the dome; about 4 in 10 times the extra-excited version), kid idle 10s (think, sink, then every few seconds peek over the edge with no hands showing, until the kid's next input), wake up, wrong (head shake and shrug), wrong with peek (ducks to his eyes, looks left/right, small shiver, comes back), third miss (covers eyes, then relief), correct (fist pump), 3 in a row (two fists, double pop, cap sparks), round end (clap), speaker locked (head shake, shrug).
  - Talking: whenever a voice clip plays through `audio.js`, an AnalyserNode drives all four effects together: the scope mouth (a glowing line at the bottom of the visor showing the live waveform, faint and flat when quiet), eyes pulsing with loudness, cap glow and sparks on loud syllables, head bobs on peaks; the eyebrows also rise with loudness. Mute (B-108) silences the sound and therefore the effects.
  - `prefers-reduced-motion`: pose and shape changes only, no floating, bobbing or hops.
  - CHARACTER.md "Poses" and "Moment map" are updated to the puppet (parts, hand shapes, the moments above); the robot rule in CLAUDE.md "Project-specific rules" is updated for the hands-over-the-edge layer.
  - Pure parts (moment table, pose lookup, hand pose per moment, the loudness smoothing) get a Django test through `node`.
  - Screenshots: one per moment at 360x740 (`robot-<moment>.png`), plus `robot-talking.png` mid-clip and `robot-peek.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/63

### B-211 Locked letters you can see at a glance
- why: on easy, letters that stay put (the given first letter, right letters after the lever, the robot's hint letter) must look clearly different from letters the kid can move. B-204's thin amber edge on the brass bar is invisible at phone size (human, 2026-10-15, on #52).
- acceptance:
  - A locked letter differs from a movable one in at least two ways, and the difference is obvious at real phone size (360x740 screenshot, not zoomed): for example a different tile colour or material, sitting sunk/fixed into the slot, and a fixed-looking detail that fits the lab machine (brass rivets or a clamp on the tile). No words; a lock icon only if nothing else reads clearly.
  - Fits DESIGN.md's retro lab look; colours from DESIGN tokens or new tokens added to DESIGN.md.
  - One look for every locked letter (B-204 given letter, B-205 lever lock, B-206 hint letter), driven only by the slot's `locked` flag.
  - When a letter becomes locked (lever or hint), a short "clunk" moment (small press-in motion; a sound only if a fitting one exists).
  - Pick the look yourself: try 2–3 options, keep the clearest, put the others' screenshots in the PR. Don't ask the human.
  - DESIGN.md "Controls and states" records the chosen look.
  - Screenshots: `locked-easy-start.png`, `locked-after-lever.png` (locked and movable letters side by side). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/63

### B-212 Next-word dome you can't miss
- why: after a correct word the kid must see at once that the dome means "go on". In the 2026-10-15 preview playtest its blink was too weak to notice (also raised 2026-10-13). This is about being noticed, not the overall look; the bolder restyle comes later.
- acceptance:
  - Once a word is correct, the check dome blinks clearly brighter and bigger than now (light that reaches past its rim, a visible on/off rhythm), obvious at 360x740 on a phone without zooming. Stays in DESIGN.md's palette and style.
  - If the kid has not pressed it after about 4 seconds, the robot nudges toward it (a point or look at the dome, per CHARACTER.md; a voice line only if a fitting clip exists) and repeats at most every 8 seconds.
  - The "all slots filled" ready pulse before a check stays calmer than the next-word blink, so the two read differently.
  - `prefers-reduced-motion`: a steady strong glow instead of blinking.
  - Screenshots: `dome-next-on.png`, `dome-next-off.png` (both blink phases), `dome-robot-nudge.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/63

## M3 — Long words and a TV that tunes in
Decided by the human on 2026-10-16 (long words) and 2026-10-18 (TV motion, prototype v3).
Content (the word list, word pictures, voice) is made in chat sessions and lands in its own PRs. The theme files under `static/data/` are written by that content batch from the word list, never by an agent; content stays read-only here.
Build order: long words → TV tune-in. Picture life and win are now M5 (the theme data carries each word's `motion` fields).

### B-213 Long words: one row up to 8 letters, chunk break for 9–10
- why: splitting a long word in an arbitrary place ("helic / opter") hides the word's shape, which is the thing being learned. Words should break as rarely as possible, and when they must, the break should teach something: a compound word's parts or a syllable chunk. Decided by the human 2026-10-16.
- acceptance:
  - Slot sizes by word length (in `layout.js`, `slotLayout`):
    - 1–6 letters: unchanged, 46px slots, 6px gap, one row.
    - 7–8 letters: one row, no break, even when the word entry has a `break` field. Slots shrink to the largest size that fits the rail, never below 36px (about 40px for 7 letters, 36px for 8 at 360 wide), gap 4px. Letters inside the slots scale with them (about 0.58 of the slot size).
    - 9–10 letters: two rows at full 46px, split at the word entry's `break` (the number of letters on the first row), never by even halves. Each row is centred.
  - Bench blocks stay 52px for every word length. Only the slots change size.
  - Small slots stay easy to use: at 36–40px a slot's tap and drop area covers the full rail height (about 52px tall), so tapping a placed letter to send it back still works for a kid's finger. Drop snapping still picks the nearest slot.
  - Data: `break` comes from the word data format (the content batch writes it; e.g. `helicopter` 4 = heli | copter, `submarine` 3 = sub | marine, `motorbike` 5 = motor | bike). A 9–10 letter word with no `break` falls back to the even split and logs a console warning. If the theme data doesn't carry `break` yet when this runs, the tests and screenshots use a test entry that does; don't edit the theme files.
  - Brass joint: when a word breaks, a small brass joint sits at the end of the first row and the start of the second, showing it is one word in two chunks. It is drawn in code in DESIGN.md's palette (brass, brass-dark, cream). Its exact look is provisional; the human may restyle it later in Claude Design, so keep it in one small, easily replaced component. When a broken word appears, the joint glows once (about 600ms; a steady state under `prefers-reduced-motion`).
  - Locked letters (B-211) and the second-miss hint letter (B-206) stay clearly visible in 36px slots.
  - Layout fit: at 360x740 every word of 1–10 letters still fits without overlap with the console, dome and robot, including hard mode's 2 extra letters (B-207). Extend the layout tests for the new sizes and the split rows.
  - DESIGN.md "Layout" slot rail line is updated to this ladder (replacing "Six slots fit one row; 7+ letters wrap into two even rows"), with a DECISIONS entry.
  - Screenshots: `long-7-scooter.png`, `long-8-letters.png` (any 8-letter test word), `long-10-helicopter.png`, `long-9-motorbike.png`, `long-10-hard-extras.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/71

### B-214 TV tune-in on every new word
- why: the TV is an old analog set, so each new word should tune in like changing the channel. It makes every new picture a small event and sets up the funny picture motion that comes next. Approved by the human on 2026-10-18 (prototype v3).
- reference: `design/reference/tv-motion.html` is the approved prototype. Serve the repo root over http (e.g. `python3 -m http.server`) and open `/design/reference/tv-motion.html`. Its layer 1 "TV" (`tuneIn`, `hiss`, `ambientRoll`, the `.tune` canvas and `.roll` bar) is the spec: port its numbers and drawing, don't reinvent them. Its layers 2 and 3 (life, win), its bat and taxi pictures and its page layout are for a later item; leave them out.
- acceptance:
  - On every new word (the round's first word and each next word), the TV plays the tune-in for about 1 second: fine streaky snow, a dark sync bar rolling down, the word's picture rolling vertically and tearing sideways, slowing, then locking still. Drawn in code over the picture, inside the TV screen's rounded mask and under its scanlines and glow (DESIGN.md "TV screen").
  - A short hiss with a channel click plays with it, made in code (Web Audio, no sound file), started through `audio.js` (the only place sounds play) and silent when muted.
  - After the lock, the TV stays alive but quiet: a faint bar rolls past every 6–11 seconds, and a rare 90ms dim flicker. Nothing that pulls the eye from the letters.
  - Never blocks input: the kid can drag and place letters while the TV tunes in.
  - The robot's "Picture shown" moment (CHARACTER.md) starts as the picture locks, not during the snow.
  - The wrong-check static flicker (DESIGN.md "Feedback", 150ms) still works; it may reuse the new snow drawing.
  - Works with today's pictures and with the new `.webp` word pictures under `static/images/words/` (4:3, teal background).
  - `prefers-reduced-motion`: a 250ms fade in instead of the snow and roll; no ambient bar or flicker.
  - Performance: the drawing loop runs only during the tune-in and stops at the lock; nothing animates while the play screen is hidden. Smooth on a mid-range Android phone.
  - Architecture: the tune-in is one-shot motion keyed on the word changing (a transition, like `feedback.js`'s TV static); the CLAUDE.md architecture list names where it lives. No state outside `state.js`.
  - DESIGN.md records the tune-in and the ambient bar next to the TV screen line.
  - Screenshots: `tv-tune-snow.png` (early in the tune-in), `tv-tune-roll.png` (picture rolling), `tv-locked.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/71

## M4 — Stages instead of levels, gears and boosts
Decided by the human on 2026-10-13 (stages, gears, boosts) and 2026-10-15 (lever rule); build decisions 2026-10-21. **Read PROGRESSION.md first**: it is the source for every item here, and its tables are the starting numbers. CLAUDE.md "Product rules" already describe where M4 ends up.
Looks: new screens and controls use the interim style (DESIGN.md "Other screens", the lab palette, no English text). The human will restyle them later in Claude Design, so keep each new visual piece in one small, easily replaced component. Choose the interim look yourself and record it in DECISIONS; don't open a question issue only about looks.
Since 2026-10-23 the theme data is full (four themes, 130 words, every stage); the stage and round tests keep a frozen copy of the earlier partial data (`spelling_game/fixtures/sparse-data/`). Every item must work with sparse stages and with full ones.
Build order: stages replace levels → lever rule → stage rounds and clearing → stage map and replay → gears → boosts → struggle help.

### B-215 Stages replace the level picker
- why: difficulty should come from moving forward in the game, not from a picker the kid doesn't understand (playtest 2026-10-13: the three bulb buttons were unclear, and the stickers button under them got pressed as if it were "start"). PROGRESSION.md "Principles", "Stages".
- acceptance:
  - New `stage.js` replaces `level.js` (pure, no DOM, no module state; a Django test runs it through `node`): `STAGES` = `[1, 2, 3, 4, 5, 'long']`; `stagesOf(data)`, the stages a theme's data has words in, in that order; `stageRules(stage)`, PROGRESSION.md's table as `{ givenFirst, extras }` (anything that is not a stage gets stage 1's rules).
  - `state.round.stage` replaces `state.round.level`. Gone: `state.level`, the level streak `state.streak` (the robot's own `streak` moment, from the round's results, stays), `level.js`, reading or writing localStorage `flip.level` (a stale value is simply ignored), the level-up nudge (B-209: `#level-up-btn`, its `.level-up` styles, main.js's `onLevelUp` wiring and `levelUpFor`), and the level picker (`#level-picker`, `#level-easy`, `#level-normal`, `#level-hard`). Removed ids leave the template and CLAUDE.md's id list, with a DECISIONS entry. The theme screen shows the theme cards and the stickers button.
  - round.js `makeWord(entry, stage, newId)` reads `stageRules`: `givenFirst` gives the first letter, locked (as easy did); `extras` puts that many extra letters on the bench, `CONFUSIONS` first (as hard did). A round's stage rules apply to every word in it, review and fill words included.
  - Words are picked by `stage`, never by `difficulty`. The data's `difficulty` field is no longer read (the content batch drops it later; don't edit the data).
  - The speaker plays the word on every stage, before and after it is answered: `speakerAction` no longer gives `'locked'`. `speaker-cap` stays for a word with no audio file, as today. Keep the `lockedTaps` counter and the robot's `speakerLocked` moment and its "hmm no" (character.js plays them when `lockedTaps` changes): nothing from the speaker adds to it any more, and B-219 adds one when the kid can't afford a boost. CHARACTER.md's "Speaker locked" row says it now comes from a boost the kid can't afford (B-219).
  - Until B-215b, the lever behaves on every stage as easy's did (`leverDropsWrongFirst`).
  - Until B-216, a tapped theme plays a round of its first stage: up to 2 missed words back (as today), then that stage's words at random, filled from the theme's other stages (nearest first) when it has fewer than 5.
  - Docs: DESIGN.md's level-picker convention and the speaker's held-back line (B-203) follow the stage rules; CLAUDE.md's architecture list replaces the `level.js` bullet with `stage.js` and updates the round.js and controls.js bullets.
  - Tests: the level tests become stage tests.
  - Screenshots: `theme-no-levels.png`, `stage1-first-letter.png`, `stage3-one-extra.png` (stage forced through the dev hook). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/76

### B-215b Lever rule on every stage
- why: after a wrong check the lever should keep what the kid got right, on every stage, without ever working as a free check (human, 2026-10-15; PROGRESSION.md "Lever rule").
- acceptance:
  - State on `current`: `rightAtCheck`, the tile ids the word's last wrong check found right, per slot (null before any wrong check), and `justPulled`, true after a lever pull and false after any block move (drag, tap or a robot letter landing). After a pull `returnAll` sets the status back to `'playing'` as today, so `justPulled` is what tells a second pull apart.
  - A pull (drag.js `leverResult`, `returnAll`, no level or stage argument): with `justPulled` true, start over: everything goes back but the given letter, the robot's hint letter and a boost's letter (B-219), including letters a pull locked, and `rightAtCheck` is cleared. Otherwise, after a wrong check (`rightAtCheck` set): the blocks in `rightAtCheck` that are still in their own slot stay and lock; everything else goes back, also blocks moved or placed after the check (the lever never judges a letter the check didn't). Before the word's first wrong check: everything but the given, hint and boost letters goes back.
  - DESIGN.md "Controls and states" (reset lever, locked letter) describes this rule instead of easy's; CLAUDE.md's drag.js bullet is updated.
  - Tests through `node`: a pull right after a wrong check; a wrong check, a block moved, then a pull; a wrong check, a new block placed in an empty slot, then a pull (it goes back); a second pull; a pull before any check; the given and hint letters through all of them.
  - Screenshots: `lever-after-check.png`, `lever-after-move.png` (a wrong check, one block moved, then a pull: the checked-right letters stay, locked), `lever-start-over.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/76

### B-216 Stage rounds, clearing a stage, and the next stage
- why: the kid moves forward by playing; each stage is a short set of words, and clearing it opens the next (PROGRESSION.md "Stages").
- acceptance:
  - New `progress.js`, the only place localStorage `flip.progress.v1` is read or written (every read and write in try/catch, as stickers.js): `{ "<theme>": { "solved": [word, ...], "cleared": [stage, ...] } }`, keyed by the theme keys as they are (`animals`, `transportation`), like stickers and missed words. Pure helpers, tested through `node`: `currentStage(data, progress)`, the first stage of `stagesOf(data)` not cleared (all cleared: the last one); `afterRound(progress, data, stage, results)`, which adds every word checked correct this round to `solved` (help counts; a revealed word does not) and adds `stage` to `cleared` once all of its words in the data are solved, and says whether it was just cleared. A cleared stage stays cleared, even when the data later adds words to it.
  - round.js `pickRound` for a stage follows PROGRESSION.md "Rounds": up to `MISSED_BACK` missed words, then the stage's unsolved words, then its solved words, then words from earlier stages, then, only if still short, from later stages (nearest first); 5 words in random order. Tests use today's data (transportation stage 1 is only `bus`, stage 2 is empty) and a full test theme.
  - Tapping a theme plays its current stage. The round's stage is fixed for the round.
  - Progress is recorded once per finished round, in `onNext`'s round-end branch (where missed words are recorded). A round left with the back button records nothing.
  - Round-end: under the stars, a row of the theme's stage bulbs (one per stage, lit = cleared; DESIGN.md "Other screens" conventions). When the round cleared its stage, that bulb lights with a pop as the stars finish (reduced motion: it is simply lit). Play again (▶) starts the theme's current stage, so after a clear it is the next one.
  - Screenshots: `round-end-stage-cleared.png`, `round-end-not-cleared.png`, `play-next-stage.png` (the first word after clearing stage 1: no given letter). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/76

### B-217 Stage map: see your progress, replay a stage
- why: the kid sees how far they got in a theme and can go back to a cleared stage for confidence, missing stickers or gears (PROGRESSION.md "Replay").
- acceptance:
  - Tapping a theme card opens a new stage screen (`#screen-stages`) for that theme. It shows the theme's picture at the top and one station per stage in `stagesOf(data)` (up to 6), in the interim style: a cream panel button with the stage number as a split-flap digit (the `long` stage shows a small brass joint between two chunks, the B-213 joint, instead of a digit) and one bulb. Cleared: bulb lit, tappable. Current: bulb pulsing amber, the button raised and glowing, tappable; this is the screen's obvious start. Not open yet: bulb dark, button dimmed, not tappable. Tap areas at least 48x48; aria-labels name the stage number. No text.
  - Tapping a cleared or current station starts a round of that stage. A replay of a cleared stage records solved words (and, from B-218, gears and stickers) but clears nothing new.
  - The stage screen's back arrow (the sticker book's back glyph) goes to the theme screen. The play screen's back arrow (B-201) now goes to the theme's stage screen.
  - When every stage is cleared, all stations are lit and the last one also gets the current station's glow, so there is still one obvious start.
  - Theme cards show the theme's progress as a small row of bulbs under the picture (lit = cleared).
  - Screenshots: `stages-new-theme.png` (only stage 1 open), `stages-mid.png` (two cleared, the third current), `stages-all-cleared.png`, `theme-cards-progress.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/80

### B-218 Gears: earn them, see them; stickers for clean words
- why: gears are what the kid earns by playing and spends on boosts; stickers become the reward for a clean spelling (PROGRESSION.md "Gears", "Repetition and stickers").
- acceptance:
  - New `gears.js`, the only place localStorage `flip.gears.v1` (a whole number, 0 or more) is read or written, in try/catch. Pure helpers tested through `node`: the gears for a word result and for a finished round.
  - Each word's result records `clean`: checked correct on the first check, with no boost (B-219 adds `boosted`).
  - Earned: 1 gear for a correct word, 1 more if it is clean, 2 when the round reaches the round-end screen. Never lost: gears earned in a round the kid leaves with the back button stay (unlike that round's stickers, B-201). A word's gears are added at its correct check.
  - Stickers: `stickers.js` `add` is called only for a clean word (CLAUDE.md "Product rules"). Stars are unchanged.
  - Shown: a gear counter, a brass cog drawn in code with the count in split-flap digits, on the theme screen (in the header) and on the play screen, where it sits on the console between the speaker and the dome as the face of the boost button B-219 builds (not tappable yet). On a correct word, small cogs fly from the TV to the counter and the count flips up (600ms at most; reduced motion: the count just changes).
  - Round-end shows the round's gears: the cog and "+N" in split-flap digits. Numbers only.
  - DESIGN.md: the cog counter on the play screen is a new scene object drawn in code; record it as an exception to "The layer model" (like the interim screens' CSS panels) until the Claude Design pass replaces it.
  - Screenshots: `gears-play.png`, `gears-fly.png` (mid-flight), `gears-theme.png`, `round-end-gears.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/80

### B-219 Boosts: pay gears, the robot remembers a letter
- why: help the kid chooses and pays for, so the free help can fade (PROGRESSION.md "Boosts", "Guardrails").
- acceptance:
  - The console's gear counter (B-218) becomes the boost button. It is off (dimmed, taps ignored) until every slot of the current word has been filled at least once, after a boost was used on this word (one per word), and once the word is answered.
  - Tapping it opens a small brass tray above the console, over the bench, with the boosts that apply now (PROGRESSION.md "Offered when"): Remember this one (3 gears) when a slot isn't locked, First letter (2) when the first slot isn't locked, Clean-up (2) when the word still has extra blocks (on the bench or in a slot). Each is an icon drawn in code with its cost as gear pips (one small cog per gear). Tapping outside the tray closes it; no tap goes through it to a block below.
  - Never a free check (PROGRESSION.md): what the tray offers and what glows never depends on whether a placed letter is right.
  - Remember this one: every slot that isn't locked glows; the kid taps one; the robot puts the right letter there with the second-miss hint's motion (B-206: a block already in the slot hops back, the right one flies in and locks), also when the right letter was already there (it still costs). First letter: the same for the first slot, with no slot to pick. Clean-up: the extra blocks puff away (300ms) from the bench and from any slot; the other blocks keep their spots.
  - A boost's letter is marked `boost: true` on its slot (not `hint`: feedback.js's hint fly-in and the robot's `hintGiven` key on the first `hint` slot, and the free hint must still work after a boost). It is locked, and the lever (B-215b) and the reveal keep it like the hint letter. The robot plays a new `boostGiven` moment (`hintGiven`'s steps) as it lands; CHARACTER.md's moment table gets its row.
  - The gears are taken when the boost happens. Not enough gears: nothing is spent and the tray closes; `lockedTaps` goes up by one, so the robot plays his `speakerLocked` head-shake with its "hmm no", and the gear counter flickers.
  - A boosted word's result has `boosted: true`: it still counts for its stage (B-216) and earns its correct-word gear, but no clean bonus and no sticker (B-218).
  - `boost.js` holds the pure rules (which boosts are offered, the costs, the per-word limit) tested through `node`; CLAUDE.md's architecture list names it.
  - DESIGN.md: the boost tray is a new scene object drawn in code; record it as an exception to "The layer model" until the Claude Design pass, next to B-218's counter.
  - Screenshots: `boost-off.png`, `boost-tray.png`, `boost-pick-slot.png`, `boost-placed.png`, `boost-no-gears.png`, `boost-cleanup.png` (a stage with extras, through the dev hook). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/80

### B-220 Struggle help: easier words after three hard ones
- why: a kid who keeps missing gets an easy win before they give up (PROGRESSION.md "Guardrails").
- acceptance:
  - After three words in a row in a round that were not clean (a wrong check, a boost or a reveal), the next two words not yet shown are swapped for solved words from the theme's earlier stages. Swapped-out words stay unsolved and come back in later rounds. Nothing happens on stage 1, or when no earlier word is solved. The kid isn't told.
  - A pure `swapForStruggle(...)` in round.js, tested through `node`; main.js applies it before the next word.
  - Screenshots: `struggle-swap.png` (the swapped-in word on the play screen, after three forced misses). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/90

## M4b — The robot's new voice
Decided by the human on 2026-10-19 (per word: the clean word, then its own gag line; shared lines per moment; Hebrew guesses only where funny) and 2026-10-21/22 (the voice "FLIP ROBIT -FINAL" on Eleven v4, clean words with "!"). The clips are made by `tools/voices.py` into `static/voice/` and listed in `static/voice/manifest.json` (DECISIONS 2026-10-22); since 2026-10-23 every word's `audio` in the theme data is its new clip (`words/<theme>/<word>.mp3`, DECISIONS 2026-10-23).
`static/voice/` is content: read it, never add, edit, rename or re-encode a file there or in `content/voice/`. Only some lines are voiced so far and more arrive in batches (a rerun of the script adds files and manifest entries, nothing else), so everything here works from what the manifest lists today and picks up new clips with no code change. A moment with no new clip yet keeps today's prototype clip (`static/sounds/`).
Line pools and what each moment wants: `content/voice/robot-lines.json` (`pools`, each with its `moment`) and `content/voice/word-lines.json`. The manifest's keys are the files that exist, relative to `static/voice/`; a shared line's file is `robot/<line id>.mp3` and its pool is the id without its `-NN` (`robot/correct-02.mp3` → `correct`).

### B-223 Correct word: the robot says the word, then his gag
- why: on a correct word he should say the word itself mixed with his celebration (human, 2026-10-13), and each word has its own gag line tied to its picture's joke (human, 2026-10-19).
- acceptance:
  - audio.js fetches `/static/voice/manifest.json` once at `init` (a missing or broken manifest counts as an empty one, no console error). Pure helpers, tested through `node` with stand-in manifests: the clips the manifest lists per pool, and a word's gag clips (`gags/<theme>/<word>.mp3`, and `<word>-2.mp3` when it exists).
  - On a correct check (moments `correct` and `streak`) he says the word, clean and complete, from the word's `audio`, then, when it ends, one line: on `correct` the word's gag (one of its gag clips at random), else a random line of pool `correct`; on `streak` a random line of pool `streak`, else the word's gag, else pool `correct`. With none of these clips, the prototype `correct` pool plays after the word as today's clip does. The word is never cut (CHARACTER.md "Rules"); the line after it is his voice clip like any other: one at a time, cut by the next voice clip, by a speaker tap or by leaving the word.
  - Both clips are his voice: they go through the analyser, so the scope mouth, eyes and cap move while he says the word and the gag (B-210). The current word's word and gag clips are fetched and decoded when the word starts (a new word), so they are ready at the check; a clip not ready at the check is skipped, never waited for.
  - The speaker (`speakWord`, B-215) is unchanged: it plays the word as today.
  - Mute and the first-gesture unlock work as today; muted, nothing plays.
  - Docs: CHARACTER.md's moment map ("Correct", "3 correct in a row") and its "Voice lines…" paragraph; CLAUDE.md's audio.js bullet (the manifest, the new clips, and that `static/voice/` is read-only content).
  - Tests: the helpers above; the order word → line; the fallbacks (no gag, no pool line, no clip at all); nothing over the word.
  - Screenshots: `correct-talking.png` (right after a correct check, the scope mouth showing his voice). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/90

### B-225 Apply #86 answer to B-223
- why: a gag never plays without the word (the human, issue #86 B, 2026-10-23); CHARACTER.md "Rules": the target word is always spoken, a quirk may follow it, never replace it. Today, when the word's clip is not ready at a correct check, his line plays alone, and that line can be the word's gag.
- acceptance:
  - On a correct check (moments `correct`, `streak` and the tutorial's `tutorialDone`), when the word's clip is not ready, the word's gag is skipped too: his line is a ready clip of the first of the moment's other lines that has one (`tutorial-done`, `streak`, `correct`), else the prototype `correct` clip, as today. A gag never plays without the word (CHARACTER.md "Rules").
  - With the word's clip ready, nothing changes: the word, then the line as B-223 and B-224 built it.
  - The rule is in audio.js's pure part (`sayPlan` or `pickLine`), tested through `node` with stand-in manifests: a correct check with the word not ready never picks a gag (`correct`, `streak`, `tutorialDone`); with the word ready, the gag as today.
  - Screenshots: `correct-no-word.png` (a correct check with the word's clip held back, the scope mouth showing his shared line). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/102

### B-224 His shared lines on the moments, the Hebrew guess, the letter names
- why: the robot's personality lives in his lines (CHARACTER.md, `claude/flip-robot-lines.md`); the prototype clips don't fit him (human, 2026-10-10).
- acceptance:
  - character.js's moment table names, per moment, the pool of his new lines it plays (CHARACTER.md's moment map gets the column), and audio.js plays a random clip of that pool that the manifest lists; with no clip in the pool, the moment's prototype sound as today (or nothing, where it has none). Starting map, recorded in DECISIONS: `roundStart` → `start`; `picture` → the word's Hebrew guess (`hebrew/<theme>/<word>.mp3`) when it exists, else `picture-<variant>` (surprise, giggle, shock); `filledEarly` and `domeNudge` → `press`; `kidIdle` → `idle`; the peeks → `peek`; `wake` → `wake`; `wrong` → `wrong`, else `mumble`; `wrongPeek` → `mumble`; `hintGiven` → `hint`; `thirdMiss` → `reveal-open`; the round end by its stars: 3 → `end-high`, 2 → `end-mid`, 0–1 → `end-low` (the tada stays as an effect, under or before the line); `speakerLocked` (a boost the kid can't afford) → `no-gears`; `boostGiven` → `boost-slot`, `boost-first` or `boost-clean` by the boost.
  - Letter names: when his letter lands (`hintGiven`, `boostGiven` for Remember this one and First letter) he says its name (`letters/<letter>.mp3`, "Eigh!" … "Zee!") after his line, or alone when the moment has no line.
  - All rules of his voice stay: one clip at a time, never over the word, nothing while muted. A line that can't play now (the word is playing, not decoded yet) is dropped, not queued.
  - Pools not wired here (`greet`, `murmur`, `reveal-close`, `sticker`, `stage`, `gear`, `boost-slow`) get one line each in "Later / not now".
  - Pure helpers (moment → pool, pool → its clips, the picture's choice, the letter clip) tested through `node` with stand-in manifests.
  - Docs: CHARACTER.md moment map (the pool per moment); DESIGN.md "Sound" where it lists the pools.
  - Screenshots: `picture-talking.png` (a new picture, him saying his line). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/90

## M5 — Living pictures
Approved by the human on 2026-10-18 (prototype v3: "every word picture should be lively with a humorous approach, with the humour emphasised in the correct-word animation"). Reference: `design/reference/tv-motion.html` (serve the repo root and open `/design/reference/tv-motion.html`), layers 2 "Life" and 3 "Win"; its layer 1 is B-214. The data is read-only. A word entry's optional `motion` object has `subject` and `plate` (image paths: the cutout and the background with the subject painted out), `idle` (`sway`, `bob`, `hop`, `rumble`, `wobble`, `float`, `breathe` or `spin`), `pivot` (`top`, `bottom` or `center`) and `win` (`cheer`, `drive`, `bungee`, `hop-spin`, `wobble-flop`, `splash`, `pop` or `zoom`); later it may also carry `face` or `win_image` (see "Later").
Build order: life → win.

### B-221 Picture life on the TV
- why: every word picture should feel alive and a little funny, not a still.
- acceptance:
  - A word whose data entry has `motion` shows, once the tune-in locks, as two layers: `motion.plate` (the background) with `motion.subject` (the cutout) over it, framed exactly like `image` is today (they line up pixel for pixel with the full picture). The tune-in still draws from `image`. A word without `motion` (`duck` today) shows its still picture as before.
  - The subject loops its `idle` move around its `pivot` (`top` about 50% 12%, `bottom` about 50% 88%, `center` 50% 50%; the prototype's bat uses 51% 14% and its taxi 50% 88%). `sway` and `rumble` are the prototype's `IDLE` keyframes and timings. The others are new, in the same small scale (the subject moves at most about 2% of the picture or 3°, loops of 1–3.5s): `bob` (a gentle up and down), `hop` (small hops with a squash on landing and a pause between), `wobble` (a rock side to side from its base), `float` (a slow drift up and down with a slight tilt), `breathe` (a slow scale to about 1.02 from the pivot), `spin` (a slow turn back and forth, about ±10°, never a full turn). One table in code.
  - The plate's glow breathes (brightness 1 → 1.07, 4.2s each way) and about 6 dim specks drift up (the prototype's motes).
  - Never in the way: the layers take no taps; the TV's quiet bar and flicker and the wrong-check static still show over them; the robot's "Picture shown" timing is unchanged.
  - Performance: transforms and opacity, plus the plate's brightness for the glow; no per-frame script; all of it stops on a new word, on leaving the play screen and while the page is hidden. Smooth on a mid-range Android phone.
  - `prefers-reduced-motion`: the two layers show still; no idle, glow or specks.
  - A new `picture.js` (a subscriber after `renderTv`) renders the layers and runs the life; it never mutates state; its tables and pure helpers are tested through `node`; CLAUDE.md's architecture list names it. The data has no `face` or `win_image` yet; leave the peek and win frames out.
  - DESIGN.md records the life layer next to the TV lines.
  - Screenshots: `life-cat.png`, `life-bus.png`, `life-helicopter.png`, `life-duck-still.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/90

### B-222 Each word's own win on a correct answer
- why: the correct answer is where each picture's joke pays off (the human's example: the bat opens its wings), instead of the same burst on every word.
- acceptance:
  - When a word is checked correct, its subject plays its `win` move once, inside the TV's mask, then goes back to its idle. `cheer` (1.9s), `bungee` (1.4s) and `drive` (1.5s, with its exhaust puffs) are the prototype's `WIN` moves. New, in the same spirit, big and silly, 1.2–1.9s, each ending exactly where it started: `hop-spin` (a high hop with one full turn in the air, a squash on landing), `wobble-flop` (wobbles, flops over to one side, springs back up), `splash` (dips, then leaps in an arc while teal and cream drops fly), `pop` (a squash, then a big bouncy pop to about 1.25 and settle), `zoom` (shoots off the top with a blur and drops back in from above).
  - With it, the TV's warm flash and sparks (today's correct-check flash and burst) play once, not twice. The slots' pulse and the robot's Correct moment stay as they are.
  - A word without `motion`: the whole picture does the `pop` move, with the flash and sparks.
  - Reduced motion: the prototype's opacity pulse (400ms); no move, no sparks.
  - Performance: as B-221; a win move may also blur its subject for its fast part (the prototype's `drive`).
  - It lives in `picture.js` (B-221); CLAUDE.md's celebrate.js bullet says the TV's win, flash and sparks now start there. DESIGN.md "Feedback" (Correct) is updated.
  - Screenshots, each mid-move: `win-cat-cheer.png`, `win-taxi-drive.png`, `win-dog-hop-spin.png`, `win-helicopter-zoom.png`, plus `win-reduced.png`. Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/90

## M6 — A quieter robot, then the opening screen and login
Decided by the human on 2026-10-26: the prototype is ready as a game; next come a quieter robot, an opening screen (the lab "power-on", tap to start) and login (a parent's Google sign-in, progress kept on the server). Only the first is itemised here; the opening screen and login get their items once their details are settled in chat.

### B-226 A quieter robot: fewer lines, the "press it" line later and not every time
- why: the robot talks too much; the "press the button" line plays every time the kid fills the last slot, and it should come only after a few seconds, with some randomness, and not every time (human, 2026-10-26).
- acceptance:
  - All slots filled, word not checked yet (`filledEarly`): his point at the dome and the dome's blink stay as today, with no line at that moment. His `press` line comes only if the kid has neither pressed the dome nor moved a block for a random 4–7 s, and then only with chance 1/3; at most once per word. A move or a press cancels it. Nothing of this in the tutorial word (`tutorialPress` stays as it is).
  - The dome nudge after a correct word (`domeNudge`, B-212): his point keeps repeating as today, but only the first nudge of a word may say a `press` line, with chance 1/3; later nudges are silent.
  - Three tiers of moments, each moment's tier and chance in one table in character.js, as starting values recorded in DECISIONS (the human will tune them):
    - always: `correct`, `streak` (the word, then his line), `thirdMiss`, `hintGiven`, `boostGiven`, `speakerLocked`, the round end, `greet`, `keyEarned`, `themeOpen` and the tutorial moments.
    - sometimes (chance 1/2): `roundStart`, `wrong`, `wrongPeek`, `wake`, and `picture`'s `picture-<variant>` line. A word's Hebrew guess, when it has one, always plays (those exist only where funny).
    - rare: `kidIdle` (chance 1/3), his peeks' whisper (chance 1/4), the `press` lines above (1/3).
  - A quiet gap: after any line of his ends, a "sometimes" or "rare" line is dropped for 8 s (`TALK_GAP`, in the same table). The "always" moments and the word itself are never dropped by it.
  - A dropped line drops only the voice: the pose, the moves and the effect sounds (swipe, error, tada) play as today. A moment whose line is dropped plays no prototype clip in its place.
  - The chances, the 4–7 s wait and the gap are pure (no DOM), passed a random function, and tested through `node`: each tier at fixed draws, the gap, the press line cancelled by a move, at most one press line per word.
  - Docs: CHARACTER.md's moment map (a column or a note per moment: always / sometimes / rare); CLAUDE.md's character.js and audio.js bullets where they say which moments speak.
  - Screenshots: `filled-quiet.png` (all slots filled, him pointing, the scope mouth off). Checklist passes.
- status: done: https://github.com/kadmon76/flip/pull/106

### B-227 Correct word: the picture's 1-second win first, then the robot speaks
- why: the win should be easy to see and fun, and not compete with the robot (human, 2026-10-27, after the "Win Length Test" prototype: 1 second chosen; the robot says the word after the win; his gag line stays as it is, after the word). Each word gets its own win story later (Word Win Review page, M5); this item sets the timing, the sound and the room to move that those stories will use.
- acceptance:
  - On a correct check the TV picture's win (picture.js, B-222) plays at once and lasts 1 s (`WIN_MS`, one constant, the human may tune it): every move of `WIN` and the reduced-motion pulse are retimed to fit it, keeping their shapes. Easing goes on each keyframe, not on the whole animation, so the beats land where the keyframes say.
  - During the win the subject may leave the TV screen: it is drawn above the TV's frame and the scene (not clipped by the screen's rounded corners), while the plate, the flash and the scanlines stay inside the screen. When the move ends the subject is back in its place inside the screen. A word with no `motion` keeps today's `pop` of the whole picture, clipped as today.
  - A shared win chime, made in code in audio.js like the TV's hiss (no file): two bright notes (about C6 then G6, triangle wave), the second starting about 0.09 s after the first, started with the win. It is an effect: it may overlap anything, the mute stops it. It plays on every correct check (`correct`, `streak`, `tutorialDone`), alongside the moment's existing effect sound.
  - The robot stays quiet during the win: on `correct`, `streak` and `tutorialDone` he looks up at the TV with happy eyes (no pump, no talk) for `WIN_MS`, then does today's pump. His voice (the word, then his gag or streak line, as today) starts when the win ends (`waitFor`), not at the check. Nothing else of his voice starts during the win.
  - The cogs still fly from the TV into the gear counter (B-218); they start when the win ends.
  - iPhone silent switch: code-made sound (Web Audio: his voice, the effects, the hiss, the chime) also plays with the phone's silent switch on. At the first gesture that unlocks sound, audio.js sets `navigator.audioSession.type = 'playback'` where the browser has it, and starts a looping silent clip made in code (a short WAV of zeros as a blob URL, in an `<audio>` element) so the page counts as playing media; the mute pauses it, unmute resumes it. Recorded in DECISIONS.
  - Pure helpers (the retimed move table, `WIN_MS`, the robot's wait for the win, the chime's notes) tested through `node`.
  - Docs: CHARACTER.md moment map (Correct, 3 in a row, Tutorial done: he watches the win, then speaks); CLAUDE.md's picture.js, audio.js and character.js bullets where they describe the win and the correct check; DESIGN.md "Sound" (the chime).
  - Screenshots: `win-out.png` (mid-win, the subject partly outside the TV screen), `win-then-word.png` (just after the win, the scope mouth showing the word). Checklist passes.
- status:

### B-228 Each animal's own win on a correct word
- why: every word picture should act out its own funny win, with its own sound (human, 2026-10-18 and 2026-10-27); the human approved all 32 Animals wins one by one on the Word Win Preview page (2026-10-27/28). The data and the drawings are in the repo; this item plays them in the game.
- needs: B-227 (the 1-second win first, the subject free to leave the screen, the chime, the robot waiting).
- content (read-only, written by Claude in chat): `static/data/wins/animals.json` (`ms` 1000; per word: `pivot`, `peak`, optional `clip`, `frame`, `parts`, `shake`, and `subject`, `fx`, `sfx`; the `story` is for people, never shown) and the part drawings in `static/images/words/animals/` (`<word>-body.webp` plus one file per part, `bat-win.webp`; the bat's plate and subject were replaced to line up with its win drawing). The reference player is `design/reference/word-wins.html` (serve the repo root and open `/design/reference/word-wins.html`): its engine (the `FX` particle kinds and their drawn `SHAPES`, the `SFX` sounds made in code, and `play()`) is the spec. The game must play each win exactly as the reference does.
- acceptance:
  - A word whose theme has a wins file and whose word has an entry plays that win on a correct check, instead of B-227's shared move: the subject's track (all keyframes, easing per keyframe, `extra` props such as `filter` and `opacity`), its `parts` (a word with parts shows `<word>-body.webp` plus each part at its pivot, all inside the moving subject, except a `fixed` part, which stays put beside it; a part's third value is its opacity, stepped), the `frame` swaps (rest/win drawing, stepped), the `shake` (the TV picture jolts), the `fx` (drawn in code like the reference: puff, dust, feathers, sparks, stars, drops, clang, swoosh, bubble, rings, ping, ink, moon, tangle) and the `sfx` (audio.js, made in code, effects: they may overlap anything, the mute stops them). The chime and the warm flash and sparks of B-227 fire at the word's `peak`, not at a fixed time.
  - `clip: true` (crab, mouse) keeps the subject inside the screen; every other win may leave it, drawn above the TV frame as B-227 set up.
  - While the life layers are not showing (not decoded or not locked yet), or for a word with no entry (duck, any other theme), B-227's win plays as today. Under reduced motion: the flash and a pulse only, no move, no particles; the sounds still play.
  - The parts' drawings load with the word's life layers (B-221) and only the current and next word's are fetched.
  - The robot's voice still waits for the win to end (B-227); the win stays 1 s (`ms`).
  - The particle kinds, the sound recipes and the data reader are pure where they can be (no DOM: e.g. the keyframe lists built from a win, the sound schedule, which drawings a word needs) and tested through `node` with the real `animals.json`: every word's tracks start at 0 and end at 1, every part named has its file, every fx kind and sfx name used exists.
  - Docs: CLAUDE.md's picture.js and audio.js bullets (the wins file, parts, the effect sounds); DESIGN.md "Motion" (per-word wins) and "Sound" (their effects).
  - Screenshots: mid-win frames for `giraffe` (neck tangled), `dolphin` (in the air, splash still in place), `crab` (half off the right edge, clipped) and `bat` (wings open); a side-by-side with the reference player at the same moment for one of them. Checklist passes.
- status:

## Later / not now
- Robot says the chunks of a broken word ("heli… copter!") while the brass joint glows; needs the new voice clips (B-213 ships without it).
- Picture peek and win frames: once the data carries `face` or `win_image` (the win-frame batch), the face peeks every 3–7s and the win swaps in the second frame, as the prototype's bat (B-221, B-222 leave them out).
- Slow say boost (PROGRESSION.md): the robot says the word in parts; needs the new voice clips.
- Buy a new theme with gears (PROGRESSION.md "Build decisions"): once Food and Home are in the data; which themes are open from the start and the price are open questions.
- Kept letters draggable on later stages (PROGRESSION.md "Lever rule"); M4 locks them on every stage.
- Stage screens dressed as lab rooms or machine upgrades, and a real stage-cleared animation: a Claude Design session (human).
- Design bump: the overall look feels mellow and restrained; make it bolder across all screens, worked out in Claude Design first (human, 2026-10-15).
- Login and saving the sticker book to the DB (django.contrib.auth is already installed).
- Visual mascot on the theme, round-end and sticker book screens (no corner is reserved since B-116; CHARACTER.md "Poses": robot-hero on the theme screen); character text lines on screens.
- Content in DB and generation pipeline (words, images in one cartoon style, TTS audio).
- PWA: `manifest.json` references icons that do not exist; icons and offline.
- Background music loop with its own toggle.
- Hebrew UI labels (RTL).
- Adaptive word selection (unmastered words return more often).
- Untrack `staticfiles/` (STATIC_ROOT, gitignored but tracked; still holds copies of the legacy frontend files removed in B-102).
- `tools/shot.mjs` sometimes exits 1 with ENOTEMPTY while removing its temp profile after `Browser.close` (Chromium still flushing); the PNG is still written. Wait for process exit before `rmSync` or retry the removal.
- Fold `feedback.js` (B-109, wiggle) and `celebrate.js` (B-110, pulse/confetti/star pop) into one transition-keyed module once both PRs land; the CLAUDE.md lines added from issues #19 and #21 each claim the correct-check effects until then.
- Screen change crossfade 200ms (DESIGN "Motion") has no backlog item; screens still switch instantly via `display`.
- A clink as each cog lands in the gear counter (B-218's flight is silent; needs a clip, or an effect made in code in audio.js like the TV hiss).
- Sticker book reachable from the round-end screen (B-112 puts the only "Stickers" button on the theme screen).
- TV picture: content images carry their own light square backdrop, so the word picture shows as a light card on the teal tube instead of the subject on teal as in v5; needs transparent-background pictures from the content pipeline.
- Wrong-box tint (from closed PR #18, B-109): boxes holding a wrong letter keep an error-colour tint until the kid next moves a block; main has the wiggle and the bulb flicker but no tint.
- Robot peek randomness (issue #34 B): PR #33 (B-115) peeks only after the wrong check that leaves one bulb lit; CHARACTER.md "Peek" now also asks for a rare random peek after the first wrong check.
- Fold card.js's `renderCounter` onto `flaps.js` `renderFlaps` (same split-flap markup; left out of B-116 as a refactor).
- `console.png` has stray dark opaque pixels at its top-left and top-right corners that show as dark notches at both ends of the console's brass rail; needs a cleaned asset from the human (assets are read-only in M1).
- The robot is drawn only on the play screen, so CHARACTER's "Round end" moment (happy for 2–3 stars, idle for 0–1), already picked in `character.js` as `roundEndGood`/`roundEnd`, isn't shown anywhere yet (B-115).
- Replace the placeholder game sounds (swipe, tada, prototype clips still used where a moment has no new line) with ones that fit the lab look; the human will provide them. The robot's voice is M4b.
- Upgrade the Linode's Python (3.8 today) so the server can follow newer Django; until then keep backend code 3.8-compatible (CLAUDE.md).
- `spelling_game` models have no migrations (warning on every deploy); add them before login and server-side sticker saving.
- A dome-aimed point pose for the robot's dome nudge (B-212 reuses `point`, turned 32° down, while the dome is ~13° down from his hand at 360); tune it on `design/reference/robot-puppet.html` with the human.
- `tools/shot.mjs`: a `--reduced-motion` flag (`Emulation.setEmulatedMedia`) and a `--step-timeout <ms>` option, so reduced-motion shots and long real-flow runs don't need a throwaway copy (B-210, B-211, B-212 used one).
- His `murmur` lines (a block placed, neutral, never a hint): not wired by B-224; needs a rule for how often, so they don't come with every block.
- His `reveal-close` lines (third miss, after the letters fly in): not wired by B-224, which plays `reveal-open` at the miss; needs a second line timed to the reveal's end.
- His `sticker` lines (a new sticker): not wired by B-224; no moment for a new sticker yet (it shows only on the round end, where he is not drawn).
- His `stage` lines (a stage cleared): not wired by B-224; no stage-up moment yet (the round end's bulb pop, B-216, has no robot).
- His `gear` lines (the first gear of a session): not wired by B-224; no moment for it yet.
- His `boost-slow` line (the slow say boost, before the slow word): not wired by B-224; waits for the slow say boost (above).
- Renaming or removing a player on the start screen (players and names, chat 2026-10-24): today a player can only be added.
- Tune B-226's starting values: with `TALK_GAP` 8 s and the dome nudge's first at 4 s (B-212), the dome nudge's `press` line is never heard after an answer (the answer's own line is still playing or ended under 8 s before; DECISIONS 2026-10-27).
