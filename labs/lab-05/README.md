# Lab 05 — Attacking AI Agents

DS 6042 · Module 4 (security against ML systems) · 2–3 hours in class
plus a 3-hour assignment.

## Files

```
lab-05/
├── attack-agents.html      ← main lab page (student-facing)
├── styles.css              ← per-lab styles
├── viz.js                  ← three interactive widgets
├── README.md               ← this file
│
├── agent/
│   ├── baseline_agent.py   ← vulnerable agent (run on a free port via $AGENT_PORT)
│   ├── secure_agent.py     ← hardened agent (run on a free port via $AGENT_PORT)
│   ├── llm_client.py       ← OpenAI-compatible client (env-var driven)
│   ├── tools.py            ← file_search, file_read, config_lookup
│   ├── system_prompt.txt   ← system prompt with planted creds
│   ├── requirements.txt
│   ├── .env.example        ← copy to .env, fill in Rivanna details
│   └── data/               ← fake employee files, config.json
│
├── attacks/
│   └── 03_memory_poisoning.py   ← AML.T0020 data poisoning
│
└── solution/
    └── NOTES.md            ← instructor notes (not student-facing)
```

## Quick start

```bash
cd Class/labs/lab-05
python3 -m venv .venv && source .venv/bin/activate
pip install -r agent/requirements.txt
cp agent/.env.example agent/.env
$EDITOR agent/.env                 # fill in Rivanna GenAI values

# terminal 1 — shared node: pick a free port (see lab §2.3)
export AGENT_PORT=8013
uvicorn agent.baseline_agent:app --port $AGENT_PORT --reload

# terminal 2 — script reads $AGENT_PORT
export AGENT_PORT=8013
python attacks/03_memory_poisoning.py
```

Then start the secure version on a fresh free port and re-run:

```bash
export AGENT_PORT=8014
uvicorn agent.secure_agent:app --port $AGENT_PORT --reload
# scripts read $AGENT_PORT, so just re-export it and re-run them
```

## Open in browser

Open `attack-agents.html` directly — no server needed.

## Reference

- MITRE ATLAS — <https://atlas.mitre.org/>
- OWASP LLM Top-10 — <https://owasp.org/www-project-top-10-for-large-language-model-applications/>
- UVA RC GenAI portal — <https://open-webui.rc.virginia.edu/>
