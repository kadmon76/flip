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
