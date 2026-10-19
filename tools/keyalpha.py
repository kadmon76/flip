"""Alpha from a Canva background-removal render over magenta (#FF00FF).

usage: python3 tools/keyalpha.py <original.png> <keyed.png> <out_mask.png>
The keyed render may be framed slightly differently from the original preview
(another page size), so the original is first aligned onto the render (ECC,
affine, on the solid subject pixels). Each keyed pixel is a*F + (1-a)*K, with F
the aligned original and K magenta, so a = dot(p-K, F-K) / |F-K|^2. The mask is
then mapped back onto the original's pixels. Prints the alignment check.
Offline tool like cutout.py (numpy, opencv-python-headless); not used by the app.
"""
import sys, json
import numpy as np, cv2
K = np.array([255, 0, 255], np.float32)
orig = cv2.cvtColor(cv2.imread(sys.argv[1]), cv2.COLOR_BGR2RGB).astype(np.float32)
key = cv2.cvtColor(cv2.imread(sys.argv[2]), cv2.COLOR_BGR2RGB).astype(np.float32)
H, W = key.shape[:2]; h, w = orig.shape[:2]
S = np.array([[W / w, 0, 0], [0, H / h, 0]], np.float32)          # stretch original to the render's size
hard = (np.abs(key - K).sum(2) > 150)
solid = cv2.erode(hard.astype(np.uint8), np.ones((5, 5), np.uint8))
g_key = cv2.cvtColor(key.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
g_org = cv2.cvtColor(cv2.warpAffine(orig, S, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
warp = np.eye(2, 3, dtype=np.float32)
try:
    _, warp = cv2.findTransformECC(g_key, g_org, warp, cv2.MOTION_AFFINE,
                                   (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), solid, 5)
except cv2.error:
    pass
# full map original -> render: render(x) = orig(warp_total^-1 ...); build it as one affine
A = np.vstack([S, [0, 0, 1]]); B = np.vstack([warp, [0, 0, 1]])
# ECC gives g_org(B·x) ≈ g_key(x), i.e. render pixel x shows stretched-original pixel B·x
M_r2o = np.linalg.inv(A) @ B                                      # render pixel -> original pixel
F = cv2.warpAffine(orig, M_r2o[:2].astype(np.float32), (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
d = F - K
a = np.clip(((key - K) * d).sum(2) / np.maximum((d * d).sum(2), 1.0), 0, 1)
near = (d * d).sum(2) < 60 ** 2
a[near] = hard[near].astype(np.float32)
err = float(np.abs(F - key)[solid > 0].mean()) if solid.any() else 0.0
# back onto the original's pixels
M_o2r = np.linalg.inv(M_r2o)
a_o = cv2.warpAffine(a, M_o2r[:2].astype(np.float32), (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
cv2.imwrite(sys.argv[3], (np.clip(a_o, 0, 1) * 255).round().astype(np.uint8))
print(json.dumps({'coverage': round(float(a_o.mean()), 3), 'solid_err': round(err, 2),
                  'shift': [round(float(warp[0, 2]), 2), round(float(warp[1, 2]), 2)],
                  'scale': [round(float(warp[0, 0]), 4), round(float(warp[1, 1]), 4)]}))
