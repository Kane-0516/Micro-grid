"""Compatibility import for the runtime product administration router.

New code should import :mod:`app.routers.product_admin_runtime` directly.
"""

from __future__ import annotations

from app.routers.product_admin_runtime import router

__all__ = ["router"]
