# Autograder — microfake diffusion assignment

Gradescope autograder for `microfake.py` (students implement `precond_target`
and `ddim_step`). Pure Python 3 stdlib.

## Files
- `run_autograder` — Gradescope entrypoint.
- `setup.sh` — image build step (just checks python3; nothing to install).
- `grader.py` — imports the student's `microfake.py`, runs 4 checks, writes
  `results.json` in Gradescope format. Grades the **code** portion (70 pts);
  the reflection (30 pts) is graded manually.
- `build_zip.sh` — builds `autograder.zip` to upload to Gradescope.

## Tests (70 pts autograded)
1. `precond_target` exact value — 25
2. `ddim_step` partial step exact — 15
3. `ddim_step` boundary (`sigma_next=0`) — 10
4. end-to-end generation (train + sample near the manifold) — 20

## Grade locally
    python3 grader.py --submission ../solution     # reference -> 70/70
    python3 grader.py --submission /path/to/student

## Build the Gradescope zip
    ./build_zip.sh    # -> autograder.zip
