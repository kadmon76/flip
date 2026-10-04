// audio.js — the only place sounds play (CLAUDE.md, DESIGN "Sound").
// B-114 needs one sound: the target word, the per-word `audio` file from
// the content JSON, played when the kid taps the speaker on the console.
// The character's voice pools and the mute toggle (B-108, PR #16) belong
// in this file too when they land.
//
// The target word is never cut by another clip (DESIGN "Sound"); a new
// tap on the speaker starts it again from the beginning. Playback starts
// inside the tap's handler, so the browser's autoplay policy allows it.

// Handle to the word clip now playing (an HTMLAudioElement), or null. It
// is not game state and not a DOM cache: audio.js keeps it so a new tap or
// a word change can stop the clip, and reads it only to tell whether an
// ended clip is still the current one (a stopped or replaced clip must not
// call its `onEnd`). No other module reads it; whether the word is playing
// is `state.speaking`, set by main.js, and that is the truth.
let wordClip = null;

// Play the word clip at `url`; `onEnd` runs once when it ends or fails to
// play (missing file, decode error, playback refused). A clip stopped by
// stopWord() or replaced by a new speakWord() never calls its `onEnd`:
// whoever stopped it has already moved on.
export function speakWord(url, onEnd) {
    stopWord();
    let el;
    try {
        el = new Audio(url);
    } catch (e) {
        onEnd();
        return;
    }
    wordClip = el;
    const done = () => {
        if (wordClip !== el) return;
        wordClip = null;
        onEnd();
    };
    el.addEventListener('ended', done);
    el.addEventListener('error', done);
    const p = el.play();
    if (p && p.catch) p.catch(done);
}

// Stop the word clip if one is playing (the word changed or the screen
// left the play screen).
export function stopWord() {
    if (!wordClip) return;
    const el = wordClip;
    wordClip = null;
    el.pause();
}
