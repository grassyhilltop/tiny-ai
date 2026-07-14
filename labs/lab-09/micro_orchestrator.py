#!/usr/bin/env python3
"""
micro_orchestrator.py — the smallest orchestrator that still teaches the idea.

An ORCHESTRATOR is the control layer. It does no leaf work itself; it decides
WHAT runs, in WHAT order, and WHERE the results go. The WORKERS (parse, detect,
report) are dumb, swappable units. They obey one contract: each takes the
previous stage's output and returns the input for the next stage.

That separation is the whole lesson:
  - swap a worker            -> the orchestrator doesn't change
  - change the control flow  -> the workers don't change

Run it against the lab's synthetic log:
    python3 micro_orchestrator.py sample-auth.log

Expected (same 137 / 4 the lab quotes), with the orchestrator narrating each
hand-off so you can see the control flow:
    [orchestrator] dispatch -> parse
    [orchestrator] dispatch -> detect
    [orchestrator] dispatch -> report
     137  203.0.113.42
       4  198.51.100.7
"""
import sys


# ---- THE ORCHESTRATOR -------------------------------------------------------
# Six lines. It owns the control flow (sequential), not the work. Each stage's
# return value becomes the next stage's argument — that is the "out -> in" edge
# from the diagram, made literal.
def orchestrate(stages, data):
    for stage in stages:
        print(f"[orchestrator] dispatch -> {stage.__name__}")
        data = stage(data)
    return data


# ---- THE WORKERS ------------------------------------------------------------
# Contract  parse -> detect :  list of {"ip": str}
# Contract  detect -> report:  list of (ip, count) sorted high-to-low
def parse(path):
    events = []
    with open(path) as f:
        for line in f:
            if "Failed password" in line:
                toks = line.split()
                ip = toks[toks.index("from") + 1]
                events.append({"ip": ip})
    return events


def detect(events):
    counts = {}
    for e in events:
        counts[e["ip"]] = counts.get(e["ip"], 0) + 1
    return sorted(counts.items(), key=lambda kv: -kv[1])


def report(rows):
    for ip, n in rows:
        print(f"{n:>4d}  {ip}")
    return rows


# ---- YOU, THE CONDUCTOR -----------------------------------------------------
# Define the pipeline (the order) and press go. To make this FAN-OUT, run the
# pipeline over many files at once; to make it LOOP, wrap it in a while-loop
# with a stop condition. The workers above never change.
if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sample-auth.log"
    orchestrate([parse, detect, report], path)
