# ============================================================
# E2B sandbox template — MicroGrid as an on-demand agent tool.
#
# No server process and no database: builds a sandbox with the backend
# and its dependencies pre-installed so an agent can, per call:
#   1. create a sandbox from this template,
#   2. run `python e2b_tool.py <action> '<json>'`,
#   3. read the single JSON line from stdout,
#   4. let the sandbox die (or kill it) — nothing keeps running between calls.
# ============================================================
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ libffi-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /backend

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/          ./app/
COPY products.yaml .
COPY e2b_tool.py   .
