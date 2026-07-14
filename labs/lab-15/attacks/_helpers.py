"""Shared helpers for the RAG attack scripts."""

import sys
import httpx

SERVER = "http://127.0.0.1:8090"


def ask(query: str) -> dict:
    try:
        # The RC GenAI deployment is slow and frequently drops the first request
        # (~60s time-to-first-token vs the gateway's 60s timeout), so the server
        # retries internally — which can take a few minutes. Give it room.
        r = httpx.post(SERVER + "/query", json={"query": query}, timeout=600)
    except httpx.ConnectError:
        print(f"!! cannot reach {SERVER} — start the server first:")
        print("   uvicorn server.baseline_rag:app --port 8090 --reload")
        sys.exit(2)
    r.raise_for_status()
    return r.json()


def ingest(source: str, body: str) -> dict:
    r = httpx.post(SERVER + "/ingest", json={"source": source, "body": body}, timeout=30)
    r.raise_for_status()
    return r.json()


def reset() -> dict:
    r = httpx.post(SERVER + "/reset", timeout=30)
    r.raise_for_status()
    return r.json()


def banner(label: str) -> None:
    print("\n" + "=" * 72 + "\n" + label + "\n" + "=" * 72)
