"""Cached product catalog loader with PostgreSQL and YAML fallback."""
from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def get_catalog():
    from app.services.config_loader import ProductCatalog

    try:
        from app.db.database import ensure_db_seeded, get_connection
        from app.db.queries import build_product_catalog

        ensure_db_seeded()
        conn = get_connection()
        try:
            return build_product_catalog(conn)
        finally:
            conn.close()
    except Exception as exc:
        print(f"[db] PostgreSQL unavailable for catalog; using products.yaml fallback: {exc}")
        from app.db.yaml_store import get_all_products

        return ProductCatalog(get_all_products(), source="yaml")


def invalidate_catalog_cache() -> None:
    get_catalog.cache_clear()
