#!/usr/bin/env python3
"""
detect_faces.py -- the defender's turn: catch the fakes you just made (HPC, §6).

`detect.py` shows the frequency-artifact idea on one image. This trains a real
detector on the faces from the SAME arc: real Olivetti faces vs. the fakes your
§3 GAN and §4 diffusion models generated. It closes the arms race the course is
built on.

Two things it demonstrates:

  1. A learned detector nails the generator it was TRAINED on. Near-perfect on
     held-out GAN fakes.
  2. It largely FAILS to transfer. Train it on GAN fakes, test it on DIFFUSION
     fakes it has never seen, and accuracy falls toward chance -- because each
     generator leaves its OWN fingerprint. That generalization gap is why passive
     detection is a losing game and provenance (C2PA / SynthID) is the real fix.

It also saves the average FREQUENCY spectrum of real vs fake: generators leave a
tell-tale high-frequency / checkerboard signature invisible in the pixels.

INPUTS: faces_all.npz (real) + gan_fakes.npz and diff_fakes.npz (run §3 and §4
        first to produce these).
RUN:    python detect_faces.py
OUTPUT: accuracies printed + spectra.png (real vs fake average FFT).
"""
import argparse
import numpy as np
import torch
import torch.nn as nn


class Detector(nn.Module):
    """face (1x64x64) -> one logit (high = 'real')."""
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 16, 4, 2, 1), nn.LeakyReLU(0.2),   # 64->32
            nn.Conv2d(16, 32, 4, 2, 1), nn.LeakyReLU(0.2),  # 32->16
            nn.Conv2d(32, 64, 4, 2, 1), nn.LeakyReLU(0.2),  # 16->8
            nn.Flatten(), nn.Linear(64 * 8 * 8, 1),
        )

    def forward(self, x):
        return self.net(x)


def load(npz, device):
    imgs = np.load(npz)["images"].astype("float32") / 127.5 - 1.0
    return torch.from_numpy(imgs).unsqueeze(1).to(device)


def split(t, frac=0.8):
    n = int(len(t) * frac)
    perm = torch.randperm(len(t), device=t.device)
    return t[perm[:n]], t[perm[n:]]


@torch.no_grad()
def accuracy(net, real, fake):
    """Fraction correctly classified over a balanced real/fake set."""
    xr, xf = net(real) > 0, net(fake) <= 0        # real should be >0, fake <=0
    return (xr.float().mean().item() + xf.float().mean().item()) / 2


def spectrum(t):
    """Average log-magnitude 2D FFT (fftshifted) over a batch, as a 64x64 array."""
    x = t.cpu().numpy()[:, 0]
    f = np.abs(np.fft.fftshift(np.fft.fft2(x), axes=(-2, -1)))
    return np.log1p(f).mean(0)


def save_spectra(real, fake, out):
    from PIL import Image
    a, b = spectrum(real), spectrum(fake)
    both = np.concatenate([a, b], axis=1)
    both = (both - both.min()) / (both.max() - both.min() + 1e-9)
    img = (both * 255).astype("uint8")
    Image.fromarray(img).resize((img.shape[1] * 4, img.shape[0] * 4), Image.NEAREST).save(out)


def main():
    ap = argparse.ArgumentParser(description="real-vs-fake face detector (closes the arms race)")
    ap.add_argument("--real", default="faces_all.npz")
    ap.add_argument("--train_fakes", default="gan_fakes.npz", help="generator the detector LEARNS")
    ap.add_argument("--test_fakes", default="diff_fakes.npz", help="unseen generator (cross-test)")
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="spectra.png")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")

    real = load(args.real, device)
    train_fake = load(args.train_fakes, device)
    real_tr, real_te = split(real)
    fake_tr, fake_te = split(train_fake)
    print(f"real: {len(real)}   train-generator fakes ({args.train_fakes}): {len(train_fake)}")

    net = Detector().to(device)
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    bce = nn.BCEWithLogitsLoss()
    for step in range(1, args.steps + 1):
        ri = torch.randint(0, len(real_tr), (32,), device=device)
        fi = torch.randint(0, len(fake_tr), (32,), device=device)
        logit = net(torch.cat([real_tr[ri], fake_tr[fi]]))
        label = torch.cat([torch.ones(32, 1, device=device), torch.zeros(32, 1, device=device)])
        loss = bce(logit, label)
        opt.zero_grad(); loss.backward(); opt.step()
        if step % max(1, args.steps // 5) == 0 or step == 1:
            print(f"step {step:5d}/{args.steps}  loss {loss.item():.3f}", flush=True)

    net.eval()
    print("\n=== how good is the detector? ===")
    print(f"trained-on generator (held-out) : {accuracy(net, real_te, fake_te)*100:5.1f}%  <- easy")
    try:
        test_fake = load(args.test_fakes, device)
        _, tf_te = split(test_fake)
        print(f"UNSEEN generator ({args.test_fakes}) : {accuracy(net, real_te, tf_te)*100:5.1f}%  <- the arms race: it doesn't transfer")
    except FileNotFoundError:
        print(f"(run §4 to make {args.test_fakes} and see the cross-generator gap)")

    save_spectra(real_te, fake_te, args.out)
    print(f"\nwrote {args.out}: average frequency spectrum, real (left) vs fake (right).")
    print("the fake side shows a brighter high-frequency ring / grid -- the generator's fingerprint.")


if __name__ == "__main__":
    main()
