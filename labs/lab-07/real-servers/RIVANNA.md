# Deploying the real vulnerable MCP servers on Rivanna

This runbook stands up three **real**, **known-vulnerable** MCP servers on a
Rivanna compute node and attacks them from **inside VS Code on that node** (the
OOD Code Server you launched in §1), using VS Code's built-in **port forwarding**
to view them in your browser. It is written portably — fill in the placeholders
(`<COMPUTING_ID>`, `<ALLOCATION>`, `<COMPUTE_NODE>`) with your own values.

> **Why a remote target at all?** The toy `baseline_server.py` (§1–§6) runs on
> your laptop, where "RCE" lands in your own shell. These three run on a *different
> machine you reach over the network* — which is exactly the shape of a real
> engagement, and which is why each exploit ends by printing the **server's**
> hostname or dropping a file **on the server**. Running the exploit on the remote
> node, not your laptop, is the whole point.

---

## 0 · The shape of it

```
  Rivanna compute node <COMPUTE_NODE> — you are here, inside VS Code (OOD Code Server)
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ DVMCP challenge 8   ⟶  :9008 (SSE)                                         │
  │ git-mcp-server  ⟶ supergateway :8090       VS Code "Ports" panel           │
  │ mcp-server-git  ⟶ supergateway :8091       auto-forwards 9008/8090/8091    │
  │                                            → ood.hpc.virginia.edu/…/proxy/ │
  │ python real-servers/attack_*.py            <port>/  (open in your browser) │
  │   → http://127.0.0.1:<port>  (same node)   private to your OOD session     │
  └──────────────────────────────────────────────────────────────────────────┘
```

All three speak the **same** MCP-over-SSE contract once they are up, so the one
client in `real-servers/_mcp_sse.py` drives all three. DVMCP serves SSE natively;
the two git servers are **stdio** servers wrapped by **supergateway** (a tiny
"run an MCP stdio server over SSE" bridge), which exposes the identical `/sse`
endpoint on a port VS Code can forward. Because your attack scripts run in a VS
Code terminal **on the same node**, they reach the servers at `127.0.0.1:<port>`
directly; the Ports panel is only for *viewing* a server from your browser.

| Server | CVE | Language | Native transport | Port (after wrap) |
|---|---|---|---|---|
| DVMCP challenge 8 | (educational) | Python | SSE | **9008** |
| `@cyanheads/git-mcp-server@2.1.4` | CVE-2025-53107 | Node ≥20 | stdio → supergateway | **8090** |
| `mcp-server-git==2025.11.25` | CVE-2025-68144 | Python | stdio → supergateway | **8091** |

> **Pin the vulnerable versions.** `git-mcp-server` is patched in **2.1.5**;
> `mcp-server-git` is patched in **2025.12.18**. Installing "latest" gives you the
> *fixed* code (which is the §Secure half of the lesson — keep it for later).

---

## 1 · Get a compute node and load toolchains

Don't run servers on the shared **login** node. The easiest path is the one this
lab already uses: the **OOD Code Server** session (Interactive partition) *is* VS
Code running on a compute node — its terminal is already on `<COMPUTE_NODE>`, so
you can skip the manual allocation below and just open terminals there. If you'd
rather work from a plain SSH shell, grab an interactive allocation instead
(syntax varies by site; this is the Slurm shape):

```bash
ssh <COMPUTING_ID>@rivanna.hpc.virginia.edu
salloc -A <ALLOCATION> -p standard -c 2 -t 2:00:00      # → drops you on <COMPUTE_NODE>
hostname                                                # confirm which compute node you're on
```

Load Python and Node (module names vary — `module spider python node` to discover):

```bash
module load python/3.12 node/20      # or whatever your site calls them
```

No `node` module? Two fallbacks: (a) use a conda env with `conda install nodejs`,
or (b) skip Node entirely for the **Python** server by using `mcp-proxy` instead
of supergateway (see §4 note). The Node `git-mcp-server` does need Node ≥20.

> **No Docker on Rivanna.** That's fine — none of this needs it. (If you want
> isolation, `apptainer exec docker://node:20 ...` works, but plain `module load`
> is simpler for a lab.)

> **⚠ Compute nodes may have no internet.** On many HPC clusters the compute
> nodes can't reach the network, so `git clone`, `pip install`, and `npx -y …`
> (which downloads on first run) will hang or fail there. Do all the **fetching
> on the login node first**, into your home or a project directory on the shared
> filesystem, then *run* on the compute node:
> - `pip install …` into a venv in `~` (the compute node sees the same `$HOME`).
> - `git clone …` the DVMCP repo in `~`.
> - Warm the npm cache so `npx` runs offline later: on the login node run
>   `npx -y supergateway --help` and `npx -y @cyanheads/git-mcp-server@2.1.4 --help`
>   once (or `npm install -g supergateway @cyanheads/git-mcp-server@2.1.4` and call
>   the installed `supergateway` / `git-mcp-server` binaries directly on the node).
>
> If your compute nodes *do* have internet (some partitions do), ignore this and
> run the commands as written.

---

## 2 · Deploy DVMCP challenge 8 (native SSE, port 9008)

```bash
cd ~ && git clone https://github.com/harishsg993010/damn-vulnerable-MCP-server.git dvmcp
cd dvmcp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python challenges/hard/challenge8/server_sse.py        # binds 0.0.0.0:9008
```

> **Security note — the bind address.** `server_sse.py` hard-codes
> `host="0.0.0.0"`, which exposes this *deliberately vulnerable* server to every
> other user on the compute node. On a shared node, either (a) confirm your node
> is single-tenant, or (b) edit the last line to `host="127.0.0.1"` and let VS
> Code forward the port privately to you. Never leave a `0.0.0.0` DVMCP running
> unattended.

Leave it running. Open a second VS Code terminal on the same node
(**Terminal → New Terminal**, or split the panel) for the next servers.

---

## 3 · Deploy git-mcp-server (CVE-2025-53107, port 8090)

The vulnerable Node server, wrapped to SSE by supergateway, bound to localhost:

```bash
npx -y supergateway \
  --host 127.0.0.1 --port 8090 \
  --stdio "npx -y @cyanheads/git-mcp-server@2.1.4"
```

`supergateway` downloads on first run; `--stdio "..."` is the command it launches
and bridges. The vulnerable `git_init` tool takes an absolute `path`, so you don't
need to pre-create a repo — the attack passes `--path /tmp/gitmcp_lab_repo`.

---

## 4 · Deploy Anthropic's mcp-server-git (CVE-2025-68144, port 8091)

```bash
python -m venv ~/anthropic-git/.venv && source ~/anthropic-git/.venv/bin/activate
pip install "mcp-server-git==2025.11.25"

# the git_diff argument-injection needs a REAL repo to diff. Use an ABSOLUTE
# path under /tmp (NOT ~/...): the attack sends this path literally over MCP and
# the server resolves it against its own working directory, so a relative or
# ~-prefixed path can land somewhere unexpected. An absolute path is unambiguous.
mkdir -p /tmp/anthropic_lab_repo && cd /tmp/anthropic_lab_repo
git init -q . && git config user.email lab@uva && git config user.name lab
echo "v1" > notes.txt && git add notes.txt && git commit -qm init
echo "v2" >> notes.txt                                 # optional: makes the leaked diff non-empty

# wrap stdio → SSE on 8091:
npx -y supergateway --host 127.0.0.1 --port 8091 --stdio "python -m mcp_server_git"
```

> **Check the SSE path.** supergateway serves the MCP SSE stream at `/sse` by
> default and prints the full URL on startup — if your version prints something
> else, use that path in `--url`. The attack scripts assume `…/sse`.

> **Node-free alternative.** If you can't get Node on your node, bridge this
> Python server with the Python [`mcp-proxy`](https://github.com/sparfenyuk/mcp-proxy)
> instead (it also turns a stdio MCP server into an SSE endpoint). Check its
> README for the current flag names — the CLI has changed across releases — and
> point `--url` at the `/sse` URL it prints. `git-mcp-server` still needs Node.

---

## 5 · Forward the ports with VS Code (optional — for browser viewing)

You do **not** need to forward anything for the attacks to work: your scripts run
in a VS Code terminal on the same node and reach the servers at `127.0.0.1`
already. Forwarding is only to *see* a server in your laptop browser.

VS Code does it automatically: as each server binds its port, VS Code detects it
and adds it to the **Ports** panel with an `ood.hpc.virginia.edu/…/proxy/<port>/`
URL that's private to your OOD session. To open the panel:

- **View → Open View… → Ports**, or the Command Palette
  (<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → *Ports: Focus on Ports View*).
- If a port isn't auto-detected, click **Forward a Port** and type it
  (`9008`, `8090`, `8091`).
- Click the globe/URL next to a port to open it in your browser. A green dot
  means the port has a live listener.

There is no `ssh -L`, no jump host, and nothing to leave running on your laptop.

---

## 6 · Attack from a VS Code terminal on the node

Open another VS Code terminal (still on `<COMPUTE_NODE>`) in your lab checkout.
The scripts and the servers are on the same machine, so they talk over
`127.0.0.1`:

```bash
cd Class/labs/lab-07
python -m venv .venv-attack && source .venv-attack/bin/activate
pip install mcp                                        # the official MCP client SDK

# §9 — DVMCP eval() RCE (fill in the payload yourself first):
python real-servers/attack_dvmcp.py                    # → http://127.0.0.1:9008/sse

# §10 — git-mcp-server command injection:
python real-servers/attack_git_mcp.py --url http://127.0.0.1:8090/sse --path /tmp/gitmcp_lab_repo

# §11 — Anthropic mcp-server-git argument injection (absolute --repo, not ~/...):
python real-servers/attack_anthropic_git.py --url http://127.0.0.1:8091/sse --repo /tmp/anthropic_lab_repo
```

Each `attack_*.py` is a **template** — you write the exploit payload (see the
`# YOUR JOB` block). Reference solutions live in `solution/real-servers/` for the
instructor; don't peek until you've tried it.

**Verifying server-side effects.** The git attacks drop files on the server. The
scripts self-verify through each server's own `git_status` tool, but to *see* the
payoff (e.g. the captured `id` output), check on the Rivanna side:
```bash
cat /tmp/gitmcp_lab_repo/rce_proof.txt        # git-mcp-server, from §10
```

---

## 7 · Show the patch closes it (the Secure half)

Re-deploy each server at its **fixed** version and re-run the same attack — it
should fail in a way you can read in the diff:

```bash
# git-mcp-server: 2.1.5 swaps exec(string) for spawn('git', [args]) — no shell
npx -y supergateway --host 127.0.0.1 --port 8090 --stdio "npx -y @cyanheads/git-mcp-server@2.1.5"

# mcp-server-git: 2025.12.18 rejects a target starting with '-' and rev-parses it
pip install "mcp-server-git==2025.12.18" && \
  npx -y supergateway --host 127.0.0.1 --port 8091 --stdio "python -m mcp_server_git"
```

The attack scripts already print the "you probably hit the patched version" hint
when the marker file fails to appear.

---

## 8 · Teardown

Stop the servers in their VS Code terminals (`Ctrl-C` each, or
`pkill -f supergateway; pkill -f server_sse.py`). VS Code drops the forwarded
ports automatically when the listeners die. Then end your OOD Code Server session
(or `exit` the `salloc` allocation) so you're not holding the node.

---

## Authorized use

Same rule as the rest of the lab: **you attack only servers you started
yourself.** These are intentionally vulnerable — bind them to `127.0.0.1`, let
VS Code forward them privately to your own session, and tear them down when
you're done. Do not point them
at, or run them against, any shared UVA service, any classmate's node, or
anything on the public internet. Coordinate with HPC staff if you're unsure
whether your node is shared.
