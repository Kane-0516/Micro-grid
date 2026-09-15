"""Read the product catalog from PostgreSQL.

Reconstructs the shape expected by the frontend API.
"""

from __future__ import annotations

from typing import Any

from psycopg import Connection


def _meta(conn: Connection, key: str, default: Any = None) -> Any:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value_json FROM catalog_meta WHERE key = %s", (key,)
        )
        row = cur.fetchone()
    return row["value_json"] if row else default


def _blob(conn: Connection, key: str, default: Any = None) -> Any:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT json_value FROM catalog_blobs WHERE key = %s", (key,)
        )
        row = cur.fetchone()
    return (
        row["json_value"] if row else (default if default is not None else {})
    )


def get_all_products(conn: Connection) -> dict:
    """Build the full product catalog dict from PostgreSQL tables."""
    return {
        "pv_panels": _build_pv_panels(conn),
        "bracket_systems": _build_bracket_systems(conn),
        "battery_packs": _build_battery_packs(conn),
        "inverters": _build_inverters(conn),
        "diesel_generators": _build_diesel_generators(conn),
        "integrated_pv_storage": _build_integrated_pv_storage(conn),
        "standard_products": _build_standard_products(conn),
        "home_bg_defaults": _blob(conn, "home_bg_defaults"),
        "site_layout": _blob(conn, "site_layout"),
        "simulation_defaults": _blob(conn, "simulation_defaults"),
        "economic_defaults": _meta(conn, "economic_defaults", {}),
        "accessories": _blob(conn, "accessories"),
        "pricing": _blob(conn, "pricing"),
    }


def _fetch_all(conn: Connection, sql: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql)
        return list(cur.fetchall())


def _build_pv_panels(conn: Connection) -> dict:
    rows = _fetch_all(conn, "SELECT * FROM pv_panels ORDER BY watts")
    models = {
        row["model"]: {
            "display_name": row["display_name"],
            "display_name_en": row["display_name_en"],
            "display_name_zh": row["display_name_zh"],
            "watts": row["watts"],
            "price_usd_per_wp": row["price_usd_per_wp"],
            "efficiency_pct": row["efficiency_pct"],
            "temp_coeff_pct_per_c": row["temp_coeff_pct_per_c"],
            "length_mm": row["length_mm"],
            "width_mm": row["width_mm"],
            "description": row["description"],
        }
        for row in rows
    }
    return {
        "default_model": _meta(conn, "pv_panels.default_model", "655W"),
        "models": models,
    }


def _build_bracket_systems(conn: Connection) -> dict:
    rows = _fetch_all(
        conn, "SELECT * FROM bracket_systems ORDER BY panels_per_set"
    )
    models = {
        row["model"]: {
            "display_name": row["display_name"],
            "display_name_en": row["display_name_en"],
            "display_name_zh": row["display_name_zh"],
            "panels_per_set": row["panels_per_set"],
            "area_m2": row["area_m2"],
            "footprint_length_m": row["footprint_length_m"],
            "footprint_width_m": row["footprint_width_m"],
            "description": row["description"],
        }
        for row in rows
    }
    return {
        "default_model": _meta(
            conn, "bracket_systems.default_model", "standard_32"
        ),
        "spacing_m": _meta(conn, "bracket_systems.spacing_m", 3.048),
        "models": models,
    }


def _build_battery_packs(conn: Connection) -> dict:
    rows = _fetch_all(conn, "SELECT * FROM battery_packs ORDER BY capacity_kwh")
    models = {
        row["model"]: {
            "display_name": row["display_name"],
            "display_name_en": row["display_name_en"],
            "display_name_zh": row["display_name_zh"],
            "capacity_kwh": row["capacity_kwh"],
            "price_usd": row["price_usd"],
            "voltage_v": row["voltage_v"],
            "cycle_life": row["cycle_life"],
            "depth_of_discharge_pct": row["depth_of_discharge_pct"],
            "description": row["description"],
        }
        for row in rows
    }
    return {
        "default_model": _meta(
            conn, "battery_packs.default_model", "LFP-16kWh"
        ),
        "price_usd_per_kwh_fallback": _meta(
            conn, "battery_packs.price_usd_per_kwh_fallback", 300.0
        ),
        "models": models,
    }


def _build_inverters(conn: Connection) -> dict:
    rows = _fetch_all(conn, "SELECT * FROM inverters ORDER BY power_kw")
    models = {
        row["model"]: {
            "display_name": row["display_name"],
            "display_name_en": row["display_name_en"],
            "display_name_zh": row["display_name_zh"],
            "power_kw": row["power_kw"],
            "price_usd": row["price_usd"],
            "voltage_levels": row["voltage_levels"],
            "packs_per_inverter": row["packs_per_inverter"],
            "description": row["description"],
        }
        for row in rows
    }
    return {
        "models": models,
        "voltage_default_map": _meta(conn, "inverters.voltage_default_map", {}),
    }


def _build_diesel_generators(conn: Connection) -> dict:
    rows = _fetch_all(conn, "SELECT * FROM diesel_generators ORDER BY power_kw")
    models = {
        row["model"]: {
            "display_name": row["display_name"],
            "display_name_en": row["display_name_en"],
            "display_name_zh": row["display_name_zh"],
            "power_kw": row["power_kw"],
            "price_usd": row["price_usd"],
            "fuel_efficiency_kwh_per_liter": row[
                "fuel_efficiency_kwh_per_liter"
            ],
            "fuel_intercept_coeff": row.get("fuel_intercept_coeff", 0.033),
            "fuel_slope_coeff": row.get("fuel_slope_coeff", 0.273),
            "description": row["description"],
        }
        for row in rows
    }
    return {
        "price_usd_per_kw": _meta(
            conn, "diesel_generators.price_usd_per_kw", 1125.0
        ),
        "models": models,
    }


def _build_integrated_pv_storage(conn: Connection) -> dict:
    rows = _fetch_all(conn, "SELECT * FROM integrated_pv_storage")
    models = {
        row["model"]: {
            "display_name": row["display_name"],
            "display_name_en": row["display_name_en"],
            "display_name_zh": row["display_name_zh"],
            "pv_kw": row["pv_kw"],
            "battery_kwh": row["battery_kwh"],
            "battery_kw": row["battery_kw"],
            "diesel_ratio": row["diesel_ratio"],
        }
        for row in rows
    }
    return {"models": models}


def _build_standard_products(conn: Connection) -> dict:
    rows = _fetch_all(
        conn,
        "SELECT package_id, data_json FROM standard_packages ORDER BY "
        "package_id",
    )
    return {"packages": {row["package_id"]: row["data_json"] for row in rows}}


def build_product_catalog(conn: Connection):
    """Build a ProductCatalog backed by the current PostgreSQL data."""
    from app.services.config_loader import ProductCatalog

    data = get_all_products(conn)
    return ProductCatalog(data, source="postgresql")
