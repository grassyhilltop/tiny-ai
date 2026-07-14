# Micro face-swap on the HPC cluster (turn-key)

The real-image companion to §2 of the lab. `autoencoder.py` shows the face-swap
idea on 4 hand-traced numbers; **`faceswap.py`** shows the *same* idea learning
from real faces on a GPU: one shared encoder, two identity decoders, then swap
the decoders. Everything you need ships in this folder — no downloads, no
`pip install`.

## What's here

| File | What it is |
|------|-----------|
| `faceswap.py` | The whole model, ~180 readable lines. Shared encoder + two decoders. |
| `faces_all.npz` | The data: 40 Olivetti faces (64×64 grayscale, public-domain research set). |
| `run_faceswap.slurm` | Batch job that runs it on a cluster GPU. |
| `results.png` | Example output (what a good run looks like). |

## Run it in 3 steps

Connecting: off campus, turn on the UVA VPN (UVA Anywhere) first — without it
the cluster won't answer. Then `ssh <your-id>@login.hpc.virginia.edu` (UVA
password + Duo push). If this folder isn't on the cluster yet, pull the lab zip
straight onto the login node — no scp needed:

```bash
mkdir -p lab-20 && cd lab-20
wget https://researcher111.github.io/ML-Security-Public/labs/lab-20/lab-20-code.zip
unzip lab-20-code.zip
```

(Or, if you already have the files on your laptop: `scp faceswap.py
faces_all.npz run_faceswap.slurm <your-id>@login.hpc.virginia.edu:~/lab-20/`.)

From the login node, in this folder:

```bash
sbatch run_faceswap.slurm          # 1. submit to a GPU node
squeue --me                        # 2. watch until it leaves the queue (~seconds-minutes)
```
When it finishes, `results.png` is written here. Copy it to your laptop to look:
```bash
# 3. run this on YOUR laptop, not the cluster:
scp <your-id>@login.hpc.virginia.edu:~/path/to/lab-20/results.png .
```

That's it. PyTorch comes from a pre-built container module the job loads for you
(`apptainer/1.4.5` + `pytorch/2.11.0`) — nothing to install.

## Reading results.png

Six rows. The **swap** rows are the point:

| Row | Contents |
|-----|----------|
| 1 | Identity **A** originals (subject 7) |
| 2 | A reconstructed (`decoderA(encoder(A))`) — should look like A. Sanity check. |
| 3 | **A's pose/expression on B's face** (`decoderB(encoder(A))`) ← the swap |
| 4 | Identity **B** originals (subject 21) |
| 5 | B reconstructed — should look like B. |
| 6 | **B's pose/expression on A's face** (`decoderA(encoder(B))`) ← the swap |

If rows 2 and 5 look like the originals but rows 3 and 6 show the *other* person
holding the *same* expression, the swap worked. Swaps look rougher than
reconstructions on purpose — that quality gap is the whole reason detection (§6)
has anything to grab onto.

## Try other faces

Any two of the 40 subjects (montage of all of them is in the lab page). Pick a
pair and pass their indices:

```bash
# quick interactive run instead of a batch job:
# Request an A100 (gpu:a100:1). The pytorch/2.11.0 container has no CUDA kernels
# for the older V100s (CC 7.0) and crashes on one with "no kernel image is available".
module load apptainer/1.4.5 pytorch/2.11.0
srun -A ds6042 -p interactive --gres=gpu:a100:1 -c 4 --mem=16G -t 00:15:00 \
  apptainer exec --nv "$CONTAINERDIR/pytorch-2.11.0.sif" \
  python faceswap.py --a 3 --b 30 --out swap_3_30.png
```

Knobs: `--a`/`--b` (subjects 0–39), `--steps` (default 3000), `--noise` (default
0.5 — the latent jitter that makes swaps clean; try `--noise 0` to see the grainy
failure the regularization fixes), `--zdim` (bottleneck width, default 128).

## No GPU / just want to read the code

It runs on CPU too (about a minute) — drop `--nv` and the `--gres=gpu:a100:1`, or run
it anywhere you have `torch` installed. The GPU only makes it instant.
