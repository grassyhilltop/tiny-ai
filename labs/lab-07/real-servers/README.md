# Lab 07 · Part 2 — attacking real vulnerable MCP servers

§1–§6 of the lab attack a *toy* server we wrote (`../server/baseline_server.py`).
This folder attacks three **real, published, CVE-bearing** MCP servers, deployed
on a Rivanna compute node and attacked from inside VS Code on that node (with
their ports forwarded to your browser). The point is to
see that the bug classes you practiced on the toy are the *same* ones that shipped
in real software — including Anthropic's own reference implementation.

## The three targets (easy → subtle)

| § | Server | CVE | Bug | Sink |
|---|---|---|---|---|
| 10 | **DVMCP** challenge 8 | educational | code injection | `eval(expression)` |
| 11 | **cyanheads/git-mcp-server** ≤ 2.1.4 | [CVE-2025-53107](https://github.com/advisories/GHSA-3q26-f695-pp76) | command injection → RCE | `exec(\`git init -b "${branch}"\`)` |
| 12 | **Anthropic mcp-server-git** ≤ 2025.11.25 | [CVE-2025-68144](https://vulnerablemcp.info/vuln/cve-2025-68145-anthropic-git-mcp-rce-chain.html) | argument injection → arbitrary file write | `repo.git.diff(target)` |

They escalate: a raw `eval`, then a shell-string injection (`$()` beats the
quote-escaping), then an argument injection with **no shell at all** (`--output=`
is parsed by git as a flag). Same lesson three ways: the trust boundary is *the
tool's argument handling*, and "we escaped the dangerous character" is not a fix.

## Files

```
real-servers/
├── RIVANNA.md            ← deploy + port-forward runbook (read this first)
├── _mcp_sse.py           ← shared MCP-over-SSE client (the official `mcp` SDK)
├── attack_dvmcp.py       ← §9 template — YOU write the eval payload
├── attack_git_mcp.py     ← §10 template — YOU write the initialBranch payload
└── attack_anthropic_git.py ← §11 template — YOU write the diff --output target

../solution/real-servers/  ← instructor reference solutions (filled-in payloads)
```

## Quick start

1. Deploy the servers on a Rivanna compute node — **`RIVANNA.md`**. VS Code
   auto-forwards their ports (see the **Ports** panel); no SSH tunnel needed.
2. In a VS Code terminal on the node: `pip install mcp` in a venv.
3. Open a template, fill in the `# YOUR JOB` payload, run it. Success = the
   script's self-verify stage confirms code ran / a file was written **on the
   server**.

Each attack is a *template*: the scaffolding (connect, recon, sanity check,
self-verify via the server's own tools) is done; you supply the one exploit
string. Stuck? The hints in each file point at the exact mechanism; the full
answers are in `../solution/real-servers/`.

## Authorized use

Intentionally vulnerable software. Run it bound to `127.0.0.1` and let VS Code
forward the port privately to your own session, attack only the instance you
started, tear it down when done. See the
authorized-use note in `RIVANNA.md` and the lab page.
