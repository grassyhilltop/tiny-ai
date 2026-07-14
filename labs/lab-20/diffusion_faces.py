#!/usr/bin/env python3
"""
diffusion_faces.py -- a micro diffusion model that GENERATES faces on HPC.

The real-image companion to §4. `diffusion.py` learns a denoiser on 2D points;
this learns one on 64x64 faces and generates new ones. Same recipe as §4, and
the same idea behind Stable Diffusion -- just tiny.

    forward (free):   noisy = face + sigma * noise      # destroy, no learning
    train:            D(noisy, sigma) -> face           # learn to undo it
    sample:           start from pure noise, denoise down to sigma=0 (a new face)

Unlike the GAN in §3 there is no adversary and no mode collapse: the denoiser is
trained by plain regression, which is why diffusion is stable and covers the
whole data distribution. That stability is the point of the section.

We use EDM preconditioning (Karras et al. 2022) so a tiny model trained for a few
minutes actually produces face-like samples -- the same trick §4's 2D demo uses.

DATA:   faces_all.npz (ships alongside; 40 Olivetti subjects, 64x64).
RUN:    python diffusion_faces.py --steps 4000 --out diff_samples.png
OUTPUT: diff_samples.png (generated faces) + diff_fakes.npz (fakes for §6).
"""
import argparse
import numpy as np
import torch
import torch.nn as nn

SIGMA_DATA = 1.0           # we standardize the faces to unit variance below, so this is 1
SIGMA_MIN, SIGMA_MAX = 0.02, 20.0   # wide range so the top of the schedule is ~pure noise


class ResBlock(nn.Module):
    """GroupNorm -> SiLU -> Conv, twice, plus a skip. Normalization + the residual
    path are what let the denoiser actually FIT the faces instead of blurring to
    the mean -- the piece a plain conv stack was missing."""
    def __init__(self, cin, cout):
        super().__init__()
        self.n1, self.c1 = nn.GroupNorm(8, cin), nn.Conv2d(cin, cout, 3, 1, 1)
        self.n2, self.c2 = nn.GroupNorm(8, cout), nn.Conv2d(cout, cout, 3, 1, 1)
        self.skip = nn.Conv2d(cin, cout, 1) if cin != cout else nn.Identity()
        self.act = nn.SiLU()

    def forward(self, x):
        h = self.c1(self.act(self.n1(x)))
        h = self.c2(self.act(self.n2(h)))
        return h + self.skip(x)


class SelfAttn(nn.Module):
    """Spatial self-attention at the 8x8 bottleneck: lets every location see every
    other, so the model gets the global face LAYOUT (eyes above nose above mouth)
    that convolutions alone miss."""
    def __init__(self, c):
        super().__init__()
        self.n = nn.GroupNorm(8, c)
        self.qkv = nn.Conv2d(c, c * 3, 1)
        self.proj = nn.Conv2d(c, c, 1)

    def forward(self, x):
        B, C, H, W = x.shape
        q, k, v = self.qkv(self.n(x)).chunk(3, dim=1)
        q = q.reshape(B, C, H * W); k = k.reshape(B, C, H * W); v = v.reshape(B, C, H * W)
        attn = torch.softmax(q.transpose(1, 2) @ k / C**0.5, dim=-1)  # (B, HW, HW)
        o = (v @ attn.transpose(1, 2)).reshape(B, C, H, W)
        return x + self.proj(o)


class UNet(nn.Module):
    """Residual U-Net denoiser. Input = noisy image + a sigma-conditioning channel.
    Three levels (64->32->16->8) with a self-attention bottleneck; skip connections
    (the 'U') carry fine detail across."""
    def __init__(self, ch=64):
        super().__init__()
        self.in_conv = nn.Conv2d(2, ch, 3, 1, 1)                 # (img + sigma map) -> ch @64
        self.rb1 = ResBlock(ch, ch)
        self.rb2 = ResBlock(ch, ch * 2)                          # after down -> @32
        self.rb3 = ResBlock(ch * 2, ch * 4)                     # after down -> @16
        self.mid1 = ResBlock(ch * 4, ch * 4)                    # after down -> @8
        self.attn = SelfAttn(ch * 4)
        self.mid2 = ResBlock(ch * 4, ch * 4)
        self.ru3 = ResBlock(ch * 4 + ch * 4, ch * 2)           # up to 16, skip h3
        self.ru2 = ResBlock(ch * 2 + ch * 2, ch)               # up to 32, skip h2
        self.ru1 = ResBlock(ch + ch, ch)                       # up to 64, skip h1
        self.out = nn.Sequential(nn.GroupNorm(8, ch), nn.SiLU(), nn.Conv2d(ch, 1, 3, 1, 1))
        self.down = nn.AvgPool2d(2)
        self.up = lambda t: nn.functional.interpolate(t, scale_factor=2, mode="nearest")

    def forward(self, x, c_noise):
        cmap = c_noise.view(-1, 1, 1, 1).expand(-1, 1, x.shape[2], x.shape[3])
        h1 = self.rb1(self.in_conv(torch.cat([x, cmap], dim=1)))  # @64, ch
        h2 = self.rb2(self.down(h1))                              # @32, 2ch
        h3 = self.rb3(self.down(h2))                              # @16, 4ch
        m = self.mid2(self.attn(self.mid1(self.down(h3))))       # @8,  4ch
        u = self.ru3(torch.cat([self.up(m), h3], dim=1))         # @16, 2ch
        u = self.ru2(torch.cat([self.up(u), h2], dim=1))         # @32, ch
        u = self.ru1(torch.cat([self.up(u), h1], dim=1))         # @64, ch
        return self.out(u)


def edm_coeffs(sigma):
    """EDM preconditioning coefficients for a batch of sigmas (shape (N,1,1,1))."""
    c_skip = SIGMA_DATA**2 / (sigma**2 + SIGMA_DATA**2)
    c_out = sigma * SIGMA_DATA / (sigma**2 + SIGMA_DATA**2).sqrt()
    c_in = 1.0 / (sigma**2 + SIGMA_DATA**2).sqrt()
    c_noise = sigma.log().flatten() / 4.0
    return c_skip, c_out, c_in, c_noise


def denoise(net, x, sigma):
    """The full denoiser D(x,sigma) -> x0_hat, wrapping the raw net with EDM."""
    c_skip, c_out, c_in, c_noise = edm_coeffs(sigma)
    return c_skip * x + c_out * net(c_in * x, c_noise)


def load_faces(npz_path, device):
    """Return faces standardized to zero-mean / unit-variance (what EDM assumes),
    plus the (mean, std) needed to turn generated samples back into pixels."""
    d = np.load(npz_path)
    imgs = d["images"].astype("float32") / 255.0          # [0,1]
    mean, std = float(imgs.mean()), float(imgs.std())
    x = (imgs - mean) / std                                # ~N(0,1)
    return torch.from_numpy(x).unsqueeze(1).to(device), mean, std


def to_pixels(imgs, mean, std):
    """Undo standardization: model space -> uint8 pixels."""
    x = imgs.detach().cpu().numpy()[:, 0] * std + mean
    return np.clip(x * 255.0, 0, 255).astype("uint8")


def grid_png(imgs, mean, std, out, ncol=4):
    from PIL import Image
    x = to_pixels(imgs, mean, std)
    n = len(x); nrow = (n + ncol - 1) // ncol
    canvas = np.zeros((nrow * 64, ncol * 64), "uint8")
    for i, im in enumerate(x):
        r, c = divmod(i, ncol); canvas[r*64:(r+1)*64, c*64:(c+1)*64] = im
    Image.fromarray(canvas).resize((ncol*64*2, nrow*64*2), Image.NEAREST).save(out)


@torch.no_grad()
def sample(net, n, device, steps=40):
    """Generate n faces: start from noise, integrate the EDM ODE down to sigma=0.
    Uses Heun's method (a 2nd-order corrector) -- EDM's default. It re-estimates
    the derivative at the step's endpoint and averages, which sharpens samples a
    lot per step versus plain Euler."""
    # EDM sigma schedule (rho=7) from SIGMA_MAX down to 0
    i = torch.arange(steps, device=device)
    sig = (SIGMA_MAX**(1/7) + i/(steps-1) * (SIGMA_MIN**(1/7) - SIGMA_MAX**(1/7)))**7
    sig = torch.cat([sig, sig.new_zeros(1)])            # append 0
    x = torch.randn(n, 1, 64, 64, device=device) * SIGMA_MAX
    for k in range(steps):
        s = sig[k].view(1, 1, 1, 1).expand(n, 1, 1, 1)
        d = (x - denoise(net, x, s)) / sig[k]            # derivative at current sigma
        x_next = x + (sig[k+1] - sig[k]) * d             # Euler predictor
        if sig[k+1] > 0:                                  # Heun corrector (skip at sigma=0)
            s2 = sig[k+1].view(1, 1, 1, 1).expand(n, 1, 1, 1)
            d2 = (x_next - denoise(net, x_next, s2)) / sig[k+1]
            x = x + (sig[k+1] - sig[k]) * 0.5 * (d + d2)
        else:
            x = x_next
    return x


def main():
    ap = argparse.ArgumentParser(description="micro diffusion model that generates faces")
    ap.add_argument("--data", default="faces_all.npz")
    ap.add_argument("--steps", type=int, default=4000)
    ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--sample_steps", type=int, default=40)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="diff_samples.png")
    ap.add_argument("--dump_fakes", default="diff_fakes.npz")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")
    faces, mean, std = load_faces(args.data, device)
    print(f"training on {faces.shape[0]} real faces")

    net = UNet().to(device)
    opt = torch.optim.Adam(net.parameters(), lr=2e-4)
    # EMA: keep a slowly-averaged copy of the weights and SAMPLE from it. This is the
    # single biggest quality lever for diffusion -- it smooths out the noisy last-step
    # weights into a much better generator.
    ema = UNet().to(device)
    ema.load_state_dict(net.state_dict())

    for step in range(1, args.steps + 1):
        idx = torch.randint(0, faces.shape[0], (args.bs,), device=device)
        x0 = faces[idx]
        # sample a noise level per image (EDM log-normal), then noise the face
        sigma = (torch.randn(args.bs, 1, 1, 1, device=device) * 1.2 - 1.2).exp()
        x = x0 + sigma * torch.randn_like(x0)
        # train the raw net to hit the EDM target; equivalent to weighted x0-regression
        c_skip, c_out, c_in, c_noise = edm_coeffs(sigma)
        target = (x0 - c_skip * x) / c_out
        loss = ((net(c_in * x, c_noise) - target) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
        with torch.no_grad():   # update the EMA weights toward the live ones
            for pe, pn in zip(ema.parameters(), net.parameters()):
                pe.mul_(0.999).add_(pn, alpha=0.001)
        if step % max(1, args.steps // 10) == 0 or step == 1:
            print(f"step {step:5d}/{args.steps}  loss {loss.item():.4f}", flush=True)

    ema.eval()
    grid_png(sample(ema, 16, device, args.sample_steps), mean, std, args.out)
    print(f"\nwrote {args.out} (16 generated faces)")
    if args.dump_fakes:
        fk = sample(ema, 400, device, args.sample_steps)
        np.savez_compressed(args.dump_fakes, images=to_pixels(fk, mean, std))
        print(f"wrote {args.dump_fakes} (400 fakes for the detector in §6)")


if __name__ == "__main__":
    main()
