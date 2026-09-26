// gallery.js — the sticker book screen (BACKLOG B-112): one section per
// theme with a "have / total" count and a 3-column grid of the theme's
// words. A mastered word shows its image and the word; an unmastered one
// shows the image greyed out (CSS filter) and a "?". Renders from
// state.themes (each theme carries its word list, loaded by main.js) and
// the book read through stickers.js; nothing here mutates state. The only
// control, Back, is wired in main.js.

import { load } from './stickers.js';

// Pure (node-tested): which of `words` ([{ word, image }]) are stickers in
// `theme` according to `book` ({ "<theme>": [word, ...] }, the shape
// stickers.load() returns). Only words in the theme's list count, so a
// sticker for a word that left the content can never push the count past
// the total, and a theme missing from the book is simply 0 / total.
export function themeProgress(book, theme, words) {
    const have = Array.isArray(book[theme]) ? new Set(book[theme]) : new Set();
    const items = words.map(({ word, image }) => ({ word, image, mastered: have.has(word) }));
    return { count: items.filter((i) => i.mastered).length, total: items.length, items };
}

function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function section(theme, progress) {
    const el = document.createElement('section');
    el.className = 'gallery-theme';

    const heading = document.createElement('h3');
    const name = document.createElement('span');
    name.textContent = capitalise(theme.name);
    heading.appendChild(name);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${progress.count} / ${progress.total}`;
    heading.appendChild(count);
    el.appendChild(heading);

    const grid = document.createElement('ul');
    grid.className = 'gallery-grid';
    for (const item of progress.items) {
        const li = document.createElement('li');
        li.className = item.mastered ? 'mastered' : 'locked';
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = '';
        li.appendChild(img);
        const label = document.createElement('span');
        label.className = 'word';
        label.textContent = item.mastered ? item.word : '?';
        li.appendChild(label);
        grid.appendChild(li);
    }
    el.appendChild(grid);
    return el;
}

// Rebuilds the sections from state.themes and the book on every render
// while the gallery shows; the list is small and nothing in it is
// interactive, so there is nothing to preserve between renders.
export function renderGallery(state) {
    if (state.screen !== 'gallery') return;
    const book = load();
    const progress = state.themes.map((t) => themeProgress(book, t.name, t.words || []));

    const any = progress.some((p) => p.count > 0);
    document.getElementById('gallery-empty').style.display = any ? 'none' : '';

    const container = document.getElementById('gallery-themes');
    container.innerHTML = '';
    state.themes.forEach((theme, i) => container.appendChild(section(theme, progress[i])));
}
