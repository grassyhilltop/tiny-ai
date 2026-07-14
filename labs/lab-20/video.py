"""
micro-video — why naive per-frame generation flickers, in pure Python.

No numpy, no torch. Renders the SAME animation (a face that sways, blinks, and
smiles) two ways and measures the flicker:

  naive       : a fresh independent noise field every frame  -> flicker
  consistent  : one shared noise field reused every frame     -> stable

It prints the mean frame-to-frame change for each. The naive clip changes a lot
between frames (that's flicker); the consistent clip changes only as much as the
intended motion. Same idea the browser widget animates.

    python3 video.py
"""
import math, random
random.seed(0)

G = 12
def randn():
    u, v = random.random(), random.random()
    return math.sqrt(-2 * math.log(u + 1e-12)) * math.cos(2 * math.pi * v)

def face_pixels(p):
    """Clean face at phase p in [0,1): horizontal sway + blink + smile."""
    x = [[0.0] * G for _ in range(G)]
    dx = round(1.6 * math.sin(2 * math.pi * p))
    blink = 0.46 < p < 0.56
    smile = 0.5 + 0.5 * math.sin(2 * math.pi * p)
    def put(r, c, v):
        c += dx
        if 0 <= r < G and 0 <= c < G:
            x[r][c] = max(x[r][c], v)
    for c in range(2, 10): put(1, c, 0.6); put(10, c, 0.6)
    for r in range(2, 10): put(r, 1, 0.6); put(r, 10, 0.6)
    if blink:
        for c in (3, 4, 7, 8): put(4, c, 0.9)
    else:
        put(3, 4, 1); put(4, 4, 0.8); put(3, 7, 1); put(4, 7, 0.8)
    up = round(2 * smile)
    put(8, 4, 0.9); put(8, 7, 0.9); put(9, 5, 0.9); put(9, 6, 0.9)
    put(8 - up, 3, 0.85); put(8 - up, 8, 0.85)
    return x

def add_noise(pix, noise, amp):
    return [[max(0.0, min(1.0, pix[r][c] + amp * noise[r][c])) for c in range(G)] for r in range(G)]

def fresh_noise():
    return [[randn() for _ in range(G)] for _ in range(G)]

def frame_diff(a, b):
    return sum((a[r][c] - b[r][c]) ** 2 for r in range(G) for c in range(G)) / (G * G)

def render_clip(n_frames, amp, shared):
    """shared=None -> fresh noise each frame (naive); else reuse `shared` field."""
    frames = []
    for f in range(n_frames):
        pix = face_pixels(f / n_frames)
        noise = shared if shared is not None else fresh_noise()
        frames.append(add_noise(pix, noise, amp))
    return frames

def mean_flicker(frames):
    return sum(frame_diff(frames[i], frames[i - 1]) for i in range(1, len(frames))) / (len(frames) - 1)

if __name__ == "__main__":
    N, AMP = 24, 0.25
    naive = render_clip(N, AMP, shared=None)
    consistent = render_clip(N, AMP, shared=fresh_noise())
    print(f"mean frame-to-frame change over {N} frames (noise amp {AMP}):")
    print(f"  naive (independent noise) : {mean_flicker(naive):.4f}   <- flicker")
    print(f"  consistent (shared noise) : {mean_flicker(consistent):.4f}   <- only the intended motion")
    print("the consistent clip changes far less between frames; that gap IS the flicker the noise-sharing removes.")
