// motion.js — tile motion specs from DESIGN.md "Motion". No DOM: drag.js
// reads these and passes in whether prefers-reduced-motion is on; a
// Django test runs this module through node.

// Durations in seconds (GSAP). Overshoot only on the drop into a box;
// pick-up and the return of a stray drop are plain ease-out.
export const MOTION = {
    pickup: { duration: 0.12, ease: 'power2.out', scale: 1.08 },
    snap: { duration: 0.2, ease: 'back.out(1.4)', scale: 1 },
    return: { duration: 0.25, ease: 'power2.out', scale: 1 },
};

// Spec for one motion. With `reduced` (prefers-reduced-motion) every
// move is instant, nothing scales and nothing overshoots.
export function motionFor(kind, reduced) {
    const spec = MOTION[kind];
    if (!spec) throw new Error(`motion: unknown kind "${kind}"`);
    if (reduced) return { duration: 0, ease: 'none', scale: 1 };
    return { ...spec };
}
