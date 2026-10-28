# B-229 measurements: main vs this branch

Chromium (playwright chromium-1169, headless), DevTools protocol
`Network.emulateNetworkConditions` (1.5 Mbps down, 300 ms latency), cold
cache (a fresh profile each run), 360x740 at 2x, touch. Both served by the
local dev server (`manage.py runserver`; main from a `git worktree` of
`main` at 656b957). The flow: open the page, wait until the start screen
shows, a quick kid (0.5-0.8 s between taps) picks a picture and goes (new
device) or taps their card (returning player), taps Animals, taps station 1.
Median of 3 runs each, every run in brackets. Throwaway script:
`/tmp/b229/measure.mjs` (built from `tools/shot.mjs`, not committed).

- "idle": the page's `load` event, then its first `requestIdleCallback`
  (the moment audio.js now starts fetching).
- "drawn": the start screen visible with the robot's images, the backdrop
  and the cards in place. "shows": every picture on it loaded too, and the
  fonts.
- "lock": `state.tuned`, the first word's picture locked at the end of the
  TV's tune-in.

## New device (no player yet: the picker's 8 pictures)

| | main | branch | target |
|---|---|---|---|
| bytes before the start screen is idle | 9.66 MB, 173 requests [9.66, 9.66, 9.66] | 1.80 MB, 81 requests [1.80, 1.80, 1.80] | under 1 MB: not met |
| of them his voice and the game sounds | 6.79 MB | 0 | |
| of them the UI images | 1.63 MB | 0.55 MB (0.26 MB of it the robot's PNG parts, which have no WebP copies) | |
| start screen drawn | 11.4 s [11.4, 11.4, 11.4] | 7.1 s [7.1, 7.1, 7.2] | |
| start screen shows | 52.8 s [52.8, 52.8, 52.8] | 11.0 s [11.0, 11.0, 11.1] | under 3 s: not met |
| stage tap -> first word's picture locks (tapping once the start screen shows) | 2.66 s [2.73, 2.58, 2.66] (main: tapped at ~56 s, every clip already in) | 2.36 s [2.36, 1.73, 2.48] | under 3 s: met |
| stage tap -> lock, tapping as soon as the start screen is drawn | 33.6 s [33.96, 33.34] (tap at ~21.7 s; 6.1 MB came in meanwhile) | 2.1 s [1.75, 2.48] (tap at ~11.5 s) | under 3 s: met |

## Returning player (one player on the device)

| | main | branch | target |
|---|---|---|---|
| bytes before the start screen is idle | 9.66 MB, 173 requests [9.66, 9.66, 9.66] | 1.26 MB, 70 requests [1.28, 1.26, 1.26] | under 1 MB: not met |
| start screen drawn | 11.4 s | 7.1 s [7.1, 7.1, 7.1] | |
| start screen shows | 52.8 s | 7.9 s [7.9, 7.9, 7.9] | under 3 s: not met |
| stage tap -> lock (tapping once the start screen shows) | 2.58 s [2.58, 2.59, 1.75] | 2.38 s [1.73, 2.48, 2.38] | under 3 s: met |

## What is left before idle on the branch (new device, 1.80 MB)

| | bytes |
|---|---|
| JS (33 modules + GSAP), sent uncompressed by the dev server | 530 KB |
| UI images (WebP 0.29 MB, the robot's puppet PNGs 0.26 MB) | 555 KB |
| word pictures (the picker's 8 cutouts + the 4 theme cards) | 540 KB |
| CSS | 87 KB |
| theme data (themes.json + 4 data files) | 65 KB |
| fonts, HTML | 27 KB |

A returning player's start no longer fetches the picker's 8 pictures
(0.42 MB on main too: its first render showed the picker before the
players were read). The JS and CSS are 569 KB as files, 182 KB gzipped;
served compressed, the branch's returning-player start would be about
0.89 MB, a new device's about 1.41 MB. Whether the Linode compresses
static files is not known here.
