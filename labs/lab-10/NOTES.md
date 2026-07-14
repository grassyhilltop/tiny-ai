# Lab 10 — Instructor Notes

## What this lab is for

Three jobs, in order: (1) close the loop between the manual pentest in Lab 01 and the agentic-engineering toolkit in Lab 09, (2) give students hands-on experience driving an agent against a real (intentionally vulnerable) target, (3) make the dual-use ethics of agentic pentesting concrete enough that no one in the cohort accidentally crosses the CFAA in week 11.

This lab does **not** follow the Build → Break → Secure arc. It's a deepening of Break, with the operator changed from "the student typing commands" to "the agent the student is supervising."

---

## Runtime: PentestGPT on Rivanna + free Kimi, target = Metasploitable 3

This lab uses **PentestGPT** (GreyDGL, MIT) in its **interactive legacy mode**
(`pentestgpt-legacy`), pointed at the free **UVA Rivanna GenAI (Kimi)** endpoint
via `OPENAI_BASE_URL`. It costs students nothing. Key facts to internalize before
teaching:

- The plain `pentestgpt` (autonomous) command is **Claude-only** and needs the
  paid Claude CLI — we do **not** use it. `pentestgpt-legacy` is the multi-model,
  human-in-the-loop mode (reasoning + generation + parsing sessions, the PTT).
- PentestGPT is **semi-interactive**: it suggests a command, the student runs it
  on Kali against the target, and pastes the output back. The agent never touches
  the target directly — the student is the execution gate. Lean into this; it's
  the whole ethics story.
- **Two machines.** PentestGPT runs on **Rivanna** (where Kimi is reachable); the
  exploit commands run on the **cyber-range Kali** against a **Metasploitable 3**
  box. Students copy commands Rivanna→Kali and paste results Kali→Rivanna.

## The cyber-range egress story (much simpler now)

Because PentestGPT runs on Rivanna, **the range needs no new egress** — Kali never
has to reach the model. This is the big win over the Claude-Code design. Options:

1. **Default: PentestGPT on Rivanna.** Students use an Open OnDemand shell / Code
   Server on Rivanna for PentestGPT, and the VCR Kali web shell for commands.
   Range stays fully air-gapped.

2. **If you opened Kali→RC GenAI egress** (single host,
   `open-webui.rc.virginia.edu:443`), students can run `pentestgpt-legacy`
   directly on Kali. Convenient, but no longer needed for cost or function.

3. **Fully offline**: run a local Ollama model on Rivanna (or Kali) and pass
   `--reasoning-model ollama:qwen3 --base-url http://localhost:11434/v1`. Weaker
   model, zero network.

---

## Pre-class checklist (1 week before)

- [ ] VCR "Lab 10 — Agentic pentest" exercise provisions a **Metasploitable 3** target (Linux build assumed by the walkthrough: ProFTPD 1.3.5, UnrealIRCd 6697, Apache 2.4.7, Samba, MySQL, CUPS). If your range serves the Windows build, swap the example services.
- [ ] `pentestgpt-legacy` installed on Rivanna (Python 3.12+, `uv`); you started a session against the Kimi endpoint and confirmed the 3 sessions come online
- [ ] You ran the full walkthrough yourself, Rivanna↔Kali, end-to-end. Note timing (≈10–15 min to first compromise — the copy/paste loop is slower than a fully-autonomous agent)
- [ ] Confirmed the exact `--reasoning-model` / `--parsing-model` id and flag spelling for the installed PentestGPT version (`--help`, `--models`) — these drift between releases
- [ ] Students have a free Rivanna GenAI token (no paid subscription needed). Confirm token issuance before class day
- [ ] Backup plan if VCR is down: pre-recorded screencast of a full engagement + reading on PTES + the assignment can shift entirely to homework

---

## Pre-class checklist (day-of)

- [ ] Egress allowlist still working — run the test `curl` from inside an instance
- [ ] No internal subnets are reachable from the exercise's Kali (test: `nmap -sn 10.0.0.0/8` should only see the lab subnet, not the larger range)
- [ ] You can demo the Try-It widget on the projector — it's a recorded transcript but it sets the stage
- [ ] Gradescope assignment posted with deliverables and rubric

---

## Time budget (real)

| Part | Allotted | Actual w/ prepared class | Common slip |
|---|---|---|---|
| §1–§3 reading + glossary hover | 15 min | 15 min | None |
| §4 Setup — install PentestGPT on Rivanna + point at Kimi + launch Kali | 25 min | 25–35 min | `uv`/Python 3.12 install; model flag/id mismatch |
| §5 First agentic engagement (scope → recon → 2 exploits → review) | 60 min | 55 min | Students reading every line slowly (good — encourage it) |
| §6–§8 best practices, anti-patterns, legal | 15 min | 10–15 min | Discussion-driven |
| Assignment kickoff | 10 min | 10 min | None |

Total: ~2 hours in class, assignment as ~1 week of homework.

---

## Common student errors

| Symptom | Cause | Fix |
|---|---|---|
| `pentestgpt` wants a Claude login / API key | They ran the **autonomous** command, which is Claude-only | Use `pentestgpt-legacy`; it's the multi-model interactive mode |
| Model errors / 401 / "model not found" | `OPENAI_BASE_URL`/token unset, or wrong model id | `export OPENAI_API_KEY` + `OPENAI_BASE_URL`; confirm the id with `--models`; pass `--base-url` explicitly |
| `make install` fails | Missing Python 3.12+ or `uv` | Install `uv`; on Rivanna load a 3.12 module; or `pip install -e .` |
| Session "hangs" on first reply | First-token latency on Kimi can be slow | Wait 20–30s; if it persists, re-check the endpoint |
| Suggested command targets an IP outside scope | Student briefed scope loosely ("the subnet" not "10.0.0.6 only") | Tighten the scope briefing together — useful teaching moment; and remind them THEY run the command, so they catch it |
| PentestGPT claims a compromise that didn't happen | LLM hallucinated success from pasted output | Verify with own eyes: `id`, `whoami`, `hostname` in the actual shell. This is the headline failure mode — make students hunt for it |
| Student runs a suggested command against their laptop "to test" | Scope confusion | Hard stop. Walk through scope again. The model proposing it doesn't make it legal — the human running it is liable. Most important teaching moment of the lab |

---

## Discussion seeds

- **The dual-use truth, on the projector.** Open §8 of the HTML in presentation mode and discuss for 10 minutes. The whole lab hinges on whether students internalize the authorization-is-everything point.
- **"Why didn't PentestGPT skip recon?"** Show the Try-It widget. Ask why it ran nmap before jumping to the ProFTPD exploit it could have guessed from the version banner. The answer — "to find the *other* services and confirm what's actually there" — is the lesson of phased pentesting.
- **Compare productivity claims honestly.** Lab 01 took 40 minutes for one compromise; with PentestGPT the *recall and planning* are near-instant, but the **human** is still in the loop running and verifying every command, so wall-clock is dominated by you, not the model. The multiplier is real; "AI does pentests for you" is wrong — and the interactive copy/paste loop makes that obvious.
- **Prompt injection in the wild.** Real example: Mandiant red team caught an internal LLM agent following instructions buried in a captured HTTP banner (Anthropic published a related case study in 2024). The risk is not theoretical.

---

## Grading rubric expansion (matches the assignment table in the HTML)

- **Scope statement (15 pts)** — full credit for IP-specific scope, explicit exclusions, time-box, attack-category list. Partial credit for missing exclusions or vague language ("the lab subnet" instead of "10.0.0.6").
- **≥1 additional service compromised (30 pts)** — beyond the ProFTPD 1.3.5 mod_copy path shown in the walkthrough, the student must compromise at least one more distinct service. Metasploitable 3 (Linux) offers plenty: UnrealIRCd 6697 backdoor, Apache/Drupal/web app, Samba, MySQL/CUPS, plus several sudo/SUID privescs. Penalize if the additional "service" is just a variation on ProFTPD, or if the student couldn't verify root with their own `id` output.
- **PTES report (25 pts)** — executive summary present + accurate; methodology lists tools used; findings table with severity ratings; remediation specific enough to be actionable. Penalize "agent-flavored" prose that wasn't edited (the report should sound like *the student*, not the model), and any finding without evidence in the student's own command history.
- **Reflection (15 pts)** — full credit only if the student names a *specific* PentestGPT mistake and shows how they caught it. "It was sometimes overconfident" is a 5/15 answer; "it claimed root on service X but `id` returned uid=33; the privesc step had silently failed and I re-ran it" is 15/15.
- **You-signed-it quality (15 pts)** — would you forward this report to a paying client? Or are there typos, mis-rated risks, generic advice?
- **Bonus +10 pts — beat the agent** — student documents a real vuln PentestGPT missed, misjudged, or hallucinated, with evidence and a working (or disproven) exploit, and one line on why the model got it wrong.

---

## After-action items

- Review each team's Kali command history against their scope statement. Anyone who ran a command against an out-of-scope host gets a friendly check-in conversation, not a grade penalty (yet) — they likely didn't realize. Repeat-offenders escalate.
- Note which Metasploitable 3 services students actually compromised, and which exploits PentestGPT suggested vs. which it missed. Informs next year's walkthrough.
- Collect anonymized PentestGPT sessions + command histories (with consent) — they become the corpus for next year's Try-It widget.

---

## Backup plan if the Kimi endpoint is down

Have Plan B ready:

1. Point `pentestgpt-legacy` at a local Ollama model (`--reasoning-model ollama:qwen3 --base-url http://localhost:11434/v1`). Weaker reasoning, but fully offline — doubles as the outage plan.
2. Run the lab as a pure-manual exercise (matches Lab 01's flow) and have students *write* the prompts they would have given PentestGPT and predict its next step, with a peer playing the agent. Still teaches the discipline.

Don't cancel class. The principles transfer.
