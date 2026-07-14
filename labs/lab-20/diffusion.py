"""
micro-diffusion — a complete, runnable 2D diffusion model in pure Python.

No numpy, no torch. It LEARNS a denoiser D(x, sigma) ~= E[x0 | x] by regression,
then generates new points by running that denoiser in reverse (DDIM). Same method
the browser widget uses, and the same idea behind Stable Diffusion / Sora — just
in 2D so every line is readable.

    python3 diffusion.py

Pipeline:
  forward (free):   x = x0 + sigma * noise           # destroy data, no learning
  train (regression): D(x, sigma) -> x0              # learn to undo one step
  sample (DDIM):    start from noise, denoise + lower sigma, repeat
"""
import math, random
random.seed(3)

def randn():
    u, v = random.random(), random.random()
    return math.sqrt(-2 * math.log(u + 1e-12)) * math.cos(2 * math.pi * v)

def relu(x): return x if x > 0 else 0.0

# ---- a tiny MLP with manual backprop + Adam (the denoiser's body) ----
class MLP:
    def __init__(self, sizes):
        self.L = len(sizes) - 1
        self.W = [[[randn() * math.sqrt(2 / sizes[l]) for _ in range(sizes[l])]
                   for _ in range(sizes[l + 1])] for l in range(self.L)]
        self.b = [[0.0] * sizes[l + 1] for l in range(self.L)]
        self.mW = [[[0.0] * len(r) for r in W] for W in self.W]
        self.vW = [[[0.0] * len(r) for r in W] for W in self.W]
        self.mb = [[0.0] * len(b) for b in self.b]; self.vb = [[0.0] * len(b) for b in self.b]; self.t = 0
    def forward(self, x):
        acts, pre, a = [x], [], x
        for l in range(self.L):
            z = [self.b[l][i] + sum(self.W[l][i][j] * a[j] for j in range(len(a))) for i in range(len(self.W[l]))]
            pre.append(z); a = [relu(v) for v in z] if l < self.L - 1 else z[:]; acts.append(a)
        return a, (acts, pre)
    def backward(self, cache, d_out):
        acts, pre = cache
        gW = [[[0.0] * len(r) for r in W] for W in self.W]; gb = [[0.0] * len(b) for b in self.b]; d_up = None
        for l in reversed(range(self.L)):
            a_prev = acts[l]
            dz = d_out[:] if l == self.L - 1 else [d_up[i] * (1.0 if pre[l][i] > 0 else 0.0) for i in range(len(pre[l]))]
            for i in range(len(self.W[l])):
                gb[l][i] += dz[i]
                for j in range(len(a_prev)): gW[l][i][j] += dz[i] * a_prev[j]
            d_up = [sum(self.W[l][i][j] * dz[i] for i in range(len(self.W[l]))) for j in range(len(a_prev))]
        return gW, gb
    def adam(self, gW, gb, lr=2e-3, b1=0.9, b2=0.999, eps=1e-8):
        self.t += 1; bc1, bc2 = 1 - b1 ** self.t, 1 - b2 ** self.t
        for l in range(self.L):
            for i in range(len(self.W[l])):
                for j in range(len(self.W[l][i])):
                    g = gW[l][i][j]
                    self.mW[l][i][j] = b1 * self.mW[l][i][j] + (1 - b1) * g
                    self.vW[l][i][j] = b2 * self.vW[l][i][j] + (1 - b2) * g * g
                    self.W[l][i][j] -= lr * (self.mW[l][i][j] / bc1) / (math.sqrt(self.vW[l][i][j] / bc2) + eps)
                g = gb[l][i]
                self.mb[l][i] = b1 * self.mb[l][i] + (1 - b1) * g
                self.vb[l][i] = b2 * self.vb[l][i] + (1 - b2) * g * g
                self.b[l][i] -= lr * (self.mb[l][i] / bc1) / (math.sqrt(self.vb[l][i] / bc2) + eps)

# ---- EDM preconditioning: rescale in/out per sigma so F regresses a clean target ----
SMAX, SMIN, SD = 1.2, 0.02, 0.5
def precond(sigma):
    ss = sigma * sigma + SD * SD
    return (1 / math.sqrt(ss),                 # c_in
            SD * SD / ss,                       # c_skip
            sigma * SD / math.sqrt(ss),         # c_out
            math.log(sigma) / 4)                # c_noise

F = MLP([3, 64, 64, 2])                         # the raw network behind the denoiser

def denoise(x, sigma):                          # D(x, sigma) ~= E[x0 | x]
    c_in, c_skip, c_out, c_noise = precond(sigma)
    out, _ = F.forward([c_in * x[0], c_in * x[1], c_noise])
    return [c_skip * x[0] + c_out * out[0], c_skip * x[1] + c_out * out[1]]

# ---- data: two moons ----
DATA = ([[math.cos(math.pi * i / 89) - 0.5, math.sin(math.pi * i / 89) - 0.25] for i in range(90)] +
        [[math.cos(math.pi * i / 89),       -math.sin(math.pi * i / 89) + 0.25] for i in range(90)])

def train(iters=12000, batch=32):
    for _ in range(iters):
        gW = [[[0.0] * len(r) for r in W] for W in F.W]; gb = [[0.0] * len(b) for b in F.b]
        for _ in range(batch):
            x0 = random.choice(DATA)
            sigma = math.exp(math.log(SMIN) + random.random() * (math.log(SMAX) - math.log(SMIN)))
            c_in, c_skip, c_out, c_noise = precond(sigma)
            x = [x0[0] + sigma * randn(), x0[1] + sigma * randn()]      # forward: destroy
            out, cache = F.forward([c_in * x[0], c_in * x[1], c_noise])
            tgt = [(x0[0] - c_skip * x[0]) / c_out, (x0[1] - c_skip * x[1]) / c_out]
            gWi, gbi = F.backward(cache, [out[0] - tgt[0], out[1] - tgt[1]])  # MSE gradient
            for l in range(F.L):
                for i in range(len(gW[l])):
                    for j in range(len(gW[l][i])): gW[l][i][j] += gWi[l][i][j] / batch
                    gb[l][i] += gbi[l][i] / batch
        F.adam(gW, gb)

def sample(n=300, steps=40):
    sig = [math.exp(math.log(SMAX) * (1 - i / (steps - 1)) + math.log(SMIN) * (i / (steps - 1))) for i in range(steps)] + [0.0]
    pts = [[randn() * SMAX, randn() * SMAX] for _ in range(n)]            # start from noise
    for s in range(len(sig) - 1):
        for p in pts:
            x0 = denoise(p, sig[s])
            r = sig[s + 1] / sig[s] if sig[s] > 1e-9 else 0.0             # DDIM step
            p[0], p[1] = x0[0] + r * (p[0] - x0[0]), x0[1] + r * (p[1] - x0[1])
    return pts

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="micro-diffusion in pure Python")
    # Speed/quality knob. 6000 iters -> avg-dist ~0.05 (on-manifold, slightly fuzzy)
    # in about half the time of 12000 -> ~0.03 (sharper). Pure Python is CPU-bound,
    # so this dominates runtime -- on a shared HPC login node keep it modest, or run
    # on a compute node (`srun ... python3 diffusion.py --iters 12000`) for a crisp fit.
    ap.add_argument("--iters", type=int, default=6000)
    args = ap.parse_args()
    print(f"training the denoiser by regression for {args.iters} iters (this takes a moment)...")
    train(iters=args.iters)
    pts = sample()
    def nearest(p): return min(math.hypot(p[0] - d[0], p[1] - d[1]) for d in DATA)
    avg = sum(nearest(p) for p in pts) / len(pts)
    print(f"generated {len(pts)} samples; avg distance to the moons = {avg:.4f}")
    print("(small = the learned denoiser, run in reverse, reproduced the data distribution)")
