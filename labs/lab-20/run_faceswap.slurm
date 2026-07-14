#!/bin/bash
#SBATCH --job-name=faceswap
#SBATCH --account=ds6042
#SBATCH --partition=gpu
# Request an A100 (compute capability 8.0). The NGC pytorch/2.11.0 container
# ships CUDA kernels for CC >= 7.5 only, so the older V100s (CC 7.0) in the
# general gpu pool crash with "no kernel image is available". a40/a6000 also work.
#SBATCH --gres=gpu:a100:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:20:00
#SBATCH --output=faceswap-%j.out
#
# Micro deepfake face-swap on the UVA HPC cluster (Rivanna/Afton).
#   Submit:  sbatch run_faceswap.slurm
#   Watch:   squeue --me      then   tail -f faceswap-<jobid>.out
#   Result:  results.png in this directory (scp it to your laptop to view)
#
# PyTorch comes from the pre-built NGC container module -- nothing to pip install.

module load apptainer/1.4.5 pytorch/2.11.0

# --nv exposes the GPU to the container. Swap subjects with --a / --b (0-39).
apptainer exec --nv "$CONTAINERDIR/pytorch-2.11.0.sif" \
    python faceswap.py --a 7 --b 21 --steps 3000 --out results.png

echo "done -- results.png written. Copy it down with:"
echo "  scp $USER@login.hpc.virginia.edu:$(pwd)/results.png ."
