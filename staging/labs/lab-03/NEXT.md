# Lab 03 — what is still half-done

This lab was written for a university HPC cluster and is being converted to a free Colab GPU.
The **visual** conversion is done: the portal walkthrough, its screenshots and the institutional
naming are gone. What remains is the part that needs someone to actually run the lab.

Verified clean as rendered (innerText **and** hover annotations, which are a separate string pool
that `innerText` cannot see — check both): Rivanna, Afton, Open OnDemand, OOD, MIG, Code Server,
UVA, netbadge, /scratch, sbatch. No dead internal anchors, no broken images.

## Still to do, roughly in order

1. **Run the pipeline on a free Colab T4 and fix what breaks.** Nothing below is a substitute for
   this, and every remaining item is a guess until someone does it.
2. **Shell commands vs notebook cells.** Some commands still read as though they are typed at a
   cluster prompt. In a Colab cell a shell command needs a `!` prefix and `export` does not
   survive between cells (use `%env`). Audit every command block for this; it is the single most
   likely thing to stop a reader dead.
3. **§5 "Talk to your model".** It calls `chat_cli`, an interactive stdin REPL. Colab *does* have
   a terminal (the button in the bottom-left of the sidebar), so this is not impossible — but a
   plain `!python -m scripts.chat_cli` cell has no stdin attached and will take EOF immediately.
   Either point the reader at the terminal explicitly, or prefer the web-UI path, which works from
   a cell. Do not describe the REPL as the "always works" fallback; it is the fussiest path.
4. **The assignment block** is still coursework: "What you submit", a rubric scored out of 100, a
   bonus worth +10. It sits a paragraph below "Nobody is grading this". Pick one.
5. **Screenshots.** Five remain. `07-chat-ui.png` shows the course fork's UI with its own accent
   colours while §3 now says the reader is cloning Karpathy's nanochat unmodified — either recapture
   or say which is being shown. `05-training-terminal.png`'s alt text says "bf16 MFU" on a page
   that now tells the reader a free T4 runs fp32.
6. **`--master_port`.** The commands use a literal `29500`; `viz.js`'s hover explanation for that
   flag is still headed `--master_port=$MASTER_PORT`, a variable the lab no longer sets.
7. **The footer** links to `../lab-04/microagent.html`, which is a 404, and still says "COURSE".
   That comes from `labs/_shared/lab-base.js` and is shared with the other labs.

## Two traps for whoever picks this up

- **Grepping the rendered text is not enough.** `data-explain` and `data-gloss` attributes render
  into the hover panel and never appear in `innerText`. A `/scratch` path hid in one of those
  through a check that reported the page clean. Grep the source too.
- **Blanket string replacement mangles prose.** Replacing "Rivanna" with a generic phrase turned a
  glossary entry into "'s two HPC clusters... **a GPU cluster** is the older". Read what you
  rewrote; that entry had to be written again from scratch.
