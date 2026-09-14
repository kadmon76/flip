# Flip — spelling card game

## What this is
A web game for kids aged 9–10 who are beginners in English. A card shows a
picture; the player drags letter tiles into boxes to spell the word.
Single developer, hobby project. Fun and polish come before analytics.

## Stack
- Django 4.2 (Python 3.12), SQLite, django.contrib.auth for login.
- Frontend: vanilla JS (ES modules), GSAP Draggable for drag-and-drop, no build step.
- Word/category content currently in static/data/*.json; will move to DB later.
- Dev: local WSL2, `python manage.py runserver 0.0.0.0:8000`.
- Deploy: Linode via git pull. Never edit code on the server.

## Product rules
- Free to play without login. Login only to save progress/collection.
- Mobile-first, touch-first. Must feel good on a phone.
- Short sessions: rounds of 5 words, then a celebration/round-end screen.

## Architecture (new frontend, in progress)
static/js/
  state.js    — single gameState object + subscribe/emit. Only place state is mutated.
  screens.js  — show/hide screens (theme, play, round-end, gallery).
  card.js     — renders card, letter boxes, letter tray from state.
  drag.js     — GSAP Draggable + snap logic (ported from old ui.js).
  audio.js    — preloaded sound pools; the only place sounds play.
  main.js     — wiring.
Rules: no state stored on DOM elements or in classes. Every screen is a
render of state. Old script.js/ui.js are reference only; delete when replaced.

## Working rules
- One step per task. Ask before expanding scope.
- Explain what you changed and why, briefly.
- Commit after every completed step with a clear message. Remind the user to push.
- No "fix*.js" patch files. Fix the source.
- No new dependencies without asking.
- Run `python manage.py check` before committing backend changes.

## Roadmap
1. Rewrite frontend around state.js: theme → play → 5-word round → round-end with stars, working restart. (current)
2. Feedback: sounds, wiggle on wrong, confetti on word complete.
3. Sticker-book gallery of mastered words (localStorage; DB when logged in).
4. Difficulty scaffolding: easy (first letter given) / normal / hard (distractor letters).
5. Mascot.
6. Content in DB + generation pipeline (words via Claude API, images generated in a fixed cartoon style, audio via TTS).
7. PWA (icons, offline).
