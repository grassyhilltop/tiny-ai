"""microagent.py — the smallest readable ReAct agent.   *** ASSIGNMENT TEMPLATE ***

YOUR JOB
========
Give the agent a second tool: `run_command`, so it can run shell commands.
A command-running tool is the most dangerous thing you can hand an LLM — a
prompt injection that reaches it becomes remote code execution — so you guard
it two ways: an allowlist that auto-rejects dangerous commands, AND a
human-in-the-loop confirmation so a person approves every command before it
runs (the agent proposes, you decide). This is how real agents like Claude
Code gate risky tools.

Implement the four pieces marked `# TODO` below:

  1. ALLOWED_COMMANDS  — the allowlist of programs the agent may run.
  2. is_safe_command(command) -> Optional[str]
         None to allow; a one-sentence reason string to refuse.
  3. run_command(command) -> str
         - Refuse unsafe commands: return "REFUSED: <reason>" (don't even ask).
         - Otherwise PRINT the command and ask the operator to approve it
           (input("... [y/N] ")). If they don't type y, return
           "SKIPPED: operator declined to run the command" and do NOT run it.
         - If approved, run it and return its output.
  4. Register run_command in TOOLS and document it in SYSTEM_PROMPT, and add
     a ToyLLM scenario that uses it.

Keep the I/O exactly as specified or the autograder can't read your work:
run_command returns "REFUSED: ..." when the guard refuses, "SKIPPED: ..."
when the operator declines, otherwise the command's output.

Run this on Rivanna (e.g. a Code Server terminal) — the model is reachable
there, and the confirmation prompt is what keeps the command tool safe.

    python microagent.py --toy    # canned LLM, no API; hand-traceable
    python microagent.py --real   # calls Rivanna (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL)
"""

from __future__ import annotations
import argparse, json, os, re, shlex, subprocess, sys
from pathlib import Path
from typing import Optional

DATA = Path(__file__).resolve().parent / "microdata"
SANDBOX = Path(__file__).resolve().parent / "sandbox"   # run_command's working dir

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass


# === TOOLS =================================================================

def file_read(path: str) -> str:
    """The original tool: read a markdown file from microdata/. Use this as
    the worked example for the shape of a tool."""
    p = DATA / path
    if p.exists():
        return p.read_text()
    available = ", ".join(sorted(q.name for q in DATA.glob("*.md")))
    return f"not found: {path}. available files: {available}"


# === YOUR JOB starts here. =================================================

# TODO (1): the allowlist of programs the agent may run. Pick read-only /
# inspection commands an IT helper legitimately needs (ls, cat, echo, …) and
# nothing that can mutate the system, reach the network, or escalate.
ALLOWED_COMMANDS: set[str] = set()


def is_safe_command(command: str) -> Optional[str]:
    """TODO (2): decide whether `command` is safe to run.

    Return None to allow it, or a one-sentence reason string to refuse.
    Think about at least three classes of attack:
      - shell metacharacters that chain/redirect/substitute ( ; | & > < ` $( )
      - programs that aren't on ALLOWED_COMMANDS
      - arguments that escape the sandbox (absolute paths, '..')
    """
    return None  # TODO: replace — right now everything is allowed (unsafe!)


def run_command(command: str) -> str:
    """TODO (3): the agent's command tool, with a human in the loop.

    1. If is_safe_command refuses, return "REFUSED: <reason>" (don't even ask).
    2. Otherwise PRINT the proposed command and ask the operator to approve it
       with input("... [y/N] "). If they don't type y/yes, return
       "SKIPPED: operator declined to run the command" and do NOT run it.
    3. If approved, run it and return its combined stdout/stderr (truncated).
       Run it WITHOUT a shell (shlex.split + subprocess.run, no shell=True),
       inside SANDBOX, with a timeout.
    """
    return "REFUSED: run_command not implemented yet"  # TODO: replace


# === SYSTEM PROMPT =========================================================

# TODO (4a): document run_command here so the LLM knows it exists and how to
# call it (mirror the file_read line and the JSON shape).
SYSTEM_PROMPT = """You are a tiny IT helper. You have one tool:

  file_read(path)  — read a file from the knowledge base

The knowledge base contains: hello.md, network_help.md, password_policy.md.

When you want to call the tool, reply with this JSON, nothing else:

  {"action": "file_read", "args": {"path": "..."}}

When you have the answer, reply with:

  {"action": "final", "answer": "..."}
"""


# === TWO LLM CLIENTS (same interface, different brains) ====================

class ToyLLM:
    """Canned responses, hand-pinned to scenarios. No API call."""

    SCRIPTS = {
        "how do i reset my password": [
            {"action": "file_read", "args": {"path": "password_policy.md"}},
            {"action": "final", "answer":
             "Visit https://password.megacorpone.local. Locked out? Ext. 4357."},
        ],
        "my wifi keeps dropping": [
            {"action": "file_read", "args": {"path": "network_help.md"}},
            {"action": "final", "answer":
             "Forget the network and rejoin megacorp-corp (not guest). "
             "If it keeps dropping, restart NetworkManager."},
        ],
        # TODO (4b): add a scenario whose first step calls run_command, e.g.
        # "what files are in the sandbox" -> run_command("ls") -> final answer.
        "hello": [
            {"action": "final", "answer": "Hi! Ask me about passwords or wifi."},
        ],
    }

    def __init__(self):
        self.step = 0
        self.script = None

    def chat(self, messages: list[dict]) -> str:
        if self.script is None:
            key = next(m["content"] for m in messages if m["role"] == "user")
            key = key.lower().strip(" ?.!")
            self.script = self.SCRIPTS.get(key, [
                {"action": "final", "answer":
                 "No canned answer for that. Use --real or add to ToyLLM.SCRIPTS."},
            ])
        action = self.script[min(self.step, len(self.script) - 1)]
        self.step += 1
        return json.dumps(action)


class RealLLM:
    """OpenAI-compatible REST client. Works against Rivanna's GenAI
    service or any vLLM / Ollama OpenAI-compat endpoint."""

    def __init__(self):
        import httpx
        self.url = os.environ["LLM_BASE_URL"].rstrip("/") + "/chat/completions"
        self.key = os.environ["LLM_API_KEY"]
        self.model = os.environ["LLM_MODEL"]
        self.client = httpx.Client(timeout=120)

    def chat(self, messages: list[dict]) -> str:
        # The RC GenAI endpoint streams Server-Sent Events even for one-shot
        # calls: the body is a series of `data: {json}` lines. Stitch the
        # assistant's content deltas together (ignoring Kimi's "reasoning"
        # deltas, which are its private chain-of-thought).
        r = self.client.post(self.url,
            headers={"Authorization": f"Bearer {self.key}"},
            json={"model": self.model, "messages": messages,
                  "temperature": 0.2, "stream": True})
        r.raise_for_status()
        out = []
        for line in r.text.splitlines():
            if not line.startswith("data: "):
                continue
            payload = line[len("data: "):].strip()
            if payload == "[DONE]":
                break
            try:
                delta = json.loads(payload)["choices"][0]["delta"]
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
            if delta.get("content"):
                out.append(delta["content"])
        return "".join(out).strip()


# === THE REACT LOOP ========================================================

def parse_action(reply: str) -> dict:
    """Pluck the first {...} JSON object out of the LLM's reply. If
    there is no JSON, treat the whole reply as a final answer."""
    m = re.search(r"\{.*\}", reply, re.DOTALL)
    if not m: return {"action": "final", "answer": reply.strip()}
    try:                  return json.loads(m.group(0))
    except json.JSONDecodeError: return {"action": "final", "answer": reply.strip()}


# TODO (4c): add "run_command": run_command to the TOOLS table.
TOOLS = {"file_read": file_read}   # name -> callable


def react(llm, user_msg: str, verbose: bool = True) -> str:
    """The entire loop. Five steps max, prints every observation if verbose."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg}]
    for step in range(5):
        action = parse_action(llm.chat(messages))
        if verbose: print(f"  [step {step}] action: {action}")
        if action["action"] == "final":
            return action["answer"]
        tool = TOOLS.get(action["action"])
        obs = tool(**action.get("args", {})) if tool else f"unknown tool: {action['action']}"
        if verbose: print(f"  [step {step}] observation: {obs[:120].rstrip()}" + (" …" if len(obs) > 120 else ""))
        messages.append({"role": "assistant", "content": json.dumps(action)})
        messages.append({"role": "user",      "content": f"Observation: {obs}"})
    return "(ran out of steps)"


# === CLI ===================================================================

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--toy",  action="store_true", help="canned LLM, no API")
    ap.add_argument("--real", action="store_true", help="real LLM via env vars")
    ap.add_argument("-q", "--quiet", action="store_true", help="hide ReAct trace")
    args = ap.parse_args()
    llm = ToyLLM() if (args.toy or not args.real) else RealLLM()
    print("microagent ready. type questions; Ctrl-D to quit.\n")
    while True:
        try:
            q = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not q: continue
        print("agent>", react(llm, q, verbose=not args.quiet))


if __name__ == "__main__":
    main()
