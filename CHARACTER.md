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

## Poses (`static/images/ui/robot-*.png`)
| File | Use |
|---|---|
| robot-idle | default, waiting |
| robot-thinking | picture shown; kid idle |
| robot-confused | wrong check |
| robot-excited | correct; streak |
| robot-happy | round end (good); reveal resolved |
| robot-oops | third miss (before the reveal) |
| robot-hero | theme screen, larger |

More poses (pointing left/right/down, shrug, muted) come later from the
same sheet style; until then use the closest pose above.

## Presence on the play screen
He stands **behind the console's left third**; the console is drawn over
him. Normally head and shoulders show (~75px). Movement is a vertical
slide, nothing else:
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
| Round start | idle, pop up | — | always |
| Picture shown | thinking | — | always |
| Block placed | idle (eyes follow) | swipe | always |
| All slots filled | idle; points at dome via robot-excited for 2 rounds | — | first 2 rounds since the page was loaded (not stored) |
| Kid idle 10s | thinking, then sink | — | once per word |
| Wrong check | confused, peek | error clip | always |
| Third miss | oops → happy as blocks fly in | error clip | always |
| Correct | excited, pop up | correct clip | always |
| 3 correct in a row | excited, double pop | correct clip | always |
| Round end | happy (2–3 stars) / idle (0–1 stars, never sad) | tada | always |

Voice lines (the ~60-line pool, pre-generated AI voice, his own quirks
after the target word) are a later item; M1 uses the existing clips.

## Rules
- The target word is always spoken clean and complete; a quirk may
  follow it, never replace it.
- One voice clip at a time; a new clip cuts the previous one, except the
  target word.
- He never covers the rail, the blocks or the console controls.
- No English text from him on screen, ever.
