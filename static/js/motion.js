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
export const MOTION = {
    pickup: { duration: 0.12, ease: 'power2.out', scale: 1.08 },
    snap: { duration: 0.2, ease: 'back.out(1.4)', scale: 1 },
    return: { duration: 0.25, ease: 'power2.out', scale: 1 },
    pulse: { duration: 0.3, ease: 'power2.out', scale: 1.1, fade: 0.2 },
    confetti: { duration: 0.6, ease: 'power2.out', scale: 1, count: 40 },
    starPop: { duration: 0.2, ease: 'back.out(1.4)', scale: 1, stagger: 0.2, fade: 0.2 },
};

// Spec for one motion. With `reduced` (prefers-reduced-motion) every
// move is instant, nothing scales and nothing overshoots; kinds with a
// `count` get none, kinds with a `fade` keep it as an opacity-only fade.
export function motionFor(kind, reduced) {
    const spec = MOTION[kind];
    if (!spec) throw new Error(`motion: unknown kind "${kind}"`);
    if (reduced) {
        const still = { duration: 0, ease: 'none', scale: 1 };
        if ('count' in spec) still.count = 0;
        if ('stagger' in spec) still.stagger = spec.fade || 0;
        if ('fade' in spec) still.fade = spec.fade;
        return still;
    }
    return { ...spec };
}
