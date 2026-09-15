"""main.py - FastAPI application entry point."""

from __future__ import annotations

import sys
from pathlib import Path

_APP = Path(__file__).resolve().parent
_BACKEND = _APP.parent
_SRVS = _APP / "services"
for _p in (_BACKEND, _APP, _SRVS):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.core import config as cfg  # noqa: E402
from app.routers import (  # noqa: E402
    calculate,
    geocode,
    layout,
    optimize,
    product_admin_runtime,
    products,
    report,
)

app = FastAPI(
    title="Microgrid Advisor API",
    description="VoltageEnergy Off-Grid Microgrid Economic Analysis",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup_seed_db() -> None:
    """Seed the database on startup.

    Initializes PostgreSQL when available; otherwise serves from
    products.yaml.
    """
    from app.db.database import ensure_db_seeded

    try:
        ensure_db_seeded()
    except Exception as exc:
        print(
            "[db] PostgreSQL unavailable at startup; "
            f"using products.yaml fallback: {exc}"
        )


app.include_router(products.router)
app.include_router(product_admin_runtime.router)
app.include_router(calculate.router)
app.include_router(optimize.router)
app.include_router(report.router)
app.include_router(geocode.router)
app.include_router(layout.router)

_FRONTEND_DIST = _BACKEND.parent / "frontend" / "dist"
_SPA_INDEX = _FRONTEND_DIST / "index.html"
if _FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(_FRONTEND_DIST / "assets")),
        name="assets",
    )
    app.mount(
        "/images",
        StaticFiles(directory=str(_FRONTEND_DIST / "images")),
        name="images",
    )

    @app.get("/", include_in_schema=False)
    async def spa_index():
        """Serve the frontend SPA's index page."""
        return FileResponse(_SPA_INDEX)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve a static asset or fall back to the SPA index page."""
        if full_path.startswith("api/"):
            return FileResponse(_SPA_INDEX)
        candidate = _FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_SPA_INDEX)


if __name__ == "__main__":
    print("Starting Microgrid Advisor API...")
    print(f"  Docs: http://localhost:{cfg.API_PORT}/docs")
    uvicorn.run(
        "app.main:app",
        host=cfg.API_HOST,
        port=cfg.API_PORT,
        reload=cfg.DEBUG,
        reload_dirs=[str(_BACKEND)],
        app_dir=str(_BACKEND),
    )
