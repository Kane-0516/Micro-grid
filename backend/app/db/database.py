"""
PostgreSQL connection management, schema creation, and initial catalog seed.
"""
from __future__ import annotations

import threading

from psycopg import Connection, connect
from psycopg.rows import dict_row

from app.core.config import DATABASE_URL, PRODUCTS_YAML

_seed_lock = threading.Lock()
_seeded = False

_DDL = """
CREATE TABLE IF NOT EXISTS pv_panels (
    model TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_en TEXT DEFAULT '',
    display_name_zh TEXT DEFAULT '',
    watts DOUBLE PRECISION NOT NULL,
    price_usd_per_wp DOUBLE PRECISION NOT NULL,
    efficiency_pct DOUBLE PRECISION DEFAULT 20.0,
    temp_coeff_pct_per_c DOUBLE PRECISION DEFAULT -0.35,
    length_mm DOUBLE PRECISION DEFAULT 0,
    width_mm DOUBLE PRECISION DEFAULT 0,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bracket_systems (
    model TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_en TEXT DEFAULT '',
    display_name_zh TEXT DEFAULT '',
    panels_per_set INTEGER NOT NULL,
    area_m2 DOUBLE PRECISION NOT NULL,
    footprint_length_m DOUBLE PRECISION DEFAULT 28.0,
    footprint_width_m DOUBLE PRECISION DEFAULT 5.6,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS battery_packs (
    model TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_en TEXT DEFAULT '',
    display_name_zh TEXT DEFAULT '',
    capacity_kwh DOUBLE PRECISION NOT NULL,
    price_usd DOUBLE PRECISION NOT NULL,
    voltage_v DOUBLE PRECISION DEFAULT 51.2,
    cycle_life INTEGER DEFAULT 4000,
    depth_of_discharge_pct DOUBLE PRECISION DEFAULT 90.0,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inverters (
    model TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_en TEXT DEFAULT '',
    display_name_zh TEXT DEFAULT '',
    power_kw DOUBLE PRECISION NOT NULL,
    price_usd DOUBLE PRECISION NOT NULL,
    voltage_levels JSONB DEFAULT '[]'::jsonb,
    packs_per_inverter INTEGER DEFAULT 6,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS diesel_generators (
    model TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_en TEXT DEFAULT '',
    display_name_zh TEXT DEFAULT '',
    power_kw DOUBLE PRECISION NOT NULL,
    price_usd DOUBLE PRECISION NOT NULL,
    fuel_efficiency_kwh_per_liter DOUBLE PRECISION DEFAULT 3.5,
    fuel_intercept_coeff DOUBLE PRECISION DEFAULT 0.033,
    fuel_slope_coeff DOUBLE PRECISION DEFAULT 0.273,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS integrated_pv_storage (
    model TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_en TEXT DEFAULT '',
    display_name_zh TEXT DEFAULT '',
    pv_kw DOUBLE PRECISION NOT NULL,
    battery_kwh DOUBLE PRECISION NOT NULL,
    battery_kw DOUBLE PRECISION NOT NULL,
    diesel_ratio DOUBLE PRECISION DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS standard_packages (
    package_id TEXT PRIMARY KEY,
    data_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_meta (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_blobs (
    key TEXT PRIMARY KEY,
    json_value JSONB NOT NULL
);
"""

_MIGRATIONS = [
    "ALTER TABLE diesel_generators ADD COLUMN IF NOT EXISTS fuel_intercept_coeff DOUBLE PRECISION DEFAULT 0.033",
    "ALTER TABLE diesel_generators ADD COLUMN IF NOT EXISTS fuel_slope_coeff DOUBLE PRECISION DEFAULT 0.273",
]


def get_connection() -> Connection:
    return connect(DATABASE_URL, row_factory=dict_row, connect_timeout=3)


def create_schema(conn: Connection) -> None:
    statements = [stmt.strip() for stmt in _DDL.split(";") if stmt.strip()]
    with conn.cursor() as cur:
        for statement in statements:
            cur.execute(statement)
        for statement in _MIGRATIONS:
            cur.execute(statement)
    conn.commit()


def _is_empty(conn: Connection) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.pv_panels') AS table_name")
        row = cur.fetchone()
        if not row or row["table_name"] is None:
            return True
        cur.execute("SELECT COUNT(*) AS count FROM pv_panels")
        count_row = cur.fetchone()
        return int(count_row["count"]) == 0


def ensure_db_seeded() -> None:
    global _seeded
    if _seeded:
        return
    with _seed_lock:
        if _seeded:
            return
        conn = get_connection()
        try:
            create_schema(conn)
            if _is_empty(conn):
                from app.db.seed import seed_from_yaml

                seed_from_yaml(str(PRODUCTS_YAML), conn)
                print(f"[db] Seeded PostgreSQL catalog from {PRODUCTS_YAML}")
            else:
                from app.db.seed import merge_catalog_defaults_from_yaml

                merge_catalog_defaults_from_yaml(str(PRODUCTS_YAML), conn)
                print(f"[db] Backfilled missing catalog defaults from {PRODUCTS_YAML}")
        finally:
            conn.close()
        _seeded = True
