"""
Seed the PostgreSQL product catalog from products.yaml.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from psycopg import Connection
from psycopg.types.json import Jsonb


def seed_from_yaml(yaml_path: str, conn: Connection) -> None:
    with open(yaml_path, "r", encoding="utf-8") as f:
        data: dict[str, Any] = yaml.safe_load(f)

    _seed_pv_panels(data, conn)
    _seed_bracket_systems(data, conn)
    _seed_battery_packs(data, conn)
    _seed_inverters(data, conn)
    _seed_diesel_generators(data, conn)
    _seed_integrated_pv_storage(data, conn)
    _seed_standard_packages(data, conn)
    _seed_catalog_meta(data, conn)
    _seed_catalog_blobs(data, conn)
    conn.commit()


def _deep_merge_defaults(default_value: Any, current_value: Any) -> Any:
    if isinstance(default_value, dict) and isinstance(current_value, dict):
        merged = dict(current_value)
        for key, value in default_value.items():
            merged[key] = _deep_merge_defaults(value, merged.get(key)) if key in merged else value
        return merged
    return default_value if current_value is None else current_value


def _fetch_json_value(conn: Connection, table_name: str, value_column: str, key: str) -> Any:
    with conn.cursor() as cur:
        cur.execute(f"SELECT {value_column} FROM {table_name} WHERE key = %s", (key,))
        row = cur.fetchone()
        if not row:
            return None
        return row[value_column] if isinstance(row, dict) else row[0]


def _upsert_json_value(conn: Connection, table_name: str, value_column: str, key: str, value: Any) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {table_name} (key, {value_column})
            VALUES (%s, %s)
            ON CONFLICT (key)
            DO UPDATE SET {value_column} = EXCLUDED.{value_column}
            """,
            (key, Jsonb(value)),
        )


def merge_catalog_defaults_from_yaml(yaml_path: str, conn: Connection) -> None:
    """Backfill new catalog setting fields without overwriting user-edited values."""
    with open(yaml_path, "r", encoding="utf-8") as f:
        data: dict[str, Any] = yaml.safe_load(f)

    pv_sec = data.get("pv_panels", {})
    br_sec = data.get("bracket_systems", {})
    bat_sec = data.get("battery_packs", {})
    inv_sec = data.get("inverters", {})
    dg_sec = data.get("diesel_generators", {})
    meta_defaults = {
        "pv_panels.default_model": pv_sec.get("default_model", "655W"),
        "bracket_systems.default_model": br_sec.get("default_model", "standard_32"),
        "bracket_systems.spacing_m": float(br_sec.get("spacing_m", 3.048)),
        "battery_packs.default_model": bat_sec.get("default_model", "LFP-16kWh"),
        "battery_packs.price_usd_per_kwh_fallback": float(bat_sec.get("price_usd_per_kwh_fallback", 300.0)),
        "inverters.voltage_default_map": inv_sec.get("voltage_default_map", {}),
        "diesel_generators.price_usd_per_kw": float(dg_sec.get("price_usd_per_kw", 1125.0)),
        "economic_defaults": data.get("economic_defaults", {}),
    }
    blob_defaults = {key: data.get(key, {}) for key in ["home_bg_defaults", "site_layout", "simulation_defaults", "accessories", "pricing"]}

    for key, default_value in meta_defaults.items():
        current_value = _fetch_json_value(conn, "catalog_meta", "value_json", key)
        merged_value = _deep_merge_defaults(default_value, current_value)
        _upsert_json_value(conn, "catalog_meta", "value_json", key, merged_value)

    for key, default_value in blob_defaults.items():
        current_value = _fetch_json_value(conn, "catalog_blobs", "json_value", key)
        merged_value = _deep_merge_defaults(default_value, current_value)
        _upsert_json_value(conn, "catalog_blobs", "json_value", key, merged_value)

    conn.commit()


def _truncate(conn: Connection, table_name: str) -> None:
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {table_name}")


def _seed_pv_panels(data: dict, conn: Connection) -> None:
    _truncate(conn, "pv_panels")
    sec = data.get("pv_panels", {})
    rows = [
        (
            model,
            item.get("display_name", model),
            item.get("display_name_en", ""),
            item.get("display_name_zh", ""),
            float(item["watts"]),
            float(item["price_usd_per_wp"]),
            float(item.get("efficiency_pct", 20.0)),
            float(item.get("temp_coeff_pct_per_c", -0.35)),
            float(item.get("length_mm", 0)),
            float(item.get("width_mm", 0)),
            str(item.get("description", "")),
        )
        for model, item in sec.get("models", {}).items()
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO pv_panels (
                model, display_name, display_name_en, display_name_zh, watts,
                price_usd_per_wp, efficiency_pct, temp_coeff_pct_per_c, length_mm, width_mm, description
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def _seed_bracket_systems(data: dict, conn: Connection) -> None:
    _truncate(conn, "bracket_systems")
    sec = data.get("bracket_systems", {})
    rows = [
        (
            model,
            item.get("display_name", model),
            item.get("display_name_en", ""),
            item.get("display_name_zh", ""),
            int(item["panels_per_set"]),
            float(item["area_m2"]),
            float(item.get("footprint_length_m", 28.0)),
            float(item.get("footprint_width_m", 5.6)),
            str(item.get("description", "")),
        )
        for model, item in sec.get("models", {}).items()
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO bracket_systems (
                model, display_name, display_name_en, display_name_zh, panels_per_set,
                area_m2, footprint_length_m, footprint_width_m, description
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def _seed_battery_packs(data: dict, conn: Connection) -> None:
    _truncate(conn, "battery_packs")
    sec = data.get("battery_packs", {})
    rows = [
        (
            model,
            item.get("display_name", model),
            item.get("display_name_en", ""),
            item.get("display_name_zh", ""),
            float(item["capacity_kwh"]),
            float(item["price_usd"]),
            float(item.get("voltage_v", 51.2)),
            int(item.get("cycle_life", 4000)),
            float(item.get("depth_of_discharge_pct", 90.0)),
            str(item.get("description", "")),
        )
        for model, item in sec.get("models", {}).items()
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO battery_packs (
                model, display_name, display_name_en, display_name_zh, capacity_kwh,
                price_usd, voltage_v, cycle_life, depth_of_discharge_pct, description
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def _seed_inverters(data: dict, conn: Connection) -> None:
    _truncate(conn, "inverters")
    sec = data.get("inverters", {})
    rows = [
        (
            model,
            item.get("display_name", model),
            item.get("display_name_en", ""),
            item.get("display_name_zh", ""),
            float(item["power_kw"]),
            float(item["price_usd"]),
            Jsonb(item.get("voltage_levels", [])),
            int(item.get("packs_per_inverter", 6)),
            str(item.get("description", "")),
        )
        for model, item in sec.get("models", {}).items()
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO inverters (
                model, display_name, display_name_en, display_name_zh, power_kw,
                price_usd, voltage_levels, packs_per_inverter, description
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def _seed_diesel_generators(data: dict, conn: Connection) -> None:
    _truncate(conn, "diesel_generators")
    sec = data.get("diesel_generators", {})
    rows = [
        (
            model,
            item.get("display_name", model),
            item.get("display_name_en", ""),
            item.get("display_name_zh", ""),
            float(item["power_kw"]),
            float(item["price_usd"]),
            float(item.get("fuel_efficiency_kwh_per_liter", 3.5)),
            float(item.get("fuel_intercept_coeff", 0.033)),
            float(item.get("fuel_slope_coeff", 0.273)),
            str(item.get("description", "")),
        )
        for model, item in sec.get("models", {}).items()
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO diesel_generators (
                model, display_name, display_name_en, display_name_zh, power_kw,
                price_usd, fuel_efficiency_kwh_per_liter, fuel_intercept_coeff,
                fuel_slope_coeff, description
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def _seed_integrated_pv_storage(data: dict, conn: Connection) -> None:
    _truncate(conn, "integrated_pv_storage")
    sec = data.get("integrated_pv_storage", {})
    rows = [
        (
            model,
            item.get("display_name", model),
            item.get("display_name_en", ""),
            item.get("display_name_zh", ""),
            float(item["pv_kw"]),
            float(item["battery_kwh"]),
            float(item["battery_kw"]),
            float(item.get("diesel_ratio", 1.0)),
        )
        for model, item in sec.get("models", {}).items()
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO integrated_pv_storage (
                model, display_name, display_name_en, display_name_zh, pv_kw,
                battery_kwh, battery_kw, diesel_ratio
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def _seed_standard_packages(data: dict, conn: Connection) -> None:
    _truncate(conn, "standard_packages")
    packages = data.get("standard_products", {}).get("packages", {})
    rows = [(pkg_id, Jsonb(pkg_data)) for pkg_id, pkg_data in packages.items()]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO standard_packages (package_id, data_json) VALUES (%s, %s)",
            rows,
        )


def _seed_catalog_meta(data: dict, conn: Connection) -> None:
    _truncate(conn, "catalog_meta")
    pv_sec = data.get("pv_panels", {})
    br_sec = data.get("bracket_systems", {})
    bat_sec = data.get("battery_packs", {})
    inv_sec = data.get("inverters", {})
    dg_sec = data.get("diesel_generators", {})
    rows = [
        ("pv_panels.default_model", Jsonb(pv_sec.get("default_model", "655W"))),
        ("bracket_systems.default_model", Jsonb(br_sec.get("default_model", "standard_32"))),
        ("bracket_systems.spacing_m", Jsonb(float(br_sec.get("spacing_m", 3.048)))),
        ("battery_packs.default_model", Jsonb(bat_sec.get("default_model", "LFP-16kWh"))),
        ("battery_packs.price_usd_per_kwh_fallback", Jsonb(float(bat_sec.get("price_usd_per_kwh_fallback", 300.0)))),
        ("inverters.voltage_default_map", Jsonb(inv_sec.get("voltage_default_map", {}))),
        ("diesel_generators.price_usd_per_kw", Jsonb(float(dg_sec.get("price_usd_per_kw", 1125.0)))),
        ("economic_defaults", Jsonb(data.get("economic_defaults", {}))),
    ]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO catalog_meta (key, value_json) VALUES (%s, %s)",
            rows,
        )


def _seed_catalog_blobs(data: dict, conn: Connection) -> None:
    _truncate(conn, "catalog_blobs")
    keys = ["home_bg_defaults", "site_layout", "simulation_defaults", "accessories", "pricing"]
    rows = [(key, Jsonb(data.get(key, {}))) for key in keys]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO catalog_blobs (key, json_value) VALUES (%s, %s)",
            rows,
        )


if __name__ == "__main__":
    from app.db.database import create_schema, get_connection
    from app.core.config import PRODUCTS_YAML

    yaml_path = Path(__file__).resolve().parents[2] / "products.yaml"
    if PRODUCTS_YAML.exists():
        yaml_path = PRODUCTS_YAML

    print(f"Seeding PostgreSQL catalog from {yaml_path} ...")
    connection = get_connection()
    try:
        create_schema(connection)
        seed_from_yaml(str(yaml_path), connection)
    finally:
        connection.close()
    print("Done.")
