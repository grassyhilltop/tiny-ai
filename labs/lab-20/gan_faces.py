#!/usr/bin/env python3
"""
gan_faces.py -- a micro DCGAN that GENERATES new faces on the HPC cluster.

The real-image companion to §3. `gan.py` shows the generator-vs-discriminator
minimax on a 2D ring of Gaussians; this shows the SAME game learning to paint
64x64 faces. Two networks fight:

    Generator G:      random noise z  ->  a fake face
    Discriminator D:  a face         ->  "real" or "fake"

D learns to catch G's fakes; G learns to fool D. At equilibrium G is drawing
faces good enough that D can only guess. Nobody labels anything -- the only
supervision is D's real/fake call. That is the whole idea.

Watch for MODE COLLAPSE: if G finds one face that reliably fools D, it may paint
that same face for every z. The sample grid makes it obvious -- 16 near-identical
faces instead of 16 different people.

DATA:   faces_all.npz (ships next to this file; 40 Olivetti subjects, 64x64).
RUN:    python gan_faces.py --steps 4000 --out gan_samples.png
OUTPUT: gan_samples.png (16 generated faces) and gan_fakes.npz (a batch of fakes
        the §6 detector will later try to catch).
"""
import argparse
import numpy as np
import torch
import torch.nn as nn

NZ = 100  # length of the random noise vector G starts from


class Generator(nn.Module):
    """noise z (NZ) -> fake face (1x64x64), values in [-1,1] via tanh."""
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(NZ, 128 * 8 * 8)
        self.net = nn.Sequential(
            nn.BatchNorm2d(128), nn.ReLU(),
            nn.ConvTranspose2d(128, 64, 4, 2, 1), nn.BatchNorm2d(64), nn.ReLU(),  # 8 ->16
            nn.ConvTranspose2d(64, 32, 4, 2, 1), nn.BatchNorm2d(32), nn.ReLU(),   # 16->32
            nn.ConvTranspose2d(32, 1, 4, 2, 1), nn.Tanh(),                        # 32->64
        )

    def forward(self, z):
        return self.net(self.fc(z).view(-1, 128, 8, 8))


class Discriminator(nn.Module):
    """face (1x64x64) -> one real/fake logit (high = 'real')."""
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 32, 4, 2, 1), nn.LeakyReLU(0.2),           # 64->32
            nn.Conv2d(32, 64, 4, 2, 1), nn.BatchNorm2d(64), nn.LeakyReLU(0.2),  # 32->16
            nn.Conv2d(64, 128, 4, 2, 1), nn.BatchNorm2d(128), nn.LeakyReLU(0.2),# 16->8
            nn.Flatten(),
            nn.Linear(128 * 8 * 8, 1),
        )

    def forward(self, x):
        return self.net(x)


def load_faces(npz_path, device):
    """All 400 faces, scaled to [-1,1] to match the generator's tanh output."""
    d = np.load(npz_path)
    imgs = d["images"].astype("float32") / 127.5 - 1.0     # (400,64,64) in [-1,1]
    return torch.from_numpy(imgs).unsqueeze(1).to(device)  # (400,1,64,64)


def grid_png(imgs, out, ncol=4):
    """imgs in [-1,1] (n,1,64,64) -> n/ncol x ncol montage PNG."""
    from PIL import Image
    x = ((imgs.detach().cpu().clamp(-1, 1).numpy()[:, 0] + 1) * 127.5).astype("uint8")
    n = len(x); nrow = (n + ncol - 1) // ncol
    canvas = np.zeros((nrow * 64, ncol * 64), "uint8")
    for i, im in enumerate(x):
        r, c = divmod(i, ncol)
        canvas[r*64:(r+1)*64, c*64:(c+1)*64] = im
    Image.fromarray(canvas).resize((ncol*64*2, nrow*64*2), Image.NEAREST).save(out)


def main():
    ap = argparse.ArgumentParser(description="micro DCGAN that generates faces")
    ap.add_argument("--data", default="faces_all.npz")
    ap.add_argument("--steps", type=int, default=4000)
    ap.add_argument("--bs", type=int, default=64)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="gan_samples.png")
    ap.add_argument("--dump_fakes", default="gan_fakes.npz",
                    help="save a batch of generated faces here for the §6 detector")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")
    real = load_faces(args.data, device)
    print(f"training on {real.shape[0]} real faces")

    G, D = Generator().to(device), Discriminator().to(device)
    optG = torch.optim.Adam(G.parameters(), lr=2e-4, betas=(0.5, 0.999))
    optD = torch.optim.Adam(D.parameters(), lr=2e-4, betas=(0.5, 0.999))
    bce = nn.BCEWithLogitsLoss()
    fixed_z = torch.randn(16, NZ, device=device)  # same z every log -> watch G evolve

    for step in range(1, args.steps + 1):
        # --- train D: real should score high, fake should score low ---
        idx = torch.randint(0, real.shape[0], (args.bs,), device=device)
        x_real = real[idx]
        z = torch.randn(args.bs, NZ, device=device)
        x_fake = G(z).detach()
        lossD = bce(D(x_real), torch.ones(args.bs, 1, device=device)) + \
                bce(D(x_fake), torch.zeros(args.bs, 1, device=device))
        optD.zero_grad(); lossD.backward(); optD.step()

        # --- train G: make D call its fakes 'real' ---
        z = torch.randn(args.bs, NZ, device=device)
        lossG = bce(D(G(z)), torch.ones(args.bs, 1, device=device))
        optG.zero_grad(); lossG.backward(); optG.step()

        if step % max(1, args.steps // 10) == 0 or step == 1:
            print(f"step {step:5d}/{args.steps}  lossD {lossD.item():.3f}  lossG {lossG.item():.3f}", flush=True)

    G.eval()
    with torch.no_grad():
        grid_png(G(fixed_z), args.out)
        print(f"\nwrote {args.out} (16 generated faces -- look for mode collapse)")
        if args.dump_fakes:
            fakes = ((G(torch.randn(400, NZ, device=device)).clamp(-1, 1).cpu().numpy()[:, 0]
                      + 1) * 127.5).astype("uint8")
            np.savez_compressed(args.dump_fakes, images=fakes)
            print(f"wrote {args.dump_fakes} ({len(fakes)} fakes for the detector in §6)")


if __name__ == "__main__":
    main()
