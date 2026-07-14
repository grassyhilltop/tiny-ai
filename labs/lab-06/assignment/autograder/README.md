# lab-06 Gradescope autograder — the `guard()` tool-call policy

Pure-Python (stdlib only) autograder. Students submit their edited
`micromcp.py`; the grader spawns it as a subprocess and drives it over the real
JSON-RPC/stdio transport, checking that the `guard()` policy ALLOWS benign
`tools/call`s and BLOCKS adversarial ones with a `REFUSE:` message.

## Files

| file | role |
|------|------|
| `run_autograder` | Gradescope entrypoint |
| `setup.sh` | image build step — no deps |
| `grader.py` | all grading logic; writes `results.json` |
| `build_zip.sh` | builds `autograder.zip` for upload |

## Scoring (100 pts)

| pts | test | how |
|----:|------|-----|
| 10 | server smoke test | `initialize` returns `serverInfo`; `tools/list` advertises both tools |
| 25 | benign allowed | legit `get_greeting` / `read_file` calls are NOT refused and return real content |
| 35 | path constraints | `read_file` refuses `..` traversal, absolute paths, non-`.md`, empty, and non-string `path` |
| 15 | greeting constraints | `get_greeting` refuses names > 32 chars, multi-line names, and non-string names |
| 15 | allowlist | tools outside `{get_greeting, read_file}` are refused |

All components give proportional partial credit.

## Contract

`handle_tools_call` calls `guard(name, arguments)` before any tool runs.
`guard` returns `None` to allow, or a reason string to block; a blocked call
replies with `{"content":[{"type":"text","text":"REFUSE: <reason>"}], "isError": true}`.
A call is judged **blocked** iff its result content begins with `REFUSE:`.

## Safety

The grader never imports or `exec`s the student's code in-process — it runs
`micromcp.py` as a subprocess and only exchanges JSON lines. The adversarial
inputs are paths and strings; no tool here writes, deletes, or shells out, so a
broken submission cannot damage the grading container.

## Build & test

```bash
./build_zip.sh                                  # -> autograder.zip
python3 grader.py --submission ../../solution   # reference -> 100/100
python3 grader.py --submission ../              # the template -> low score
```

Reference solution: `../../solution/micromcp.py`. Template: `../micromcp.py`.
The grader writes the `microdata/*.md` files the benign tests need next to the
submitted `micromcp.py`, so no data needs to be uploaded.
