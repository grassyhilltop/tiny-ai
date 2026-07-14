#!/bin/bash
#SBATCH --job-name=microfake
#SBATCH --account=ds6042
#SBATCH --partition=gpu
# Request an A100 (compute capability 8.0). The NGC pytorch/2.11.0 container
# ships CUDA kernels for CC >= 7.5 only, so the older V100s (CC 7.0) in the
# general gpu pool crash with "no kernel image is available". a40/a6000 also work.
#SBATCH --gres=gpu:a100:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:20:00
#SBATCH --output=%x-%j.out
#
# Generic GPU runner for any microfake companion script.
#   sbatch run_hpc.slurm faceswap.py --a 7 --b 21
#   sbatch run_hpc.slurm gan_faces.py --steps 4000
#   sbatch run_hpc.slurm diffusion_faces.py --steps 4000
#   sbatch run_hpc.slurm video_faces.py --a 7 --b 21
#   sbatch run_hpc.slurm detect_faces.py
#
# Watch:  squeue --me         Result: the PNG(s) that script writes, in this dir.
# PyTorch comes from the prebuilt NGC container -- nothing to install.

module load apptainer/1.4.5 pytorch/2.11.0

apptainer exec --nv "$CONTAINERDIR/pytorch-2.11.0.sif" python "$@"

echo "done. copy any PNGs down with:  scp $USER@login.hpc.virginia.edu:$(pwd)/'*.png' ."
