#!/usr/bin/env python3
"""
Gradescope grader for the microfake diffusion assignment.

Grades the CODE portion of the rubric (70 pts) by importing the student's
microfake.py and checking the two functions they implement — precond_target and
ddim_step — plus an end-to-end generation run. The written reflection (30 pts) is
graded manually and is not touched here.

Local use (grade the reference solution or a student folder):
    python3 grader.py --submission ../solution
    python3 grader.py --submission /path/to/folder/with/microfake.py

Pure Python 3 stdlib. No numpy/torch.
"""
import argparse, importlib.util, json, math, os, sys, traceback

GS_SUBMISSION = "/autograder/submission"
GS_RESULTS = "/autograder/results/results.json"


def find_microfake(submission_dir):
    """Return the dir containing microfake.py (walk in case it's nested)."""
    if os.path.isfile(os.path.join(submission_dir, "microfake.py")):
        return submission_dir
    for root, _dirs, files in os.walk(submission_dir):
        if "microfake.py" in files:
            return root
    return None


def load_student(mf_dir):
    path = os.path.join(mf_dir, "microfake.py")
    spec = importlib.util.spec_from_file_location("microfake", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["microfake"] = mod
    spec.loader.exec_module(mod)   # may raise if the file is broken
    return mod


def approx(a, b, tol=1e-6):
    return abs(a - b) <= tol


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submission", default=GS_SUBMISSION)
    ap.add_argument("--results", default=GS_RESULTS)
    args = ap.parse_args()

    tests = []
    def add(name, score, max_score, output):
        tests.append({"name": name, "score": round(float(score), 2),
                      "max_score": max_score, "output": output})

    sub = os.path.abspath(args.submission)
    mf_dir = find_microfake(sub)
    if mf_dir is None:
        add("Submission check", 0, 70,
            "No microfake.py found in your submission. Upload microfake.py "
            "(with precond_target and ddim_step implemented).")
        return write(args, tests)

    try:
        m = load_student(mf_dir)
    except Exception:
        add("Import microfake.py", 0, 70,
            "microfake.py could not be imported / run:\n" + traceback.format_exc())
        return write(args, tests)

    # ---- Test 1: precond_target exact (25) ----
    try:
        out = m.precond_target([0.8, 0.0], [0.2, 0.0], 0.5, 0.4)
        ok = approx(out[0], 1.75) and approx(out[1], 0.0)
        add("precond_target returns the EDM target", 25 if ok else 0, 25,
            "PASS: (x0 - c_skip*x)/c_out computed correctly."
            if ok else f"FAIL: precond_target([0.8,0],[0.2,0],0.5,0.4) = {out}, expected [1.75, 0.0].")
    except Exception:
        add("precond_target returns the EDM target", 0, 25,
            "FAIL: precond_target raised:\n" + traceback.format_exc())

    # ---- Test 2: ddim_step partial step (15) ----
    try:
        out = m.ddim_step([0.2, 0.0], [0.8, 0.0], 0.5, 0.3)
        ok = approx(out[0], 0.44) and approx(out[1], 0.0)
        add("ddim_step takes the right partial step", 15 if ok else 0, 15,
            "PASS: x0_hat + (sigma_next/sigma)*(x - x0_hat) computed correctly."
            if ok else f"FAIL: ddim_step([0.2,0],[0.8,0],0.5,0.3) = {out}, expected [0.44, 0.0].")
    except Exception:
        add("ddim_step takes the right partial step", 0, 15,
            "FAIL: ddim_step raised:\n" + traceback.format_exc())

    # ---- Test 3: ddim_step boundary sigma_next=0 (10) ----
    try:
        out = m.ddim_step([0.2, -0.5], [0.8, 0.1], 0.5, 0.0)
        ok = approx(out[0], 0.8) and approx(out[1], 0.1)
        add("ddim_step lands on x0_hat at sigma_next=0", 10 if ok else 0, 10,
            "PASS: returns x0_hat exactly when the next noise level is 0."
            if ok else f"FAIL: ddim_step(...,sigma_next=0) = {out}, expected [0.8, 0.1].")
    except Exception:
        add("ddim_step lands on x0_hat at sigma_next=0", 0, 10,
            "FAIL: ddim_step raised:\n" + traceback.format_exc())

    # ---- Test 4: end-to-end generation (20) ----
    try:
        m.train(iters=1500, batch=12)
        pts = m.sample(n=200)
        def nearest(p): return min(math.hypot(p[0] - d[0], p[1] - d[1]) for d in m.DATA)
        avg = sum(nearest(p) for p in pts) / len(pts)
        ok = avg < 0.18
        add("Trained model generates on-manifold samples", 20 if ok else 0, 20,
            f"PASS: avg distance of samples to the data = {avg:.4f} (< 0.18)."
            if ok else f"FAIL: avg distance = {avg:.4f} (need < 0.18). "
                       "Your functions run but the model isn't generating the data.")
    except Exception:
        add("Trained model generates on-manifold samples", 0, 20,
            "FAIL: training/sampling raised:\n" + traceback.format_exc())

    # ---- informational: reflection is graded by hand ----
    add("Reflection (Part 2) — graded manually", 0, 0,
        "The 30-pt reflection.md is graded by the instructor, not this autograder.")

    write(args, tests)


def write(args, tests):
    total = round(sum(t["score"] for t in tests), 2)
    results = {"score": total, "tests": tests,
               "output": "Autograder covers the code (70 pts). The reflection (30 pts) is graded separately."}
    os.makedirs(os.path.dirname(os.path.abspath(args.results)) or ".", exist_ok=True)
    with open(args.results, "w") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
