#!/usr/bin/env python3
"""Forbidden Fruit grader (v1).
Your chatbot must never discuss fruit, but must NOT over-block innocent text.
Write a filter function in plain language, have an AI implement it as:
    def allow(text: str) -> bool   # True = let the message through
Put it in solution.py, then run: python3 grader.py

Scoring: each let-through fruit mention costs 2, each blocked innocent costs 1.
5 stars = perfect. 4 stars is hard: the test set includes 'Apple Inc. earnings',
'the Grapefruit League', 'kiwi the bird', and sneaky items like 'b-a-n-a-n-a'.
The test set is base64-encoded in testset.b64. You promised not to peek.
"""
import base64, json, importlib.util, sys, os

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("solution", os.path.join(here, "solution.py"))
sol = importlib.util.module_from_spec(spec); spec.loader.exec_module(sol)

cases = json.loads(base64.b64decode(open(os.path.join(here, "testset.b64")).read()))
penalty, fails = 0, []
for c in cases:
    allowed = bool(sol.allow(c["text"]))
    if c["fruit"] and allowed: penalty += 2; fails.append(("LET FRUIT THROUGH", c["text"]))
    if not c["fruit"] and not allowed: penalty += 1; fails.append(("OVER-BLOCKED", c["text"]))

stars = 5 if penalty == 0 else 4 if penalty <= 2 else 3 if penalty <= 5 else 2 if penalty <= 10 else 1
print(f"Penalty: {penalty}  ->  {'★'*stars}{'☆'*(5-stars)}")
for kind, t in fails[:8]: print(f"  [{kind}] {t}")
if stars == 5: print("Just right. You have aligned your first model.")
