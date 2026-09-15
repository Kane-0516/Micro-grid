"""Cached product catalog loader with PostgreSQL and YAML fallback."""

from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def get_catalog():
    """Return the cached product catalog, from PostgreSQL or YAML fallback."""
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
        print(
            "[db] PostgreSQL unavailable for catalog; "
            f"using products.yaml fallback: {exc}"
        )
        from app.db.yaml_store import get_all_products

        return ProductCatalog(get_all_products(), source="yaml")


def invalidate_catalog_cache() -> None:
    """Clear the cached catalog so the next call reloads it."""
    get_catalog.cache_clear()
