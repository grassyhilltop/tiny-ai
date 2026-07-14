# Lab 0 — Instructor Notes

## What this lab is for

Three jobs, in this order: (1) get teams formed and contracted, (2) verify every student can actually reach a working Kali shell in the cyber range, (3) give them the satisfaction of popping a root shell on day one. The vsftpd backdoor is the vehicle, not the point — the point is confidence with the toolchain so Lab 1 doesn't lose 45 minutes to "I can't log into the cyber range."

This lab does **not** follow the Build → Break → Secure arc. It's orientation. The arc resumes at Lab 1.

---

## Time budget (real)

| Part | Allotted | Actual w/ a prepared class | Common slip |
|---|---|---|---|
| 1 — Teams | 15 min | 10 min | None if you pre-assign or use sign-ups; 30 min if you don't |
| 2 — VCR | 20 min | 25–30 min | netbadges not active, enrollment link not accepted, browser blocking Guacamole |
| 3 — Recon | 30 min | 15 min | None — fast |
| 4 — Manual exploit | 30 min | 30 min | Students Ctrl-C terminal A; students miss that there's no shell prompt |
| 5 — Metasploit | 20 min | 15 min | First `msfconsole` launch slow on a cold VM |
| 6 — Reflection | 10 min | rolls to homework | Almost always |

Build a 10-minute float into Part 2. If anything is going to eat the class, it's network/auth issues.

---

## Cyber range setup — do this 1 week before class

1. Sign in to https://www.virginiacyberrange.org as instructor.
2. Create a new course; copy the enrollment URL into Gradescope as a "Team Signup" page resource.
3. Add an exercise from a template:
   - Preferred: VCR's stock **"Metasploitable 2"** exercise (already configured: Kali + Metasploitable on a private subnet, no internet).
   - If not available in your catalog, build a custom exercise with Kali Linux (current LTS) and Metasploitable 2 on the same `/24`, no egress.
4. Rename the exercise **"Lab 0 — vsftpd backdoor"** so students find it on the dashboard.
5. Provision **per-team**, not per-student. Lab 0 has both teammates driving the same Kali; per-team is cheaper and the social pressure of pair-driving works in our favor.
6. **Verify end-to-end yourself**: launch the exercise, run the README's `nmap -sn`, run the manual exploit, run the Metasploit module. Note the actual subnet (it varies by VCR build) and patch Part 2.3 of the README if it isn't `10.0.0.0/24`.
7. Send the enrollment link 24–48 hours before class. Check Gradescope the morning of class — confirm ≥80% have accepted. Chase the laggards by email.

---

## Pre-class checklist (day-of)

- [ ] Enrollment acceptance ≥80% — if not, hold an "office hours" 30 min before class for the rest
- [ ] You can launch the exercise yourself and pop a root shell in <5 min
- [ ] You have the actual target subnet noted in case it isn't `10.0.0.0/24`
- [ ] Course Gradescope page has the team-contract template linked
- [ ] Backup plan if VCR is down: pre-recorded screencast of the exploit + offline reading on supply-chain attacks

---

## Common student errors

| Symptom | Cause | Fix |
|---|---|---|
| `nmap -sn` returns only Kali itself | Target VM hasn't finished booting | Wait 30s, re-run. If still nothing after 2 min, restart the exercise. |
| `USER hacker:)` typed, but Terminal B's `nc … 6200` says "Connection refused" | They didn't send `PASS`. The backdoor doesn't arm until both lines are sent. | Send a `PASS` line in Terminal A. Re-try Terminal B. |
| Terminal B connects, then immediately closes | They Ctrl-C'd Terminal A | Re-open Terminal A, redo the two lines, keep it open this time |
| Terminal B is connected but nothing happens when they hit Enter | There's no prompt — they don't realize they're already at a shell | Tell them to just type `id` and hit Enter. Output appears even without a `$`. |
| `msfconsole` won't launch ("could not connect to database") | Postgres not running on the Kali image | `sudo systemctl start postgresql && sudo msfdb init` |
| Metasploit `run` hangs on "Banner: 220..." | `RHOSTS` set to wrong IP, or target VM rebooted | `show options`, set `RHOSTS` again |
| "Permission denied" when running `nmap -sn` | Forgot `sudo` | Re-run with `sudo`. Mention that raw-socket scans require root on Linux. |

---

## Discussion seeds

- **The diff between legitimate and backdoored vsftpd 2.3.4 source.** If you have time, pull both tarballs up on the projector and show the four poisoned lines (in `str.c`'s call-site logic). Point: hostile additions can be one logical conditional. This sets up the whole "ML supply chain" thread that returns in Module 5 (poisoned pretrained models).
- **"Why manual first?"** — before students start Part 5, ask them to predict what Metasploit is about to do. Good answers prove they internalized Part 4. If they can't predict it, Part 4 didn't land — have them re-read 4.2/4.3 before moving on.
- **Pre-auth vs. post-auth severity** (reflection Q2) — good answers note that pre-auth bugs are exploitable by any attacker with network reachability; post-auth bugs require credential compromise as a prerequisite, raising the bar substantially. CVSS attack-complexity / privileges-required vectors reflect this directly.
- **Supply chain modern equivalents** (reflection Q1) — strong answers: XZ-Utils (CVE-2024-3094), event-stream npm (2018), SolarWinds Orion (2020), Codecov bash uploader (2021), `ua-parser-js` npm (2021). Weak answers: "phishing" (different threat model), "zero-day" (too generic).

---

## Grading rubric (10 points)

| Criterion | Points |
|---|---|
| Team roster + one-page contract submitted | 1 |
| Both teammates logged into VCR (verify via attendance / live demo) | 1 |
| Nmap output clearly identifies `vsftpd 2.3.4` | 2 |
| Manual exploit screenshot shows `uid=0(root)` from the port-6200 shell | 3 |
| Metasploit screenshot shows a session as root | 2 |
| Reflection answers complete and substantive (all three questions) | 1 |

Be liberal with partial credit — this is the orientation lab. The goal is everyone leaves with confidence in the workflow, not a sieve.

---

## Cleanup

- **Remind students at the end of class to terminate their cyber range exercise.** VCR meters per-VM-hour; an idle exercise consumes credits until it times out. Build this into the closing 2 minutes of class — don't trust students to remember.
- The VCR exercise template re-provisions clean for Lab 1; nothing for you to reset.

---

## After-action items

- Note any students who couldn't log into VCR — they need a separate session before Lab 1.
- Note any teams that didn't gel — flag for check-in during Lab 1.
- If a subnet other than `10.0.0.0/24` appeared, update `README.md` Part 2.3 for next semester.
- Track which reflection-Q1 modern equivalents students picked. The distribution is a useful pulse-check on their prior security exposure.
