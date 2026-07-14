"""
microfake.py — the assignment model (REFERENCE SOLUTION).

A complete micro-diffusion generator in pure Python. The two functions a student
must write are PRECOND_TARGET and DDIM_STEP — the regression target diffusion is
trained on, and the reverse-sampling step that generates. Everything else (the
MLP, the training loop, the EDM preconditioning, the data) is provided.

Run it:           python3 microfake.py
Grade it:         python3 test_microfake.py
"""
import math, random
random.seed(7)

# ---------------- provided: a tiny MLP with Adam ----------------
def randn():
    u, v = random.random(), random.random()
    return math.sqrt(-2 * math.log(u + 1e-12)) * math.cos(2 * math.pi * v)
def relu(x): return x if x > 0 else 0.0

class MLP:
    def __init__(self, sizes):
        self.L = len(sizes) - 1
        self.W = [[[randn() * math.sqrt(2 / sizes[l]) for _ in range(sizes[l])] for _ in range(sizes[l + 1])] for l in range(self.L)]
        self.b = [[0.0] * sizes[l + 1] for l in range(self.L)]
        self.mW = [[[0.0] * len(r) for r in W] for W in self.W]; self.vW = [[[0.0] * len(r) for r in W] for W in self.W]
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
                    self.mW[l][i][j] = b1 * self.mW[l][i][j] + (1 - b1) * g; self.vW[l][i][j] = b2 * self.vW[l][i][j] + (1 - b2) * g * g
                    self.W[l][i][j] -= lr * (self.mW[l][i][j] / bc1) / (math.sqrt(self.vW[l][i][j] / bc2) + eps)
                g = gb[l][i]
                self.mb[l][i] = b1 * self.mb[l][i] + (1 - b1) * g; self.vb[l][i] = b2 * self.vb[l][i] + (1 - b2) * g * g
                self.b[l][i] -= lr * (self.mb[l][i] / bc1) / (math.sqrt(self.vb[l][i] / bc2) + eps)

# ---------------- provided: EDM preconditioning + data ----------------
SMAX, SMIN, SD = 1.2, 0.02, 0.5
def precond(sigma):
    ss = sigma * sigma + SD * SD
    return (1 / math.sqrt(ss), SD * SD / ss, sigma * SD / math.sqrt(ss), math.log(sigma) / 4)  # c_in, c_skip, c_out, c_noise

DATA = ([[math.cos(math.pi * i / 89) - 0.5, math.sin(math.pi * i / 89) - 0.25] for i in range(90)] +
        [[math.cos(math.pi * i / 89),       -math.sin(math.pi * i / 89) + 0.25] for i in range(90)])

F = MLP([3, 64, 64, 2])

# ====================================================================
#  YOUR JOB starts here  —  implement the two functions below.
# ====================================================================

def precond_target(x0, x, c_skip, c_out):
    """The EDM regression target the network F is trained to output.

    The denoiser is   D(x) = c_skip * x + c_out * F(...),  and we want D(x) = x0.
    Solve for what F must output, i.e. return  (x0 - c_skip * x) / c_out,
    component-wise for the 2-D vectors x0 and x.
    """
    # TODO: return the 2-element list  [(x0[k] - c_skip*x[k]) / c_out  for k in (0,1)]
    return [(x0[k] - c_skip * x[k]) / c_out for k in range(2)]


def ddim_step(x, x0_hat, sigma, sigma_next):
    """One deterministic DDIM reverse step.

    Given the current noisy point x at level sigma, and the denoiser's clean
    estimate x0_hat, move PARTWAY toward x0_hat — keeping the share of leftover
    noise appropriate to the next (lower) level:
        x_next = x0_hat + (sigma_next / sigma) * (x - x0_hat)
    When sigma_next is 0 this returns x0_hat exactly.
    """
    # TODO: return the 2-element list for x_next using the formula above
    r = sigma_next / sigma if sigma > 1e-9 else 0.0
    return [x0_hat[k] + r * (x[k] - x0_hat[k]) for k in range(2)]

# ====================================================================
#  YOUR JOB ends here.  The rest uses your two functions.
# ====================================================================

def denoise(x, sigma):
    c_in, c_skip, c_out, c_noise = precond(sigma)
    out, _ = F.forward([c_in * x[0], c_in * x[1], c_noise])
    return [c_skip * x[0] + c_out * out[0], c_skip * x[1] + c_out * out[1]]

def train(iters=8000, batch=24):
    for _ in range(iters):
        gW = [[[0.0] * len(r) for r in W] for W in F.W]; gb = [[0.0] * len(b) for b in F.b]
        for _ in range(batch):
            x0 = random.choice(DATA)
            sigma = math.exp(math.log(SMIN) + random.random() * (math.log(SMAX) - math.log(SMIN)))
            c_in, c_skip, c_out, c_noise = precond(sigma)
            x = [x0[0] + sigma * randn(), x0[1] + sigma * randn()]
            out, cache = F.forward([c_in * x[0], c_in * x[1], c_noise])
            tgt = precond_target(x0, x, c_skip, c_out)              # <-- your function
            gWi, gbi = F.backward(cache, [out[0] - tgt[0], out[1] - tgt[1]])
            for l in range(F.L):
                for i in range(len(gW[l])):
                    for j in range(len(gW[l][i])): gW[l][i][j] += gWi[l][i][j] / batch
                    gb[l][i] += gbi[l][i] / batch
        F.adam(gW, gb)

def sample(n=300, steps=40):
    sig = [math.exp(math.log(SMAX) * (1 - i / (steps - 1)) + math.log(SMIN) * (i / (steps - 1))) for i in range(steps)] + [0.0]
    pts = [[randn() * SMAX, randn() * SMAX] for _ in range(n)]
    for s in range(len(sig) - 1):
        for k in range(len(pts)):
            x0_hat = denoise(pts[k], sig[s])
            pts[k] = ddim_step(pts[k], x0_hat, sig[s], sig[s + 1])  # <-- your function
    return pts

if __name__ == "__main__":
    print("training..."); train()
    pts = sample()
    avg = sum(min(math.hypot(p[0] - d[0], p[1] - d[1]) for d in DATA) for p in pts) / len(pts)
    print(f"avg distance of generated samples to the data = {avg:.4f}")
