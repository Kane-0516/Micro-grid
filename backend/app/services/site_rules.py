from __future__ import annotations

import math
from typing import Optional

from app.core.catalog import get_catalog

PV_INVERTER_RATIO_MIN = 0.9
PV_INVERTER_RATIO_MAX = 1.5


def _get_site_layout_params() -> dict:
    """Read site layout parameters from product catalog."""
    cat = get_catalog()
    return cat.site_layout()


def _get_pv_set_footprint_m2() -> float:
    """Compute PV set footprint (with spacing) from catalog: (length + spacing) × (width + spacing)."""
    cat = get_catalog()
    bracket = cat.bracket()
    spacing = cat.bracket_spacing_m()
    return (bracket.footprint_length_m + spacing) * (bracket.footprint_width_m + spacing)


def min_inverter_count_for_ratio(pv_kw: float, inverter_kw: float) -> int:
    if pv_kw <= 0 or inverter_kw <= 0:
        return 0
    return max(1, math.ceil(pv_kw / (inverter_kw * PV_INVERTER_RATIO_MAX)))


def max_inverter_count_for_ratio(pv_kw: float, inverter_kw: float) -> int:
    if pv_kw <= 0 or inverter_kw <= 0:
        return 0
    return max(1, math.floor(pv_kw / (inverter_kw * PV_INVERTER_RATIO_MIN)))


def tray_count_for_inverters(
    inverter_count: int,
    inverters_per_tray: Optional[int] = None,
) -> int:
    if inverter_count <= 0:
        return 0
    if inverters_per_tray is None:
        inverters_per_tray = _get_site_layout_params().get("inverters_per_tray", 2)
    return math.ceil(inverter_count / inverters_per_tray)


def total_site_area_m2(
    bracket_sets: int,
    tray_count: int,
    has_diesel: bool,
    pv_set_footprint_m2: Optional[float] = None,
    tray_length_m: Optional[float] = None,
    tray_width_m: Optional[float] = None,
    diesel_reserved_area_m2: Optional[float] = None,
) -> float:
    # Read from catalog if not explicitly provided
    if pv_set_footprint_m2 is None:
        pv_set_footprint_m2 = _get_pv_set_footprint_m2()
    if tray_length_m is None or tray_width_m is None or diesel_reserved_area_m2 is None:
        sl = _get_site_layout_params()
        if tray_length_m is None:
            tray_length_m = sl.get("tray_length_m", 6.2)
        if tray_width_m is None:
            tray_width_m = sl.get("tray_width_m", 4.4)
        if diesel_reserved_area_m2 is None:
            diesel_reserved_area_m2 = sl.get("diesel_reserved_area_m2", 75.0)

    tray_footprint_m2 = tray_length_m * tray_width_m
    pv_area = max(0, bracket_sets) * pv_set_footprint_m2
    tray_area = max(0, tray_count) * tray_footprint_m2
    diesel_area = diesel_reserved_area_m2 if has_diesel else 0.0
    return pv_area + tray_area + diesel_area
