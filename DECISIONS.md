# Decisions log
Append-only. One entry per choice an agent made without asking (per ask-rule).

## 2026-09-18 — /health served without trailing slash only (B-000)
- chose: route `path('health', ...)` so exactly `GET /health` returns 200; `/health/` is not routed (404).
- because: acceptance names `/health` literally; monitors and load-balancer probes hit a fixed string, so one canonical URL is simpler. Redirects (301 via APPEND_SLASH) are not useful for probes, and a trailing-slash-only route would break the acceptance path.
- considered: (a) `path('health/')` relying on APPEND_SLASH to redirect `/health` -> `/health/` (adds a 301, fails "exactly /health"); (b) registering both routes (duplicate names, no real gain).
- reversible: yes (add a second `path('health/')` line if ever needed).

## 2026-09-18 — Index view no longer requires login (B-101)
- chose: drop `@login_required` from `spelling_game.views.index`; `GET /` renders the game for anonymous users. Added a test for it.
- because: CLAUDE.md says "Never: login required to play" and "Free to play without login"; with the decorator a fresh load of `/` is a 302 to the login page, so B-101's `theme.png` (fresh load) could not exist. The health endpoint had already been made auth-free for the same reason.
- considered: (a) teaching `tools/shot.mjs` to log in first (needs credentials, a cookie flow, and keeps a rule violation alive); (b) shooting the login page as `theme.png` (fails the acceptance).
- reversible: yes (one decorator line), but it should not be reverted per product rules.

## 2026-09-18 — How tools/shot.mjs finds and drives Chromium (B-101)
- chose: resolve the newest `~/.cache/ms-playwright/chromium-<rev>/chrome-linux/chrome` (numeric sort on `<rev>`), falling back to the newest `chromium_headless_shell-<rev>/chrome-linux/headless_shell`; `CHROMIUM=/path` env overrides. Launch with `--headless=new --remote-debugging-port=0` in a temp `--user-data-dir`, parse the `DevTools listening on ws://…` line from stderr, and talk CDP over Node's built-in `WebSocket` (Target/Page/Runtime/Emulation/Network). Every step (launch, connect, navigate, load, eval, capture) has a 15s timeout; the browser is SIGKILLed and the temp profile removed on every exit path.
- because: the backlog names only "the headless Chromium under `~/.cache/ms-playwright/`"; not hardcoding the revision keeps the tool working after a Playwright update, and the full `chromium-*` build renders fonts like a real phone browser, which the headless shell does not always match. The port approach needs no fd plumbing and works with the global `WebSocket` in Node 22 (no packages).
- also: a main-document HTTP status >= 400 is treated as a navigation failure (exit 1), and page-side uncaught exceptions are printed as `shot: page error:` warnings without failing the shot, so reviewers see broken JS in the log.
- considered: `--remote-debugging-pipe` (fd 3/4, more code); Playwright's own node module (not installed, and CLAUDE.md forbids new dependencies).
- reversible: yes.

## 2026-09-18 — Tracked copies under staticfiles/ left in place (B-102)
- chose: delete only `static/js/script.js`, `static/js/ui.js`, `static/css/style.css`, `static/css/mobile-fixes.css` and the unimported `static/js/data.js`. The collected copies under `staticfiles/{css,js}/` stay.
- because: `staticfiles/` is `STATIC_ROOT` (collectstatic output) and is listed in `.gitignore`, yet its files are tracked from an earlier commit. The acceptance names `templates static` only; untracking `staticfiles/` wholesale touches every admin asset and is unrelated to the frontend rewrite. In DEBUG, runserver serves from `static/` via the finders, so the stale copies are not what the browser loads.
- considered: `git rm --cached -r staticfiles` (large unrelated diff); deleting just the five collected copies (leaves the directory half-tracked and inconsistent).
- reversible: yes.

## 2026-09-18 — Acceptance grep hits inside base64 image data treated as false positives (B-102)
- chose: treat `grep -rn "script.js\|ui.js\|style.css\|mobile-fixes" templates static` as satisfied although it prints two lines: `static/images/animals/horse.svg:45` (`uiIjs`) and `static/images/transportation/bicycle.svg:45` (`uiwjs`). Both are inside base64 `data:image/jpeg` blobs; the unescaped `.` in `ui.js` matches any byte. The same grep with `ui\.js` (dot escaped), or with `--exclude-dir=images`, prints nothing.
- because: the matches are not references to the deleted files, and content assets under `static/images/` are read-only in M1 (CLAUDE.md), so the only way to make the literal grep empty would break that rule.
- considered: editing the two SVGs (forbidden); asking the human (reversible, no user-facing effect, so the ask-rule says decide and log).
- reversible: yes.

## 2026-09-19 — Themes live in state; theme screen renders from it (B-103)
- chose: add `state.themes` (`[{ name, dataUrl, image }]`). `main.js` loads `static/config/themes.json` and every theme's data file once at start-up, takes the first word's `image`, and calls `setState({ themes })`; `renderThemeButtons(state)` is a subscriber that rebuilds the cards only when the array is replaced. `startRound` receives the theme entry and re-fetches its data file (browser cache hit).
- because: CLAUDE.md says every screen is a render of state and state lives only in `state.js`; the previous code built the buttons once outside of state. The acceptance needs the first word's image, which is only in the per-theme data file, so those files must be read before the theme screen can render.
- considered: fetching the images lazily per button (flash of image-less cards); keeping the buttons outside state (violates the architecture rule).
- reversible: yes.

## 2026-09-19 — Palette applied to the play and round-end screens too (B-103)
- chose: to leave no colour literal outside `:root`, elements the theme item does not name were mapped as well: tiles and letter boxes are white surfaces with the DESIGN shadow (empty boxes keep a dashed frame in the muted colour); Check/Next/Play again and the logout pill are primary teal with the text colour as label (white on #7FB7BE is ~2.3:1 contrast); live hearts are the accent colour and lost hearts muted (B-106 owns the error-colour transition); the dragged-tile shadow is the DESIGN shadow colour at 0.24 alpha (`--shadow-lift`). Body text is the system sans-serif at 16px; Fredoka One is used for headings, tiles and buttons per DESIGN "Type".
- because: the acceptance says no other colour literals remain in `game.css`; B-104/B-106 refine these screens later and can change the mapping.
- considered: leaving old literals in place on non-theme screens (fails the acceptance); white button labels (contrast too low for a beginner reader).
- reversible: yes.

## 2026-09-19 — tools/shot.mjs gets `--viewport WxH` (B-103)
- chose: an optional `--viewport <W>x<H>` (CSS px, default `360x740`) that only changes width and height; device scale stays 2 and mobile emulation stays on, so `theme-desktop.png` is 2048x1480. Bad values exit 1 with a usage line (test added). Usage comment stays five lines.
- because: the acceptance needs a 1024x740 screenshot and the task said to extend the tool minimally rather than add another one.
- considered: switching `mobile` off above a width threshold (extra heuristic nobody asked for).
- reversible: yes.

## 2026-09-20 — Letter boxes wrap into even rows instead of shrinking below 48px (B-104)
- chose: boxes are 48px like the tiles. When a word does not fit one row, boxes of 8+ letters shrink toward 40px only if that makes the row fit; otherwise they stay 48px and wrap into rows as even as possible (7 letters at 360px -> 4 + 3, 9 -> 5 + 4, 10 -> 5 + 5). The rule lives in `static/js/layout.js` (`boxLayout(count, width, gap)`, pure, node-tested); `card.js` applies it as `--box-size` / `--cols` on `#letter-boxes` (CSS grid), and `main.js` re-renders the card on `resize`.
- because: at 360px wide with 16px gutters the row is 328px. Seven 48px boxes (372px) and even eight 40px boxes (362px with 6px gaps) do not fit one row, so the DESIGN minimums (48px; 40px only for 8+ letters) force a second row for the 7-, 9- and 10-letter words that already exist in the content. Wrapping keeps every box a full tap target; even rows read better than flex-wrap's 6 + 1. On the 480px desktop column the shrink still applies (9 letters -> 44px, one row).
- considered: shrinking boxes to whatever fits one row (the previous CSS: 27px boxes for "helicopter", fails the 40px floor); letting the box row bleed into the gutters (only rescues 8-letter words, and there are none in the content); hearts and counter on one line to buy height (the item lists them as separate rows).
- reversible: yes.

## 2026-09-20 — Play screen: fixed card, buttons pinned above a 96px mascot strip, primary tile inside a filled box (B-104)
- chose: `#screen-play` is top-aligned with 8px gaps, a `min(48vw, 192px)` square card, and `padding-bottom: 96px` (`--mascot-corner`); the action row uses `margin-top: auto` so Check/Next sit just above that strip in the same place for every word length. A filled box is primary-coloured and the tile inside it also takes the primary colour (no shadow); a tile dragged out keeps the colour until it lands. Empty boxes are white with the DESIGN shadow and a dashed muted frame. Disabled Check is 0.4 opacity with no shadow.
- because: with hearts, counter, two rows of boxes and two rows of tiles for a 10-letter word, the column needs about 640px above the mascot strip at 740px tall, which fixes the card at roughly 176px on a 360px phone. Reserving the whole bottom strip (not just the corner) is the simplest way to keep the bottom-left 96x96 free with full-width buttons, and a constant button position is easier for a kid's thumb. The tile covers the box, so "filled boxes use the primary colour" is only visible if the tile itself is teal.
- considered: buttons right-aligned beside the corner (110px buttons, asymmetric); card that grows into free space (`flex: 1` + `aspect-ratio`, fragile across browsers); keeping the placed tile white on a teal box (teal never visible).
- reversible: yes.
