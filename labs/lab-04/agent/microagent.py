"""microagent.py — the smallest readable ReAct agent.

One file. One tool. One loop. Two modes:

    python microagent.py --toy    # canned LLM, no API; hand-traceable
    python microagent.py --real   # calls Rivanna (needs LLM_BASE_URL / LLM_API_KEY / LLM_MODEL)

The whole agent fits on one screen. Read it top to bottom and you will
have read everything LangChain / LlamaIndex / OpenAI Assistants do
under the hood.
"""

from __future__ import annotations
import argparse, json, os, re
from pathlib import Path

DATA = Path(__file__).resolve().parent / "microdata"

# Load LLM_* env vars from agent/.env if present. python-dotenv is optional —
# without it, you can still `export LLM_BASE_URL=... LLM_API_KEY=...` in your
# shell and --real mode works the same.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass


# === ONE TOOL ==============================================================

def file_read(path: str) -> str:
    """The agent's only tool: read a markdown file from microdata/."""
    p = DATA / path
    if p.exists():
        return p.read_text()
    available = ", ".join(sorted(q.name for q in DATA.glob("*.md")))
    return f"not found: {path}. available files: {available}"


# === SYSTEM PROMPT =========================================================

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
    """Canned responses, hand-pinned to scenarios. No API call. Used by
    the lab walkthrough so students can run the ReAct loop offline and
    watch the trace print without needing Rivanna credentials."""

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
