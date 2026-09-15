"""运行时产品配置管理接口（增删改查 products.yaml 中的型号与设置）."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import admin as admin_db
from app.db import yaml_store
from app.db.database import get_connection

router = APIRouter(prefix="/api/admin/products", tags=["product-admin"])

NOT_FOUND_RESPONSE = {
    404: {"description": "Requested category, setting, or item was not found."}
}
WRITE_RESPONSES = {
    400: {"description": "The submitted value is invalid."},
    **NOT_FOUND_RESPONSE,
}

ProductAdminCategory = Literal[
    "pv_panels",
    "bracket_systems",
    "battery_packs",
    "inverters",
    "diesel_generators",
    "integrated_pv_storage",
    "standard_packages",
]


class ProductAdminItemPayload(BaseModel):
    """Create/update payload for one item in a product category."""

    key: str
    data: dict[str, Any]


class ProductAdminSettingPayload(BaseModel):
    """Update payload for one YAML setting value."""

    value: Any


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


def _open_db_connection():
    try:
        return get_connection()
    except Exception as exc:
        print(
            "[db] PostgreSQL unavailable for runtime product admin; "
            f"using products.yaml fallback: {exc}"
        )
        return None


def _close_db_connection(conn) -> None:
    if conn is not None and not conn.closed:
        conn.close()


def _get_yaml_setting_or_404(key: str) -> dict[str, Any]:
    try:
        value = yaml_store.get_setting(key)
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"Setting '{key}' is not supported."
        )
    if value is None:
        raise HTTPException(
            status_code=404, detail=f"Setting '{key}' not found."
        )
    return {"key": key, "value": value}


@router.get("/categories")
def list_product_categories() -> dict[str, list[str]]:
    """List all supported product category keys."""
    return {"categories": admin_db.list_categories()}


@router.get("/settings")
def list_product_settings() -> list[dict[str, str]]:
    """List every editable setting's key and scope."""
    return yaml_store.list_settings()


@router.get("/settings/{key:path}", responses=NOT_FOUND_RESPONSE)
def get_product_setting(key: str) -> dict[str, Any]:
    """Get one setting's current value, from PostgreSQL or the YAML fallback."""
    conn = _open_db_connection()
    if conn is None:
        return _get_yaml_setting_or_404(key)
    try:
        value = admin_db.get_setting(conn, key)
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"Setting '{key}' is not supported."
        )
    except Exception as exc:
        print(
            "[db] Failed to read runtime product setting "
            f"'{key}'; using products.yaml fallback: {exc}"
        )
        return _get_yaml_setting_or_404(key)
    finally:
        _close_db_connection(conn)
    if value is None:
        return _get_yaml_setting_or_404(key)
    return {"key": key, "value": value}


@router.put("/settings/{key:path}", responses=WRITE_RESPONSES)
def update_product_setting(
    key: str, payload: ProductAdminSettingPayload
) -> dict[str, bool]:
    """Update one setting's value in PostgreSQL, falling back to YAML."""
    conn = _open_db_connection()
    try:
        if conn is None:
            yaml_store.upsert_setting(key, payload.value)
        else:
            admin_db.upsert_setting(conn, key, payload.value)
    except KeyError:
        _close_db_connection(conn)
        raise HTTPException(
            status_code=404, detail=f"Setting '{key}' is not supported."
        )
    except ValueError as exc:
        _close_db_connection(conn)
        raise _bad_request(str(exc))
    except Exception as exc:
        _close_db_connection(conn)
        print(
            "[db] Failed to update runtime product setting "
            f"'{key}'; writing products.yaml fallback: {exc}"
        )
        try:
            yaml_store.upsert_setting(key, payload.value)
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"Setting '{key}' is not supported."
            )
        except ValueError as yaml_exc:
            raise _bad_request(str(yaml_exc))
    finally:
        _close_db_connection(conn)
    return {"success": True}


@router.get("/{category}", responses=NOT_FOUND_RESPONSE)
def list_product_items(category: ProductAdminCategory) -> list[dict[str, Any]]:
    """List all items in a product category."""
    conn = _open_db_connection()
    if conn is None:
        try:
            return yaml_store.list_items(category)
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"Category '{category}' not found."
            )
    try:
        return admin_db.list_items(conn, category)
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"Category '{category}' not found."
        )
    finally:
        conn.close()


@router.post("/{category}", responses=WRITE_RESPONSES)
def create_product_item(
    category: ProductAdminCategory, payload: ProductAdminItemPayload
) -> dict[str, bool]:
    """Create or replace one item in a product category."""
    conn = _open_db_connection()
    try:
        if conn is None:
            yaml_store.upsert_item(category, payload.key, payload.data)
        else:
            admin_db.upsert_item(conn, category, payload.key, payload.data)
    except KeyError:
        if conn is not None:
            conn.close()
        raise HTTPException(
            status_code=404, detail=f"Category '{category}' not found."
        )
    except ValueError as exc:
        if conn is not None:
            conn.close()
        raise _bad_request(str(exc))
    finally:
        if conn is not None and not conn.closed:
            conn.close()
    return {"success": True}


@router.get("/{category}/{key}", responses=NOT_FOUND_RESPONSE)
def get_product_item(
    category: ProductAdminCategory, key: str
) -> dict[str, Any]:
    """Get one item's data from a product category."""
    conn = _open_db_connection()
    if conn is None:
        try:
            item = yaml_store.get_item(category, key)
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"Category '{category}' not found."
            )
        if item is None:
            raise HTTPException(
                status_code=404,
                detail=f"Item '{key}' not found in '{category}'.",
            )
        return {"key": key, "data": item}
    try:
        item = admin_db.get_item(conn, category, key)
    except KeyError:
        conn.close()
        raise HTTPException(
            status_code=404, detail=f"Category '{category}' not found."
        )
    finally:
        if not conn.closed:
            conn.close()
    if item is None:
        raise HTTPException(
            status_code=404, detail=f"Item '{key}' not found in '{category}'."
        )
    return {"key": key, "data": item}


@router.put("/{category}/{key}", responses=WRITE_RESPONSES)
def update_product_item(
    category: ProductAdminCategory, key: str, payload: dict[str, Any]
) -> dict[str, bool]:
    """Replace one item's data in a product category."""
    conn = _open_db_connection()
    try:
        if conn is None:
            yaml_store.upsert_item(category, key, payload)
        else:
            admin_db.upsert_item(conn, category, key, payload)
    except KeyError:
        if conn is not None:
            conn.close()
        raise HTTPException(
            status_code=404, detail=f"Category '{category}' not found."
        )
    except ValueError as exc:
        if conn is not None:
            conn.close()
        raise _bad_request(str(exc))
    finally:
        if conn is not None and not conn.closed:
            conn.close()
    return {"success": True}


@router.delete("/{category}/{key}", responses=NOT_FOUND_RESPONSE)
def delete_product_item(
    category: ProductAdminCategory, key: str
) -> dict[str, bool]:
    """Delete one item from a product category."""
    conn = _open_db_connection()
    try:
        if conn is None:
            deleted = yaml_store.delete_item(category, key)
        else:
            deleted = admin_db.delete_item(conn, category, key)
    except KeyError:
        if conn is not None:
            conn.close()
        raise HTTPException(
            status_code=404, detail=f"Category '{category}' not found."
        )
    finally:
        if conn is not None and not conn.closed:
            conn.close()
    if not deleted:
        raise HTTPException(
            status_code=404, detail=f"Item '{key}' not found in '{category}'."
        )
    return {"success": True}
