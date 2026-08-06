"""YAML-backed product catalog storage used when PostgreSQL is unavailable."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any

import yaml

from app.core.config import PRODUCTS_YAML
from app.db.admin import (
    BLOB_SETTING_KEYS,
    CATEGORY_CONFIG,
    META_SETTING_KEYS,
    _validate_product_payload,
    _validate_setting_value,
)

_CATALOG_LOCK = RLock()


def _read_catalog() -> dict[str, Any]:
    with open(PRODUCTS_YAML, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Product catalog YAML must contain an object: {PRODUCTS_YAML}")
    return data


def _write_catalog(data: dict[str, Any]) -> None:
    path = Path(PRODUCTS_YAML)
    backup = path.with_suffix(path.suffix + ".bak")
    temp_path = path.with_suffix(path.suffix + ".tmp")
    if path.exists() and not backup.exists():
        backup.write_bytes(path.read_bytes())
    with open(temp_path, "w", encoding="utf-8", newline="\n") as handle:
        yaml.safe_dump(data, handle, allow_unicode=True, sort_keys=False, default_flow_style=False)
    temp_path.replace(path)


def get_all_products() -> dict[str, Any]:
    with _CATALOG_LOCK:
        return deepcopy(_read_catalog())


def list_categories() -> list[str]:
    return list(CATEGORY_CONFIG.keys())


def list_settings() -> list[dict[str, str]]:
    return (
        [{"key": key, "scope": "meta"} for key in sorted(META_SETTING_KEYS)]
        + [{"key": key, "scope": "blob"} for key in sorted(BLOB_SETTING_KEYS)]
    )


def _category_models(data: dict[str, Any], category: str) -> dict[str, Any]:
    if category == "standard_packages":
        return data.setdefault("standard_products", {}).setdefault("packages", {})
    return data.setdefault(category, {}).setdefault("models", {})


def _get_nested(data: dict[str, Any], dotted_key: str) -> Any | None:
    current: Any = data
    for part in dotted_key.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return deepcopy(current)


def _set_nested(data: dict[str, Any], dotted_key: str, value: Any) -> None:
    current: dict[str, Any] = data
    parts = dotted_key.split(".")
    for part in parts[:-1]:
        next_value = current.setdefault(part, {})
        if not isinstance(next_value, dict):
            next_value = {}
            current[part] = next_value
        current = next_value
    current[parts[-1]] = value


def get_setting(key: str) -> Any | None:
    if key not in META_SETTING_KEYS and key not in BLOB_SETTING_KEYS:
        raise KeyError(key)
    with _CATALOG_LOCK:
        data = _read_catalog()
        if key in BLOB_SETTING_KEYS:
            return deepcopy(data.get(key))
        return _get_nested(data, key)


def upsert_setting(key: str, value: Any) -> None:
    _validate_setting_value(key, value)
    with _CATALOG_LOCK:
        data = _read_catalog()
        if key in BLOB_SETTING_KEYS:
            data[key] = value
        elif key in META_SETTING_KEYS:
            _set_nested(data, key, value)
        else:
            raise KeyError(key)
        _write_catalog(data)


def list_items(category: str) -> list[dict[str, Any]]:
    cfg = CATEGORY_CONFIG.get(category)
    if cfg is None:
        raise KeyError(category)
    with _CATALOG_LOCK:
        data = _read_catalog()
        key_field = cfg["key_field"]
        items = []
        for key, payload in sorted(_category_models(data, category).items()):
            item_data = deepcopy(payload) if isinstance(payload, dict) else {"value": payload}
            if category != "standard_packages":
                item_data.setdefault(key_field, key)
            items.append({"key": key, "data": item_data})
        return items


def get_item(category: str, key: str) -> dict[str, Any] | None:
    cfg = CATEGORY_CONFIG.get(category)
    if cfg is None:
        raise KeyError(category)
    with _CATALOG_LOCK:
        data = _read_catalog()
        payload = _category_models(data, category).get(key)
        if payload is None:
            return None
        item_data = deepcopy(payload) if isinstance(payload, dict) else {"value": payload}
        if category != "standard_packages":
            item_data.setdefault(cfg["key_field"], key)
        return item_data


def upsert_item(category: str, key: str, item_data: dict[str, Any]) -> None:
    cfg = CATEGORY_CONFIG.get(category)
    if cfg is None:
        raise KeyError(category)
    payload = deepcopy(item_data)
    payload.pop(cfg["key_field"], None)
    _validate_product_payload(category, key, payload)
    with _CATALOG_LOCK:
        data = _read_catalog()
        _category_models(data, category)[key] = payload
        _write_catalog(data)


def delete_item(category: str, key: str) -> bool:
    if category not in CATEGORY_CONFIG:
        raise KeyError(category)
    with _CATALOG_LOCK:
        data = _read_catalog()
        models = _category_models(data, category)
        if key not in models:
            return False
        del models[key]
        _write_catalog(data)
        return True
