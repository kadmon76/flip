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

Exception (BACKLOG B-218): the gear counter on the play screen's console, on the brass plate between the speaker and the check dome (a brass cog drawn in code, inline SVG, with the count in split-flap digits; the face of the boost button, B-219), is a new scene object drawn in code until the Claude Design pass replaces it.

Exception (BACKLOG B-219): the boost tray (a small brass plate over the bench, just above the console, its notch pointing at the gear counter, which is the boost button; one cream key per boost that applies, its icon drawn in code, inline SVG, and its cost as small cogs; the amber glow round the slots "Remember this one" offers; a clear scrim under them) is a new scene object drawn in code until the Claude Design pass replaces it.

Tutorial (human, 2026-10-24): on a player's first word a ghost mitten shows what to do, with no words: the robot's own pointing mitten (`ui/robot/hand-point.png`, a puppet part, not a new object) carries a letter from the bench to the first empty slot on a loop, and once every slot is full taps the check dome. It never takes taps; it goes as the kid does the step. Under reduced motion it stays still at the slot or the dome (at the slot, fading in and out).

Exception (theme keys, human 2026-10-24): the brass key and the padlock (the key holder on the theme screen, the key a round earned on the round end, the padlock over a locked theme's card) are new scene objects drawn in code (inline SVG, lit from the upper left like the gear counter's cog) until the Claude Design pass replaces them.

## Assets (`static/images/ui/`)
| File | What | Shown at (CSS px, 360 wide) |
|---|---|---|
| bg-lab.webp | lab + TV machine + bench, 1264x2739 | width 100%, anchored top |
| frame.webp | cream bakelite bezel, transparent window | border-image overlay |
| console.webp | control console (cream + brass plate) | safe width less 4px each side (324px), ~58px tall |
| dome-off / -ready / -pressed.webp | check button (also "next") | ~80px wide |
| lever-up / -down.webp | reset lever (same canvas, plate aligned) | ~40px wide |
| speaker-off / -on / -cap.webp | hear-the-word button; cap = blanked | ~38px wide |
| mute-switch-on / -off.webp | header mute switch (same canvas), knob right = sound on, knob left = muted, 180x59 | 60px wide (60x19.7) |
| robot/ body, head, browL, browR, hand-restL / -restR / -wave / -point / -ball / -palm | the robot puppet (505x505 canvas, aligned; hands 2x, placed by centre); the old robot-*.png poses stay on disk, not drawn | see CHARACTER.md |

The UI uses the `.webp` copies (same names and pixel sizes; BACKLOG B-229); the PNG/JPG originals stay in the repo, unused. `robot/` has no WebP copies: the puppet's parts and the tutorial's mitten stay PNG.

All scene sprites are lit from the upper left. Every sprite gets a soft
contact shadow (dark, blurred, offset down-right, ~40% opacity).

## Layout (play screen, 360x740 reference; scale with width)
- **Background:** `bg-lab.webp`, `width:100%`, anchored top. At 360 wide it
  is 780px tall. On taller screens fill below with `--bench-deep`; the
  console hides the join.
- **Frame:** fixed overlay, `pointer-events:none`, above everything:
  ```css
  border-style: solid;
  border-width: 29px 26px 38px 28px;          /* top right bottom left */
  border-image: url(../images/ui/frame.webp) 180 165 235 175;   /* no fill */
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
- **TV picture life** (BACKLOG B-221; `design/reference/tv-motion.html`
  layer 2 "Life"): from the lock, a word whose data has `motion` shows as
  two layers framed exactly like its picture (they line up pixel for
  pixel): the plate (the background, the subject painted out), its glow
  breathing (brightness 1 → 1.07, 4.2s each way) under about 6 dim cream
  specks drifting up (at most 0.3 opacity, 9–16s each), and over it the
  subject (the cutout) looping its `idle` move around its `pivot` (`top`
  50% 12%, `bottom` 50% 88%, `center` 50% 50%): `sway` and `rumble` as
  the prototype, `bob`, `hop`, `wobble`, `float`, `breathe` and `spin` in
  the same small scale (at most about 2% of the picture or 3°, `spin`
  ±10°; loops of 1–3.5s), every move starting from rest so nothing jumps
  at the lock. The tune-in still rolls the full picture; a word without
  `motion` keeps its still picture. The quiet bar, the dim flicker and
  the wrong-check static show over the layers (they jitter with the
  static); the layers take no taps. Transforms, opacity and the plate's
  brightness only, no script per frame; stopped on a new word, off the
  play screen and while the page is hidden. Reduced motion: the two
  layers show still.
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
  row; with 2 extra letters (stages 4–5, B-215) a 10-letter word's 12 blocks put five on the first row in a play column narrower than 462px, that is on every phone, and a third row of three starts right of the robot's reach, B-207). Lowercase by default.
- **Console:** pinned to the bottom of the safe area, inset 4px from each
  side of it (324px wide at 360) so its lower corners clear the frame's
  rounded inner corners. On its brass plate,
  left to right: reset lever (far left), speaker (centre-left), the gear counter, which is the boost button (B-218, B-219; between the speaker's and the dome's tap areas, its tap area 48px tall), check
  dome (right). Reset and check stay far apart.
- **Robot:** behind the console's left third, head and shoulders visible
  (~75px); the console, the rail and the bench blocks are drawn above him (on 9–10 letter words his pop-up passes under the second block row; BACKLOG B-115, B-213).
- **Header:** split-flap logo "flip" top-left, mute toggle top-right, and between them on the play screen only the back arrow (24px left of the toggle's tap area; B-201) and on the theme screen only the gear counter (a brass cog and the kid's gears in split-flaps, centred between the logo and the toggle; B-218), inside the safe area over the shelf.

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
"flip" logo, and a player's own name, typed by the kid (any language;
under their card on the start screen and beside their picture on the
theme screen; human, 2026-10-24). Numbers are allowed. Every other label, message and button
is an icon, a light, a sound, motion or the robot. No result-line text.

## Controls and states
- **Check dome** (`#check-btn`): `off` while slots are empty or partly
  filled. When all slots are filled: `ready`, glow pulsing slowly
  (opacity 0.45↔1, 1.2s each way, ease-in-out, infinite) until pressed or a block is
  taken out. Press: `pressed` for 120ms, then the result. After a correct
  answer or a reveal it is `next`: the lit dome blinks on and off (1.2s a blink: lit 480ms, an ember at 0.2 for 408ms, 156ms changes) and, while lit, its glass shines and an amber halo spills past its rim onto the console and the bench, under the blocks (B-212); pressing it goes to
  the next word (the dome is both check and next). After a wrong check it
  stays `off` until a block moves (drag, tap or the reset lever), or until the robot's second-miss letter completes the word (a stage with extra letters, B-207, B-215), when it is `ready` at once.
- **Reset lever** (`#reset-btn`): tap → `lever-down` for 250ms, rail shakes
  ±4px for 200ms, the blocks it sends back hop to their starting spots (300ms,
  30ms stagger) and the letters it keeps stay in their slots; lever springs back. Tap area 48x48. Which letters it keeps, the same on every stage (PROGRESSION.md "Lever rule", B-215b): after a wrong check a pull keeps the letters that check found right that are still in their own slot, and they lock with the locked look; every other letter goes back, also one moved or placed since the check, even a right one (the lever never judges a letter the check didn't, so it is never a free check). A pull again right after a pull (no block dragged, tapped or placed by the robot since) starts the word over: every letter goes back, the ones a pull locked too, and the check is forgotten. Before the word's first wrong check a pull sends every letter back. The given first letter (stage 1, B-204, B-215), the robot's second-miss letter (B-206) and a boost's letter (B-219) stay through every pull.
- **Locked letter** (a slot with the `locked` flag: stage 1's given first letter, a letter the last wrong check found right that the lever keeps, on every stage, until a start-over pull sends it back (B-215b), the robot's second-miss letter, from B-219 a boost's letter): one look for all, a brass plate riveted into the slot in place of the cream block (B-211). Brass face (`--brass-hi` → `--brass` → `--brass-dark`, lit from the upper left), the letter in `--ink` (25px) stamped in with a `--brass-hi` line under it, a small brass rivet in each corner, and sunk: 86% of the slot, so the hole's dark rim shows round it, its top shaded by the rim, no shadow of its own. It never lifts or moves. When a letter locks (the lever, or the robot's letter as it lands) it clunks in: drawn as a placed block it presses in to 0.8 (90ms, ease-in), turns to brass at the hit and comes up to its locked size (110ms, ease-out); no sound. Reduced motion: no press; a letter the lever keeps dips in opacity (200ms), the robot's letter only fades in where it lands (its fly-in's fade).
- **Speaker** (`#speak-btn`): plays the word's audio. `speaker-on` while
  playing. A word with no audio file shows `speaker-cap` and ignores taps. On every stage a tap plays the word, before and after the word is answered; it never holds the word back (B-215, PROGRESSION.md: the word is always hearable; B-203's held-back speaker is gone).
- **Mute toggle** (`#mute-btn`): top-right, one button: the small cream speaker glyph (code; wave, or cross while muted) then the brass switch (`mute-switch-on` knob right = sound on, `mute-switch-off` knob left = muted, stacked and swapped by class). Remembered in localStorage.
- **Back** (`#play-back-btn`): play screen only, in the header left of the mute toggle: the sticker book's line arrow as a cream glyph (code, 30px) with a contact shadow and no face, 48x48 tap area. Tap → the theme's stage screen at once, the round dropped (B-201, B-217).

## Feedback (no words)
- Wrong check: blocks in wrong slots wiggle ±6px (300ms); one lives bulb
  flickers three times and goes dark (`--bulb-off`); the TV picture gets a
  150ms static flicker; robot: Wrong check moment (CHARACTER.md).
- Second miss (the wrong check that leaves one bulb lit, every stage; B-206): the wrong blocks wiggle as above; then the block in the first wrong slot hops back to its bench spot (the lever's hop), then that slot's right letter flies in from where it lay (the reveal's fly-in) and locks, clunking in as it lands (the locked look, "Controls and states"); robot `confused` peek, then `happy` with a 10px pop when the peek ends. No sound beyond the miss's error clip.
- Third wrong: correct blocks fly into the slots in order (120ms stagger), from wherever they lie (another slot or, on a stage with extra letters, their bench spot, starting at the bench's size); an extra letter in a slot hops back to its bench spot (B-207);
  robot: Third miss moment (CHARACTER.md).
- Correct: slots pulse once (a word with an entry in its theme's wins file plays that win instead: Motion, "Per-word wins", B-228); the TV picture plays the word's own win
  (BACKLOG B-222; `design/reference/tv-motion.html` layer 3 "Win"): its
  subject does the word's `win` move once, at once, free to leave the TV screen meanwhile (drawn over the TV's frame and the lab; the plate, the flash and the scanlines stay inside; BACKLOG B-227), then
  goes back to its idle (paused meanwhile): `cheer`, `bungee` and `drive`
  (the subject blurred on its fast part, with its exhaust puffs) as the
  prototype; `hop-spin` (a high hop with one full turn in the air, a
  squash on landing), `wobble-flop` (wobbles, topples over to one side,
  springs back up), `splash` (dips, leaps in an arc while teal and cream
  drops fly), `pop` (a squash, a bouncy pop to 1.25, settles) and `zoom`
  (shoots off the top, blurred, a beat up over the TV's frame, drops back
  in from above); each lasting 1 s (B-227: `WIN_MS`, each beat eased on its own keyframe), every move ending exactly where it
  started. A word without `motion` (or whose layers are not showing yet):
  the whole picture does the `pop`, inside the screen. With it, once, the TV screen flashes
  warm white (200ms) and up to 40 sparks (amber, teal, cream) burst from
  the TV, 600ms, removed after. Reduced motion: the flash, and the
  picture's opacity dips to 0.7 and back over the 1 s; no move, no sparks.
  When the win ends (B-227), small cogs, one per gear the word earns, fly from the TV into the console's gear counter, its count flipping up as each lands (600ms at most; reduced motion: the count just changes; B-218); robot: Correct moment (CHARACTER.md: he watches the win, then pumps and says the word).
- Never block input for more than 300ms. `prefers-reduced-motion`:
  replace motion with opacity fades; the dome glows steadily instead of
  pulsing or blinking (`next` keeps its lit look, shine and halo).

## Motion
Calm-tactile, 120–300ms, ease-out; small overshoot `back.out(1.4)` only for
a block snapping into a slot and for star pops. Block pick-up: scale 1.08,
shadow lifts, 120ms.

Per-word wins (BACKLOG B-228): on a correct check, a word with an entry in
its theme's wins file (`static/data/wins/<theme>.json`, approved by the
human on the Word Win Preview page) plays its own 1 s win instead of the
shared move, exactly as `design/reference/word-wins.html` plays it: the
subject's track (each beat eased out on its keyframe, with its blur or
fade), its parts (a body and its parts, each turning at its own pivot,
inside the moving subject; a fixed part, the dolphin's water, stays put),
its frame swaps (the bat's wings-open drawing), its jolts of the TV
picture, and its particles drawn in code over the TV, not clipped by its
screen (puff, dust, feathers, sparks, stars, drops, clang, swoosh, bubble,
rings, ping, ink, moon, tangle; the reference's own drawings and colours,
DECISIONS 2026-10-28). The subject may leave the screen as B-227 set up,
unless the win says `clip` (crab, mouse: they leave by an edge and stay
inside the screen). The TV's warm flash and the sparks come at the win's
peak. A word with no entry (duck, every other theme), or whose layers are
not showing yet, plays the shared win (Feedback, Correct). Reduced motion:
the flash at the peak and the opacity pulse; no move, no particles.

## Sound
On by default, mute toggle remembered. The robot's voice: on each moment
a line of his new voice from the pool CHARACTER.md's moment map names
("His lines", B-224; the clips `static/voice/manifest.json` lists; on a
new picture the word's Hebrew guess when it has one; after his letter
lands, the second miss or a letter boost, its name, `letters/`), and
where the pool has no clip yet the existing clip in `static/sounds/`, or
nothing where the moment has none:
correct → the win's chime with the TV's win (B-227: two bright notes made in code, triangle waves, about C6 then G6, the second 0.09 s after the first; on every correct check, the tutorial word's too; a word with its own win, B-228, has the chime at the win's peak and its own sounds with it, made in code as the reference player makes them, each at its time: the cat's purring motor and sputter, the giraffe's slide, boings and dizzy wobble, and so on, through one gain of 0.55; under reduced motion too), then, once the 1 s win has played, the robot says the word, then his line (CHARACTER.md, B-223), a `correct/` clip when his voice has no line for it, wrong (also the second miss and the reveal) → `error/`, the robot's head-shake (`speakerLocked`; from B-219 a boost the kid can't afford) → `error/hmm no.mp3`.
Round end → a short fanfare made in code (B-230: three bright notes rising, triangle waves, about C5, E5 and G5, 0.12 s apart, the last held about 0.4 s; an effect), as the round-end screen shows; his end line (and the key line after it) starts when the fanfare ends, never under it, and nothing of the last word's voice plays on into the round end (the word he says, his line, a clip still due all stop as it shows). `celebration/tada.mp3`, a clip of the prototype character's voice, is no longer played.
Block into slot → `swipe/` (not a block back to the bench or the reset
lever; the reveal fly-in plays no swipe, only his `reveal-open` line or the error clip). One voice clip at a
time; a new one cuts the previous, except the target word: the word stops
the voice clip playing, and a voice clip due while the word plays is
dropped. How often he speaks is CHARACTER.md's Says column (B-226): a sometimes or rare line is dropped while he talks and for 8 s after his voice went quiet, and a dropped line plays no clip in its place. The swipe, the TV's tune-in hiss (B-214, made in code), the win's chime (B-227, made in code), a word's own win's sounds (B-228, made in code) and the round end's fanfare (B-230, made in code; his end line waits for it) are effects and may overlap anything. Muted: nothing
plays; a speaker tap that would play the word is ignored, and the robot's head-shake still comes, silently. All playback goes through `audio.js`.

## Other screens (interim, until designed)
Start (who's playing; 2026-10-24), theme, stage map, round-end and sticker book use: `bg-lab.webp` blurred 6px and
darkened 40% as backdrop, the same frame, cream panels with a brass
border in CSS, the palette and fonts above, and icons instead of English
labels (play ▶, themes ▦, stickers ★, back ←). Theme cards show the
theme's picture, not its name, two to a row. These are placeholders; a design pass
will replace them.

Theme keys (human, 2026-10-24): a locked theme's card shows its picture greyed and dimmed under a brass padlock. While the kid holds a key the locked cards glow amber and their padlocks rock now and then, and the key holder (a brass key and the count in split-flaps) shows top right, beside the player's name; a tap on a glowing card opens it: the padlock rises, swells, turns and fades away and the picture brightens (`unlock`), and the robot says his theme-open line. With no key a locked card does nothing. On the round end the key a round earned pops in right of the stage bulbs after the stars (`keyPop`), and the robot says his key line after his end line.

Start screen (human, 2026-10-24): the game opens on it. The robot, still and waving, stacked from his puppet parts (not the old still poses), over a grid of square cream cards, three to a row: one per player on the device showing the animal picture the kid picked (a word picture's cutout), and a new-player card with a plus while there is room (6 players at most). A card is the start. The picker shows the pictures no player has taken; with no player yet it shows at once and has no back arrow. A picture picked opens the name step: the picture, a cream name field (Andika Bold 24px, centred, any language, optional, 12 characters at most), back and go (a check mark); go or the keyboard's enter adds the player and starts. Each card shows the player's name under the picture (cut with an ellipsis when long). The theme screen has the player's picture on a small icon button, top left, back to the start screen to switch player, and their name beside it in cream.

Conventions on these screens: numbers are Courier Prime split-flaps; "sticker" is an amber disc with a light star (dark = none); earned / unearned, mastered / missed and a theme's stages cleared / not cleared are lit / dark (stars, bulbs), never ticks, crosses or outlines. There is no level picker: how hard a round is comes from its theme's stage (PROGRESSION.md "Stages", B-215).

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
