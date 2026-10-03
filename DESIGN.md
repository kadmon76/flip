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
   console, check dome, reset lever, speaker button, robot.
2. **Interactive and data parts** = code, drawn to match the scene's
   light: picture on the TV screen, bulbs, flip counter, slot rail,
   letter blocks, glows and motion.

Never replace an image asset with a CSS-drawn version of the same object,
and never draw a new scene object in CSS (buttons, boxes, panels). If an
object is missing, open a question issue; new scene objects are made in
an image model by the human.

## Assets (`static/images/ui/`)
| File | What | Shown at (CSS px, 360 wide) |
|---|---|---|
| bg-lab.jpg | lab + TV machine + bench, 1264x2739 | width 100%, anchored top |
| frame.png | cream bakelite bezel, transparent window | border-image overlay |
| console.png | control console (cream + brass plate) | full safe width, ~60px tall |
| dome-off / -ready / -pressed.png | check button (also "next") | ~80px wide |
| lever-up / -down.png | reset lever (same canvas, plate aligned) | ~40px wide |
| speaker-off / -on / -cap.png | hear-the-word button; cap = blanked | ~38px wide |
| robot-*.png | idle, thinking, confused, excited, happy, oops, hero | see CHARACTER.md |

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
- **Brass plate** under the TV: x 24.5%–72.5%, y 33.3%–38.5%. Left: three
  lives bulbs. Right: split-flap counter "2 / 5".
- **Slot rail:** brass, full safe width, directly below the machine
  (~y 347–413). Slots 46x46px, gap 6px, rail padding 8px. Six slots fit
  one row; 7+ letters wrap into two even rows.
- **Letter blocks:** cream clay blocks lying on the bench below the rail,
  52px min, slightly rotated (±4°), in loose staggered rows (max 4 per
  row). Lowercase by default.
- **Console:** pinned to the bottom of the safe area. On its brass plate,
  left to right: reset lever (far left), speaker (centre-left), check
  dome (right). Reset and check stay far apart.
- **Robot:** behind the console's left third, head and shoulders visible
  (~75px); console drawn above him.
- **Header:** split-flap logo "flip" top-left, mute toggle top-right,
  inside the safe area over the shelf.

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
  (opacity 0.45↔1, 1.2s ease-in-out, infinite) until pressed or a block is
  taken out. Press: `pressed` for 120ms, then the result. After a correct
  answer or a reveal, it returns to `ready` pulse and pressing it goes to
  the next word (the dome is both check and next).
- **Reset lever** (`#reset-btn`): tap → `lever-down` for 250ms, rail shakes
  ±4px for 200ms, placed blocks hop back to their starting spots (300ms,
  30ms stagger), lever springs back. Tap area 48x48.
- **Speaker** (`#speak-btn`): plays the word's audio. `speaker-on` while
  playing. Where a mode hides it, show `speaker-cap` and ignore taps.
- **Mute toggle:** top-right, remembered in localStorage.

## Feedback (no words)
- Wrong check: blocks in wrong slots wiggle ±6px (300ms); one lives bulb
  flickers three times and goes dark (`--bulb-off`); the TV picture gets a
  150ms static flicker; robot `confused`.
- Third wrong: correct blocks fly into the slots in order (120ms stagger);
  robot `oops` then `happy`.
- Correct: slots pulse once; TV screen flashes warm white (200ms); up to
  40 sparks (amber, teal, cream) burst from the TV, 600ms, removed after;
  robot `excited`.
- Never block input for more than 300ms. `prefers-reduced-motion`:
  replace motion with opacity fades; the dome glows steadily instead of
  pulsing.

## Motion
Calm-tactile, 120–300ms, ease-out; small overshoot `back.out(1.4)` only for
a block snapping into a slot and for star pops. Block pick-up: scale 1.08,
shadow lifts, 120ms.

## Sound
On by default, mute toggle remembered. Existing clips in `static/sounds/`:
correct → `correct/`, wrong → `error/`, round end → `celebration/tada.mp3`,
block into slot → `swipe/`. One voice clip at a time; a new one cuts the
previous, except the target word. All playback goes through `audio.js`.

## Other screens (interim, until designed)
Theme, round-end and sticker book use: `bg-lab.jpg` blurred 6px and
darkened 40% as backdrop, the same frame, cream panels with a brass
border in CSS, the palette and fonts above, and icons instead of English
labels (play ▶, themes ▦, stickers ★, back ←). Theme cards show the
theme's picture, not its name. These are placeholders; a design pass
will replace them.

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
- Tap targets ≥48px (slots may be 46px).
- Nothing clipped, overlapping, or scrolling sideways at 360px.
