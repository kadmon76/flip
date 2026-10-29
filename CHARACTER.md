# Flip — the character

Working copy of the full moment map (with discussion history):
https://claude.ai/code/artifact/ae4e1045-8b41-4905-a03a-e1e69b4e1d3a
This file is the build contract. If they differ, this file wins.

## Who he is
An old, outdated household robot who became an eccentric inventor:
overexcited grandpa energy, wild, warm, easily distracted, a little
dramatic. He knows every word but has forgotten how to spell them, so he
needs the kid. He laughs with the kid, never at them. Name: not decided.

Story is minimal. He exists only at moments where the game already gives
feedback. No cutscenes, no backstory screens.

## How he looks (locked)
Reference: `design/reference/robot-character-sheet.png`.
Cream pod head and body, dark visor with two glowing teal eye shapes, no
mouth, small white bushy eyebrows on the visor's top edge, brass cap on
top, brass ear discs, brass neck ring, orange chest panel, detached
floating mitten hands, no legs, hovers. Expressions are eye shape +
eyebrow angle + hands.

## Poses (the puppet, `static/images/ui/robot/`; BACKLOG B-210)
He is a puppet of separate parts on one 505x505 canvas ("puppet px"),
built and tuned with the human on `design/reference/robot-puppet.html`;
`character.js` keeps that page's numbers.

| Part | Drawn from | What it does |
|---|---|---|
| body | `body.png` | breathes; rises (pop) and sinks with the head |
| head | `head.png` (empty visor) | turns about its neck |
| eyes | code (SVG) inside the visor | idle, wide, squint, confused (one big, one small), dots, happy (`^ ^` arcs); look about the visor; blink |
| scope mouth | code, a glowing line at the visor's bottom | the live waveform of his voice; faint and flat when quiet |
| cap glow and sparks | code, over the brass cap | flare on loud syllables and on 3 in a row |
| eyebrows | `browL.png`, `browR.png` | calm, up, frown, puzzled, worried, happy |
| hands | `hand-restL` / `hand-restR` (rest), `hand-wave`, `hand-point`, `hand-ball` (fist), `hand-palm` (palm up); the left hand mirrors the right-hand shapes, except rest | one hand pose per moment step, below |

Hand poses: rest (both mittens on the console's edge), wave, gasp, giggle
(fist at his mouth), shock (arms out), chin (fist at his chin), point (at
the dome), pointUp (up at the rail), shrug (palms up), cover (over his
eyes), pump (one fist up), pump2 (two fists up), clap; cheer, scratch and
grip are drawn but not used yet.

His body and head stand behind the console; his hands are a layer of
their own over the console's top edge, so they stay in view resting on it
(still under the controls, the rail and the blocks).

While he is shown (the play screen) he is never still: he floats, breathes,
his hands drift, his eyebrows bob out of step and now and then one lifts or
wiggles on its own; he blinks (sometimes twice) and his eyes wander. His
eyes and a small head turn follow a block the kid drags.

Talking: whenever a voice clip plays through `audio.js`, his voice drives four effects
together: the scope mouth draws it, his eyes pulse, his cap glows and
sparks on loud syllables, his head bobs on peaks; his eyebrows rise with
it. Muted, nothing plays, so nothing moves.

`prefers-reduced-motion`: pose and shape changes only, no floating,
bobbing or hops.

The still poses `static/images/ui/robot-*.png` (B-115) stay on disk and
are no longer drawn.

## Presence on the play screen
He stands **behind the console's left third**; the console is drawn over
him. Normally head and shoulders show (~75px). Movement is a vertical
slide, nothing else, except the small head-shake of "Speaker locked" (a ±4.5° turn about the neck, 90ms swings, 540ms; B-203):
- **Pop up** (react): rises ~20px over 180ms, ease-out, then settles.
- **Sink** (bored, idle 10s+): slides down until only the top of the head
  shows, 400ms; pops back up on the kid's next action.
- **Peek** (after the wrong check that leaves one lives bulb lit, and rarely, at random, after the first wrong check too): only eyes above the edge for
  600ms, then normal.
Pose and movement change together; never more than one change per 300ms.
`prefers-reduced-motion`: pose swaps only, no sliding.

## Moment map
| Moment | Pose / movement | Sound | His lines (B-224) | How often | Says (B-226) |
|---|---|---|---|---|---|
| Round start | waves with both hands, eyebrows up, pops up; then hands to rest | — | `start` | always | sometimes (1/2) |
| Picture shown | looks up at the TV, one of three at random: surprise (wide eyes, gasp, pop), giggle (happy eyes, fist at his mouth, head wiggle), shock (dot eyes, worried, arms out, pop, then wide eyes); then rest, head a little turned | — | the word's Hebrew guess (`hebrew/<theme>/<word>.mp3`), else his look's: `picture-surprise`, `picture-giggle` or `picture-shock`; only while he is quiet | always (a third each) | his look's line sometimes (1/2); the Hebrew guess always |
| Block placed (into a slot: from the bench, from another slot, or swapping one out) | rest pose, a glance down, then ahead; while the kid drags a block his eyes and head follow it | swipe | — | always | — |
| Block returned (to the bench by tap, drag or the reset lever) | as Block placed | — | — | always | — |
| All slots filled | points at the dome, eyes wide; about 4 in 10 times extra excited (double pop, finger wagging, eyebrows jumping); from the third round, as Block placed | swipe | none (B-226: his `press` line may come later, Press nudge) | first 2 rounds since the page was loaded (not stored) | — (his `press` line: Press nudge) |
| Press nudge (B-226: All slots filled, and the kid has neither pressed the dome nor moved a block for a random 4–7 s; a move or a press cancels it and the next fill starts the wait again; not the tutorial word) | his point at the dome, as All slots filled (he is still pointing) | — | `press`; only while he is quiet | at most once per word, in the first 2 rounds since the page was loaded (where All slots filled points at the dome) | rare (1/3) |
| Dome nudge (the word answered, correct or revealed, and the dome not pressed 4s after the answer; again every 8s until it is) | points at the dome (eyes wide, eyebrows up, head turned to it), pops up, wags the pointing finger, then rest | — (no fitting clip yet) | `press`, only on the word's first nudge (B-226); only while he is quiet | every 8s | rare (1/3), the word's first nudge only |
| Kid idle 10s | thinks (squint, frown, fist at his chin), sinks, then every few seconds peeks over the edge with no hands showing, looking left and right, until the kid's next input | — | `idle`; each peek, as he comes up: `peek` (a whisper); both only while he is quiet | once per word, while the word is open (an answered word gets the dome nudge instead) | `idle` rare (1/3); each `peek` rare (1/4) |
| Wake up (the kid's next input after the idle sink) | pops up, eyes wide | — | `wake` | after Kid idle | sometimes (1/2) |
| Greet (a player tapped on the start screen; the theme screen comes up; 2026-10-24) | not drawn there yet: on the start screen he stands still, waving, built from his puppet parts; the moment's steps are his wave | — | `greet`; the tap is the one that unlocks the sound, so audio.js waits for a `greet` clip to decode (`waitReady`) instead of skipping it | each time a player starts | always |
| Tutorial: round start (a player's first word ever, `state.tutorial`; 2026-10-24) | as Round start, before the picture locks | — | none (the drag line comes as the picture locks) | the tutorial word only | always (no line) |
| Tutorial: drag (the picture has locked and the kid has placed no letter; coach.js `coachStep` 'drag'; instead of Picture shown) | points, eyes wide, while the ghost mitten carries a letter to the slot | — | `tutorial-drag` | the tutorial word only | always |
| Tutorial: press (every slot full; instead of All slots filled) | points at the dome, eyes wide, while the ghost mitten taps it | swipe | `tutorial-press` | the tutorial word only | always |
| Tutorial: done (the tutorial word checked correct; instead of Correct or 3 in a row) | as Correct: he watches the TV's win, then pumps (B-227) | the win's chime with the win; when it ends he says the word as on Correct, then a line of pool `tutorial-done`, else the word's gag, else `correct` | after the word: `tutorial-done`, else `gag`, else `correct` | once per player | always |
| Key earned (the round end of a round that brought a theme key; keys.js, human 2026-10-24) | not drawn there yet; the steps are a point with wide eyes | — | after his round-end line: `key` | when a round brings a key | always |
| Theme opened (a key opens a locked theme on the theme screen) | not drawn there yet; the steps are a gasp | — | `theme-open` | each theme opened | always |
| Wrong check | confused eyes, puzzled eyebrows, head-shake, shrug | error clip | `wrong`, else `mumble` | always | sometimes (1/2) |
| Wrong check that leaves one bulb lit | ducks to his eyes (no hands), looks left and right, shivers, comes back | error clip | `mumble` | always | sometimes (1/2) |
| Second miss: his letter (B-206; the wrong check that leaves one bulb lit) | when the peek ends: happy, small pop (half the pop), points up at his letter | — | after the line before it: `hint`, then his letter's name (`letters/<letter>.mp3`, "Eigh!" … "Zee!"), or the name alone | always | always |
| Boost given (`boostGiven`, B-219: a boost the kid paid for) | as his letter lands in its slot (or as the clean-up's extra blocks have puffed away): his second-miss letter's steps, happy, small pop, points up at it | — | as it lands, by the boost: `boost-slot` (Remember this one), `boost-first` (First letter), `boost-clean` (Clean-up); then, for a letter, its name, or the name alone | every boost | always |
| Third miss | covers his eyes (dot eyes, worried), then relief (happy eyes) as the blocks fly in | error clip | `reveal-open` | always | always |
| Correct | while the TV's win plays (1 s, B-227) he watches it: looks up at the TV with happy eyes, his hands at rest, no pump, no talk; when it ends: fist pump, happy eyes, pop | the win's chime (made in code, an effect) with the win; when the win ends he says the word, clean and complete (the word's own clip, as his voice), then one line: the word's gag (`gags/<theme>/<word>.mp3`, or its `-2`, at random), else a line of pool `correct`; with neither, a correct clip after the word (B-223) | after the word: `gag`, else `correct` | always | always |
| 3 correct in a row (the third only; the 4th and 5th in a row are Correct again, so each says its gag; human, 2026-10-24) | he watches the TV's win as on Correct (B-227); when it ends: two fists pumping, double pop, cap sparks | the win's chime with the win; when it ends he says the word as on Correct, then a line of pool `streak`, else the word's gag, else a line of pool `correct`; with none, a correct clip after the word (B-223) | after the word: `streak`, else `gag`, else `correct` | once per run of 3 | always |
| Round end | claps (2–3 stars) / rest pose (0–1 stars, never sad); he is not on the round-end screen yet | the fanfare (made in code, an effect: three bright notes rising, about 0.64 s; B-230) as the screen shows; his line when it ends, never under it; nothing of the last word's voice plays on | after the fanfare, by the stars: 3 `end-high`, 2 `end-mid`, 0–1 `end-low` | always | always |
| Speaker locked (from B-219: a boost the kid can't afford; the speaker always plays the word since B-215) | head-shake, frown, shrug | hmm no (placeholder, `error/hmm no.mp3`) | `no-gears` | every time | always |

Voice lines: his new voice (pre-generated AI voice; `tools/voices.py`
makes the clips into `static/voice/`, read-only content, and
`static/voice/manifest.json` lists them; the lines are
`content/voice/robot-lines.json`'s pools and each word's gag and Hebrew
guess in `content/voice/word-lines.json`) arrives in batches. The game
plays what the manifest lists. On each moment he says a random clip of
the first pool in "His lines" that has one (`robot/<pool>-NN.mp3`; the
word's gag and Hebrew guess are its own clips); a moment with no new clip
yet keeps its existing clip from `static/sounds/` (Sound), or says
nothing where it has none. On a correct check he first watches the TV's
win (1 s, B-227: none of his voice starts during it), then says the word
himself, then his line after it (B-223, the two Correct rows above); after his
letter lands (the second miss, a letter boost) he says its name (B-224).
The word he says and his lines are his voice, so he talks with them
(Talking, above), while the word the speaker plays is not. A moment that
comes on its own (the picture, kid idle and his peeks, the press nudge,
the dome nudge) says its line only while he is quiet: due while one of his clips plays,
it is dropped, never cutting him. How often he talks (B-226; the Says
column, character.js `CHATTER`, starting values the human tunes): an
always moment says its line every time; a sometimes or rare one says it
at its chance, and never while he talks or for 8 s after a clip of his
voice ended or was cut (`TALK_GAP`); the always moments and the word
itself are never dropped. A dropped line drops only his voice: his pose,
his moves and the effects (the swipe, the fanfare) play as ever, and no
prototype clip plays in its place. Pools not wired yet: `murmur`,
`reveal-close`, `sticker`, `stage`, `gear`, `boost-slow` (BACKLOG
"Later / not now").

## Rules
- The target word is always spoken clean and complete; a quirk may
  follow it, never replace it.
- One voice clip at a time; a new clip cuts the previous one, except the
  target word.
  Never cut means by another clip: a speaker tap starts the word again
  from the speaker, and leaving the word (next, round end, back) stops
  the word he is saying and drops his line, as it stops the speaker's
  word (B-223).
- When the word's clip is not ready at a correct check, the word's gag
  is skipped too; a shared line or the correct clip plays alone (a gag
  never plays without the word).
- He never covers the rail, the blocks or the console controls.
- No English text from him on screen, ever.
