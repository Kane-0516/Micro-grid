"""CLI entrypoint for calling MicroGrid as a tool from an E2B sandbox.

Designed for on-demand use: an AI agent creates a sandbox from the
``microgrid-tool`` E2B template, runs this script once per call, reads the
JSON result from stdout, then lets the sandbox die (or kills it). No server
process, no database — the product catalog falls back to the bundled
products.yaml, so a single ``python e2b_tool.py <action> '<json>'`` call is
self-contained.

Usage:
    python e2b_tool.py calculate '{"annualLoadKwh": 131400, ...}'
    python e2b_tool.py optimize '{"annualLoadKwh": 131400, ...}'
    python e2b_tool.py layout_optimize '{"availableAreaM2": 1200}'

Always prints exactly one JSON line to stdout and exits 0, even on error
(errors are reported as {"success": false, "error": "..."} so an agent can
parse the result uniformly without checking the exit code).
"""

from __future__ import annotations

import contextlib
import io
import json
import sys

from app.routers.calculate import calculate
from app.routers.layout import LayoutOptimizeRequest, layout_optimize
from app.routers.optimize import optimize_microgrid
from app.schemas.calculate import CalculateRequest
from app.schemas.optimize import OptimizeRequest

_ACTIONS = {
    "calculate": (CalculateRequest, calculate),
    "optimize": (OptimizeRequest, optimize_microgrid),
    "layout_optimize": (LayoutOptimizeRequest, layout_optimize),
}


def _warm_catalog_cache() -> None:
    """Load and cache the product catalog once, before the real call."""
    from app.core.catalog import get_catalog

    get_catalog()


def _fail(message: str) -> int:
    print(json.dumps({"success": False, "error": message}, ensure_ascii=False))
    return 0


def main(argv: list[str]) -> int:
    """Dispatch one tool call and print its JSON result.

    Args:
        argv: Command-line arguments, excluding the program name:
            [action, json_payload].

    Returns:
        Process exit code (always 0 — errors are reported in the JSON body
        so an agent can rely on stdout alone).
    """
    if len(argv) < 2:
        actions = " | ".join(_ACTIONS)
        return _fail(f"Usage: python e2b_tool.py <{actions}> '<json>'")

    action, payload_str = argv[0], argv[1]
    if action not in _ACTIONS:
        return _fail(
            f"Unknown action '{action}'. Choose from: {list(_ACTIONS)}"
        )

    request_cls, handler = _ACTIONS[action]
    try:
        payload = json.loads(payload_str)
        req = request_cls(**payload)
    except Exception as exc:
        return _fail(f"Invalid input for '{action}': {exc}")

    # get_catalog() prints a fallback notice on its first call (no local
    # Postgres in a sandbox) — swallow that so stdout carries only the
    # single JSON result line the caller expects.
    with contextlib.redirect_stdout(io.StringIO()):
        _warm_catalog_cache()

    try:
        result = handler(req)
    except Exception as exc:
        return _fail(f"'{action}' failed: {exc}")

    if hasattr(result, "model_dump"):
        result = result.model_dump()
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
