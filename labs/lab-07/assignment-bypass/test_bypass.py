"""test_bypass.py — autograder for the bypass assignment.

Starts secure_server.py on a fresh port, plants a RANDOM canary credential in
the data it protects (the api_keys table and credentials.json), runs the
student's bypass.py against it, and PASSES if the canary appears in the output.

The canary is random per run, so printing a hard-coded secret will not pass —
the bypass has to actually defeat a defense and read the live data.

    python test_bypass.py                 # grades ./bypass.py
    python test_bypass.py path/to/bypass.py

Requires the server deps (fastapi, uvicorn, jinja2) installed; the bypass
itself is stdlib-only.
"""

import json
import secrets
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                      # lab-07/  (this file lives in assignment-bypass/)
DB = ROOT / "data" / "megacorp.db"
CREDS = ROOT / "data" / ".secrets" / "credentials.json"


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_health(port: int, timeout: float = 25.0) -> bool:
    for _ in range(int(timeout * 4)):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as r:
                if json.load(r).get("status") == "healthy":
                    return True
        except Exception:
            time.sleep(0.25)
    return False


def plant_canary(token: str) -> None:
    """Tag every protected credential with the run's canary token, so any
    genuine read of the api_keys table or the credentials file surfaces it."""
    conn = sqlite3.connect(DB)
    conn.execute("UPDATE api_keys SET key_value = key_value || ' [' || ? || ']'", (token,))
    conn.commit()
    conn.close()
    creds = json.loads(CREDS.read_text())
    creds["_grader_canary"] = token
    CREDS.write_text(json.dumps(creds, indent=2))


def main() -> int:
    target = sys.argv[1] if len(sys.argv) > 1 else str(HERE / "bypass.py")
    if not Path(target).exists():
        print(f"FAIL · {target} not found")
        return 1
    if not (ROOT / "server" / "secure_server.py").exists():
        print(f"FAIL · can't find server/secure_server.py under {ROOT}")
        return 1
    if not DB.exists():
        subprocess.run([sys.executable, str(ROOT / "server" / "init_db.py")], check=True)

    token = "MEGACORP-FLAG-" + secrets.token_hex(8)
    db_backup = DB.read_bytes()
    creds_backup = CREDS.read_text()
    server = None
    try:
        plant_canary(token)
        port = free_port()
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "server.secure_server:app", "--port", str(port)],
            cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not wait_health(port):
            print("FAIL · secure_server did not come up (are the server deps installed?)")
            return 1

        try:
            proc = subprocess.run(
                [sys.executable, target, "--url", f"http://127.0.0.1:{port}"],
                capture_output=True, text=True, timeout=60)
        except subprocess.TimeoutExpired:
            print("FAIL · bypass.py did not finish within 60s")
            return 1

        out = (proc.stdout or "") + (proc.stderr or "")
        print("──── bypass.py output ───────────────────────────────────────")
        print(out.strip()[-1800:] or "(no output)")
        print("─────────────────────────────────────────────────────────────")

        if token in out:
            print(f"PASS · your bypass retrieved the planted credential ({token}).")
            return 0
        print("FAIL · the planted credential never appeared in your output.")
        print("       Defeat a defense and PRINT what you retrieve — the full")
        print("       api_keys table, or credentials.json.")
        return 1
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except Exception:
                server.kill()
        DB.write_bytes(db_backup)        # restore the lab data
        CREDS.write_text(creds_backup)


if __name__ == "__main__":
    sys.exit(main())
