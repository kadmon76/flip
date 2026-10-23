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
| Moment | Pose / movement | Sound (M1: existing clips only) | How often |
|---|---|---|---|
| Round start | waves with both hands, eyebrows up, pops up; then hands to rest | — | always |
| Picture shown | looks up at the TV, one of three at random: surprise (wide eyes, gasp, pop), giggle (happy eyes, fist at his mouth, head wiggle), shock (dot eyes, worried, arms out, pop, then wide eyes); then rest, head a little turned | — | always (a third each) |
| Block placed (into a slot: from the bench, from another slot, or swapping one out) | rest pose, a glance down, then ahead; while the kid drags a block his eyes and head follow it | swipe | always |
| Block returned (to the bench by tap, drag or the reset lever) | as Block placed | — | always |
| All slots filled | points at the dome, eyes wide; about 4 in 10 times extra excited (double pop, finger wagging, eyebrows jumping); from the third round, as Block placed | swipe | first 2 rounds since the page was loaded (not stored) |
| Dome nudge (the word answered, correct or revealed, and the dome not pressed 4s after the answer; again every 8s until it is) | points at the dome (eyes wide, eyebrows up, head turned to it), pops up, wags the pointing finger, then rest | — (no fitting clip yet) | every 8s |
| Kid idle 10s | thinks (squint, frown, fist at his chin), sinks, then every few seconds peeks over the edge with no hands showing, looking left and right, until the kid's next input | — | once per word, while the word is open (an answered word gets the dome nudge instead) |
| Wake up (the kid's next input after the idle sink) | pops up, eyes wide | — | after Kid idle |
| Wrong check | confused eyes, puzzled eyebrows, head-shake, shrug | error clip | always |
| Wrong check that leaves one bulb lit | ducks to his eyes (no hands), looks left and right, shivers, comes back | error clip | always |
| Second miss: his letter (B-206; the wrong check that leaves one bulb lit) | when the peek ends: happy, small pop (half the pop), points up at his letter | — | always |
| Boost given (`boostGiven`, B-219: a boost the kid paid for) | as his letter lands in its slot (or as the clean-up's extra blocks have puffed away): his second-miss letter's steps, happy, small pop, points up at it | — | every boost |
| Third miss | covers his eyes (dot eyes, worried), then relief (happy eyes) as the blocks fly in | error clip | always |
| Correct | fist pump, happy eyes, pop | correct clip | always |
| 3 correct in a row | two fists pumping, double pop, cap sparks | correct clip | always |
| Round end | claps (2–3 stars) / rest pose (0–1 stars, never sad); he is not on the round-end screen yet | tada | always |
| Speaker locked (from B-219: a boost the kid can't afford; the speaker always plays the word since B-215) | head-shake, frown, shrug | hmm no (placeholder, `error/hmm no.mp3`) | every time |

Voice lines (the ~60-line pool, pre-generated AI voice, his own quirks
after the target word) are a later item; M1 uses the existing clips.

## Rules
- The target word is always spoken clean and complete; a quirk may
  follow it, never replace it.
- One voice clip at a time; a new clip cuts the previous one, except the
  target word.
- He never covers the rail, the blocks or the console controls.
- No English text from him on screen, ever.
