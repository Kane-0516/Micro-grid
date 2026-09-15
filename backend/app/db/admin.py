"""CRUD helpers for product configuration management."""

from __future__ import annotations

from typing import Any, Iterable

from psycopg import Connection
from psycopg.types.json import Jsonb

CATEGORY_CONFIG: dict[str, dict[str, Any]] = {
    "pv_panels": {
        "table": "pv_panels",
        "key_field": "model",
        "json_fields": set(),
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "watts",
            "price_usd_per_wp",
            "efficiency_pct",
            "temp_coeff_pct_per_c",
            "length_mm",
            "width_mm",
        },
        "non_negative_fields": {
            "watts",
            "price_usd_per_wp",
            "efficiency_pct",
            "length_mm",
            "width_mm",
        },
    },
    "bracket_systems": {
        "table": "bracket_systems",
        "key_field": "model",
        "json_fields": set(),
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "panels_per_set",
            "area_m2",
            "footprint_length_m",
            "footprint_width_m",
        },
        "non_negative_fields": {
            "panels_per_set",
            "area_m2",
            "footprint_length_m",
            "footprint_width_m",
        },
    },
    "battery_packs": {
        "table": "battery_packs",
        "key_field": "model",
        "json_fields": set(),
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "capacity_kwh",
            "price_usd",
            "voltage_v",
            "cycle_life",
            "depth_of_discharge_pct",
        },
        "non_negative_fields": {
            "capacity_kwh",
            "price_usd",
            "voltage_v",
            "cycle_life",
            "depth_of_discharge_pct",
        },
    },
    "inverters": {
        "table": "inverters",
        "key_field": "model",
        "json_fields": {"voltage_levels"},
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "power_kw",
            "price_usd",
            "voltage_levels",
            "packs_per_inverter",
        },
        "non_negative_fields": {
            "power_kw",
            "price_usd",
            "packs_per_inverter",
        },
    },
    "diesel_generators": {
        "table": "diesel_generators",
        "key_field": "model",
        "json_fields": set(),
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "power_kw",
            "price_usd",
            "fuel_efficiency_kwh_per_liter",
            "fuel_intercept_coeff",
            "fuel_slope_coeff",
        },
        "non_negative_fields": {
            "power_kw",
            "price_usd",
            "fuel_efficiency_kwh_per_liter",
            "fuel_intercept_coeff",
            "fuel_slope_coeff",
        },
    },
    "integrated_pv_storage": {
        "table": "integrated_pv_storage",
        "key_field": "model",
        "json_fields": set(),
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "pv_kw",
            "battery_kwh",
            "battery_kw",
            "diesel_ratio",
        },
        "non_negative_fields": {
            "pv_kw",
            "battery_kwh",
            "battery_kw",
            "diesel_ratio",
        },
    },
    "standard_packages": {
        "table": "standard_packages",
        "key_field": "package_id",
        "json_payload_field": "data_json",
        "required_fields": {
            "display_name",
            "display_name_en",
            "display_name_zh",
            "panel_model",
            "bracket_model",
            "bracket_sets",
            "annual_load_kwh",
            "peak_load_kw",
            "load_type",
            "diesel_model",
            "battery_pack_model",
            "battery_pack_count",
        },
        "non_negative_fields": {
            "bracket_sets",
            "annual_load_kwh",
            "peak_load_kw",
            "battery_pack_count",
        },
    },
}

META_SETTING_KEYS = {
    "pv_panels.default_model",
    "bracket_systems.default_model",
    "bracket_systems.spacing_m",
    "battery_packs.default_model",
    "battery_packs.price_usd_per_kwh_fallback",
    "inverters.voltage_default_map",
    "diesel_generators.price_usd_per_kw",
    "economic_defaults",
}

BLOB_SETTING_KEYS = {
    "home_bg_defaults",
    "site_layout",
    "simulation_defaults",
    "accessories",
    "pricing",
}

STRING_SETTING_KEYS = {
    "pv_panels.default_model",
    "bracket_systems.default_model",
    "battery_packs.default_model",
}

NON_NEGATIVE_NUMBER_SETTING_KEYS = {
    "bracket_systems.spacing_m",
    "battery_packs.price_usd_per_kwh_fallback",
    "diesel_generators.price_usd_per_kw",
}

SIMULATION_DEFAULT_FIELDS = {
    "system_efficiency",
    "default_year",
    "default_load_type",
    "diesel_dispatch_mode",
    "pv_generation_correction_factor",
    "converter_kw_per_pv_kw",
    "cycle_charging_target_load_pu",
    "cycle_charging_start_soc_pu",
}

ECONOMIC_DEFAULT_NUMBER_FIELDS = (
    ("diesel_price_usd_per_liter", 0),
    ("electricity_price_usd_per_kwh", 0),
    ("project_years", 1),
    ("nominal_discount_rate_pct", None),
    ("inflation_rate_pct", None),
)

HOME_BG_NUMBER_FIELDS = (
    "pv_kw",
    "annual_load_kwh",
    "diesel_kw",
    "diesel_price_usd",
    "battery_kwh",
    "storage_days",
)

SITE_LAYOUT_NUMBER_FIELDS = (
    "tray_length_m",
    "tray_width_m",
    "diesel_reserved_area_m2",
    "inverters_per_tray",
    "max_layout_area_m2",
)


def _require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object.")
    return value


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string.")
    return value.strip()


def _require_number(
    value: Any, label: str, *, minimum: float | None = None
) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{label} must be a number.")
    numeric = float(value)
    if minimum is not None and numeric < minimum:
        raise ValueError(f"{label} must be >= {minimum}.")
    return numeric


def _require_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list of strings.")
    cleaned: list[str] = []
    for item in value:
        cleaned.append(_require_string(item, label))
    return cleaned


def _validate_known_fields(
    data: dict[str, Any], allowed_fields: Iterable[str], label: str
) -> None:
    unknown = sorted(set(data.keys()) - set(allowed_fields))
    if unknown:
        raise ValueError(
            f"{label} contains unknown fields: {', '.join(unknown)}."
        )


def _validate_required_fields(
    data: dict[str, Any], required_fields: Iterable[str], label: str
) -> None:
    missing = sorted(field for field in required_fields if field not in data)
    if missing:
        raise ValueError(
            f"{label} is missing required fields: {', '.join(missing)}."
        )


def _validate_battery_payload(data: dict[str, Any]) -> None:
    dod = _require_number(
        data["depth_of_discharge_pct"],
        "battery_packs:depth_of_discharge_pct",
        minimum=0,
    )
    if dod > 100:
        raise ValueError("battery_packs:depth_of_discharge_pct must be <= 100.")


def _validate_inverter_payload(data: dict[str, Any]) -> None:
    voltage_levels = data["voltage_levels"]
    if not isinstance(voltage_levels, list) or not voltage_levels:
        raise ValueError("inverters:voltage_levels must be a non-empty list.")
    for item in voltage_levels:
        _require_string(item, "inverters:voltage_levels")


def _validate_standard_package_payload(data: dict[str, Any]) -> None:
    _require_string(data["load_type"], "standard_packages:load_type")


PRODUCT_PAYLOAD_VALIDATORS = {
    "pv_panels": lambda data: _require_number(
        data["efficiency_pct"], "pv_panels:efficiency_pct", minimum=0
    ),
    "battery_packs": _validate_battery_payload,
    "inverters": _validate_inverter_payload,
    "standard_packages": _validate_standard_package_payload,
}


def _validate_product_payload(
    category: str, key: str, data: dict[str, Any]
) -> None:
    cfg = _get_config(category)
    required_fields = cfg.get("required_fields", set())
    allowed_fields = set(required_fields) | {
        "description",
        "display_name",
        "display_name_en",
        "display_name_zh",
    }
    _validate_known_fields(data, allowed_fields, f"{category}:{key}")
    _validate_required_fields(data, required_fields, f"{category}:{key}")

    for field in ("display_name", "display_name_en", "display_name_zh"):
        if field in data:
            _require_string(data[field], f"{category}:{field}")

    for field in cfg.get("non_negative_fields", set()):
        if field in data:
            _require_number(data[field], f"{category}:{field}", minimum=0)

    validator = PRODUCT_PAYLOAD_VALIDATORS.get(category)
    if validator:
        validator(data)


def _validate_bounded_number(
    payload: dict[str, Any], key: str, field: str, maximum: float
) -> None:
    value = _require_number(payload.get(field), f"{key}.{field}", minimum=0)
    if value > maximum:
        raise ValueError(f"{key}.{field} must be <= {maximum:g}.")


def _validate_number_fields(
    payload: dict[str, Any],
    key: str,
    fields: Iterable[str],
    *,
    minimum: float | None = 0,
) -> None:
    for field in fields:
        _require_number(payload.get(field), f"{key}.{field}", minimum=minimum)


def _validate_simulation_defaults(value: Any, key: str) -> None:
    payload = _require_mapping(value, key)
    _validate_known_fields(payload, SIMULATION_DEFAULT_FIELDS, key)
    _validate_bounded_number(payload, key, "system_efficiency", 1)
    _require_number(
        payload.get("default_year"), f"{key}.default_year", minimum=1900
    )
    _require_string(
        payload.get("default_load_type"), f"{key}.default_load_type"
    )
    dispatch_mode = _require_string(
        payload.get("diesel_dispatch_mode"), f"{key}.diesel_dispatch_mode"
    ).lower()
    if dispatch_mode not in {"lf", "cc", "cd", "lp", "proxy", "uc"}:
        raise ValueError(
            f"{key}.diesel_dispatch_mode must be one of "
            "lf, cc, cd, lp, proxy, uc."
        )
    _validate_number_fields(
        payload,
        key,
        ("pv_generation_correction_factor", "converter_kw_per_pv_kw"),
    )
    _validate_bounded_number(payload, key, "cycle_charging_target_load_pu", 1)
    _validate_bounded_number(payload, key, "cycle_charging_start_soc_pu", 1)


def _validate_economic_defaults(value: Any, key: str) -> None:
    payload = _require_mapping(value, key)
    _validate_known_fields(
        payload, {field for field, _ in ECONOMIC_DEFAULT_NUMBER_FIELDS}, key
    )
    for field, minimum in ECONOMIC_DEFAULT_NUMBER_FIELDS:
        _require_number(payload.get(field), f"{key}.{field}", minimum=minimum)


def _validate_flat_number_mapping(
    value: Any, key: str, fields: Iterable[str]
) -> None:
    payload = _require_mapping(value, key)
    field_set = set(fields)
    _validate_known_fields(payload, field_set, key)
    _validate_number_fields(payload, key, field_set)


def _validate_pricing(value: Any, key: str) -> None:
    payload = _require_mapping(value, key)
    _validate_known_fields(
        payload, {"profit_margin", "pass_through_items"}, key
    )
    _require_number(
        payload.get("profit_margin"), f"{key}.profit_margin", minimum=0
    )
    _require_string_list(
        payload.get("pass_through_items", []), f"{key}.pass_through_items"
    )


def _validate_accessory_rate(
    payload: dict[str, Any], key: str, nested_name: str
) -> None:
    nested_key = f"{key}.{nested_name}"
    nested = _require_mapping(payload.get(nested_name), nested_key)
    fields = {"base_usd", "per_bracket_set_usd"}
    _validate_known_fields(nested, fields, nested_key)
    _validate_number_fields(nested, nested_key, fields)


def _validate_accessories(value: Any, key: str) -> None:
    payload = _require_mapping(value, key)
    allowed = {
        "pv_mounting_cost_per_set_usd",
        "intl_transport",
        "installation",
        "accessory_materials",
        "other_initial_usd",
        "battery_pallet",
        "ems_addons",
    }
    _validate_known_fields(payload, allowed, key)
    _require_number(
        payload.get("pv_mounting_cost_per_set_usd"),
        f"{key}.pv_mounting_cost_per_set_usd",
        minimum=0,
    )
    for nested_name in (
        "intl_transport",
        "installation",
        "accessory_materials",
    ):
        _validate_accessory_rate(payload, key, nested_name)
    _require_number(
        payload.get("other_initial_usd"), f"{key}.other_initial_usd", minimum=0
    )
    battery_key = f"{key}.battery_pallet"
    battery_pallet = _require_mapping(
        payload.get("battery_pallet"), battery_key
    )
    battery_fields = {"per_pack_usd", "reference_pack_kwh"}
    _validate_known_fields(battery_pallet, battery_fields, battery_key)
    _validate_number_fields(battery_pallet, battery_key, battery_fields)
    ems_key = f"{key}.ems_addons"
    ems_addons = _require_mapping(payload.get("ems_addons", {}), ems_key)
    _validate_known_fields(ems_addons, {"prediction_control_usd"}, ems_key)
    _require_number(
        ems_addons.get("prediction_control_usd", 0),
        f"{ems_key}.prediction_control_usd",
        minimum=0,
    )


def _validate_voltage_default_map(value: Any, key: str) -> None:
    payload = _require_mapping(value, key)
    _validate_known_fields(
        payload,
        {"120V/240V", "120V/208V", "220V/380V", "230V/400V", "277V/480V"},
        key,
    )
    for voltage_key, voltage_value in payload.items():
        _require_string(voltage_value, f"{key}.{voltage_key}")


def _validate_setting_value(key: str, value: Any) -> None:
    if key in STRING_SETTING_KEYS:
        _require_string(value, key)
    elif key in NON_NEGATIVE_NUMBER_SETTING_KEYS:
        _require_number(value, key, minimum=0)
    elif key == "simulation_defaults":
        _validate_simulation_defaults(value, key)
    elif key == "economic_defaults":
        _validate_economic_defaults(value, key)
    elif key == "home_bg_defaults":
        _validate_flat_number_mapping(value, key, HOME_BG_NUMBER_FIELDS)
    elif key == "site_layout":
        _validate_flat_number_mapping(value, key, SITE_LAYOUT_NUMBER_FIELDS)
    elif key == "pricing":
        _validate_pricing(value, key)
    elif key == "accessories":
        _validate_accessories(value, key)
    elif key == "inverters.voltage_default_map":
        _validate_voltage_default_map(value, key)
    else:
        raise KeyError(key)


def list_categories() -> list[str]:
    """Return the list of known product category keys."""
    return list(CATEGORY_CONFIG.keys())


def _get_config(category: str) -> dict[str, Any]:
    if category not in CATEGORY_CONFIG:
        raise KeyError(category)
    return CATEGORY_CONFIG[category]


def _setting_source(key: str) -> tuple[str, str]:
    if key in META_SETTING_KEYS:
        return ("catalog_meta", "value_json")
    if key in BLOB_SETTING_KEYS:
        return ("catalog_blobs", "json_value")
    raise KeyError(key)


def list_settings() -> list[dict[str, str]]:
    """Return every editable setting's key and scope (meta or blob)."""
    return [
        {"key": key, "scope": "meta"} for key in sorted(META_SETTING_KEYS)
    ] + [{"key": key, "scope": "blob"} for key in sorted(BLOB_SETTING_KEYS)]


def get_setting(conn: Connection, key: str) -> Any | None:
    """Return the current value of a setting, or None if unset.

    Args:
        conn: An open database connection.
        key: The setting key (meta dotted-path or blob key).

    Returns:
        The setting value, or None if it has not been set.

    Raises:
        KeyError: If key is not a recognized setting.
    """
    table, value_field = _setting_source(key)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {value_field} FROM {table} WHERE key = %s", (key,))
        row = cur.fetchone()
    return row[value_field] if row else None


def upsert_setting(conn: Connection, key: str, value: Any) -> None:
    """Validate and persist a setting value.

    Args:
        conn: An open database connection.
        key: The setting key (meta dotted-path or blob key).
        value: The new value to store.

    Raises:
        KeyError: If key is not a recognized setting.
    """
    _validate_setting_value(key, value)
    table, value_field = _setting_source(key)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {table} (key, {value_field})
            VALUES (%s, %s)
            ON CONFLICT (key)
            DO UPDATE SET {value_field} = EXCLUDED.{value_field}
            """,
            (key, Jsonb(value)),
        )
    conn.commit()


def list_items(conn: Connection, category: str) -> list[dict[str, Any]]:
    """List all items in a product category.

    Args:
        conn: An open database connection.
        category: The product category key.

    Returns:
        A list of {"key": ..., "data": ...} entries.

    Raises:
        KeyError: If category is not recognized.
    """
    cfg = _get_config(category)
    table = cfg["table"]
    key_field = cfg["key_field"]
    payload_field = cfg.get("json_payload_field")
    with conn.cursor() as cur:
        if payload_field:
            cur.execute(
                f"SELECT {key_field}, {payload_field} FROM {table} "
                f"ORDER BY {key_field}"
            )
            rows = cur.fetchall()
            return [
                {"key": row[key_field], "data": row[payload_field]}
                for row in rows
            ]

        cur.execute(f"SELECT * FROM {table} ORDER BY {key_field}")
        rows = cur.fetchall()
        return [{"key": row[key_field], "data": dict(row)} for row in rows]


def get_item(
    conn: Connection, category: str, key: str
) -> dict[str, Any] | None:
    """Return one item's data, or None if it doesn't exist.

    Args:
        conn: An open database connection.
        category: The product category key.
        key: The item's key within the category.

    Returns:
        The item's data dict, or None if not found.

    Raises:
        KeyError: If category is not recognized.
    """
    cfg = _get_config(category)
    table = cfg["table"]
    key_field = cfg["key_field"]
    payload_field = cfg.get("json_payload_field")
    with conn.cursor() as cur:
        if payload_field:
            cur.execute(
                f"SELECT {payload_field} FROM {table} WHERE {key_field} = %s",
                (key,),
            )
            row = cur.fetchone()
            return row[payload_field] if row else None

        cur.execute(f"SELECT * FROM {table} WHERE {key_field} = %s", (key,))
        row = cur.fetchone()
        return dict(row) if row else None


def upsert_item(
    conn: Connection, category: str, key: str, data: dict[str, Any]
) -> None:
    """Validate and create or replace one item in a product category.

    Args:
        conn: An open database connection.
        category: The product category key.
        key: The item's key within the category.
        data: The item's full data payload.

    Raises:
        KeyError: If category is not recognized.
    """
    cfg = _get_config(category)
    table = cfg["table"]
    key_field = cfg["key_field"]
    payload_field = cfg.get("json_payload_field")
    _validate_product_payload(category, key, data)

    with conn.cursor() as cur:
        if payload_field:
            cur.execute(
                f"""
                INSERT INTO {table} ({key_field}, {payload_field})
                VALUES (%s, %s)
                ON CONFLICT ({key_field})
                DO UPDATE SET {payload_field} = EXCLUDED.{payload_field}
                """,
                (key, Jsonb(data)),
            )
            conn.commit()
            return

        payload = dict(data)
        payload[key_field] = key
        columns = list(payload.keys())
        values = [
            Jsonb(payload[c]) if c in cfg["json_fields"] else payload[c]
            for c in columns
        ]
        assignments = ", ".join(
            f"{col} = EXCLUDED.{col}" for col in columns if col != key_field
        )
        column_sql = ", ".join(columns)
        placeholder_sql = ", ".join(["%s"] * len(columns))
        cur.execute(
            f"""
            INSERT INTO {table} ({column_sql})
            VALUES ({placeholder_sql})
            ON CONFLICT ({key_field})
            DO UPDATE SET {assignments}
            """,
            values,
        )
    conn.commit()


def delete_item(conn: Connection, category: str, key: str) -> bool:
    """Delete one item from a product category if it exists.

    Args:
        conn: An open database connection.
        category: The product category key.
        key: The item's key within the category.

    Returns:
        True if the item existed and was deleted, False otherwise.
    """
    cfg = _get_config(category)
    table = cfg["table"]
    key_field = cfg["key_field"]
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {table} WHERE {key_field} = %s", (key,))
        deleted = cur.rowcount > 0
    conn.commit()
    return deleted
