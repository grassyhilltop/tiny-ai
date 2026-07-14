"""
micro-autoencoder — a complete, runnable autoencoder + face-swap in pure Python.

No numpy, no torch. Two parts, both readable end to end:

  PART 1  A 2->8->1->8->2 autoencoder trained by SGD to reconstruct points on a
          curved arc. The 1-number bottleneck is forced to discover the data's
          1D manifold. (Same net the browser widget trains.)

  PART 2  The 2017 deepfake trick as exact linear algebra: ONE shared encoder,
          TWO decoders. Expression lives in the "mouth" coordinates, identity in
          the rest -> orthogonal subspaces -> the shared encoder recovers pure
          expression and the A->B swap is exact.

    python3 autoencoder.py
"""
import math, random
random.seed(0)

def randn():
    u, v = random.random(), random.random()
    return math.sqrt(-2 * math.log(u + 1e-12)) * math.cos(2 * math.pi * v)

# ======================================================================
# PART 1 — a tiny autoencoder trained with backprop (no labels)
# ======================================================================
NIN, NH, NZ = 2, 8, 1

def init():
    W1 = [[randn() * 0.8 for _ in range(NIN)] for _ in range(NH)]; b1 = [0.0] * NH
    W2 = [[randn() * 0.5 for _ in range(NH)] for _ in range(NZ)];  b2 = [0.0] * NZ
    W3 = [[randn() * 0.8 for _ in range(NZ)] for _ in range(NH)];  b3 = [0.0] * NH
    W4 = [[randn() * 0.5 for _ in range(NH)] for _ in range(NIN)]; b4 = [0.0] * NIN
    return [W1, b1, W2, b2, W3, b3, W4, b4]

def forward(p, x):
    W1, b1, W2, b2, W3, b3, W4, b4 = p
    h1 = [math.tanh(b1[j] + sum(W1[j][i] * x[i] for i in range(NIN))) for j in range(NH)]
    z  = [b2[k] + sum(W2[k][j] * h1[j] for j in range(NH)) for k in range(NZ)]   # the code
    h3 = [math.tanh(b3[j] + sum(W3[j][k] * z[k] for k in range(NZ))) for j in range(NH)]
    xh = [b4[i] + sum(W4[i][j] * h3[j] for j in range(NH)) for i in range(NIN)]  # reconstruction
    return h1, z, h3, xh

def train(p, data, epochs=400, lr=0.05):
    for _ in range(epochs):
        for x in data:
            W1, b1, W2, b2, W3, b3, W4, b4 = p
            h1, z, h3, xh = forward(p, x)
            dxh = [xh[i] - x[i] for i in range(NIN)]                 # d(0.5||xh-x||^2)/dxh
            dh3 = [0.0] * NH
            for i in range(NIN):
                for j in range(NH):
                    dh3[j] += W4[i][j] * dxh[i]; W4[i][j] -= lr * dxh[i] * h3[j]
                b4[i] -= lr * dxh[i]
            da3 = [dh3[j] * (1 - h3[j] ** 2) for j in range(NH)]
            dz = [0.0] * NZ
            for j in range(NH):
                for k in range(NZ):
                    dz[k] += W3[j][k] * da3[j]; W3[j][k] -= lr * da3[j] * z[k]
                b3[j] -= lr * da3[j]
            dh1 = [0.0] * NH
            for k in range(NZ):
                for j in range(NH):
                    dh1[j] += W2[k][j] * dz[k]; W2[k][j] -= lr * dz[k] * h1[j]
                b2[k] -= lr * dz[k]
            da1 = [dh1[j] * (1 - h1[j] ** 2) for j in range(NH)]
            for j in range(NH):
                for i in range(NIN): W1[j][i] -= lr * da1[j] * x[i]
                b1[j] -= lr * da1[j]

def avg_loss(p, data):
    return sum(0.5 * sum((forward(p, x)[3][i] - x[i]) ** 2 for i in range(NIN)) for x in data) / len(data)

# ======================================================================
# PART 2 — the face-swap as exact linear algebra
#   A "face" is 4 numbers: [eye_L, eye_R, mouth_1, mouth_2].
#   Expression (a smile amount z) lives in the mouth; identity in the eyes.
# ======================================================================
def dot(a, b): return sum(ai * bi for ai, bi in zip(a, b))

W_SMILE = [0.0, 0.0, 1.0, -1.0]          # expression direction (mouth pixels only)
A_ALICE = [1.0, 0.6, 0.0, 0.0]           # identity offsets (eyes only -> 0 in mouth)
A_BOB   = [0.6, 1.0, 0.0, 0.0]           #   => orthogonal to W_SMILE

def make_face(identity, z):              # face = identity + z * smile-direction
    return [identity[i] + z * W_SMILE[i] for i in range(4)]

def encode(face):                        # shared encoder = projection onto W_SMILE
    return dot(W_SMILE, face) / dot(W_SMILE, W_SMILE)

def swap(face, target_identity):         # decode this face's expression as another identity
    return make_face(target_identity, encode(face))

if __name__ == "__main__":
    # PART 1
    data = [[math.cos(math.pi * i / 159), math.sin(math.pi * i / 159)] for i in range(160)]
    p = init()
    print("PART 1 — autoencoder")
    print(f"  loss before training: {avg_loss(p, data):.4f}")
    train(p, data)
    print(f"  loss after  training: {avg_loss(p, data):.5f}  (the 1D code learned the arc)")

    # PART 2
    print("\nPART 2 — face-swap")
    print(f"  orthogonality check  W . a_Alice = {dot(W_SMILE, A_ALICE):.3f}, W . a_Bob = {dot(W_SMILE, A_BOB):.3f}")
    alice_smiling = make_face(A_ALICE, 0.8)
    print(f"  Alice smiling (z=0.8): {alice_smiling}")
    print(f"  shared encoder recovers z = {encode(alice_smiling):.3f}  (eyes don't leak in)")
    print(f"  swap -> Bob:           {swap(alice_smiling, A_BOB)}  (Bob's eyes, Alice's smile)")
