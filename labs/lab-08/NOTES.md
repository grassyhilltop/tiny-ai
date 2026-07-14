# Lab 08 — Instructor Notes

## What this lab is for

Three jobs: (1) make students familiar with the two OSINT search datasets they will reach for repeatedly all semester (HIBP, Shodan), (2) have them perform a real self-audit using those tools, (3) install and run a substantial OSINT-aggregation platform — Shadowbroker (BigBodyCobain) — inside the cyber range so they see what a "complete OSINT workspace" looks like and how ML-driven feed fusion works in practice.

This lab does not follow the Build → Break → Secure arc; it's a methodology + tooling lab. Most labs from here on reference the OSINT-pivot concepts from §4 and the Shadowbroker workspace from §6.

---

## Critical setup change for §7 (Shadowbroker)

The default cyber-range exercise from Lab 0 has **no internet egress**, which is correct for a vulnerability lab and wrong for an OSINT-aggregator lab. Shadowbroker ingests from 60+ third-party feeds. Before class you need to provision a **separate exercise** for Lab 08 — *do not modify Lab 0's exercise*, which other labs depend on.

### Recommended exercise: "Lab 08 — OSINT aggregator"

Clone the Lab 0 exercise template and apply these changes:

1. **Open outbound HTTPS broadly.** The right call is to allow outbound 443 to any internet host, *not* an allowlist. Shadowbroker pulls from 60+ hostnames and the list shifts as the project adds feeds; an allowlist becomes a maintenance burden. Outbound HTTPS-only (block 80, block all other ports, block DNS-to-the-internet, force DNS through a resolver you control) keeps the blast radius manageable.

2. **Block inbound from the cyber range.** Outbound HTTPS to the world; inbound from the Lab 0 subnet (Metasploitable et al.) explicitly denied. The Kali instance in this exercise must not be reachable from other students' attacks.

3. **Bump VM sizing.** Shadowbroker's backend memory-limits to 4 GB. Default Kali VMs in VCR are typically 2 GB. Re-provision at **8 GB RAM / 4 vCPU / 30 GB disk** for headroom.

4. **Pre-install Docker.** Docker has been in Kali images since 2023 but verify by running `docker run hello-world` from a fresh-launched VM. If missing: `apt-get install -y docker.io docker-compose-plugin`.

### Allowlist-only alternative (more work, more control)

If your VCR policy disallows broad outbound, you can allowlist the exact hostnames. The complete list is in `backend/feeds/` of the Shadowbroker repo; the minimum set for a working demo is:

```
aisstream.io           # ship tracking (REQUIRED — only one without alternatives)
opensky-network.org    # aircraft
api.shodan.io          # internet-asset index
services.sentinel-hub.com  # satellite imagery
earthdata.nasa.gov     # fires, weather
hub.docker.com         # image pulls
ghcr.io                # alt image pulls
github.com             # git clone
objects.githubusercontent.com   # blob storage for git clone
```

Document the allowlist in Gradescope so students who hit a "feed unavailable" message in the Shadowbroker UI know it's the allowlist, not their config.

---

## Pre-class checklist (1 week before)

- [ ] Lab 08 exercise cloned in VCR and renamed; egress + sizing verified per above
- [ ] You ran the full §7 walkthrough yourself — clone, `.env`, `docker compose up -d`, browse the UI for ≥5 minutes
- [ ] You have a working **aisstream.io** key and the URL to sign up for one is in your handout (the signup flow takes ~2 minutes; have students do it before class to save time)
- [ ] Shodan academic license requested for the cohort if it's not already in place
- [ ] Gradescope page with: VCR enrollment link, expected Kali sizing, aisstream.io signup link, backup laptop-install instructions

## Pre-class checklist (day-of)

- [ ] Egress test from a fresh VM: `curl -sI https://stream.aisstream.io/v0/stream | head -1` — should return `HTTP/1.1 200` or `426 Upgrade Required` (websocket upgrade), not a connection error
- [ ] `docker run hello-world` works from a fresh VM
- [ ] You can pull `shadowbroker-backend` from your test session in under 90 seconds
- [ ] Demo: launch Shadowbroker on the projector, show the aircraft layer over Charlottesville

---

## Time budget (real)

| Part | Allotted | Actual | Notes |
|---|---|---|---|
| §1–§5 reading + glossary hover | 15 min | 15 min | |
| §6 Hands-on self-audit | 45 min | 30–45 min | Strongly varies by whether they have an HIBP key |
| §7 Shadowbroker setup | 45 min | 50–60 min | Docker pulls dominate; aisstream.io signup if not pre-done eats 5 min |
| §8–§9 best practices, anti-patterns | 10 min | 10 min | |
| Assignment kickoff | 5 min | 5 min | |

Plan ~2 hours in class. Assignment runs ~1 week as homework.

---

## Common student errors

| Symptom | Cause | Fix |
|---|---|---|
| `docker compose pull` hangs | Egress to hub.docker.com not allowed | Confirm allowlist; check `iptables -L OUTPUT` from inside the VM |
| Shadowbroker UI loads at `:3000` but the map has no markers | aisstream.io key missing or invalid | Verify `.env`, restart with `docker compose restart backend` |
| Backend container exits with OOM | VM has <4 GB available | Re-provision VM at 8 GB, or lower `BACKEND_MEMORY_LIMIT=3g` and accept the perf hit |
| "EADDRINUSE: 3000" | Student left a previous instance running | `docker compose down` from the old directory before `docker compose up -d` in the new one |
| Frontend build times out on first run | Slow network during the npm install step inside the frontend container | Restart `docker compose up -d`; the build artifact is cached after first success |
| Student tries to access from their laptop's browser via the VCR's public URL | Frontend is not exposed; the VM uses localhost-only ports for safety | Have them browse from inside the Kali desktop via the VCR's Guacamole; that's the intended path |

---

## Discussion seeds

- **"What surprised you on the map?"** Open the projector view of Shadowbroker after students have ~10 minutes to explore. The first answer is usually "there's a military flight over Norfolk RIGHT NOW." The lesson: this isn't intelligence; it's reading a public feed. The same data is available to every adversary. *Defenders should know what their adversaries know.*
- **HIBP + breach reuse.** Walk through how a real attacker chains the OSINT pivots in §4. The exercise that drives it home: take 3 minutes to look up an instructor's domain in HIBP + Shodan + crt.sh in front of the class (with consent obviously). The number of findings against a normal academic's footprint is uncomfortable.
- **AGPL gotcha.** A real and underdiscussed risk for students who later try to ship products. Ask the class: "If you fork Shadowbroker and your startup deploys it behind a login page, what do you owe?" The answer (you must publish your modifications to your users) surprises everyone.

---

## Grading rubric expansion

The assignment is in the HTML at `#assignment`. Two areas to watch for:

- **Consent is non-negotiable.** A student who skips the consent doc submits an OSINT report on someone who didn't agree — that's an instructor-level conduct issue, not a points deduction. Be clear about this in your intro to the assignment.
- **Findings must be specific.** A finding of "the target has an exposed email in a breach" is 0 points. "The target's email <code>x@y.com</code> appears in Adobe 2013, LinkedIn 2012, and Collection #1; the leaked LinkedIn password was 6 characters and is in the top-1000 most-reused list" is full points.

---

## After-action items

- Diff egress logs from §7 against the allowlist. Anyone whose Kali tried to reach hosts outside the allowlist gets a check-in conversation. Most will be benign (a Shadowbroker feed that's not on your list); some will be students poking around at unrelated sites.
- Note the most common findings in students' self-audits (§6). The aggregate pattern is useful for the institutional security team and for future-semester briefings.

---

## Backup plans

- **If VCR can't be configured for outbound HTTPS in time**: have students run Shadowbroker on their personal laptops. The setup is identical (`docker compose up -d`); the laptop has its own internet. Lose the cyber-range security-isolation lesson but keep the tool lesson.
- **If aisstream.io is rate-limiting your cohort**: have small groups share one key. Map traffic is the same regardless of which member of the team is "the API caller."
- **If Docker Hub is down on lab day** (rare but happens): the Shadowbroker repo has `Dockerfile` for each service. `docker compose build` works offline once images are pulled, and you can pre-build images on a single instance and `docker save | docker load` to the others.
