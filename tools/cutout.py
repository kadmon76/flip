"""Split a Flip word picture into a subject cutout and a clean background plate.

Method (from claude/flip-picture-style.md): the style's ink outlines sit on a
smooth teal background, so blur, mark smooth pixels, and keep the smooth areas
that touch the picture's border as background; everything else is the subject.
The plate is the original with the subject painted out from the surrounding
background, plus grain matched to the background.

usage: python3 tools/cutout.py <in.png> <out_dir> <word> [--debug]
writes <word>.webp, <word>-subject.webp (with alpha), <word>-plate.webp

Offline tool for the picture batch, not part of the app: the server never
runs it, and its packages (numpy, opencv-python-headless, scipy) are not in
requirements.txt. Install them in a separate environment to run it.
"""
import sys, os, json
import numpy as np
import cv2
from scipy import ndimage as ndi

def masks(img):
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
    blur = cv2.GaussianBlur(lab, (0, 0), 3.5)
    gx = cv2.Sobel(blur, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(blur, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt((gx ** 2 + gy ** 2).sum(axis=2))
    # threshold from the picture's own background: the border ring is background
    ring = np.zeros((h, w), bool); ring[:8, :] = ring[-8:, :] = ring[:, :8] = ring[:, -8:] = True
    t = min(12.0, max(5.0, float(np.percentile(grad[ring], 98)) * 1.2))
    smooth = grad < t
    # seal small gaps in the ink outline before flooding in from the border,
    # then grow the background back over the sealing halo through smooth pixels only
    edges = ndi.binary_dilation(~smooth, iterations=3)
    sealed = ~edges
    lab_ids, n = ndi.label(sealed)
    border_ids = np.unique(np.concatenate([lab_ids[0], lab_ids[-1], lab_ids[:, 0], lab_ids[:, -1]]))
    border_ids = border_ids[border_ids > 0]
    bg = np.isin(lab_ids, border_ids)
    bg = ndi.binary_dilation(bg, iterations=4, mask=smooth) | bg
    subj = ~bg
    subj = ndi.binary_opening(subj, iterations=1)
    subj = ndi.binary_closing(subj, iterations=2)
    subj = ndi.binary_fill_holes(subj)
    ids, n = ndi.label(subj)
    if n:
        sizes = ndi.sum(subj, ids, range(1, n + 1))
        subj = np.isin(ids, 1 + np.flatnonzero(sizes >= 0.0015 * h * w))
    return subj, bg

def plate_from(img, subj):
    """Background plate: a radial glow model fitted to the visible background,
    plus a softly extended residual and matched grain, so the plate looks
    right even when the subject drives fully out of the frame."""
    h, w = img.shape[:2]
    f = img.astype(np.float32)
    hole = cv2.dilate(subj.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    known = ~hole
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    sm = cv2.GaussianBlur(f, (0, 0), 2)
    bins = np.arange(0, 1.6, 0.02)
    idx = np.clip(np.digitize(r, bins) - 1, 0, len(bins) - 1)
    prof = np.full((len(bins), 3), np.nan, np.float32)
    for i in range(len(bins)):
        m = known & (idx == i)
        if m.sum() > 40:
            prof[i] = np.median(sm[m], axis=0)
    good = ~np.isnan(prof[:, 0])
    if good.any():
        first, last = np.flatnonzero(good)[[0, -1]]
        prof[:first] = prof[first]; prof[last + 1:] = prof[last]
        for c in range(3):  # fill gaps by interpolation
            gi = np.flatnonzero(~np.isnan(prof[:, c]))
            prof[:, c] = np.interp(np.arange(len(bins)), gi, prof[gi, c])
        prof = cv2.GaussianBlur(prof.reshape(-1, 1, 3), (1, 0), 2).reshape(-1, 3) if False else prof
    else:
        prof[:] = np.median(sm.reshape(-1, 3), axis=0)
    model = prof[idx]
    # extend the visible deviation from the model softly into the hole
    resid = (sm - model) * known[..., None]
    num = cv2.GaussianBlur(resid, (0, 0), 25)
    den = cv2.GaussianBlur(known.astype(np.float32), (0, 0), 25)[..., None] + 1e-3
    fill = model + np.clip(num / den, -25, 25)
    grain_src = (f - sm)[known]
    std = float(np.clip(grain_src.std(), 2, 10))
    noise = np.random.default_rng(7).normal(0, std, (h, w)).astype(np.float32)
    fill = fill + noise[..., None]
    m = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)[..., None]
    out = f * (1 - m) + fill * m
    return np.clip(out, 0, 255).astype(np.uint8)

def main():
    src, out_dir, word = sys.argv[1:4]
    debug = '--debug' in sys.argv
    os.makedirs(out_dir, exist_ok=True)
    bgr = cv2.imread(src, cv2.IMREAD_COLOR)
    img = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    subj, bg = masks(img)
    # soft edge: alpha from a slightly grown mask, feathered 1px
    grown = cv2.dilate(subj.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    alpha = cv2.GaussianBlur(grown, (0, 0), 0.8)
    alpha = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    plate = plate_from(img, subj)
    rgba = np.dstack([img, alpha])
    ys, xs = np.nonzero(subj)
    box = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else [0, 0, 0, 0]
    w = lambda name, arr, mode: cv2.imwrite(os.path.join(out_dir, name),
                                            cv2.cvtColor(arr, mode), [cv2.IMWRITE_WEBP_QUALITY, 82])
    w(f'{word}.webp', img, cv2.COLOR_RGB2BGR)
    w(f'{word}-subject.webp', rgba, cv2.COLOR_RGBA2BGRA)
    w(f'{word}-plate.webp', plate, cv2.COLOR_RGB2BGR)
    info = {'word': word, 'subject_fraction': round(float(subj.mean()), 3), 'box': box,
            'touches_edge': bool(subj[0].any() or subj[-1].any() or subj[:, 0].any() or subj[:, -1].any())}
    if debug:
        dbg = img.copy(); dbg[~subj] = (dbg[~subj] * 0.25).astype(np.uint8)
        cv2.imwrite(os.path.join(out_dir, f'{word}-debug.png'), cv2.cvtColor(dbg, cv2.COLOR_RGB2BGR))
    print(json.dumps(info))

if __name__ == '__main__':
    main()
