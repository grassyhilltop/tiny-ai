#!/usr/bin/env python3
"""
faceswap.py -- a micro deepfake face-swap you can actually run on real photos.

This is the PyTorch, real-image version of the §2 autoencoder face-swap in the
lab. The pure-stdlib `autoencoder.py` shows the *idea* on 4 hand-traced numbers;
this shows the *same idea* learning from real faces on the HPC cluster, small
enough to read top to bottom in one sitting.

THE ONE IDEA
------------
The 2017 face-swap is one shared ENCODER plus two identity-specific DECODERS:

        x_A --> [ shared Encoder ] --> z --> [ Decoder A ] --> x_A   (reconstruct A)
        x_B --> [ shared Encoder ] --> z --> [ Decoder B ] --> x_B   (reconstruct B)

The encoder is forced to learn a POSE/EXPRESSION code z that works for both
people (it only ever sees one shared encoder). Each decoder learns to paint one
identity. Once trained, you SWAP decoders:

        x_A --> [ shared Encoder ] --> z --> [ Decoder B ] --> "A's pose, B's face"

That single line -- run A's face through B's decoder -- is the whole deepfake.

DATA
----
`faces_all.npz` ships next to this file (Olivetti faces: 40 consented research
subjects, 64x64 grayscale, public domain). No download, no internet needed on the
compute node. Pick any two subjects with --a / --b (montage in the README).

RUN
---
    # on an HPC GPU node (see run_faceswap.slurm), or any machine with torch:
    python faceswap.py --a 7 --b 21 --steps 3000 --out results.png

It auto-detects CUDA and falls back to CPU (this model trains on CPU in ~1 min).
It writes `results.png`: originals, reconstructions, and the identity swaps, so
you can SEE whether it worked.
"""
import argparse
import numpy as np
import torch
import torch.nn as nn

IMG = 64  # faces are 64x64 grayscale


# --------------------------------------------------------------------------- #
# Model: one shared encoder, two decoders. Small on purpose -- read it all.    #
# --------------------------------------------------------------------------- #
class Encoder(nn.Module):
    """Image (1x64x64) -> latent vector z. SHARED between both identities."""
    def __init__(self, zdim=256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 32, 4, 2, 1), nn.ReLU(),   # 64 -> 32
            nn.Conv2d(32, 64, 4, 2, 1), nn.ReLU(),  # 32 -> 16
            nn.Conv2d(64, 128, 4, 2, 1), nn.ReLU(), # 16 -> 8
            nn.Flatten(),
            nn.Linear(128 * 8 * 8, zdim),           # bottleneck: the pose/expr code
        )

    def forward(self, x):
        return self.net(x)


class Decoder(nn.Module):
    """Latent z -> image. ONE PER IDENTITY. This is what carries a person's look."""
    def __init__(self, zdim=256):
        super().__init__()
        self.fc = nn.Linear(zdim, 128 * 8 * 8)
        self.net = nn.Sequential(
            nn.ConvTranspose2d(128, 64, 4, 2, 1), nn.ReLU(),  # 8 -> 16
            nn.ConvTranspose2d(64, 32, 4, 2, 1), nn.ReLU(),   # 16 -> 32
            nn.ConvTranspose2d(32, 1, 4, 2, 1), nn.Sigmoid(), # 32 -> 64, pixels in [0,1]
        )

    def forward(self, z):
        h = self.fc(z).view(-1, 128, 8, 8)
        return self.net(h)


# --------------------------------------------------------------------------- #
# Data                                                                         #
# --------------------------------------------------------------------------- #
def load_identity(npz_path, subject, device):
    """Return that subject's images as a (N,1,64,64) float tensor in [0,1],
    doubled by horizontal flips (faces are ~symmetric; a free 2x on 10 images)."""
    d = np.load(npz_path)
    imgs = d["images"][d["subject"] == subject].astype("float32") / 255.0  # (N,64,64)
    imgs = np.concatenate([imgs, imgs[:, :, ::-1]], axis=0)                # + flips
    t = torch.from_numpy(np.ascontiguousarray(imgs)).unsqueeze(1)         # (2N,1,64,64)
    return t.to(device)


def batch(t, n):
    """Random minibatch of n images from tensor t."""
    idx = torch.randint(0, t.shape[0], (n,), device=t.device)
    return t[idx]


# --------------------------------------------------------------------------- #
# Train: reconstruct A with Decoder A and B with Decoder B, SHARED encoder.    #
# --------------------------------------------------------------------------- #
def train(A, B, steps, device, zdim=128, bs=8, lr=1e-3, noise=0.5):
    enc = Encoder(zdim).to(device)
    decA = Decoder(zdim).to(device)
    decB = Decoder(zdim).to(device)
    # One optimizer over the encoder + BOTH decoders. The encoder gets gradient
    # from both reconstruction losses, so its z must serve both identities.
    opt = torch.optim.Adam(
        list(enc.parameters()) + list(decA.parameters()) + list(decB.parameters()), lr=lr
    )
    loss_fn = nn.MSELoss()

    def code(x):
        # Add Gaussian noise to the latent during training. Without it each decoder
        # only ever sees its OWN identity's exact codes and memorizes them; feeding
        # the OTHER identity's code at swap time then lands out-of-distribution and
        # decodes to noise. The jitter forces each decoder to handle a NEIGHBORHOOD
        # of codes, so the cross-identity swap decodes cleanly. This is the single
        # change that makes the swap look like a face instead of static.
        z = enc(x)
        return z + noise * torch.randn_like(z) if noise > 0 else z

    for step in range(1, steps + 1):
        xa, xb = batch(A, bs), batch(B, bs)
        ra = decA(code(xa))         # reconstruct A through A's decoder
        rb = decB(code(xb))         # reconstruct B through B's decoder
        loss = loss_fn(ra, xa) + loss_fn(rb, xb)
        opt.zero_grad()
        loss.backward()
        opt.step()
        if step % max(1, steps // 10) == 0 or step == 1:
            print(f"step {step:5d}/{steps}  recon_loss {loss.item():.4f}", flush=True)
    return enc, decA, decB


# --------------------------------------------------------------------------- #
# Visualize: originals, reconstructions, and the SWAP -- save one PNG.         #
# --------------------------------------------------------------------------- #
def to_row(tensor):
    """(k,1,64,64) in [0,1] -> a single (64, k*64) uint8 numpy strip."""
    imgs = (tensor.detach().cpu().clamp(0, 1).numpy()[:, 0] * 255).astype("uint8")
    return np.concatenate(list(imgs), axis=1)


def save_results(enc, decA, decB, A, B, out, k=6):
    from PIL import Image
    enc.eval(); decA.eval(); decB.eval()
    with torch.no_grad():
        a, b = A[:k], B[:k]
        rows = [
            to_row(a),            # A originals
            to_row(decA(enc(a))), # A reconstructed (sanity: identity preserved)
            to_row(decB(enc(a))), # A's pose -> B's face  <-- THE SWAP
            to_row(b),            # B originals
            to_row(decB(enc(b))), # B reconstructed
            to_row(decA(enc(b))), # B's pose -> A's face  <-- THE SWAP
        ]
    gap = np.full((6, rows[0].shape[1]), 255, "uint8")  # white separators
    stacked = np.concatenate(
        [rows[0], gap, rows[1], gap, rows[2], gap * 0 + 128, rows[3], gap, rows[4], gap, rows[5]],
        axis=0,
    )
    Image.fromarray(stacked).resize(
        (stacked.shape[1] * 3, stacked.shape[0] * 3), Image.NEAREST
    ).save(out)
    print(f"\nwrote {out}")
    print("rows: A orig / A recon / A->B SWAP  ||  B orig / B recon / B->A SWAP")


def main():
    ap = argparse.ArgumentParser(description="micro deepfake face-swap (shared encoder, two decoders)")
    ap.add_argument("--data", default="faces_all.npz")
    ap.add_argument("--a", type=int, default=7, help="subject index for identity A (0-39)")
    ap.add_argument("--b", type=int, default=21, help="subject index for identity B (0-39)")
    ap.add_argument("--steps", type=int, default=3000)
    ap.add_argument("--zdim", type=int, default=128)
    ap.add_argument("--noise", type=float, default=0.5,
                    help="latent noise during training; the knob that makes swaps clean (0 = off)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="results.png")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}   swapping subject {args.a} <-> subject {args.b}")

    A = load_identity(args.data, args.a, device)
    B = load_identity(args.data, args.b, device)
    print(f"identity A: {A.shape[0]} images (with flips)   identity B: {B.shape[0]} images")

    enc, decA, decB = train(A, B, args.steps, device, zdim=args.zdim, noise=args.noise)
    save_results(enc, decA, decB, A, B, args.out)


if __name__ == "__main__":
    main()
