# MicroGrid as an E2B agent tool

This works because `ProductCatalog` already falls back to the bundled
`products.yaml` when PostgreSQL is unreachable (see
[`app/core/catalog.py`](../backend/app/core/catalog.py)), so the sandbox
needs nothing but the cloned repo and its Python dependencies.

## Files

- [`backend/e2b_tool.py`](../backend/e2b_tool.py) — CLI entrypoint,
  lives in the repo and gets cloned in at call time. Calls
  `calculate` / `optimize` / `layout_optimize` directly (no HTTP, no
  uvicorn) and prints exactly one JSON line to stdout, always exit 0 —
  errors come back as `{"success": false, "error": "..."}` so an agent
  can parse the result the same way every time.
- [`backend/e2b.Dockerfile`](../backend/e2b.Dockerfile) — sandbox image:
  Python 3.11 + `git` + `requirements.txt` installed. No app code baked
  in, no `CMD`/server — the sandbox just sits ready for a clone + one
  `e2b_tool.py` invocation per call.

## One-time setup

Requires an E2B account and API key (free tier available at e2b.dev).
The CLI's npm-generated shims can be broken on Windows PowerShell (a
known `cmd-shim` bug — `e2b.ps1`/`e2b.cmd` fail with `-S.exe` /
`"-S"` not recognized); if that happens, invoke the CLI's JS entry
point via `node` directly instead of `e2b`.

```bash
npm install -g @e2b/cli    # or: pip install e2b-cli
e2b auth login
cd backend
e2b template create microgrid-tool --dockerfile e2b.Dockerfile
```

(`e2b template build` is deprecated as of CLI 2.19 — use `template
create`, which takes the template name as a positional argument and
`-d/--dockerfile` for the Dockerfile path.)

This builds and pushes the (dependencies-only) template to your E2B
account. Rebuild it only when `requirements.txt` changes — code changes
don't need a rebuild, they just need a `git push`.

### Sandbox runs as a non-root user

Verified against a real sandbox: the template's default user is `user`
with `$HOME=/home/user`, and `/` is **not** writable. Clone into the
home directory (or any path under it), not `/repo` — cloning straight
into `/` fails with `Permission denied`.

### If the GitHub repo is private

`git clone` inside the sandbox needs credentials. Generate a
fine-grained GitHub Personal Access Token with read-only access to
`Kane-0516/Micro-grid`, then have the agent pass it in as a sandbox
environment variable (never hard-code it) and clone with it embedded in
the URL:

```python
sbx = Sandbox("microgrid-tool", envs={"GH_TOKEN": "<token>"})
sbx.commands.run(
    "git clone --depth 1 "
    "https://x-access-token:$GH_TOKEN@github.com/Kane-0516/Micro-grid.git "
    "repo",
    cwd="/home/user",
)
```

If the repo is public, drop the token and just clone the plain HTTPS URL.

## Calling it from an agent (Python SDK)

Confirmed working end-to-end against a live sandbox created from the
`microgrid-tool` template (not just a local Docker simulation):

```python
import json
from e2b import Sandbox

REPO_URL = "https://github.com/Kane-0516/Micro-grid.git"

def call_microgrid(action: str, payload: dict) -> dict:
    """Run one MicroGrid tool call in a fresh, disposable sandbox."""
    sbx = Sandbox("microgrid-tool")
    try:
        clone = sbx.commands.run(
            f"git clone --depth 1 {REPO_URL} repo", cwd="/home/user"
        )
        if clone.exit_code != 0:
            raise RuntimeError(f"git clone failed: {clone.stderr}")

        result = sbx.commands.run(
            f"python e2b_tool.py {action} '{json.dumps(payload)}'",
            cwd="/home/user/repo/backend",
        )
        return json.loads(result.stdout.strip().splitlines()[-1])
    finally:
        sbx.kill()  # nothing keeps running once this returns

# Example: size a system and get LCOE/payback.
result = call_microgrid("calculate", {
    "scenario": "known-load",
    "bracketSets": 4,
    "annualLoadKwh": 131_400,
    "dieselCapacityKw": 40,
})
print(result["summary"]["finalMgLcoe"])  # -> 0.3004
```

## Actions

| action | request schema | notes |
|---|---|---|
| `calculate` | [`CalculateRequest`](../backend/app/schemas/calculate.py) | Size a system and run the full economic analysis. |
| `optimize` | [`OptimizeRequest`](../backend/app/schemas/optimize.py) | Search bracket-set candidates, return ranked options. |
| `layout_optimize` | [`LayoutOptimizeRequest`](../backend/app/routers/layout.py) | MILP layout: max installable sets on a site polygon/area. |

Field names follow the existing REST API exactly (`/api/calculate`,
`/api/optimize`, `/api/layout/optimize` in
[`app/main.py`](../backend/app/main.py)) — the same request/response
JSON shapes, just invoked in-process instead of over HTTP.

## Notes

- **Cold start**: dependencies are already baked into the template
  image; only the `git clone` (shallow, `--depth 1`) happens per call,
  so startup stays fast even though code isn't pre-baked.
- **Per-call cost**: `optimize` scans a multi-dimensional candidate grid
  and can take tens of seconds; `calculate` and `layout_optimize` are
  quick (sub-second to a few seconds). The clone adds a small,
  roughly-constant amount of time on top.
- **Always latest code**: every call clones `main` fresh, so a `git
  push` to the repo takes effect on the very next tool call — no
  redeploy step.
- **No shared state**: every call gets a clean catalog load from the
  cloned `products.yaml`.
