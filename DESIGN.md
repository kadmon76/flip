# Flip — visual and feel contract

## Direction
A homemade 1960s retro-tech word machine in an inventor's lab. The kid
operates the machine; it should feel like playing with a gadget, never
like filling in a worksheet. Handmade, claymation-like, warm lamp light,
real depth. Humour comes from the machine being homemade and a bit
unreliable, and from the robot. Not babyish, not flat, not neon.

Approved mockup: `design/reference/play-screen-v5.png` (play screen).
Implement to it; do not reinterpret. Theme, round-end and sticker-book
screens are not designed yet: see "Other screens (interim)".

## The layer model (most important rule)
1. **Scene** = images from `static/images/ui/`. Background, frame,
   console, check dome, reset lever, speaker button, mute switch, robot.
2. **Interactive and data parts** = code, drawn to match the scene's
   light: picture on the TV screen, bulbs, flip counter, slot rail,
   letter blocks, glows and motion.

Never replace an image asset with a CSS-drawn version of the same object,
and never draw a new scene object in CSS (buttons, boxes, panels). If an
object is missing, open a question issue; new scene objects are made in
an image model by the human.

Exception: on the interim screens (see "Other screens (interim)") the cream panels with a brass border and the icon buttons (small cream panels with an ink icon) are CSS by design until their design pass.

## Assets (`static/images/ui/`)
| File | What | Shown at (CSS px, 360 wide) |
|---|---|---|
| bg-lab.jpg | lab + TV machine + bench, 1264x2739 | width 100%, anchored top |
| frame.png | cream bakelite bezel, transparent window | border-image overlay |
| console.png | control console (cream + brass plate) | safe width less 4px each side (324px), ~58px tall |
| dome-off / -ready / -pressed.png | check button (also "next") | ~80px wide |
| lever-up / -down.png | reset lever (same canvas, plate aligned) | ~40px wide |
| speaker-off / -on / -cap.png | hear-the-word button; cap = blanked | ~38px wide |
| mute-switch-on / -off.png | header mute switch (same canvas), knob right = sound on, knob left = muted, 180x59 | 60px wide (60x19.7) |
| robot/ body, head, browL, browR, hand-restL / -restR / -wave / -point / -ball / -palm | the robot puppet (505x505 canvas, aligned; hands 2x, placed by centre); the old robot-*.png poses stay on disk, not drawn | see CHARACTER.md |

All scene sprites are lit from the upper left. Every sprite gets a soft
contact shadow (dark, blurred, offset down-right, ~40% opacity).

## Layout (play screen, 360x740 reference; scale with width)
- **Background:** `bg-lab.jpg`, `width:100%`, anchored top. At 360 wide it
  is 780px tall. On taller screens fill below with `--bench-deep`; the
  console hides the join.
- **Frame:** fixed overlay, `pointer-events:none`, above everything:
  ```css
  border-style: solid;
  border-width: 29px 26px 38px 28px;          /* top right bottom left */
  border-image: url(../images/ui/frame.png) 180 165 235 175;   /* no fill */
  ```
  Content safe area inside it: padding `16px 14px 22px 14px`.
- **TV screen** (in % of the background image): x 28%–70%, y 16.4%–30.5%.
  The word picture sits inside, masked to the screen's rounded corners,
  with faint scanlines and a soft teal glow.
- **TV tune-in** (BACKLOG B-214; `design/reference/tv-motion.html` layer 1,
  its numbers): on every new word (the round's first and each next one)
  the TV tunes in for ~1s, drawn in code on a canvas over the picture,
  inside the screen's mask and under its scanlines and glow: fine streaky
  snow (the prototype's cool grey grain), a dark sync bar rolling down,
  the picture rolling vertically (a black gap between frames) and tearing
  sideways from 230ms, slowing, locked still by 760ms; the snow is gone by
  930ms and at 1s the canvas fades off the picture (120ms). A short hiss
  with a channel click, made in code (Web Audio, `audio.js`), plays with
  it; silent when muted. A picture still loading keeps the snow going (2s
  at most). Input is never blocked. The robot's "Picture shown" comes at
  the lock.
- **TV after the lock:** alive but quiet: a faint cream bar (22% of the
  screen tall, opacity 0.07) rolls down the screen in 1.7s every 6–11s,
  and with half of them the screen dims to 0.92 for 90ms. Nothing while
  the play screen is hidden. Reduced motion: the picture fades in over
  250ms instead of the snow and roll (no hiss), then locks; no bar, no
  flicker.
- **Brass plate** under the TV: x 24.5%–72.5%, y 33.3%–38.5%. Left: three
  lives bulbs. Right: split-flap counter "2 / 5".
- **Slot rail:** brass, full safe width, directly below the machine
  (~y 347–413), rail padding 8px. A word breaks as rarely as possible
  (BACKLOG B-213): 1–6 letters, one row of 46x46px slots, gap 6px; 7–8
  letters, one row, never broken (a `break` in the word's data is
  ignored), the slots shrunk to the largest size that fits, never below
  36px (41px for 7, 36px for 8 at 360 wide), gap 4px, the letter in a
  slot ~0.58 of its size, a slot's tap and drop area the rail's full
  height (~52px); 9–10 letters, two rows of 46px slots split at the
  word's `break` (the letters on the first row: heli | copter), not by
  even halves, each row centred, with a small brass joint at the end of
  the first row and the start of the second that glows once (~600ms,
  steady under reduced motion) as the word appears; only a 9–10 letter
  word without a `break` falls back to the even split, with a console
  warning.
- **Letter blocks:** cream clay blocks lying on the bench below the rail,
  52px min, slightly rotated (±4°), in loose staggered rows (max 4 per
  row; on hard a 10-letter word's 12 blocks put five on the first row in a play column narrower than 462px, that is on every phone, and a third row of three starts right of the robot's reach, B-207). Lowercase by default.
- **Console:** pinned to the bottom of the safe area, inset 4px from each
  side of it (324px wide at 360) so its lower corners clear the frame's
  rounded inner corners. On its brass plate,
  left to right: reset lever (far left), speaker (centre-left), check
  dome (right). Reset and check stay far apart.
- **Robot:** behind the console's left third, head and shoulders visible
  (~75px); the console, the rail and the bench blocks are drawn above him (on 9–10 letter words his pop-up passes under the second block row; BACKLOG B-115, B-213).
- **Header:** split-flap logo "flip" top-left, mute toggle top-right, and on the play screen only the back arrow between them (24px left of the toggle's tap area; B-201), inside the safe area over the shelf.

## Palette (sampled from v5; use as CSS variables)
```
--bench:#582703  --bench-deep:#2a1405  --cream:#efe0be  --ink:#2a1c10
--brass:#b98c36  --brass-dark:#6b4a1c  --teal:#27665e   --teal-glow:#3fe0d0
--amber:#ffd87a  --amber-deep:#e8a23a  --charcoal:#2c241c --bulb-off:#84582c
--error:#d9583b
```
No other colours without a DECISIONS entry. Tints within ±15% allowed.

## Type
- Letter blocks: **Andika Bold** (Google Fonts), single-storey a and g,
  the shapes beginners write. 30px+ on 52px blocks. Lowercase default;
  an uppercase option is a display setting only (data unchanged).
- Flip counter and logo: **Courier Prime Bold**, cream on charcoal flaps.
- No other text on screen (see "Words on screen").

## Words on screen
The players cannot read English yet. The only words allowed on screen
are the target word (on the blocks, and revealed in the slots) and the
"flip" logo. Numbers are allowed. Every other label, message and button
is an icon, a light, a sound, motion or the robot. No result-line text.

## Controls and states
- **Check dome** (`#check-btn`): `off` while slots are empty or partly
  filled. When all slots are filled: `ready`, glow pulsing slowly
  (opacity 0.45↔1, 1.2s each way, ease-in-out, infinite) until pressed or a block is
  taken out. Press: `pressed` for 120ms, then the result. After a correct
  answer or a reveal it is `next`: the lit dome blinks on and off (1.2s a blink: lit 480ms, an ember at 0.2 for 408ms, 156ms changes) and, while lit, its glass shines and an amber halo spills past its rim onto the console and the bench, under the blocks (B-212); pressing it goes to
  the next word (the dome is both check and next). After a wrong check it
  stays `off` until a block moves (drag, tap or the reset lever), or until the robot's second-miss letter completes the word (hard, B-207), when it is `ready` at once.
- **Reset lever** (`#reset-btn`): tap → `lever-down` for 250ms, rail shakes
  ±4px for 200ms, placed blocks hop back to their starting spots (300ms,
  30ms stagger), except a locked letter (easy's given first letter, B-204), which stays in its slot; lever springs back. Tap area 48x48. On easy, a pull right after a wrong check (no block moved since) sends back only the letters in wrong slots, and the right ones stay and lock with the same look; any other pull sends back every letter but the given one and the robot's second-miss letter, including the letters an earlier pull locked (B-205). The robot's second-miss letter (B-206) stays through every pull on every level, like the given one.
- **Locked letter** (a slot with the `locked` flag: easy's given first letter, a right letter the easy lever keeps, the robot's second-miss letter): one look for all, a brass plate riveted into the slot in place of the cream block (B-211). Brass face (`--brass-hi` → `--brass` → `--brass-dark`, lit from the upper left), the letter in `--ink` (25px) stamped in with a `--brass-hi` line under it, a small brass rivet in each corner, and sunk: 86% of the slot, so the hole's dark rim shows round it, its top shaded by the rim, no shadow of its own. It never lifts or moves. When a letter locks (the lever, or the robot's letter as it lands) it clunks in: drawn as a placed block it presses in to 0.8 (90ms, ease-in), turns to brass at the hit and comes up to its locked size (110ms, ease-out); no sound. Reduced motion: no press; a letter the lever keeps dips in opacity (200ms), the robot's letter only fades in where it lands (its fly-in's fade).
- **Speaker** (`#speak-btn`): plays the word's audio. `speaker-on` while
  playing. Where a mode hides it, show `speaker-cap` and ignore taps. On normal and hard, before the word is answered (correct or revealed), a tap holds the word back: the robot's head-shake, frown and shrug and "hmm no" instead; the speaker looks the same, no lock icon (B-203).
- **Mute toggle** (`#mute-btn`): top-right, one button: the small cream speaker glyph (code; wave, or cross while muted) then the brass switch (`mute-switch-on` knob right = sound on, `mute-switch-off` knob left = muted, stacked and swapped by class). Remembered in localStorage.
- **Back** (`#play-back-btn`): play screen only, in the header left of the mute toggle: the sticker book's line arrow as a cream glyph (code, 30px) with a contact shadow and no face, 48x48 tap area. Tap → theme screen at once, the round dropped (B-201).

## Feedback (no words)
- Wrong check: blocks in wrong slots wiggle ±6px (300ms); one lives bulb
  flickers three times and goes dark (`--bulb-off`); the TV picture gets a
  150ms static flicker; robot: Wrong check moment (CHARACTER.md).
- Second miss (the wrong check that leaves one bulb lit, every level; B-206): the wrong blocks wiggle as above; then the block in the first wrong slot hops back to its bench spot (the lever's hop), then that slot's right letter flies in from where it lay (the reveal's fly-in) and locks, clunking in as it lands (the locked look, "Controls and states"); robot `confused` peek, then `happy` with a 10px pop when the peek ends. No sound beyond the miss's error clip.
- Third wrong: correct blocks fly into the slots in order (120ms stagger), from wherever they lie (another slot or, on hard, their bench spot, starting at the bench's size); an extra letter in a slot hops back to its bench spot (B-207);
  robot: Third miss moment (CHARACTER.md).
- Correct: slots pulse once; TV screen flashes warm white (200ms); up to
  40 sparks (amber, teal, cream) burst from the TV, 600ms, removed after;
  robot: Correct moment (CHARACTER.md).
- Never block input for more than 300ms. `prefers-reduced-motion`:
  replace motion with opacity fades; the dome glows steadily instead of
  pulsing or blinking (`next` keeps its lit look, shine and halo).

## Motion
Calm-tactile, 120–300ms, ease-out; small overshoot `back.out(1.4)` only for
a block snapping into a slot and for star pops. Block pick-up: scale 1.08,
shadow lifts, 120ms.

## Sound
On by default, mute toggle remembered. Existing clips in `static/sounds/`:
correct → `correct/`, wrong → `error/`, round end → `celebration/tada.mp3`, held-back speaker (B-203) → `error/hmm no.mp3`,
block into slot → `swipe/` (not a block back to the bench or the reset
lever; the reveal fly-in plays the error clip only). One voice clip at a
time; a new one cuts the previous, except the target word: the word stops
the voice clip playing, and a voice clip due while the word plays is
dropped. The swipe and the TV's tune-in hiss (B-214, made in code) are effects and may overlap anything. Muted: nothing
plays; a speaker tap that would play the word is ignored, and a tap on the held-back speaker (B-203) still gets the robot's head-shake, silently. All playback goes through `audio.js`.

## Other screens (interim, until designed)
Theme, round-end and sticker book use: `bg-lab.jpg` blurred 6px and
darkened 40% as backdrop, the same frame, cream panels with a brass
border in CSS, the palette and fonts above, and icons instead of English
labels (play ▶, themes ▦, stickers ★, back ←). Theme cards show the
theme's picture, not its name. These are placeholders; a design pass
will replace them.

Conventions on these screens: numbers are Courier Prime split-flaps; "sticker" is an amber disc with a light star (dark = none); earned / unearned and mastered / missed are lit / dark (stars, bulbs), never ticks, crosses or outlines; a picked option (the level picker) is an icon button pressed in with its bulbs lit (`aria-pressed="true"`), the others raised with dark bulbs.

## Screenshots (implementer produces, reviewer checks)
- `tools/shot.mjs`, viewport 360x740, device scale 2, saved under
  `.agent/screenshots/<backlog-id>/<state>.png`.
- One screenshot per affected screen and per state in the acceptance
  criteria. Desktop shots, when an item names them: `--viewport 1024x740`,
  content centred at max width 480px.

## Screen checklist (reviewer, every screenshot)
- Play screen matches `design/reference/play-screen-v5.png` in layout,
  materials and light.
- Scene objects are the image assets; nothing in their place is CSS-drawn.
- No English on screen except the target word and the logo; numbers ok.
- Only palette colours; fonts as above.
- Tap targets ≥48px (slots may be 46px; on a 7–8 letter word a placed letter's tap area may be 40–45px wide when it spans the rail's full height, B-213).
- Nothing clipped, overlapping, or scrolling sideways at 360px (on the play screen `document.documentElement.scrollWidth` equals the viewport width and `scrollHeight` its height; a positioned glow box past the column edge adds scroll, a `box-shadow` does not).
