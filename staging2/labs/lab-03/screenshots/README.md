# Lab 03 · Screenshot inventory

Eight placeholders are referenced in `../nanochat.html`. Drop the captured images into this folder with the exact filenames below. Until they exist, the `<figure class="lab-figure">` blocks render with a cream-colored plate plus the alt text, visible enough to read the lab around them, obvious enough that nothing is missed.

All screenshots should be **PNG**, sensible width (~1200–1600 px), no need to crop tight, the CSS scales them to the figure width.

| # | Filename | What to capture | Where in the lab |
|---|---|---|---|
| 1 | `01-ood-landing.png` | The Open OnDemand landing page after a fresh netbadge sign-in at `ood.hpc.virginia.edu`. Should show the dashboard tile grid, with **Code Server** visible under *Servers*. | §4.1 |
| 2 | `02-codeserver-config.png` | The Code Server config form filled in with the lab's recommended values (GPU partition, 4 hours, 8 cores, 64 GB, 1 GPU). The form is at `https://ood.hpc.virginia.edu/pun/sys/dashboard/batch_connect/sys/code-server/session_contexts/new`. The screenshot the user provided is the same view, just unfilled. | §4.2 |
| 3 | `03-codeserver-launched.png` | The VS Code interface inside Code Server, with a terminal open and the file browser showing the `/scratch/$USER/lab03` directory. Optional: have nanochat already cloned in the file browser. | §4.3 |
| 4 | `04-terminal-uvsync.png` | Terminal output from a successful `uv sync --extra gpu` run: should end with "Installed 87 packages" or similar, and ideally show the `(.venv)` prompt prefix in the next line. | §5.3 |
| 5 | `05-training-loss.png` | Terminal log from `base_train.py` showing loss decreasing across steps. Ideally captured *during* training so the latest step number is visible, readers should see a snapshot of the loss curve in plain text. If a plotted loss curve is available (matplotlib output, TensorBoard, or wandb), use that instead. | §6.2 |
| 6 | `06-port-forward.png` | The VS Code **Ports** panel inside Code Server (bottom panel area), with port 8000 forwarded and a "Local Address" URL visible. Annotate (or capture with the cursor hovering) the globe icon that opens the URL. | §7.2 |
| 7 | `07-chat-ui.png` | The nanochat web UI loaded in a normal browser tab on the user's laptop (Safari/Firefox/Chrome), not inside Code Server. Should show the empty chat input + a sample previous response so the layout is visible. | §7.3 |
| 8 | `08-sample-conversation.png` | A few back-and-forth turns in the chat UI showing what depth-6 model output actually looks like. Pick prompts that produce a mix of "competent" and "weird", that's the honest representation of the model quality at this scale. | §7.3 (caption) |

## Suggested capture order during one Code Server session

If you do this in one sitting, the order that minimizes re-doing work:

1. Sign in to OOD, capture **01** before launching anything.
2. Fill in the Code Server form, capture **02**.
3. Launch, wait, open Code Server. Capture **03** after opening a terminal.
4. Clone nanochat + run `uv sync`. Capture **04** when sync finishes.
5. Start `base_train.py`. While it runs, capture **05**.
6. Capture **06** during the training run (port-forward isn't useful yet but you can set it up now).
7. After SFT finishes, launch `chat_web.py`. Open the forwarded URL. Capture **07** with an empty chat.
8. Hold a 4–6 turn conversation, capture **08**.

Total time for the capture pass: ~15 minutes if training is already cached; ~90 minutes if doing the full pipeline from scratch.

## Optional bonuses

If you have time, two more captures that would improve the lab without being required:

- `09-nvidia-smi.png`, `nvidia-smi` output during training, showing GPU at near-100% utilization. Good for Best Practice #3.
- `10-tmux-detached.png`, a `tmux` session list (`tmux ls`) with a detached `train` session. Good for Best Practice #4.

Add references to these in `nanochat.html` only if you capture them; the lab reads fine without them.
