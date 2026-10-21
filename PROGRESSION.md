# Flip — progression and help (stages, gears, boosts)

Source: the human's Claude Doc "Flip — Progression & help system"
(decided 2026-10-13, lever rule 2026-10-15), copied here on 2026-10-21 so
agents can read it. "Build decisions" fills the doc's open questions with
starting values; the human may change any of them. Backlog: M4.

## Principles
- **A learning game, not a business.** Gears are earned only by playing
  and spent on boosts (later also on new themes). No real money in the
  game now.
- **The word is always hearable, on every stage.** The robot forgot the
  spelling, not the word. The speaker always plays the word.
- **No level picker.** Stages replace the three level buttons.
- **Help fades as the kid improves; earned help replaces it.**
- **Works without reading.** Stages, rewards and boosts are icons,
  lights, numbers, sound and the robot. Never English text.

## Stages
Each theme runs through its stages in order: 1, 2, 3, 4, 5, then `long`
(the theme's 7–10 letter words). A stage is the theme's words whose
`stage` field has that value (the word list puts 5 words in each of 1–5
and about 8 in `long`). A stage with no words in the data is skipped. A
new theme starts at its first stage.

Each stage turns one or two dials, never all at once:

| Stage | Words (from the word list) | Given letters | Extra letters | Right letters the lever keeps |
| --- | --- | --- | --- | --- |
| 1 | 3 letters, every letter heard | first letter, locked | 0 | lock |
| 2 | 3–4 letters, blends | 0 | 0 | lock |
| 3 | letter pairs (sh, ee, ck, oo) | 0 | 1 | lock |
| 4 | one trick (silent e, oa, ai) | 0 | 2 | lock |
| 5 | tricky or 6 letters | 0 | 2 | lock |
| long | 7–10 letters, in chunks | 0 | 0 | lock |

Extra letters are the beginner confusions first (round.js `CONFUSIONS`).
A round's stage rules apply to every word in it, review and fill words
included. All numbers are first guesses to tune in play.

**Clearing a stage.** A stage is cleared when every one of its words has
been checked correct at least once (with or without help; a word the
robot revealed does not count). The next stage then opens. A cleared
stage stays cleared, even if more words are added to it later.

**Rounds.** Rounds stay 5 words. A round of a stage takes, in this order:
up to 2 of the theme's missed words (as today, `MISSED_BACK`); then the
stage's words not yet solved; then its solved words; then review words
from the theme's earlier stages. Only while a theme's data is still
partial (the voice batch has not landed), words from its next stages
fill the rest. The 5 are played in random order.

**Replay.** The kid can play any cleared stage again, and the current
one. A replay earns gears and stickers like any round.

## Repetition and stickers
- **Missed words return** in the next rounds (unchanged, `missed.js`).
- **Sticker on a clean spelling.** A word's sticker is earned the first
  time it is checked correct on the first check with no boost. A word
  solved after mistakes, the free hint or a boost still counts toward
  clearing its stage, just not the sticker. Stars per round are
  unchanged.

## Help
**Free hint (every stage).** After the second wrong check the robot
places one right letter (unchanged, B-206).

**Lever rule (every stage).** After a wrong check, a pull keeps the
letters that check found right (those still in their slots) and locks
them; everything else goes back to the bench, also when the kid moved
some letters since the check. Letters placed after the check are not
judged by the lever, so it never works as a free check. Pulling again
right after (nothing moved since) starts the word over. Before the
word's first wrong check, the lever sends back everything. The given
first letter, the robot's hint letter and a boost's letter always stay. (Kept letters may
become draggable on later stages; not now.)

**Gears.** Earned only by playing, never lost:
- 1 gear per correct word
- +1 more for a clean word (correct on the first check, no boost)
- +2 for finishing a round (reaching the round-end screen)

**Boosts.** The robot does the helping, as part of his half-remembering:

| Boost | What happens | Cost (gears) | Offered when |
| --- | --- | --- | --- |
| Remember this one | Kid taps any slot that isn't locked; the robot puts the right letter there, locked (even if the right letter was already there) | 3 | a slot isn't locked |
| First letter | The robot places the word's first letter, locked | 2 | the first slot isn't locked |
| Clean-up | The extra letters leave the bench and any slot | 2 | the word still has extra blocks |
| Slow say | The robot says the word in parts (fi…sh) | 1 | later: needs the new voice clips |

Boosts must never work as a free check: what is offered, and what
glows, never depends on whether a placed letter is right.

## Guardrails
- **One boost per word** (start at 1, tune in play).
- **No boost before the first try.** Boosts open once every slot of the
  word has been filled at least once.
- **A boost costs the sticker on that try only.** The word comes back
  later; a clean spelling then still earns the sticker.
- **Two rewards, two jobs.** Stickers are the collection and never
  spent; gears are only for spending.
- **No gears, no boost.** A boost the kid can't afford isn't spent: the
  robot shakes his head (his held-back-speaker reaction) and the gear
  counter flickers.
- **Struggle help.** Three words in a row that weren't clean (a wrong
  check, a boost or a reveal) → the next 2 words of the round are
  swapped for solved words from the theme's earlier stages, without
  telling the kid. None on stage 1, or when there is nothing solved to
  swap in.
- **Mistakes never cost gears.**

## Build decisions (2026-10-21, starting values)
These answer the doc's open questions so the build can start; each can
change.
- Stages are per theme, not one ladder for the whole game. The doc's
  "15 words to clear a stage" was written before the word list; a stage
  is now the theme's 5 words of that stage.
- Progress is saved in the kid's browser for everyone (like the sticker
  book); saving it to an account comes with login.
- All themes stay open. Buying a theme with gears waits until Food and
  Home are in the game.
- Slow say waits for the robot's new voice clips.

## Open questions (for play-testing)
- Are 5 words per stage and "every word solved once" the right bar?
- Gear amounts and boost costs.
- Should kept letters stay draggable on later stages?
- How stages look: lab rooms or machine upgrades (a Claude Design
  session; the first build uses the interim screen style).
