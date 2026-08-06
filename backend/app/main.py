"""
main.py - FastAPI application entry point
"""
from __future__ import annotations
import sys
from pathlib import Path

_APP = Path(__file__).resolve().parent
_BACKEND = _APP.parent
_SRVS = _APP / "services"
for _p in (_BACKEND, _APP, _SRVS):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.core import config as cfg
from app.routers import products, calculate, optimize, report, geocode, layout, product_admin_runtime

app = FastAPI(
    title="Microgrid Advisor API",
    description="MicroGrid Off-Grid Microgrid Economic Analysis",
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
    """Initialize PostgreSQL when available; otherwise serve from products.yaml."""
    from app.db.database import ensure_db_seeded

    try:
        ensure_db_seeded()
    except Exception as exc:
        print(f"[db] PostgreSQL unavailable at startup; using products.yaml fallback: {exc}")


app.include_router(products.router)
app.include_router(product_admin_runtime.router)
app.include_router(calculate.router)
app.include_router(optimize.router)
app.include_router(report.router)
app.include_router(geocode.router)
app.include_router(layout.router)

_FRONTEND_DIST = _BACKEND.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="assets")
    app.mount("/images", StaticFiles(directory=str(_FRONTEND_DIST / "images")), name="images")

    @app.get("/", include_in_schema=False)
    async def spa_index():
        return FileResponse(_FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            return FileResponse(_FRONTEND_DIST / "index.html")
        candidate = _FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")


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
