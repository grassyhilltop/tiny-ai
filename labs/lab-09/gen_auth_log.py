#!/usr/bin/env python3
"""
gen_auth_log.py — emit a synthetic Linux auth.log for Lab 09.

Why this exists
---------------
Students test the `failed-logins` microskill (and the `sshbursts` sprint)
on their own laptops. macOS has no /var/log/auth.log at all (it uses the
unified logging system); WSL ships one but it is usually empty. So we ship
a deterministic synthetic log that reproduces the exact numbers the lab
shows:

    $ grep "Failed password" sample-auth.log | grep -oE 'from [0-9.]+' \
        | awk '{print $2}' | sort | uniq -c | sort -rn
        137 203.0.113.42      <- brute-force burst (~90s window)
          4 198.51.100.7      <- a real user fat-fingering a password

The file is realistic syslog-format sshd output: the attacker burst is
interleaved with legitimate logins and the usual sshd noise (Invalid user,
pam_unix failures, Connection closed) — none of which contain the exact
string "Failed password", so the narrow grep filter stays clean. That
contrast (narrow filter vs. noisy log) is part of the lesson.

Run:  python3 gen_auth_log.py   ->  writes sample-auth.log next to this file
Deterministic: fixed seed, no wall-clock; re-running yields an identical file.
"""

import os
import random

HOST = "web01"
ATTACKER = "203.0.113.42"          # brute-force burst
SLOWBURN = "198.51.100.7"          # legit user, wrong password, spread out
BENIGN_IPS = ["192.0.2.15", "192.0.2.50", "10.0.1.7"]

ATTACK_USERS = [
    "root", "admin", "oracle", "postgres", "test", "ubuntu", "git",
    "deploy", "pi", "user", "ftpuser", "guest", "mysql", "www-data",
]
REAL_USERS = ["deploy", "ubuntu", "jsmith"]

rng = random.Random(6042)          # fixed seed -> reproducible


def line(mon, day, hh, mm, ss, msg):
    return f"{mon} {day:>2d} {hh:02d}:{mm:02d}:{ss:02d} {HOST} {msg}"


def fail(ip, user):
    pid = rng.randint(10000, 65000)
    port = rng.randint(2000, 65000)
    if user in ("root", "deploy", "ubuntu", "jsmith"):
        body = f"Failed password for {user} from {ip} port {port} ssh2"
    else:
        body = f"Failed password for invalid user {user} from {ip} port {port} ssh2"
    return f"sshd[{pid}]: {body}"


def accepted(user, ip):
    pid = rng.randint(10000, 65000)
    port = rng.randint(2000, 65000)
    method = "publickey" if user == "ubuntu" else "password"
    return f"sshd[{pid}]: Accepted {method} for {user} from {ip} port {port} ssh2"


def noise(ip, user):
    pid = rng.randint(10000, 65000)
    port = rng.randint(2000, 65000)
    kind = rng.choice(["invalid", "pam", "closed", "disconnect"])
    if kind == "invalid":
        return f"sshd[{pid}]: Invalid user {user} from {ip} port {port}"
    if kind == "pam":
        return (f"sshd[{pid}]: pam_unix(sshd:auth): authentication failure; "
                f"logname= uid=0 euid=0 tty=ssh ruser= rhost={ip}")
    if kind == "closed":
        return f"sshd[{pid}]: Connection closed by {ip} port {port} [preauth]"
    return f"sshd[{pid}]: Disconnected from invalid user {user} {ip} port {port} [preauth]"


rows = []  # (mon, day, hh, mm, ss, msg)

# ---- Mar 09 — quiet day: one legit login, one slow-burn typo, a little noise
rows.append(("Mar", 9, 8, 12, 3, accepted("deploy", BENIGN_IPS[0])))
rows.append(("Mar", 9, 9, 41, 22, fail(SLOWBURN, "jsmith")))          # .7  (1/4)
rows.append(("Mar", 9, 9, 41, 49, accepted("jsmith", SLOWBURN)))       # got it right
rows.append(("Mar", 9, 14, 3, 8, noise(rng.choice(BENIGN_IPS), "backup")))
rows.append(("Mar", 9, 22, 17, 31, accepted("ubuntu", BENIGN_IPS[1])))

# ---- Mar 10 — the attack. 137 failed passwords from the attacker in ~90s.
# Burst window: 13:58:01 .. ~13:59:31. Interleave Invalid/pam noise lines.
sec = 1
mm = 58
hh = 13
for i in range(137):
    rows.append(("Mar", 10, hh, mm, sec, fail(ATTACKER, rng.choice(ATTACK_USERS))))
    # sprinkle non-"Failed password" noise from the same attacker IP
    if i % 9 == 4:
        rows.append(("Mar", 10, hh, mm, sec, noise(ATTACKER, rng.choice(ATTACK_USERS))))
    sec += 1
    if sec >= 60:
        sec = 0
        mm += 1
        if mm >= 60:
            mm = 0
            hh += 1

# a couple of legit logins around the same day
rows.append(("Mar", 10, 7, 2, 55, accepted("deploy", BENIGN_IPS[0])))
rows.append(("Mar", 10, 16, 30, 12, accepted("ubuntu", BENIGN_IPS[1])))
rows.append(("Mar", 10, 18, 5, 40, fail(SLOWBURN, "jsmith")))         # .7  (2/4)
rows.append(("Mar", 10, 18, 6, 2, fail(SLOWBURN, "jsmith")))          # .7  (3/4)
rows.append(("Mar", 10, 18, 6, 39, accepted("jsmith", SLOWBURN)))      # finally in

# ---- Mar 11 — back to quiet; one more lonely typo from the real user
rows.append(("Mar", 11, 8, 22, 14, accepted("deploy", BENIGN_IPS[2])))
rows.append(("Mar", 11, 11, 48, 9, fail(SLOWBURN, "jsmith")))         # .7  (4/4)
rows.append(("Mar", 11, 11, 48, 35, accepted("jsmith", SLOWBURN)))

# Sort chronologically (stable) so the file reads like a real rotating log.
MONTHS = {"Mar": 3}
rows.sort(key=lambda r: (MONTHS[r[0]], r[1], r[2], r[3], r[4]))

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample-auth.log")
with open(out_path, "w") as f:
    for r in rows:
        f.write(line(*r) + "\n")

# Self-check so the shipped file always matches the lab's stated output.
fails = {}
with open(out_path) as f:
    for ln in f:
        if "Failed password" in ln:
            toks = ln.split()
            ip = toks[toks.index("from") + 1]
            fails[ip] = fails.get(ip, 0) + 1
top = sorted(fails.items(), key=lambda kv: -kv[1])
print(f"wrote {out_path}  ({len(rows)} lines)")
print("Failed-password tally per IP:")
for ip, n in top:
    print(f"  {n:>4d}  {ip}")
assert fails.get(ATTACKER) == 137, fails
assert fails.get(SLOWBURN) == 4, fails
assert len(fails) == 2, f"unexpected extra IPs with Failed password: {fails}"
print("OK — matches the lab (137 / 4).")
