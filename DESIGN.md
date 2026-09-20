# Flip — visual and feel contract

## Direction
Three words: soft, calm, paper.
Reference: Toca Boca apps — pastel paper-cutout look, rounded shapes, soft
shadows, nothing glossy or neon. The calm look carries a playful, quirky
personality: the humour lives in the character's voice and in small
motions, not in loud colours.
Approved mockup: TODO — implement to this, do not reinterpret.
Until the mockup line is filled, implement to the palette, type and
motion rules below and keep layouts simple; the mockup will refine them.

## Palette (proposed; human confirms with the mockup)
- Background: #FBF6EC (warm paper)
- Surface (card, tiles, boxes): #FFFFFF with shadow rgba(74,60,40,0.12)
- Primary (buttons, theme tiles, filled boxes): #7FB7BE (dusty teal)
- Accent / success: #F2B84B (soft mustard; stars, confetti, correct)
- Error: #E8836F (soft coral; wiggle flash, lost heart)
- Text: #4A3C28 (warm dark brown); muted text #8C7B66
No other colours without a DECISIONS entry. Tints of the above (lighter or
darker by up to 15%) are allowed for hover/pressed states.

## Type
- Font: Fredoka One for headings, tiles and buttons (already loaded from
  Google Fonts in the template); fallback "Comic Sans MS", sans-serif.
  Body text: system sans-serif. Min body size on phone 16px; letter tiles
  and boxes 28px+.
- Tap targets: min 48px on every side. Letter tiles and boxes are at
  least 48x48px; boxes may shrink to 40px only for words of 8+ letters.

## Mascot / character
No visual mascot in M1. The character exists as the voice clips under
`static/sounds/` (correct, error, celebration). Reserve the bottom-left
corner of the play and round-end screens (roughly 96x96px on a 360px
screen) for the mascot; nothing interactive goes there.
Personality: cheeky, warm, a little dramatic; laughs with the kid, never
at them. Text and voice should read as one character.

## Motion
Feel: calm-tactile. Durations 120–300ms, easing ease-out for moves and
snaps, a small overshoot (back.out(1.4)) only for tile drop and star pop.
- Tile pick-up: scale to 1.08 and lift shadow, 120ms.
- Tile drop into box: snap with overshoot, 200ms. The box fills (primary colour) as soon as state changes, so the tile is teal and shadowless while it lands.
- Wrong: tiles in wrong boxes wiggle ±6px horizontally, 300ms; heart
  fades out, 200ms.
- Correct: boxes pulse once, confetti burst from the card, 600ms total,
  does not block input.
- Screen change: crossfade 200ms.
Never block input with animation longer than 300ms. Respect
`prefers-reduced-motion`: tile moves are instant (no scale, no overshoot; the held-state shadow still shows); other animations reduce to opacity fades.

## Sound
ON by default; a mute toggle in the header (top-right), remembered in
localStorage. No background music in M1.
Style: the existing character voice clips. Correct → one random clip
from `static/sounds/correct/`; wrong → one random clip from
`static/sounds/error/`; round end → `celebration/tada.mp3`; tile drop →
`swipe/` clip. Never play two voice clips at once; a new voice clip cuts
the previous one. Sounds are preloaded in pools in `audio.js`; nothing
else calls `Audio`.

## Tone of text
Very little text. English words only; UI labels in short English a
9-year-old beginner reads without help ("Check", "Next", "Play again").
Warm, playful, one exclamation mark per screen at most. The character's
lines are short and funny, never sarcastic toward the kid.

## Screenshots (implementer produces, reviewer checks)
- Viewport 360x740, device scale 2, headless Chromium from
  `~/.cache/ms-playwright/` (no library needed), saved as PNG under
  `.agent/screenshots/<backlog-id>/<screen-or-state>.png`.
- One screenshot per affected screen and per visible state named in the
  acceptance criteria (e.g. play-empty, play-wrong, play-correct,
  round-end-3-stars).
- Non-UI items (backend, tests, tooling): screenshot the JSON or page that
  proves the change in the same viewport; the visual checklist below does
  not apply to it, the reviewer notes "non-UI" and skips it.
- Frames that show drag or tap motion must be produced with a real press/release (CDP `Input.dispatchTouchEvent` or mouse events), not a dispatched `click`; a synthetic click skips Draggable's press path (no z-index boost, no pick-up) and misrepresents layering.

## Screen checklist (reviewer uses this on every screenshot)
- Readable at 360px wide, nothing clipped or overlapping, no horizontal
  scroll
- Only palette colours; font per above
- Tap targets meet 48px minimum
- Mascot corner is free on play and round-end screens
- Matches the approved mockup for that screen (skip while mockup is TODO)
