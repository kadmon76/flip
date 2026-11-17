// boss.js — the thief bot, the boss at the end of every stage (BACKLOG
// B-232, PROGRESSION.md "Bosses"; the approved mock is
// design/reference/boss-thief.html, its rules and feel are the spec).
// A memory game against the clock: the stage's words as a picture card
// and a word card each, plus fake word cards (a near spelling), dealt face
// down in rows of ROW; the kid flips two cards at a time and matches each
// picture with its word before the thief walks his track to the vent with
// the stolen part. The clock is the thief: his place on the track is a
// pure function of time (thiefAt), from the boss's start and its events
// (he stops, walks on, is knocked back by a pair, jumps ahead on a fake).
//
// This module is the pure part: the stage table (BOSS, rulesOf), the deck
// (dealDeck: pairs, the theme's missed words of the stage first, fakes),
// the fake maker (fakesOf, fakeOf) and the letter diff (diffSpan,
// letterMarks), the pair check (judge), the swap (swapPick, swapCards),
// the clock (startClock, withEvent, hold, release, thiefAt, reachesAt,
// tickEvery, lampsBehind), stars and gears (bossStars, pairGears,
// BOSS_GEARS), the slower walk after losses (slowerBy) and the beats'
// numbers (BEAT, ENTRANCE, entranceMs, endingMs) that main.js's timers,
// bossfx.js's motion and audio.js's sounds all read, so they stay in
// step. No DOM and no module state; a Django test runs it through node.
// main.js applies it (startBoss, onBossCard and the beats), bossview.js
// renders the boss screen from state, bossfx.js plays its motion.

import { STAGES, isStage } from './stage.js';

// Per stage (one table, starting values the human tunes, DECISIONS
// 2026-11-16): how many pairs, how many fake word cards, the seconds he
// takes from his start to the vent at his own speed, and when the robot
// reads a word card: 'flip' (as it is flipped) or 'match' (only on a
// match). A stage with fewer words than its pairs uses all it has.
export const BOSS = {
    1: { pairs: 5, fakes: 0, secs: 75, read: 'flip' },
    2: { pairs: 5, fakes: 0, secs: 70, read: 'flip' },
    3: { pairs: 6, fakes: 2, secs: 85, read: 'match' },
    4: { pairs: 6, fakes: 2, secs: 80, read: 'match' },
    5: { pairs: 6, fakes: 3, secs: 75, read: 'match' },
    long: { pairs: 6, fakes: 3, secs: 95, read: 'match' },
};

// Cards are dealt face down in rows of ROW.
export const ROW = 5;

// The slower walk after losses (BACKLOG B-232): from `after` losses on the
// same boss he walks `per` slower for each loss from then on, at most
// `most`; beating him resets it (progress.js afterBoss).
export const SLOWER = { after: 2, per: 0.1, most: 0.3 };

// How much slower he walks after `losses` losses on this boss (0 to
// SLOWER.most): none before SLOWER.after, then `per` for the loss that
// reaches it and `per` more for each one after.
export function slowerBy(losses) {
    const n = Number.isInteger(losses) && losses > 0 ? losses : 0;
    if (n < SLOWER.after) return 0;
    return Math.round(Math.min(SLOWER.most, (n - SLOWER.after + 1) * SLOWER.per) * 1000) / 1000;
}

// The rules of the boss of `stage` (anything that is not a stage gets
// stage 1's) after `losses` losses: { pairs, fakes, secs, read, slower },
// `secs` the seconds to the vent at his speed then (slower walks take
// longer: secs / (1 - slower)).
export function rulesOf(stage, losses = 0) {
    const base = BOSS[isStage(stage) ? stage : STAGES[0]];
    const slower = slowerBy(losses);
    return { ...base, secs: Math.round((base.secs / (1 - slower)) * 1000) / 1000, slower };
}

// --- The fakes ---

// Letters a beginner mixes up (BACKLOG B-232: c/k, s/z, b/d, i/e, o/u and
// the like; a/e, m/n, g/j, v/w, p/b are the like, the last for a Hebrew
// speaker's ב and פ). Both ways.
export const LOOK_ALIKE = [['c', 'k'], ['s', 'z'], ['b', 'd'], ['i', 'e'], ['o', 'u'], ['a', 'e'], ['m', 'n'], ['g', 'j'], ['v', 'w'], ['p', 'b']];

// Real English words the fake maker could spell from a word of the
// game's data (every near spelling of every word of every theme, checked
// by hand on 2026-11-16; felafel, an accepted spelling of falafel), and a
// few that look or read rude: never a fake, besides
// the game's own words (`known`). Stages 1 and 2 have no fakes today; their
// words' are here in case the table gives them some.
export const REAL_WORDS = [
    'baht', 'beer', 'breed', 'cluck', 'corm', 'dock', 'dour', 'felafel', 'lino', 'loin', 'moose', 'moues', 'paste', 'rabbet',
    'scouter', 'tabla', 'wheal',
    'bad', 'ball', 'beg', 'bet', 'bid', 'bill', 'bog', 'cam', 'carb', 'cop', 'cub', 'dug', 'dull', 'gun', 'hem',
    'lamb', 'mob', 'not', 'peg', 'pen', 'slid', 'tint',
    'bum', 'crap', 'fux', 'hores',
];

// The near spellings of `word` the fake maker may use (pure), in order:
// the first letter stays (an almost-right spelling; the eye anchors on
// it); two neighbouring letters after it swapped, or one letter after it
// swapped for a look-alike (LOOK_ALIKE). Never `word` itself, a real word
// of the game (`known`: every word of every theme) or one of REAL_WORDS.
// Lowercase; sorted, each once.
export function fakesOf(word, known = []) {
    const w = typeof word === 'string' ? word.toLowerCase() : '';
    if (w.length < 2) return [];
    const not = new Set([w, ...REAL_WORDS, ...(Array.isArray(known) ? known : []).map((k) => String(k).toLowerCase())]);
    const out = new Set();
    for (let i = 1; i < w.length - 1; i++) {
        if (w[i] !== w[i + 1]) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
    }
    for (let i = 1; i < w.length; i++) {
        for (const [a, b] of LOOK_ALIKE) {
            const to = w[i] === a ? b : w[i] === b ? a : null;
            if (to) out.add(w.slice(0, i) + to + w.slice(i + 1));
        }
    }
    return [...out].filter((f) => !not.has(f)).sort();
}

// One near spelling of `word` picked at random (`rand`), or null when it
// has none (fakesOf).
export function fakeOf(word, known = [], rand = Math.random) {
    const all = fakesOf(word, known);
    return all.length ? all[Math.floor(rand() * all.length) % all.length] : null;
}

// Which letters differ between a fake `a` and its real word `b` (pure):
// everything between their common start and their common end. Returns
// { from, toA, toB }: a[from, toA) and b[from, toB) differ.
export function diffSpan(a, b) {
    const x = String(a);
    const y = String(b);
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    let j = 0;
    while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
    return { from: i, toA: x.length - j, toB: y.length - j };
}

// The fake's wrong letters and the real word's fixed ones (pure, from
// diffSpan): { bad: per letter of `fake`, wrong; fixed: per letter of
// `real`, one of the letters that put it right }. The bubble over a fake
// caught shows `real` with its fixed letters marked; the ending's fix
// turns the bad letters out and the fixed ones in.
export function letterMarks(fake, real) {
    const d = diffSpan(fake, real);
    return {
        bad: [...String(fake)].map((_, i) => i >= d.from && i < d.toA),
        fixed: [...String(real)].map((_, i) => i >= d.from && i < d.toB),
    };
}

// --- The deck ---

// The boss's deck (pure): `data` is the theme's data file, `stage` the
// stage, `missed` the theme's missed words (missed.js wordsFor, the oldest
// first), `known` every word of the game (no fake may be one), `rules`
// the stage's (rulesOf). The stage's words in the data: its missed words
// first, in their order, then the others at random, `rules.pairs` of
// them (all when it has fewer). Each is a picture card and a word card;
// then `rules.fakes` fake word cards, each a near spelling (fakeOf) of a
// different word of the deck picked at random, never the same as another
// fake (a word with no near spelling left gives none). All shuffled.
// Returns { cards, pairs }: the cards in table order, each { id, kind
// ('pic', 'word' or 'fake'), word (its word; a fake's real word), text
// (what a word card says: the word, or the fake's spelling; null on a
// picture), image, audio, brk (the word's `break`, BACKLOG B-213: a 9-10
// letter word card is written in two lines there) }; `pairs` how many
// pairs. A fake is never read
// (bossview and audio.js read `word` of a 'word' card only).
export function dealDeck(data, stage, missed = [], known = [], rules = rulesOf(stage), rand = Math.random) {
    const entries = data && typeof data === 'object' ? Object.entries(data) : [];
    const words = entries.filter(([, e]) => !!e && e.stage === stage).map(([w]) => w);
    const first = (Array.isArray(missed) ? missed : []).filter((w, i, all) => words.includes(w) && all.indexOf(w) === i);
    const rest = shuffle(words.filter((w) => !first.includes(w)), rand);
    const chosen = [...first, ...rest].slice(0, Math.max(0, rules.pairs));
    let seq = 0;
    const card = (kind, word, text) => ({
        id: `c${seq++}`, kind, word, text,
        image: (data[word] && data[word].image) || null,
        audio: (data[word] && data[word].audio) || null,
        brk: (data[word] && data[word].break) || null,
    });
    const cards = [];
    for (const w of chosen) cards.push(card('pic', w, null), card('word', w, w));
    const all = [...new Set([...words, ...(Array.isArray(known) ? known : [])])];
    const fakes = [];
    for (const w of shuffle(chosen, rand)) {
        if (fakes.length >= rules.fakes) break;
        const f = fakeOf(w, [...all, ...fakes.map((c) => c.text)], rand);
        if (f) fakes.push(card('fake', w, f));
    }
    return { cards: shuffle([...cards, ...fakes], rand), pairs: chosen.length };
}

function shuffle(arr, rand) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1)) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// --- Play ---

// Two face-up cards `a` and `b` (pure): 'pair' (a picture and its own
// word card), 'fake' (a fake with its own word's picture: right animal,
// wrong spelling, a fake caught) or 'miss' (anything else).
export function judge(a, b) {
    if (!a || !b || a.id === b.id) return 'miss';
    const fake = a.kind === 'fake' ? a : b.kind === 'fake' ? b : null;
    const other = fake === a ? b : a;
    if (fake) return other.kind === 'pic' && other.word === fake.word ? 'fake' : 'miss';
    if (a.word === b.word && ((a.kind === 'pic' && b.kind === 'word') || (a.kind === 'word' && b.kind === 'pic'))) return 'pair';
    return 'miss';
}

// The two cards the thief swaps after a miss (pure): two different face
// down cards on the table (not in `up`, not `gone`), picked at random, as
// [id, id]; null when fewer than 3 are face down (as the mock: nothing to
// fool the kid with).
export function swapPick(cards, up = [], gone = [], rand = Math.random) {
    const down = (Array.isArray(cards) ? cards : []).filter((c) => !up.includes(c.id) && !gone.includes(c.id));
    if (down.length < 3) return null;
    const i = Math.floor(rand() * down.length) % down.length;
    const a = down[i];
    const others = down.filter((c) => c !== a);
    const b = others[Math.floor(rand() * others.length) % others.length];
    return [a.id, b.id];
}

// The table after the thief swaps the cards `a` and `b` (ids): each takes
// the other's place. A new array; the same one when either is missing.
export function swapCards(cards, a, b) {
    const i = cards.findIndex((c) => c.id === a);
    const j = cards.findIndex((c) => c.id === b);
    if (i < 0 || j < 0 || i === j) return cards;
    const out = [...cards];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
}

// Gears (BACKLOG B-232; gears.js add, as they are earned): `pair` for a
// pair, `row` more for a pair that is the second (or later) in a row,
// `win` for beating him.
export const BOSS_GEARS = { pair: 1, row: 1, win: 2 };

// The gears of a pair that makes `row` pairs in a row (pure).
export function pairGears(row) {
    return BOSS_GEARS.pair + (row >= 2 ? BOSS_GEARS.row : 0);
}

// Stars by how far he was from the vent when the last pair was found
// (pure): under 45% of the track 3, under 75% 2, else 1.
export const STARS_AT = [0.45, 0.75];

export function bossStars(p) {
    if (!(p < STARS_AT[1])) return 1;
    return p < STARS_AT[0] ? 3 : 2;
}

// --- The clock: he walks the track ---

// A pair knocks him back `by` of the track (`big` times as far for a
// second pair in a row, or the last pair), easing out over `ms`; a fake
// caught pushes him on `by`, over `ms`, never past `cap` (he always walks
// the last bit himself). NEAR: past three quarters the vent's alarm lamp
// flashes and his ticking speeds up (TICK: seconds between ticks).
export const KNOCK = { by: 0.13, big: 1.4, ms: 450 };
export const PUSH = { by: 0.05, ms: 250, cap: 0.99 };
export const NEAR = 0.75;
export const TICK = { every: 0.5, near: 0.25 };

// A clock that starts now (`now`, performance.now() ms) with `secs` to
// the vent: he walks from `start`.
export function startClock(now, secs) {
    return { start: now, secs, events: [] };
}

// The clock with one more event (a new object): `kind` 'stop' (he stops),
// 'go' (he walks on), 'knock' (knocked back `by`) or 'push' (pushed on
// `by`), at time `at` (ms; a knock or push may be dated ahead, at the
// moment it lands).
export function withEvent(clock, kind, at, by = 0) {
    return { ...clock, events: [...clock.events, by ? { kind, at, by } : { kind, at }] };
}

// What stops him (pure): the boss with `reason` added to its holds
// ('pair', 'swap', 'away', 'end'), and a 'stop' at `now` on its clock
// when nothing held him before; the release takes it out, and he walks on
// ('go') when nothing holds him any more. The same boss when nothing
// changes (or with no clock yet).
export function hold(boss, reason, now) {
    const holds = boss.holds || [];
    if (holds.includes(reason)) return boss;
    const clock = boss.clock && !holds.length ? withEvent(boss.clock, 'stop', now) : boss.clock;
    return { ...boss, holds: [...holds, reason], clock };
}

export function release(boss, reason, now) {
    const holds = boss.holds || [];
    if (!holds.includes(reason)) return boss;
    const left = holds.filter((r) => r !== reason);
    const clock = boss.clock && !left.length ? withEvent(boss.clock, 'go', now) : boss.clock;
    return { ...boss, holds: left, clock };
}

const easeOut = (k) => 1 - Math.pow(1 - k, 3);

// Where he is at time `now` (pure): { p, walking }, `p` his place on the
// track (0 his start, 1 the vent). He walks 1 / secs of it a second
// while walking (from `start` until a 'stop', again from a 'go'); each
// 'knock' and 'push' moves him by its `by` (a knock never past his start,
// a push never past PUSH.cap), eased over its time, from the place he is
// at as it comes. Events are taken in time order; ones still ahead of
// `now` do nothing yet.
export function thiefAt(clock, now) {
    if (!clock) return { p: 0, walking: false };
    const speed = 1 / clock.secs;
    const events = clock.events.map((e, i) => ({ ...e, i }))
        .filter((e) => e.at <= now)
        .sort((a, b) => a.at - b.at || a.i - b.i);
    const moves = [];
    const place = (t, walked) => Math.min(1, Math.max(0, walked + moves.reduce(
        (sum, m) => sum + m.d * easeOut(Math.min(1, Math.max(0, (t - m.at) / m.ms))), 0)));
    let walked = 0;
    let walking = true;
    let last = clock.start;
    for (const e of events) {
        if (walking) walked += (Math.max(e.at, last) - last) / 1000 * speed;
        last = Math.max(e.at, last);
        if (e.kind === 'stop') walking = false;
        else if (e.kind === 'go') walking = true;
        else if (e.kind === 'knock' || e.kind === 'push') {
            const here = place(e.at, walked);
            const d = e.kind === 'knock' ? -Math.min(e.by, here) : Math.max(0, Math.min(e.by, PUSH.cap - here));
            moves.push({ at: e.at, d, ms: e.kind === 'knock' ? KNOCK.ms : PUSH.ms });
        }
    }
    if (walking) walked += Math.max(0, now - last) / 1000 * speed;
    return { p: place(now, walked), walking };
}

// When he reaches the vent if nothing else happens (pure): the time (ms,
// as `now`) when thiefAt's `p` reaches 1, or null while he is not walking.
// main.js arms its escape timer on it.
export function reachesAt(clock, now) {
    if (!clock) return null;
    const at = thiefAt(clock, now);
    if (!at.walking) return null;
    if (at.p >= 1) return now;
    const settled = Math.max(now, ...clock.events
        .filter((e) => e.kind === 'knock' || e.kind === 'push')
        .map((e) => e.at + (e.kind === 'knock' ? KNOCK.ms : PUSH.ms)));
    const there = thiefAt(clock, settled);
    if (!there.walking) return null;
    return settled + Math.max(0, 1 - there.p) * clock.secs * 1000;
}

// Seconds between his ticks at place `p`: faster past NEAR.
export function tickEvery(p) {
    return p > NEAR ? TICK.near : TICK.every;
}

// How many of the track's `n` lamps (his start to the vent, evenly
// spaced, each at the middle of its stretch) are behind him at `p`: they
// are red.
export function lampsBehind(p, n) {
    let k = 0;
    for (let i = 0; i < n; i++) if ((i + 0.5) / n < p) k++;
    return k;
}

// --- The beats (ms): main.js's timers, bossfx.js's motion and audio.js's
// sounds read the same numbers ---
//   - flip: two cards face up, then judged.
//   - zap: the zap flying from the dome to the thief (small, big).
//   - pair: after the zap he is knocked back (KNOCK.ms), then `rest`
//     before he walks on.
//   - miss: he laughs `laugh`, then the two cards turn back; `turn`
//     later he swaps two cards: hops to the table (`hop`), grabs them
//     (`lift`), slides them to each other's place (`slide`), hops back
//     (`back`).
//   - fake: the fake shakes (`shake`), then its bubble, the word and his
//     laugh and jump; the bubble stays `bubble`, fades `fade`; then the
//     two cards turn back and `turn` later the kid plays on.
//   - ending: the fakes on the table turn face up (`show`), then one by
//     one each fixes itself (`fix` each: its letters spin out and drop in
//     `swap`, the robot says the word, it glows and zaps him at `zap`);
//     then the final big zap: he swells (`swell`), bursts, the part drops
//     into the console's window (`drop`), and the end card `card` later.
//   - escape: he laughs (`laugh`), dives into the vent (`dive`), the end
//     card `card` later.
export const BEAT = {
    flip: 450,
    zap: { small: 260, big: 480 },
    pair: { rest: 250 },
    miss: { laugh: 600, turn: 350, hop: 380, lift: 200, slide: 650, back: 380 },
    fake: { shake: 550, bubble: 1800, fade: 250, turn: 350 },
    ending: { show: 700, fix: 1500, swap: 500, zap: 700, swell: 900, drop: 1000, card: 1200 },
    escape: { laugh: 400, dive: 700, card: 500 },
};

// The zap's flight for a pair (ms): big for a second pair in a row or the
// last pair.
export function zapMs(big) {
    return big ? BEAT.zap.big : BEAT.zap.small;
}

// The ms a pair beat lasts until he walks on: the zap, his knock-back,
// the rest.
export function pairMs(big) {
    return zapMs(big) + KNOCK.ms + BEAT.pair.rest;
}

// The swap's length (ms): hop, grab, slide, hop back.
export function swapMs() {
    const m = BEAT.miss;
    return m.hop + m.lift + m.slide + m.back;
}

// The fake beat's length (ms) until the cards turn back.
export function fakeMs() {
    const f = BEAT.fake;
    return f.shake + f.bubble + f.fade;
}

// The ending's steps (ms from the last pair's hit): the fakes turn up,
// each fix `fix` apart, then the burst, then the end card. `fakes` is how
// many fakes are left on the table. Returns { show, fixes: [ms...],
// burst, card }.
export function endingMs(fakes) {
    const e = BEAT.ending;
    const show = fakes > 0 ? e.show : 0;
    const fixes = Array.from({ length: Math.max(0, fakes) }, (_, i) => show + i * e.fix);
    const burst = show + Math.max(0, fakes) * e.fix;
    return { show: fakes > 0 ? 0 : null, fixes, burst, card: burst + e.swell + e.drop + e.card };
}

// The entrance (seconds from the boss's start; design/reference/
// boss-thief.html's intro): the lights flicker and dim red (`flicker`,
// five 110ms beats), the alarm turns with its sound and a drumroll
// (`alarm`), the robot ducks behind the console (`duck`), the thief drops
// in (`drop`, landing `land` with a clank), he points along the track to
// the vent and laughs while the track lights up once from him to the vent
// (`point`; lamp by lamp over `sweep`, all of them going off together
// 0.4 s later), the alarm stops and the cards are
// dealt onto the table (`deal`, one every `every`, each `fly` long), and
// the clock starts when the last has landed (entranceMs).
export const ENTRANCE = { flicker: 0, beats: 5, beat: 0.11, alarm: 0.55, duck: 1.05, drop: 1.75, land: 2.24, point: 2.5, sweep: 0.8, deal: 3.5, every: 0.055, fly: 0.36 };

// The entrance's length in ms for `n` cards: until the last card has
// landed and a beat after.
export function entranceMs(n) {
    const e = ENTRANCE;
    return Math.round((e.deal + Math.max(0, n - 1) * e.every + e.fly + 0.2) * 1000);
}
