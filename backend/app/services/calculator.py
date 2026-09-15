"""系统规格推算与 CAPEX 计算.

从原 api.py 的 _compute_sizes / _build_capex 提取，不含 HTTP 相关代码.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# 确保 services/ 自身在 path 中
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from app.services.economic_analysis import SystemCapex  # noqa: E402
from app.services.site_rules import (  # noqa: E402
    total_site_area_m2,
    tray_count_for_inverters,
)

_HOURS_PER_YEAR = 8760
_DAYS_PER_YEAR = 365
_PV_ANNUAL_FACTOR = 4.5 * _DAYS_PER_YEAR * 0.75
_DIY_HOURS_PER_DAY = 8
_DIY_POWER_FACTOR = 0.85
_MIN_DIESEL_KW = 10.0
_PEAK_LOAD_MULTIPLIER = 2.5
_BATTERY_ROUNDTRIP_EFF = 0.9
_PV_STORAGE_HOURS = 3
_DIESEL_STORAGE_HOURS = 4
_MIN_INVERTER_KW = 1e-6

_VOLTAGE_MAP = {"120V/240V": 240, "120V/208V": 208, "277V/480V": 480}
_DEFAULT_VOLTAGE = 240

_ACCESSORY_KEY_INTL_TRANSPORT = "intl_transport"
_ACCESSORY_KEY_INSTALLATION = "installation"
_ACCESSORY_KEY_ACCESSORY_MATERIALS = "accessory_materials"
_ACCESSORY_KEY_OTHER_INITIAL = "other_initial_usd"
_ACCESSORY_KEY_BATTERY_PALLET = "battery_pallet"
_ACCESSORY_KEY_PV_MOUNTING = "pv_mounting_cost_per_set_usd"
_DEFAULT_MOUNTING_COST_PER_SET = 19050
_DEFAULT_PALLET_PER_PACK = 250


@dataclass
class _ComputedSizes:
    req: Any
    panel: Any
    bp: Any
    pv_kw: float
    diesel_kw: float
    diesel_kw_comparison: float
    annual_load_kwh: float
    num_packs: int
    battery_kwh: float
    inverter: Any
    num_inverters: int
    inverter_total_kw: float
    tray_count: int
    occupied_area_m2: float
    pv_mounting_cost: float


def _converter_kw_per_pv_kw(catalog) -> float:
    defaults = catalog.simulation_defaults()
    return max(0.0, float(defaults.get("converter_kw_per_pv_kw", 0.5)))


def _diesel_kw_comparison(req, diesel_kw: float) -> float:
    peak_kw = getattr(req, "peakLoadKw", 0.0) or 0.0
    if peak_kw > 0:
        return peak_kw

    annual_load_kwh = getattr(req, "annualLoadKwh", None)
    avg_kw = (
        (annual_load_kwh or 0.0) / _HOURS_PER_YEAR if annual_load_kwh else 0.0
    )
    if diesel_kw > 0:
        return diesel_kw
    return max(_MIN_DIESEL_KW, avg_kw * _PEAK_LOAD_MULTIPLIER)


def _annual_load_kwh_and_pv(req, catalog, pv_kw: float) -> tuple[float, float]:
    if req.annualLoadKwh and req.annualLoadKwh > 0:
        return req.annualLoadKwh, pv_kw

    if req.scenario == "no-load" and req.trayCapacity:
        integrated = catalog.integrated_pv_storage(req.trayCapacity)
        total_pv = integrated.pv_kw + pv_kw
        return total_pv * _PV_ANNUAL_FACTOR, total_pv

    if req.scenario == "diy" and req.requiredCurrent:
        voltage = _VOLTAGE_MAP.get(req.voltageLevel, _DEFAULT_VOLTAGE)
        peak_kw = voltage * req.requiredCurrent * _DIY_POWER_FACTOR / 1000
        return peak_kw * _DIY_HOURS_PER_DAY * _DAYS_PER_YEAR, pv_kw

    return pv_kw * _PV_ANNUAL_FACTOR, pv_kw


def _battery_pack_sizing(
    *,
    pv_kw: float,
    annual_load_kwh: float,
    storage_days: float,
    has_generator: bool,
    diesel_kw_comparison: float,
    pack_capacity_kwh: float,
) -> tuple[int, float]:
    daily_load_kwh = (
        annual_load_kwh / _DAYS_PER_YEAR if annual_load_kwh > 0 else 0.0
    )
    if pv_kw > 0:
        autonomy_factor = 0.5 if has_generator else 1.0
        battery_kwh_target = max(
            pv_kw * _PV_STORAGE_HOURS * storage_days,
            daily_load_kwh
            * autonomy_factor
            * storage_days
            / _BATTERY_ROUNDTRIP_EFF,
        )
    else:
        battery_kwh_target = (
            diesel_kw_comparison * _DIESEL_STORAGE_HOURS * storage_days
        )

    num_packs = max(1, math.ceil(battery_kwh_target / pack_capacity_kwh))
    return num_packs, num_packs * pack_capacity_kwh


def _inverter_sizing(
    catalog, req, pv_kw: float, num_packs: int
) -> tuple[int, float, int, Any]:
    inverter = catalog.inverter_for_voltage(req.voltageLevel)
    packs_per_inv = getattr(inverter, "packs_per_inverter", 6)
    pack_based_inverters = math.ceil(num_packs / packs_per_inv)
    target_converter_kw = pv_kw * _converter_kw_per_pv_kw(catalog)
    pv_ratio_inverters = math.ceil(
        target_converter_kw / max(float(inverter.power_kw), _MIN_INVERTER_KW)
    )
    num_inverters = max(1, pack_based_inverters, pv_ratio_inverters)
    inverter_total_kw = num_inverters * float(inverter.power_kw)
    tray_count = tray_count_for_inverters(num_inverters)
    return num_inverters, inverter_total_kw, tray_count, inverter


def _accessory_bracket_cost(req, catalog) -> float:
    acc = catalog.accessories()
    mounting_cost_per_set = acc.get(
        _ACCESSORY_KEY_PV_MOUNTING, _DEFAULT_MOUNTING_COST_PER_SET
    )
    return req.bracketSets * mounting_cost_per_set


def _sizes_result(computed: _ComputedSizes) -> dict:
    return {
        "latitude": getattr(computed.req, "latitude", None),
        "longitude": getattr(computed.req, "longitude", None),
        "year": getattr(computed.req, "year", None),
        "pv_capacity_kw": round(computed.pv_kw, 2),
        "battery_capacity_kwh": round(computed.battery_kwh, 1),
        "num_battery_packs": computed.num_packs,
        "diesel_capacity_kw": round(computed.diesel_kw, 1),
        "diesel_kw_comparison": round(computed.diesel_kw_comparison, 1),
        "annual_load_kwh": round(computed.annual_load_kwh, 0),
        "pv_mounting_cost": round(computed.pv_mounting_cost, 0),
        "occupied_area_m2": round(computed.occupied_area_m2, 1),
        "panel_watts": computed.panel.watts,
        "panel_price_per_kw": computed.panel.price_usd_per_kw,
        "battery_pack_kwh": computed.bp.capacity_kwh,
        "inverter_kw": float(computed.inverter.power_kw),
        "inverter_count": computed.num_inverters,
        "total_inverter_kw": round(computed.inverter_total_kw, 3),
        "battery_power_kw": round(computed.inverter_total_kw, 3),
        "tray_count": computed.tray_count,
    }


def compute_sizes(req, catalog) -> dict:
    """根据前端表单参数推算系统规格（kW / kWh / 包数）.

    返回 keys: pv_capacity_kw, battery_capacity_kwh, num_battery_packs,
    diesel_capacity_kw, diesel_kw_comparison, annual_load_kwh,
    pv_mounting_cost, occupied_area_m2, panel_watts, panel_price_per_kw,
    battery_pack_kwh.

    本层保持地理无关：latitude/longitude/year 仅用于仿真环节。
    """
    panel = catalog.panel(req.panelModel)
    bracket = catalog.bracket(req.bracketModel)
    bp = catalog.battery_pack(req.batteryPackModel)

    pv_kw = req.bracketSets * bracket.panels_per_set * panel.kw
    diesel_kw = req.dieselCapacityKw if req.hasGenerator else 0.0
    diesel_kw_comparison = _diesel_kw_comparison(req, diesel_kw)
    annual_load_kwh, pv_kw = _annual_load_kwh_and_pv(req, catalog, pv_kw)
    num_packs, battery_kwh = _battery_pack_sizing(
        pv_kw=pv_kw,
        annual_load_kwh=annual_load_kwh,
        storage_days=req.storageDays,
        has_generator=req.hasGenerator,
        diesel_kw_comparison=diesel_kw_comparison,
        pack_capacity_kwh=bp.capacity_kwh,
    )
    num_inverters, inverter_total_kw, tray_count, inverter = _inverter_sizing(
        catalog, req, pv_kw, num_packs
    )
    occupied_area_m2 = total_site_area_m2(
        req.bracketSets, tray_count, diesel_kw > 0
    )
    pv_mounting_cost = _accessory_bracket_cost(req, catalog)

    return _sizes_result(
        _ComputedSizes(
            req=req,
            panel=panel,
            bp=bp,
            pv_kw=pv_kw,
            diesel_kw=diesel_kw,
            diesel_kw_comparison=diesel_kw_comparison,
            annual_load_kwh=annual_load_kwh,
            num_packs=num_packs,
            battery_kwh=battery_kwh,
            inverter=inverter,
            num_inverters=num_inverters,
            inverter_total_kw=inverter_total_kw,
            tray_count=tray_count,
            occupied_area_m2=occupied_area_m2,
            pv_mounting_cost=pv_mounting_cost,
        )
    )


def _scaled_accessory_cost(acc: dict, key: str, bracket_sets: int) -> float:
    section = acc[key]
    return section["base_usd"] + bracket_sets * section["per_bracket_set_usd"]


def build_capex(sizes: dict, req, catalog) -> SystemCapex:
    """从规格参数和产品目录构建 SystemCapex."""
    panel = catalog.panel(req.panelModel)
    bp = catalog.battery_pack(req.batteryPackModel)

    num_packs = sizes["num_battery_packs"]
    diesel_kw = sizes["diesel_capacity_kw"]

    panels_count = (
        req.bracketSets * catalog.bracket(req.bracketModel).panels_per_set
    )
    pv_module_cost = round(
        panels_count * panel.watts * panel.price_usd_per_wp, 2
    )

    inverter = catalog.inverter_for_voltage(req.voltageLevel)
    num_inverters = int(sizes.get("inverter_count", 0)) or 1
    inv_cost = num_inverters * inverter.price_usd
    bat_cost = num_packs * bp.price_usd
    acc = catalog.accessories()
    pallet_cost = num_packs * acc.get(_ACCESSORY_KEY_BATTERY_PALLET, {}).get(
        "per_pack_usd", _DEFAULT_PALLET_PER_PACK
    )
    energy_storage = round(bat_cost + inv_cost + pallet_cost, 0)

    diesel_cost = 0.0
    if diesel_kw > 0 and req.dieselIsNew:
        dg = catalog.diesel_generator(power_kw=diesel_kw)
        diesel_cost = dg.price_usd

    intl_transport = _scaled_accessory_cost(
        acc, _ACCESSORY_KEY_INTL_TRANSPORT, req.bracketSets
    )
    installation = _scaled_accessory_cost(
        acc, _ACCESSORY_KEY_INSTALLATION, req.bracketSets
    )
    accessory_mat = _scaled_accessory_cost(
        acc, _ACCESSORY_KEY_ACCESSORY_MATERIALS, req.bracketSets
    )
    other_initial = acc[_ACCESSORY_KEY_OTHER_INITIAL]

    return SystemCapex(
        pv_module_cost=pv_module_cost,
        pv_mounting_cost=sizes["pv_mounting_cost"],
        energy_storage_cost=energy_storage,
        diesel_generator_cost=diesel_cost,
        intl_transport_cost=round(intl_transport, 0),
        installation_cost=round(installation, 0),
        accessory_cost=round(accessory_mat, 0),
        other_initial_cost=other_initial,
        profit_margin=0.20,
    )
