#!/usr/bin/env python3
"""Turn a directory of clip.mjs frames into one animated GIF.

    python3 bin/probe/gif.py <framedir> <out.gif> --fps 11 --width 640 [--loopback]

GIF is 256 colours, and this page is a soft-shaded 3D render, so the palette is the whole game.
Quantising each frame on its own makes the background crawl between frames: every frame picks a
slightly different set of greys and the plate appears to boil. So one palette is built from a
sample of frames and every frame is mapped onto it.

--loopback appends the frames in reverse, for motions that read better as a there-and-back
(the face going frown to smile, the codon panel morphing) than as a hard cut back to the start.
"""
import argparse
import glob
import os
import sys

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("framedir")
    ap.add_argument("out")
    ap.add_argument("--fps", type=float, default=11.0)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--colors", type=int, default=192)
    ap.add_argument("--loopback", action="store_true")
    ap.add_argument("--skip", type=int, default=0, help="drop this many frames from the front")
    ap.add_argument("--every", type=int, default=1, help="keep 1 frame in N")
    ap.add_argument("--crop", help="x,y,w,h in frame pixels, applied before the resize. Cheaper "
                                   "than re-recording when the clip rectangle was too generous.")
    ap.add_argument("--dither", action="store_true",
                    help="Floyd-Steinberg. Off by default: it scatters per-pixel noise through "
                         "every flat surface, and GIF compresses runs of identical pixels, so it "
                         "roughly triples the file for a soft-shaded render like this one.")
    a = ap.parse_args()

    files = sorted(glob.glob(os.path.join(a.framedir, "*.png")))[a.skip::a.every]
    if not files:
        sys.exit("no frames in " + a.framedir)

    frames = []
    for f in files:
        im = Image.open(f).convert("RGB")
        if a.crop:
            cx, cy, cw, ch = (int(v) for v in a.crop.split(","))
            im = im.crop((cx, cy, cx + cw, cy + ch))
        if a.width and im.width > a.width:
            im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
        frames.append(im)
    if a.loopback:
        frames += frames[-2:0:-1]

    # One palette for the whole clip. Built from frames spread across the motion, not just the
    # first, or a colour that only appears late (the monitor's green trace, the confetti) has
    # nowhere to land and dithers into noise.
    sample = frames[:: max(1, len(frames) // 8)]
    strip = Image.new("RGB", (sample[0].width, sample[0].height * len(sample)))
    for i, im in enumerate(sample):
        strip.paste(im, (0, i * im.height))
    pal = strip.quantize(colors=a.colors, method=Image.MEDIANCUT)

    dither = Image.FLOYDSTEINBERG if a.dither else Image.NONE
    out = [im.quantize(palette=pal, dither=dither) for im in frames]
    out[0].save(a.out, save_all=True, append_images=out[1:],
                duration=round(1000 / a.fps), loop=0, optimize=True, disposal=2)
    kb = os.path.getsize(a.out) / 1024
    print(f"{a.out}  {len(out)} frames  {out[0].width}x{out[0].height}  {kb:.0f} KB")


if __name__ == "__main__":
    main()
