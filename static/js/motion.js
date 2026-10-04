// motion.js — tile motion specs from DESIGN.md "Motion". No DOM: drag.js
// reads these and passes in whether prefers-reduced-motion is on; a
// Django test runs this module through node.

// Durations in seconds (GSAP). Overshoot only on the drop into a box;
// pick-up and the return of a stray drop are plain ease-out.
// Correct check (celebrate.js): the boxes `pulse` once to `scale` and
// back, and `count` confetti pieces burst from the card; both start
// together, so the whole beat lasts the confetti `duration` (600ms).
// Round end: each earned star pops in (`starPop`, scale 0 -> 1 with
// overshoot) `stagger` seconds after the previous one. `fade` is the
// opacity-only fallback under reduced motion.
// Console and feedback (feedback.js, celebrate.js; DESIGN "Controls and
// states", "Feedback"):
// - `wiggle`: blocks in wrong slots swing `distance` px left and right and
//   land back at 0 within `duration` (wrong check).
// - `shake`: the same swing for the slot rail when the reset lever is
//   pulled.
// - `flicker`: the lives bulb just lost flickers `flashes` times, then
//   stays dark.
// - `tvStatic`: the TV picture jitters `distance` px under static.
// - `flash`: the TV screen flashes warm white and fades (correct check).
// - `flyIn`: on a reveal the right blocks fly into the slots one after
//   another (`stagger`), landing like a snap into a slot.
// - `hop`: after the reset lever the placed blocks hop `height` px up and
//   back down onto their start spots, `stagger` apart.
export const MOTION = {
    pickup: { duration: 0.12, ease: 'power2.out', scale: 1.08 },
    snap: { duration: 0.2, ease: 'back.out(1.4)', scale: 1 },
    return: { duration: 0.25, ease: 'power2.out', scale: 1 },
    pulse: { duration: 0.3, ease: 'power2.out', scale: 1.1, fade: 0.2 },
    confetti: { duration: 0.6, ease: 'power2.out', scale: 1, count: 40 },
    starPop: { duration: 0.2, ease: 'back.out(1.4)', scale: 1, stagger: 0.2, fade: 0.2 },
    wiggle: { duration: 0.3, ease: 'power1.inOut', scale: 1, distance: 6, fade: 0.3 },
    shake: { duration: 0.2, ease: 'power1.inOut', scale: 1, distance: 4 },
    flicker: { duration: 0.3, ease: 'none', scale: 1, flashes: 3, fade: 0.2 },
    tvStatic: { duration: 0.15, ease: 'none', scale: 1, distance: 2, fade: 0.15 },
    flash: { duration: 0.2, ease: 'power2.out', scale: 1, fade: 0.2 },
    flyIn: { duration: 0.3, ease: 'back.out(1.4)', scale: 1, stagger: 0.12, fade: 0.2 },
    hop: { duration: 0.3, ease: 'power2.out', scale: 1, stagger: 0.03, height: 16, fade: 0.2 },
};

// Spec for one motion. With `reduced` (prefers-reduced-motion) every
// move is instant, nothing scales and nothing overshoots; kinds with a
// `count`, `distance`, `flashes` or `height` get none, kinds with a
// `fade` keep it as an opacity-only fade, `stagger` is kept so fades
// still come one after another.
export function motionFor(kind, reduced) {
    const spec = MOTION[kind];
    if (!spec) throw new Error(`motion: unknown kind "${kind}"`);
    if (reduced) {
        const still = { duration: 0, ease: 'none', scale: 1 };
        for (const key of ['count', 'distance', 'flashes', 'height']) {
            if (key in spec) still[key] = 0;
        }
        if ('stagger' in spec) still.stagger = spec.stagger;
        if ('fade' in spec) still.fade = spec.fade;
        return still;
    }
    return { ...spec };
}
