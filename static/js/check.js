// check.js — the mistake rules from CLAUDE.md "Product rules" as pure
// functions. No DOM: main.js applies the result through setState and a
// Django test runs this module through node.

export const HEARTS = 3;   // attempts per word

// Outcome of pressing Check with `letters` (the placed letters in box
// order) against `word`, holding `lives` hearts:
//   - correct                -> status 'correct', hearts kept, correct: true
//   - wrong, hearts left     -> status 'wrong', one heart lost
//   - wrong, last heart lost -> status 'revealed', correct: false
// A word is mastered (correct: true) only when checked correct with at
// least one heart left; a revealed word never is.
export function checkWord(word, letters, lives) {
    if (lives <= 0) throw new Error('check: no hearts left');
    const answer = Array.isArray(letters) ? letters.join('') : String(letters);
    if (answer === word) return { status: 'correct', lives, correct: true };
    const left = lives - 1;
    if (left <= 0) return { status: 'revealed', lives: 0, correct: false };
    return { status: 'wrong', lives: left, correct: false };
}

// Fill every box with the right letter using the word's own tiles:
// returns the new `tray` (all used) and `placed` (one slot per letter).
export function revealPlacement(word, tray) {
    const used = tray.map((t) => ({ ...t, used: true }));
    const taken = new Set();
    const placed = word.split('').map((ch) => {
        const tile = used.find((t) => t.letter === ch && !taken.has(t.id));
        if (!tile) throw new Error(`check: no tile for "${ch}"`);
        taken.add(tile.id);
        return { letter: tile.letter, tileId: tile.id };
    });
    return { tray: used, placed };
}

// The result line for a status (DESIGN "Tone of text").
export function resultText(status, word) {
    switch (status) {
        case 'correct': return 'Correct!';
        case 'wrong': return 'Not quite, try again';
        case 'revealed': return `The word is "${word}"`;
        default: return '';
    }
}
