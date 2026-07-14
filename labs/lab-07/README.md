# Lab 07 — Attacking MCP

DS 6042 · Module 4 · ~3 hours in class + 3-hour assignment.

Four canonical attacks on a production-shape MCP server. The server is
structurally a microMCP (see [Lab 06](../lab-06/micromcp.html)) — same
JSON-RPC, same tool catalog — but with seven tools instead of two,
HTTP transport instead of stdio, and four planted vulnerabilities
matching the relevant MITRE ATLAS techniques.

## Files

```
lab-07/
├── attack-mcp.html               ← main lab page (student-facing)
├── styles.css
├── viz.js
├── README.md                     ← this file
│
├── server/
│   ├── baseline_server.py        ← vulnerable server, run on port 8080
│   ├── secure_server.py          ← hardened twin, run on port 8081
│   ├── init_db.py                ← seed data/megacorp.db (run once)
│   ├── requirements.txt
│   └── tool_descriptions/
│       └── format_code.txt       ← the poisonable description (Attack 1)
│
├── data/
│   ├── documents/                ← legitimate sandbox content
│   ├── .secrets/credentials.json ← path-traversal target (Attack 2)
│   └── megacorp.db               ← populated by init_db.py
│
├── attacks/                     ← Part 1: attacks on the toy server (§1–§6)
│   ├── _helpers.py
│   ├── 01_description_poisoning.py
│   ├── 02_path_traversal.py
│   ├── 03_over_privileged.py
│   └── 04_tool_chaining_ssti.py
│
├── real-servers/                ← Part 2: real, CVE-bearing MCP servers (§7–§11)
│   ├── RIVANNA.md               ← deploy + VS Code port-forward runbook (read first)
│   ├── _mcp_sse.py              ← shared MCP-over-SSE client (official `mcp` SDK)
│   ├── attack_dvmcp.py          ← §9 template — student writes the eval payload
│   ├── attack_git_mcp.py        ← §10 template — student writes the inject payload
│   └── attack_anthropic_git.py  ← §11 template — student writes the diff target
│
├── assignment-bypass/           ← Part 1 (autograded): bypass a secure_server defense
│   ├── bypass.py                ← you finish bypass() to steal a credential
│   └── test_bypass.py           ← autograder: plants a random canary, runs your bypass
│
├── assignment-build/            ← Part 2 (group): build your own MCP server, test in MCP Inspector
│   ├── my_server.py             ← server skeleton (FastMCP/stdio) — you finish it
│   ├── attack_my_server.py      ← MCP client skeleton — you write the exploit
│   ├── notes/                   ← sample data read_note serves
│   └── secret.txt               ← a file outside notes/ (traversal target)
│
└── solution/
    ├── NOTES.md                 ← instructor notes (all parts)
    ├── real-servers/            ← filled-in reference exploits for §9–§11
    ├── bypass_solution.py       ← Part 1 reference: the D3 quoted-identifier bypass
    └── build/                   ← Part 2 reference: planted traversal + secure twin
```

## Quick start

```bash
cd Class/labs/lab-07
python3 -m venv .venv && source .venv/bin/activate
pip install -r server/requirements.txt
python server/init_db.py            # one time
uvicorn server.baseline_server:app --port 8080 --reload

# in another terminal:
python attacks/02_path_traversal.py
python attacks/03_over_privileged.py
python attacks/04_tool_chaining_ssti.py
```

For the secure phase:
```bash
uvicorn server.secure_server:app --port 8081 --reload
# edit attacks/_helpers.py: SERVER = "http://127.0.0.1:8081"
# re-run each attack; each should fail
```

## Part 2 — real vulnerable MCP servers (§7–§11)

Three real, published, CVE-bearing MCP servers — including Anthropic's own
reference implementation — deployed on a Rivanna compute node and attacked from
inside VS Code on that node (ports forwarded to your browser). Each attack ships
as a template; you write the exploit payload.

```bash
# full deploy + port-forward steps:
open real-servers/RIVANNA.md      # (or just read it)

# after the servers are up, in a VS Code terminal on the node:
pip install mcp
python real-servers/attack_dvmcp.py                                    # §9
python real-servers/attack_git_mcp.py     --url http://127.0.0.1:8090/sse --path /tmp/gitmcp_lab_repo   # §10
python real-servers/attack_anthropic_git.py --url http://127.0.0.1:8091/sse --repo /tmp/anthropic_lab_repo  # §11 (absolute path — see RIVANNA.md)
```

Targets and CVEs:
- **DVMCP** challenge 8 — `eval()` on tool input → RCE (educational target).
- **cyanheads/git-mcp-server ≤ 2.1.4** — [CVE-2025-53107](https://github.com/advisories/GHSA-3q26-f695-pp76), command injection → RCE.
- **Anthropic mcp-server-git ≤ 2025.11.25** — [CVE-2025-68144](https://nvd.nist.gov/vuln/detail/CVE-2025-68144), argument injection → arbitrary file write.

## Open the lab page

`attack-mcp.html` opens directly in a browser. No server required for
the page itself; the attacks need a running server.

## MITRE ATLAS coverage

- **T0010.005** AI Supply Chain Compromise · Attack 1 (description poisoning)
- **T0051.001** LLM Prompt Injection: Indirect · Attack 1
- **T0085** Data from AI Services · Attack 3 (over-privileged DB)
- **T1059** Command and Scripting Interpreter (ATT&CK) · Attack 4 (SSTI → RCE)

## Related CVEs

- [CVE-2025-53109](https://nvd.nist.gov/vuln/detail/CVE-2025-53109) — path traversal in Anthropic's filesystem MCP server (modeled by Attack 2)
- [CVE-2025-53110](https://nvd.nist.gov/vuln/detail/CVE-2025-53110) — companion sandbox-escape via symlinks
- [CVE-2025-53107](https://github.com/advisories/GHSA-3q26-f695-pp76) — command injection in cyanheads/git-mcp-server (§10, real target)
- [CVE-2025-68144](https://nvd.nist.gov/vuln/detail/CVE-2025-68144) — argument injection in Anthropic's mcp-server-git (§11, real target); chained with [68143](https://nvd.nist.gov/vuln/detail/CVE-2025-68143) + [68145](https://nvd.nist.gov/vuln/detail/CVE-2025-68145)
