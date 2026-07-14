"""
test_microfake.py — local autograder for the microfake diffusion assignment.

Run from the folder that contains your microfake.py:

    python3 test_microfake.py

Checks two things your functions must get exactly right (fast), then trains the
real model briefly and confirms it actually GENERATES (a few seconds). The
Gradescope autograder runs a superset of these — passing locally is necessary,
not sufficient.
"""
import math, sys, importlib

def approx(a, b, tol=1e-6): return abs(a - b) <= tol

def main():
    try:
        m = importlib.import_module("microfake")
    except Exception as e:
        print("could not import microfake.py:", e); sys.exit(1)

    results = []  # (name, passed, detail)

    # ---- UNIT 1: precond_target = (x0 - c_skip*x)/c_out, component-wise ----
    try:
        out = m.precond_target([0.8, 0.0], [0.2, 0.0], 0.5, 0.4)
        ok = approx(out[0], 1.75) and approx(out[1], 0.0)   # (0.8-0.1)/0.4=1.75 ; (0-0)/0.4=0
        results.append(("precond_target returns the EDM target", ok, f"got {out}, expected [1.75, 0.0]"))
    except Exception as e:
        results.append(("precond_target returns the EDM target", False, f"raised {e!r}"))

    # ---- UNIT 2a: ddim_step moves partway toward x0_hat ----
    try:
        out = m.ddim_step([0.2, 0.0], [0.8, 0.0], 0.5, 0.3)
        ok = approx(out[0], 0.44) and approx(out[1], 0.0)   # 0.8 + (0.3/0.5)*(0.2-0.8) = 0.44
        results.append(("ddim_step takes the right partial step", ok, f"got {out}, expected [0.44, 0.0]"))
    except Exception as e:
        results.append(("ddim_step takes the right partial step", False, f"raised {e!r}"))

    # ---- UNIT 2b: ddim_step at sigma_next=0 returns x0_hat exactly ----
    try:
        out = m.ddim_step([0.2, -0.5], [0.8, 0.1], 0.5, 0.0)
        ok = approx(out[0], 0.8) and approx(out[1], 0.1)
        results.append(("ddim_step lands on x0_hat at sigma_next=0", ok, f"got {out}, expected [0.8, 0.1]"))
    except Exception as e:
        results.append(("ddim_step lands on x0_hat at sigma_next=0", False, f"raised {e!r}"))

    # ---- INTEGRATION: train briefly, then sample near the data manifold ----
    try:
        m.train(iters=1500, batch=12)
        pts = m.sample(n=200)
        def nearest(p): return min(math.hypot(p[0] - d[0], p[1] - d[1]) for d in m.DATA)
        avg = sum(nearest(p) for p in pts) / len(pts)
        ok = avg < 0.18
        results.append(("trained model generates on-manifold samples", ok, f"avg dist to data = {avg:.4f} (need < 0.18)"))
    except Exception as e:
        results.append(("trained model generates on-manifold samples", False, f"raised {e!r}"))

    print("=" * 60)
    passed = 0
    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        if not ok: print(f"        {detail}")
        passed += ok
    print("=" * 60)
    print(f"{passed}/{len(results)} tests passed")
    sys.exit(0 if passed == len(results) else 1)

if __name__ == "__main__":
    main()
