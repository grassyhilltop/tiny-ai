# Lab 15 · Assignment · Build the secure twin

You attacked `baseline_rag.py` five ways. Now defend it. Start from
`../server/baseline_rag.py`, keep its HTTP surface, and harden it.

## Deliverables (submit these two files)

1. **`secure_rag.py`** — same surface as `baseline_rag.py` (the `/query`,
   `/ingest`, `/reset`, `/health` endpoints and the `retrieve` / `output_guard`
   / `file_read` / `ingest_text` functions), with **two or more** of the §8
   fixes implemented. Run it on a **different port** from the baseline (e.g.
   `uvicorn secure_rag:app --port 8091`). Comment each fix with the attack
   number it closes.
2. **`writeup.md`** — one page, three sections: **(a)** which Lab 15 attacks
   your defenses close, **(b)** the structural blind spot your defenses still
   leave — what attack would still get through, and why, and **(c)** what the
   next defense — and its new attack class — would be.

See `solution/` for a reference of both.

## Grade yourself locally

From the folder holding your two files:

```bash
pip install fastapi httpx uvicorn pydantic
python3 /path/to/assignment/test_local.py .
```

This runs the same automated checks Gradescope runs and prints a per-check
breakdown.

## How grading works (and its one honest limit)

The lab attacks need a live LLM, which the grader does not have. So the grader
swaps in a **deterministic stub** that behaves like a faithful, compliant,
vulnerable model — it quotes retrieved context verbatim and obeys `read_file`
tool-calls — and runs the attacks against your `secure_rag` through FastAPI's
in-process `TestClient`. A working defense is exactly what stops the stub from
leaking. Results are reproducible; the stub simply can't simulate multi-turn
model cleverness, which is why the write-up is graded by a human.

### Points

| Check | Points | Auto? |
|---|---:|---|
| `secure_rag` imports, exposes the surface, answers a benign query | 10 | ✅ |
| Two or more §8 defenses are actually effective | 20 | ✅ |
| The original lab attacks fail against your twin (≥2 of 5 neutralized) | 30 | ✅ |
| Write-up: structural blind spot your defenses still leave | 20 | ✍️ by hand |
| Write-up: the next defense and its new attack class | 20 | ✍️ by hand |
| **Total** | **100** | |

The five defenses the grader can detect (implement **any two+**): ingest-time
DLP (Attack 1), ingestion provenance (Attack 2), per-source diversity cap
(Attack 3), path normalize + allowlist (Attack 4), structural output filter
(Attack 5). Category C is fair to whichever two you pick — it awards 15 points
for each of *any* two lab attacks your twin neutralizes.

## Files

```
assignment/
  README.md            ← you are here
  test_local.py        ← grade yourself locally
  solution/            ← reference secure_rag.py + writeup.md
  autograder/
    grader.py          ← the grader (also runs locally)
    run_autograder     ← Gradescope entrypoint
    setup.sh           ← Gradescope image build
    autograder.zip     ← upload this to Gradescope
```
