#!/usr/bin/env bash
# Built once when Gradescope builds the autograder image. The grader boots the
# student's FastAPI server in-process (TestClient), so it needs the web stack.
set -euo pipefail
python3 -m pip install --no-cache-dir --upgrade pip
python3 -m pip install --no-cache-dir fastapi httpx uvicorn pydantic
python3 -c "import fastapi, httpx, pydantic; from fastapi.testclient import TestClient; print('grader deps OK')"
