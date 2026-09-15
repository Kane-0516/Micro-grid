"""路由：GET /api/products、GET /api/solar-hours、GET /api/health."""

from __future__ import annotations

import math
from functools import lru_cache

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["products"])

_NASA_POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
_NASA_POWER_TIMEOUT = 8.0
_SOLAR_DATA_YEAR = 2020
_SYSTEM_DERATE = 0.75


@router.get("/health")
def health():
    """Return a simple liveness/version check."""
    return {"status": "ok", "version": "2.0.0"}


@router.get("/products")
def get_products():
    """Return the products catalog.

    Reads from PostgreSQL, falling back to products.yaml.
    """
    try:
        from app.db.database import ensure_db_seeded, get_connection
        from app.db.queries import get_all_products

        ensure_db_seeded()
        conn = get_connection()
        try:
            return get_all_products(conn)
        finally:
            conn.close()
    except Exception as exc:
        print(
            "[db] PostgreSQL unavailable for /api/products; "
            f"using products.yaml fallback: {exc}"
        )
        from app.db.yaml_store import get_all_products as get_yaml_products

        return get_yaml_products()


def _climate_zone(lat: float) -> str:
    abs_lat = abs(lat)
    if abs_lat <= 23.5:
        return "Tropical (abundant sunshine)"
    if abs_lat <= 35:
        return "Subtropical / Arid (good sunshine)"
    if abs_lat <= 50:
        return "Temperate (moderate sunshine)"
    return "High-latitude (limited sunshine)"


def _estimate_solar_hours_fallback(lat: float, lon: float) -> dict:
    lat_rad = math.radians(abs(lat))
    psh_day = max(2.5, 5.8 * math.cos(lat_rad) ** 0.5)
    psh_day_tilted = round(psh_day * 1.08, 2)
    annual_kwh_m2 = round(psh_day_tilted * 365, 0)
    annual_eff_hours = round(psh_day_tilted * 365 * _SYSTEM_DERATE)

    return {
        "success": True,
        "latitude": lat,
        "longitude": lon,
        "peak_sun_hours_per_day": psh_day_tilted,
        "annual_kwh_per_m2": annual_kwh_m2,
        "annual_eff_hours": annual_eff_hours,
        "climate_zone": _climate_zone(lat),
        "note": "Fallback engineering estimate based on latitude because NASA "
        "POWER data was unavailable.",
        "source": "fallback_latitude_formula",
        "data_year": None,
    }


@lru_cache(maxsize=512)
def _fetch_nasa_power_solar_hours(lat: float, lon: float, year: int) -> dict:
    start = f"{year}0101"
    end = f"{year}1231"
    params = {
        "parameters": "ALLSKY_SFC_SW_DWN",
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "start": start,
        "end": end,
        "format": "JSON",
    }

    with httpx.Client(timeout=_NASA_POWER_TIMEOUT) as client:
        response = client.get(_NASA_POWER_DAILY_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    parameter_block = (
        payload.get("properties", {})
        .get("parameter", {})
        .get("ALLSKY_SFC_SW_DWN", {})
    )
    if not isinstance(parameter_block, dict) or not parameter_block:
        raise ValueError("NASA POWER response missing ALLSKY_SFC_SW_DWN data")

    daily_values: list[float] = []
    for raw_value in parameter_block.values():
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        # NASA POWER uses negative sentinels like -999; ignore those.
        if value >= 0:
            daily_values.append(value)

    if not daily_values:
        raise ValueError("NASA POWER returned no valid daily irradiance values")

    annual_kwh_m2 = round(sum(daily_values), 0)
    avg_daily_kwh_m2 = sum(daily_values) / len(daily_values)
    peak_sun_hours_per_day = round(avg_daily_kwh_m2, 2)
    annual_eff_hours = round(annual_kwh_m2 * _SYSTEM_DERATE)

    return {
        "success": True,
        "latitude": lat,
        "longitude": lon,
        "peak_sun_hours_per_day": peak_sun_hours_per_day,
        "annual_kwh_per_m2": annual_kwh_m2,
        "annual_eff_hours": annual_eff_hours,
        "climate_zone": _climate_zone(lat),
        "note": (
            f"Based on NASA POWER daily ALLSKY_SFC_SW_DWN data for {year}. "
            f"Annual effective hours apply a {_SYSTEM_DERATE:.0%} "
            "system derate."
        ),
        "source": "nasa_power_daily",
        "data_year": year,
    }


@router.get("/solar-hours")
def get_solar_hours(lat: float, lon: float = 0.0):
    """Get solar resource metrics.

    Prefers NASA POWER daily irradiance data.
    """
    try:
        return _fetch_nasa_power_solar_hours(
            round(lat, 4), round(lon, 4), _SOLAR_DATA_YEAR
        )
    except Exception:
        return _estimate_solar_hours_fallback(lat, lon)
