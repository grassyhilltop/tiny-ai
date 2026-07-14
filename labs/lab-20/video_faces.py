#!/usr/bin/env python3
"""
video_faces.py -- temporal consistency on a real moving face (HPC companion to §5).

`video.py` shows the flicker problem on a 2D toy. This shows it on real faces.

A face "video" here is a MORPH: we smoothly slide from one real face to another in
the autoencoder's latent space and decode a frame at each step. The section's one
idea is that a video is a SINGLE sample from p(video), not T independent samples
from p(image) -- and that independence is exactly what makes generated video
flicker. We show that by generating the same morph two ways:

    consistent :  z_t = (1-t)*z_A + t*z_B                 # one smooth trajectory
    naive      :  z_t = (1-t)*z_A + t*z_B + fresh_noise_t # re-randomize each frame

Same motion, same endpoints. The only difference is whether each frame is drawn
independently. The naive clip jitters; the consistent one glides. We print the
frame-to-frame change for each (the flicker number) and save both as filmstrips.

DATA:   faces_all.npz.   RUN: python video_faces.py --a 7 --b 21 --out_prefix clip
OUTPUT: clip_consistent.png, clip_naive.png (filmstrips) + the two flicker numbers.
"""
import argparse
import numpy as np
import torch
import torch.nn as nn


class AE(nn.Module):
    """A small autoencoder shared across all faces: image -> z -> image."""
    def __init__(self, zdim=128):
        super().__init__()
        self.enc = nn.Sequential(
            nn.Conv2d(1, 32, 4, 2, 1), nn.ReLU(),
            nn.Conv2d(32, 64, 4, 2, 1), nn.ReLU(),
            nn.Conv2d(64, 128, 4, 2, 1), nn.ReLU(),
            nn.Flatten(), nn.Linear(128 * 8 * 8, zdim),
        )
        self.fc = nn.Linear(zdim, 128 * 8 * 8)
        self.dec = nn.Sequential(
            nn.ConvTranspose2d(128, 64, 4, 2, 1), nn.ReLU(),
            nn.ConvTranspose2d(64, 32, 4, 2, 1), nn.ReLU(),
            nn.ConvTranspose2d(32, 1, 4, 2, 1), nn.Sigmoid(),
        )

    def encode(self, x):
        return self.enc(x)

    def decode(self, z):
        return self.dec(self.fc(z).view(-1, 128, 8, 8))


def load_faces(npz_path, device):
    d = np.load(npz_path)
    imgs = d["images"].astype("float32") / 255.0
    return torch.from_numpy(imgs).unsqueeze(1).to(device), d["subject"]


def filmstrip(frames, out):
    """frames: (T,1,64,64) in [0,1] -> a 1xT filmstrip PNG."""
    from PIL import Image
    x = (frames.detach().cpu().clamp(0, 1).numpy()[:, 0] * 255).astype("uint8")
    strip = np.concatenate(list(x), axis=1)
    Image.fromarray(strip).resize((strip.shape[1] * 2, strip.shape[0] * 2), Image.NEAREST).save(out)


def flicker(frames):
    """Mean absolute change between consecutive frames -- higher = more jitter."""
    diffs = (frames[1:] - frames[:-1]).abs().mean().item()
    return diffs


def main():
    ap = argparse.ArgumentParser(description="temporal consistency on a real face morph")
    ap.add_argument("--data", default="faces_all.npz")
    ap.add_argument("--a", type=int, default=7)
    ap.add_argument("--b", type=int, default=21)
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--noise", type=float, default=1.5, help="per-frame jitter in the naive clip")
    ap.add_argument("--steps", type=int, default=2500)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out_prefix", default="clip")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")
    faces, subject = load_faces(args.data, device)

    # train the shared autoencoder on ALL faces so any face has a latent code
    ae = AE().to(device)
    opt = torch.optim.Adam(ae.parameters(), lr=1e-3)
    for step in range(1, args.steps + 1):
        idx = torch.randint(0, faces.shape[0], (32,), device=device)
        x = faces[idx]
        r = ae.decode(ae.encode(x))
        loss = ((r - x) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
        if step % max(1, args.steps // 5) == 0 or step == 1:
            print(f"step {step:5d}/{args.steps}  recon {loss.item():.4f}", flush=True)

    ae.eval()
    with torch.no_grad():
        # endpoints: first image of subject a and of subject b
        ia = int(np.where(subject == args.a)[0][0])
        ib = int(np.where(subject == args.b)[0][0])
        zA = ae.encode(faces[ia:ia+1])
        zB = ae.encode(faces[ib:ib+1])
        ts = torch.linspace(0, 1, args.frames, device=device).view(-1, 1)
        base = (1 - ts) * zA + ts * zB                      # (T, zdim) smooth path

        consistent = ae.decode(base)                        # one trajectory
        naive = ae.decode(base + args.noise * torch.randn_like(base))  # independent per frame

    filmstrip(consistent, f"{args.out_prefix}_consistent.png")
    filmstrip(naive, f"{args.out_prefix}_naive.png")
    print(f"\nwrote {args.out_prefix}_consistent.png and {args.out_prefix}_naive.png")
    print(f"flicker (frame-to-frame change):")
    print(f"  consistent : {flicker(consistent):.4f}   <- smooth morph")
    print(f"  naive      : {flicker(naive):.4f}   <- same morph + independent per-frame noise")
    print("the naive clip changes far more between frames; that extra change IS the flicker.")


if __name__ == "__main__":
    main()
