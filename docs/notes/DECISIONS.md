# Design decisions (Joel's spec, July 13, 2026)

Captured from Joel's guidance; the build should honor these:

1. **Magic pattern:** wonder in the first 7 seconds, epiphany in the first 5 minutes, repeated every 5 minutes (the Piper blueprint: magical boot, two wires touching = controller).
2. **Ground every abstraction in a real problem.** The single neuron opens with Goldilocks Dosage (StatQuest-inspired medicine classifier), not with naked math. Welch Labs' EU boundary map is the model for making nonlinearity visibly useful.
3. **Rotary knobs, never sliders.** Musical-instrument feel (Welch Labs physical-perception inspiration). Hand-training by knob first; THEN reveal backprop as the automatic hand. This is the emotional core of Lab 1.
4. **Brushing:** hover any weight and it highlights simultaneously in the knob, the network diagram, the equation, and the code.
5. **Spec, don't code:** the Forbidden Fruit finale has learners write plain-language specs and let AI generate the implementation. Future programmers spec; AI implements.
6. **Graded like a game:** hidden test set (base64, honor system), 5 stars, over-blocking penalized as much as under-blocking. Good solutions discover whitelist + blacklist thinking on their own.
7. **file:// first:** Lab 1 must work by double-clicking the HTML, no server (Joel's feedback to Prof. Graham; embed all JS/data inline).
8. **Colab + Drive, not HPC:** lab 3 assumes only a free Google account; checkpoints and pip caches go to the learner's Drive so session timeouts cost nothing; model sized to free-tier GPU limits.
9. **Attribution always:** Prof. Daniel Graham (DS 6042, UVA), Karpathy, StatQuest, Welch Labs, 3Blue1Brown. Claude Fable credited as co-author in README and commits.
10. **UVA-specific and security-lab content removed** for the public fork.
11. Title direction: "LLM Foundations for All" (keeps Joel's "for all" signal). "Hack Box" nod to his 2016 thesis can land in Lab 1 copy later. Forbidden Fruit is the alignment game's name.

## Status and next steps
- Lab 1 Goldilocks: working v1 (single file, knobs, backprop button, brushing on equation). Polish pass wanted: network diagram with brushing, nicer knob skin, mobile touch.
- Forbidden Fruit: grader v1 + starter test set. TODO: starter solution.py template, spec worksheet page, leaderboard-style score sharing.
- Lab 3 Colab: scaffold only. Port the UVA notebook: swap HPC paths for Drive mounts, scale GPT config to T4 limits, add checkpoint-resume cell.
- Repo: Joel creates github.com/<his-account>/llm-foundations-for-all, copies this folder, enables Pages. Claude can do the porting work in-session anytime; for direct GitHub pushes, provide a repo and a fine-grained token (or run the git commands locally with Claude Code).
