# MicroGrid as an E2B agent tool

Lets an AI agent call MicroGrid's sizing/optimization engine as a
one-shot tool inside an [E2B](https://e2b.dev) sandbox — on demand, no
persistent server, no database. Each call: spin up a sandbox from a
pre-built template, run one command, read one JSON line, let the
sandbox die.

This works because `ProductCatalog` already falls back to the bundled
`products.yaml` when PostgreSQL is unreachable (see
[`app/core/catalog.py`](../backend/app/core/catalog.py)), so the sandbox
needs nothing but the backend code and its Python dependencies.

## Files

- [`backend/e2b_tool.py`](../backend/e2b_tool.py) — CLI entrypoint. Calls
  `calculate` / `optimize` / `layout_optimize` directly (no HTTP, no
  uvicorn) and prints exactly one JSON line to stdout, always exit 0 —
  errors come back as `{"success": false, "error": "..."}` so an agent
  can parse the result the same way every time.
- [`backend/e2b.Dockerfile`](../backend/e2b.Dockerfile) — sandbox image:
  Python 3.11 + `requirements.txt` + `app/` + `products.yaml` +
  `e2b_tool.py`. No `CMD`/server — the sandbox just sits ready for
  `e2b_tool.py` to be invoked per call.

## One-time setup

Requires an E2B account and API key (free tier available at e2b.dev).

```bash
npm install -g @e2b/cli    # or: pip install e2b-cli
e2b auth login
cd backend
e2b template build --name microgrid-tool --dockerfile e2b.Dockerfile
```

This builds and pushes the template to your E2B account (`e2b template
build` also writes/updates `e2b.toml` in this directory on first run —
don't hand-edit that file, and check `e2b template build --help` if the
CLI's exact flags have moved since this was written).

## Calling it from an agent (Python SDK)

```python
import json
from e2b import Sandbox

def call_microgrid(action: str, payload: dict) -> dict:
    """Run one MicroGrid tool call in a fresh, disposable sandbox."""
    sbx = Sandbox("microgrid-tool")
    try:
        result = sbx.commands.run(
            f"python e2b_tool.py {action} '{json.dumps(payload)}'",
            cwd="/backend",
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
print(result["summary"]["finalMgLcoe"])
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

- **Cold start**: the template's Docker image already has all
  dependencies installed, so sandbox creation is fast (seconds, not a
  fresh `pip install`).
- **Per-call cost**: `optimize` scans a multi-dimensional candidate grid
  and can take tens of seconds; `calculate` and `layout_optimize` are
  quick (sub-second to a few seconds).
- **No shared state**: every call gets a clean catalog load from
  `products.yaml`. If you update product pricing, rebuild the template
  (`e2b template build ...` again) to bake in the new `products.yaml`.
