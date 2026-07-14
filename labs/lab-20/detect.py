"""
micro-detect — a deepfake detector with no neural net, in pure Python.

No numpy, no torch. It uses the frequency fingerprint from section 6: generators
upsample, leaving a faint periodic checkerboard that is nearly invisible in pixels
but a sharp spike in the 2D Fourier spectrum. We score the ratio of high- to
low-frequency energy; "fake" images (with the artifact) score far higher.

    python3 detect.py

This is exactly what a classic media-forensics tool checks first -- and section 6
explains why even this clean signal loses the arms race against strong generators.
"""
import math, random
random.seed(0)

N = 32
K = 8  # artifact (upsampling) frequency

def base_image():
    """A smooth, low-frequency 'real' image: a few Gaussian blobs."""
    im = [0.0] * (N * N)
    blobs = [(10, 12, 6, 0.9), (22, 20, 7, 0.7), (16, 8, 5, 0.6)]
    for y in range(N):
        for x in range(N):
            v = 0.12
            for bx, by, r, a in blobs:
                v += a * math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * r * r))
            im[y * N + x] = min(1.0, v)
    return im

def add_artifact(im, amp):
    """Add the faint periodic upsampling checkerboard a generator leaves behind."""
    out = im[:]
    for y in range(N):
        for x in range(N):
            out[y * N + x] = max(0.0, min(1.0, out[y * N + x]
                                  + amp * math.cos(2 * math.pi * K * x / N)
                                        * math.cos(2 * math.pi * K * y / N)))
    return out

def dft_magnitude(im):
    """Naive 2D DFT magnitude spectrum (fine at 32x32)."""
    mag = [0.0] * (N * N)
    for u in range(N):
        for v in range(N):
            re = im_ = 0.0
            for y in range(N):
                for x in range(N):
                    ang = -2 * math.pi * (u * x + v * y) / N
                    p = im[y * N + x]
                    re += p * math.cos(ang); im_ += p * math.sin(ang)
            mag[v * N + u] = math.hypot(re, im_)
    return mag

def high_freq_score(im):
    """Energy far from DC / energy near DC. Low for real, high for artifacted."""
    mag = dft_magnitude(im)
    hi = lo = 0.0
    for u in range(N):
        for v in range(N):
            du, dv = min(u, N - u), min(v, N - v)
            r = math.hypot(du, dv)
            m = mag[v * N + u]
            if r > 6: hi += m * m   # away from DC = high frequency
            else:     lo += m * m   # near DC = low frequency
    return hi / (lo + 1e-9)

def is_fake(im, threshold=0.002):
    return high_freq_score(im) > threshold

if __name__ == "__main__":
    real = base_image()
    fake = add_artifact(real, amp=0.06)   # a faint, eye-invisible artifact
    sr, sf = high_freq_score(real), high_freq_score(fake)
    print(f"high-frequency energy score  real: {sr:.4f}   fake: {sf:.4f}")
    print(f"verdict  real -> {'FAKE' if is_fake(real) else 'real'} ,  "
          f"fake -> {'FAKE' if is_fake(fake) else 'real'}")
    print("the artifact is barely visible in pixels but ~10x the score in frequency space.")
