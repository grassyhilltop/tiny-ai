"""
micro-GAN — a complete, runnable 2D Generative Adversarial Network in pure Python.

No numpy, no torch — just `random` and `math`, so you can read every line.
It learns to turn 2D Gaussian noise into points that match a target distribution
(8 Gaussian blobs on a ring). Same algorithm the browser widget runs.

    python3 gan.py

Two networks play a game:
  * Generator G:    noise z -> a fake 2D point          (wants to fool D)
  * Discriminator D: a 2D point -> P(real)              (wants to catch G)

D is trained to output 1 on real points and 0 on G's fakes; G is trained to make
D output 1 on its fakes (the "non-saturating" generator loss). At equilibrium G's
samples are indistinguishable from the data and D is stuck guessing 0.5.
"""
import math, random

random.seed(0)

# ----------------------------------------------------------------------
# A tiny multilayer perceptron with manual forward/backward and Adam.
# Weights are lists of lists; everything is explicit on purpose.
# ----------------------------------------------------------------------
def randn():
    # Box-Muller: a standard normal sample from two uniforms
    u, v = random.random(), random.random()
    return math.sqrt(-2 * math.log(u + 1e-12)) * math.cos(2 * math.pi * v)

def relu(x):  return x if x > 0 else 0.0
def sigmoid(x): return 1.0 / (1.0 + math.exp(-x))

class MLP:
    def __init__(self, sizes, sigmoid_out=False):
        self.sizes, self.sigmoid_out, self.L = sizes, sigmoid_out, len(sizes) - 1
        self.W, self.b = [], []
        for l in range(self.L):
            fan_in = sizes[l]
            scale = math.sqrt(2.0 / fan_in)              # He init
            self.W.append([[randn() * scale for _ in range(fan_in)] for _ in range(sizes[l + 1])])
            self.b.append([0.0 for _ in range(sizes[l + 1])])
        # Adam moment buffers
        self.mW = [[[0.0] * len(r) for r in W] for W in self.W]
        self.vW = [[[0.0] * len(r) for r in W] for W in self.W]
        self.mb = [[0.0] * len(b) for b in self.b]
        self.vb = [[0.0] * len(b) for b in self.b]
        self.t = 0

    def forward(self, x):
        """Return (output, cache) where cache holds activations for backprop."""
        acts, pre, a = [x], [], x
        for l in range(self.L):
            z = [self.b[l][i] + sum(self.W[l][i][j] * a[j] for j in range(len(a)))
                 for i in range(len(self.W[l]))]
            pre.append(z)
            if l < self.L - 1:
                a = [relu(v) for v in z]
            else:
                a = [sigmoid(v) for v in z] if self.sigmoid_out else z[:]
            acts.append(a)
        return a, (acts, pre)

    def backward(self, cache, d_out):
        """Backprop d_out (grad wrt output). Returns (gW, gb, d_input)."""
        acts, pre = cache
        gW = [[[0.0] * len(r) for r in W] for W in self.W]
        gb = [[0.0] * len(b) for b in self.b]
        d_up = None
        for l in reversed(range(self.L)):
            a_prev = acts[l]
            if l == self.L - 1:
                if self.sigmoid_out:
                    o = acts[l + 1]
                    dz = [d_out[i] * o[i] * (1 - o[i]) for i in range(len(o))]
                else:
                    dz = d_out[:]
            else:
                z = pre[l]
                dz = [d_up[i] * (1.0 if z[i] > 0 else 0.0) for i in range(len(z))]
            for i in range(len(self.W[l])):
                gb[l][i] += dz[i]
                for j in range(len(a_prev)):
                    gW[l][i][j] += dz[i] * a_prev[j]
            d_up = [sum(self.W[l][i][j] * dz[i] for i in range(len(self.W[l])))
                    for j in range(len(a_prev))]
        return gW, gb, d_up

    def adam_step(self, gW, gb, lr=4e-3, b1=0.5, b2=0.999, eps=1e-8):
        self.t += 1
        bc1, bc2 = 1 - b1 ** self.t, 1 - b2 ** self.t
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

def zeros_like(net):
    gW = [[[0.0] * len(r) for r in W] for W in net.W]
    gb = [[0.0] * len(b) for b in net.b]
    return gW, gb

def accumulate(acc, grad):
    gW, gb = acc; aW, ab = grad
    for l in range(len(gW)):
        for i in range(len(gW[l])):
            for j in range(len(gW[l][i])): gW[l][i][j] += aW[l][i][j]
            gb[l][i] += ab[l][i]

# ----------------------------------------------------------------------
# Target distribution: 8 Gaussian blobs on a ring.
# ----------------------------------------------------------------------
MODES = [(0.9 * math.cos(k / 8 * 2 * math.pi), 0.9 * math.sin(k / 8 * 2 * math.pi)) for k in range(8)]
def real_sample():
    mx, my = random.choice(MODES)
    return [mx + randn() * 0.05, my + randn() * 0.05]

# ----------------------------------------------------------------------
# The adversarial training loop.
# ----------------------------------------------------------------------
def train(iters=4000, batch=64, lr=4e-3):
    G = MLP([2, 16, 16, 2])                 # noise -> fake point
    D = MLP([2, 16, 16, 1], sigmoid_out=True)  # point -> P(real)
    for it in range(iters):
        # ---- train D: push D(real)->1 and D(fake)->0 ----
        gW, gb = zeros_like(D)
        for _ in range(batch):
            xr = real_sample()
            o, c = D.forward(xr)                       # D(real)
            accumulate((gW, gb), D.backward(c, [-1.0 / (o[0] + 1e-8)])[:2])   # d/do of -log D(real)
            z = [randn(), randn()]
            xf, _ = G.forward(z)
            o, c = D.forward(xf)                       # D(fake)
            accumulate((gW, gb), D.backward(c, [1.0 / (1 - o[0] + 1e-8)])[:2])  # d/do of -log(1-D(fake))
        for l in range(D.L):
            for i in range(len(gW[l])):
                for j in range(len(gW[l][i])): gW[l][i][j] /= batch
                gb[l][i] /= batch
        D.adam_step(gW, gb, lr)

        # ---- train G: push D(fake)->1 (non-saturating). Gradient flows THROUGH D. ----
        gW, gb = zeros_like(G)
        for _ in range(batch):
            z = [randn(), randn()]
            xf, cg = G.forward(z)
            o, cd = D.forward(xf)
            _, _, d_x = D.backward(cd, [-1.0 / (o[0] + 1e-8)])  # d(-log D)/d(D-input) = grad on the fake point
            gWg, gbg, _ = G.backward(cg, d_x)                   # ...keep flowing back into G
            accumulate((gW, gb), (gWg, gbg))
        for l in range(G.L):
            for i in range(len(gW[l])):
                for j in range(len(gW[l][i])): gW[l][i][j] /= batch
                gb[l][i] /= batch
        G.adam_step(gW, gb, lr)

        if it % 500 == 0:
            covered = mode_coverage(G)
            print(f"iter {it:5d}  modes covered: {covered}/8")
    return G, D

def mode_coverage(G, n=1000):
    hit = [0] * 8
    for _ in range(n):
        xf, _ = G.forward([randn(), randn()])
        d = [math.hypot(xf[0] - mx, xf[1] - my) for mx, my in MODES]
        k = min(range(8), key=lambda i: d[i])
        if d[k] < 0.2: hit[k] += 1
    return sum(1 for h in hit if h > n * 0.01)

if __name__ == "__main__":
    G, D = train()
    print("final modes covered:", mode_coverage(G), "/ 8")
