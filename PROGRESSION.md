# Flip — progression and help (stages, gears, boosts)

Source: the human's Claude Doc "Flip — Progression & help system"
(decided 2026-10-13, lever rule 2026-10-15), copied here on 2026-10-21 so
agents can read it. "Build decisions" fills the doc's open questions with
starting values; the human may change any of them. Backlog: M4.

## Principles
- **A learning game, not a business.** Gears are earned only by playing
  and spent on boosts; new themes open with theme keys (below). No real money in the
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
robot revealed does not count). The stage's boss then opens, and the
next stage opens once the boss is beaten (Bosses, below). A cleared
stage stays cleared, even if more words are added to it later.

**Rounds.** Rounds stay 5 words. A round of a stage takes, in this order:
up to 2 of the theme's missed words (`MISSED_BACK`), only words of this
stage or an earlier one (a miss of a later stage waits for its stage;
human, 2026-10-25); then the
stage's words not yet solved; then its solved words; then review words
from the theme's earlier stages. Only while a theme's data is still
partial (the voice batch has not landed), words from its next stages
fill the rest. The 5 are played in random order.

**Replay.** The kid can play any cleared stage again, and the current
one. A replay earns gears and stickers like any round.

## Bosses
Every stage ends with a boss, the thief bot (B-232, human 2026-11-07; the
approved mock is `design/reference/boss-thief.html`): a memory game
against the clock. Match each picture with its word before the thief
walks his track to the vent with the stolen part. The boss trains
reading the stage's words (the rounds train spelling them); its fake
cards train telling a right spelling from an almost-right one.

- **The gate.** A stage's boss opens once the stage is cleared. The next
  stage opens only when the boss is beaten; theme keys are still earned on
  clearing. Saved per player in progress.js (per theme `bosses`, the
  stages whose boss is beaten, and `bossLosses` per stage). A save from
  before the bosses counts its cleared stages' bosses as beaten (nobody
  loses an open stage).
- **Ways in.** On the stage map a cleared stage whose boss waits shows
  the thief's face on its station, pulsing; a tap starts the boss (a
  beaten one shows the part instead, and a tap replays the stage). The
  round end of a round that just cleared a stage shows a thief button
  that starts it at once; the kid can also leave and come back.
- **The deck.** The stage's words, a picture card and a word card each:
  the theme's missed words of this stage first, then the rest at random.
  Plus fake word cards: a real word of the deck with a near spelling (two
  neighbouring letters swapped, or a look-alike letter: c/k, s/z, b/d,
  i/e, o/u and the like; the first letter kept; never a real word). Fakes
  look exactly like word cards. Dealt face down in rows of 5.
- **The table** (one table, starting values to tune in play):

  | Stage | Pairs | Fakes | Seconds to the vent | The robot reads a word card |
  | --- | --- | --- | --- | --- |
  | 1 | 5 | 0 | 75 | when flipped |
  | 2 | 5 | 0 | 70 | when flipped |
  | 3 | 6 | 2 | 85 | only on a match |
  | 4 | 6 | 2 | 80 | only on a match |
  | 5 | 6 | 3 | 75 | only on a match |
  | long | 6 | 3 | 95 | only on a match |

  A stage with fewer words than its pairs uses all it has. The robot
  reads with the word's own clip; a fake is never read.
- **Play.** The kid flips two cards. A picture and its own word card: a
  pair; the robot says the word, a zap knocks the thief back along his
  track (two pairs in a row: further), the pair leaves the table. Any
  other two: they turn back, and the thief swaps two face-down cards in
  plain sight. A fake with its own word's picture: its wrong letters turn
  red, a bubble shows the right spelling, the robot says the right word,
  the thief jumps a step ahead; the fake stays on the table.
- **The clock is the thief.** He walks his track at the stage's speed;
  the lamps behind him turn red, the vent's alarm lamp flashes past three
  quarters. When the last pair is found, the fakes still on the table are
  shown and fix themselves, and he bursts.
- **Win and lose.** Win: 1 to 3 stars by how far he was from the vent
  (under 45% of the track 3, under 75% 2, else 1), gears 1 per pair, +1
  for a second pair in a row, +2 for the win, the boss beaten. Lose (he
  reaches the vent): the gears earned stay, nothing else is lost; a retry
  is offered. After 2 losses on the same boss he walks 10% slower, 10% more
  per further loss (at most 30% slower); beating him resets it.

## Repetition and stickers
- **Missed words return** in the next rounds of their stage or a later
  one (`missed.js`; see "Rounds").
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
- **Bulbs for the whole round** (B-231; the kid's idea, decided by the
  human 2026-10-28, from stage 1). A round starts with 3 bulbs plus the
  kid's spare bulbs; the TV shows them (up to 5) and they do not refill
  on a new word. Each wrong check, on any word, turns one off; the first
  word's tutorial costs none. Per word nothing else changes: the robot's
  letter after the word's own second miss, the reveal after its own
  third, the lever rule. When the last bulb goes off, the word on screen
  is revealed (it counts as missed and comes back later) and the round
  ends after it: the round end shows the stars for the words solved out
  of the round's 5 and records the round as any finished round (progress,
  missed words, gears, keys). Words not reached are not played and not
  counted as missed.
- **A spare bulb for a perfect round** (B-231). Every word of the round
  correct on the first check with no boost earns one spare bulb for the
  next round, at most 2 held. The next round starts with them; a wrong
  check turns a spare off first, the spares still lit at the round's end
  are kept and the ones turned off are gone, so a perfect round can earn
  one again. Kept per player (bulbs.js).

## Build decisions (2026-10-21, starting values)
These answer the doc's open questions so the build can start; each can
change.
- Stages are per theme, not one ladder for the whole game. The doc's
  "15 words to clear a stage" was written before the word list; a stage
  is now the theme's 5 words of that stage.
- Progress is saved in the kid's browser for everyone (like the sticker
  book); saving it to an account comes with login.
- Theme keys (human, 2026-10-24; replaces "all themes stay open"):
  Animals and Food are open from the start. Clearing a theme's first
  stage earns a key, and the kid picks which locked theme it opens. A
  kid who finishes 6 rounds in a row without a key, holding none, gets
  one anyway, so nobody stays stuck with the same themes. Gears stay for
  boosts only (a theme is not bought with gears). Keys are per player
  (keys.js).
- Slow say waits for the robot's new voice clips.
- Struggle help takes the nearest earlier stage's solved words first (each
  stage's at random), keeps a next word that already is one, and swaps
  fewer than 2 when fewer are solved; the swapped-in words play by the
  round's stage rules.

## Open questions (for play-testing)
- Are 5 words per stage and "every word solved once" the right bar?
- Gear amounts and boost costs.
- Should kept letters stay draggable on later stages?
- How stages look: lab rooms or machine upgrades (a Claude Design
  session; the first build uses the interim screen style).
