"""
services/calculator.py — 系统规格推算 + CAPEX 计算
从原 api.py 的 _compute_sizes / _build_capex 提取，不含 HTTP 相关代码。
"""
from __future__ import annotations
import math
import sys
from pathlib import Path

# 确保 services/ 自身在 path 中
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from app.services.economic_analysis import SystemCapex
from app.services.site_rules import total_site_area_m2, tray_count_for_inverters


def _converter_kw_per_pv_kw(catalog) -> float:
    defaults = catalog.simulation_defaults()
    return max(0.0, float(defaults.get("converter_kw_per_pv_kw", 0.5)))


def compute_sizes(req, catalog) -> dict:
    # This layer stays location-agnostic: latitude/longitude/year are for simulation only.
    """
    根据前端表单参数推算系统规格（kW / kWh / 包数）。

    返回 keys:
        pv_capacity_kw, battery_capacity_kwh, num_battery_packs,
        diesel_capacity_kw, diesel_kw_comparison, annual_load_kwh,
        pv_mounting_cost, occupied_area_m2, panel_watts, panel_price_per_kw,
        battery_pack_kwh
    """
    panel   = catalog.panel(req.panelModel)
    bracket = catalog.bracket(req.bracketModel)
    bp      = catalog.battery_pack(req.batteryPackModel)

    # ── PV 容量 ────────────────────────────────────────────────
    pv_kw = req.bracketSets * bracket.panels_per_set * panel.kw

    # ── 柴油机容量 ─────────────────────────────────────────────
    diesel_kw = req.dieselCapacityKw if req.hasGenerator else 0.0
    peak_kw = getattr(req, "peakLoadKw", 0.0) or 0.0
    if peak_kw > 0:
        diesel_kw_comparison = peak_kw
    else:
        avg_kw = (req.annualLoadKwh or 0.0) / 8760 if getattr(req, "annualLoadKwh", None) else 0.0
        diesel_kw_comparison = diesel_kw if diesel_kw > 0 else max(10.0, avg_kw * 2.5)

    # ── 年用电量 ───────────────────────────────────────────────
    if req.annualLoadKwh and req.annualLoadKwh > 0:
        annual_load_kwh = req.annualLoadKwh
    elif req.scenario == "no-load" and req.trayCapacity:
        integrated      = catalog.integrated_pv_storage(req.trayCapacity)
        total_pv        = integrated.pv_kw + pv_kw
        annual_load_kwh = total_pv * 4.5 * 365 * 0.75
        pv_kw           = total_pv
    elif req.scenario == "diy" and req.requiredCurrent:
        voltage_map     = {"120V/240V": 240, "120V/208V": 208, "277V/480V": 480}
        v               = voltage_map.get(req.voltageLevel, 240)
        peak_kw         = v * req.requiredCurrent * 0.85 / 1000
        annual_load_kwh = peak_kw * 8 * 365
    else:
        annual_load_kwh = pv_kw * 4.5 * 365 * 0.75

    # ── 电池容量（PV×3h 经验公式）─────────────────────────────
    daily_load_kwh = annual_load_kwh / 365 if annual_load_kwh > 0 else 0.0
    if pv_kw > 0:
        autonomy_factor = 0.5 if req.hasGenerator else 1.0
        battery_kwh_target = max(
            pv_kw * 3 * req.storageDays,
            daily_load_kwh * autonomy_factor * req.storageDays / 0.9,
        )
    else:
        battery_kwh_target = diesel_kw_comparison * 4 * req.storageDays
    num_packs   = max(1, math.ceil(battery_kwh_target / bp.capacity_kwh))
    battery_kwh = num_packs * bp.capacity_kwh

    inverter = catalog.inverter_for_voltage(req.voltageLevel)
    packs_per_inv = getattr(inverter, "packs_per_inverter", 6)
    pack_based_inverters = math.ceil(num_packs / packs_per_inv)
    target_converter_kw = pv_kw * _converter_kw_per_pv_kw(catalog)
    pv_ratio_inverters = math.ceil(target_converter_kw / max(float(inverter.power_kw), 1e-6))
    num_inverters = max(1, pack_based_inverters, pv_ratio_inverters)
    inverter_total_kw = num_inverters * float(inverter.power_kw)
    tray_count = tray_count_for_inverters(num_inverters)
    occupied_area_m2 = total_site_area_m2(req.bracketSets, tray_count, diesel_kw > 0)

    # ── 支架成本 ───────────────────────────────────────────────
    acc = catalog.accessories()
    mounting_cost_per_set = acc.get("pv_mounting_cost_per_set_usd", 19050)
    pv_mounting_cost      = req.bracketSets * mounting_cost_per_set

    return {
        "latitude":             getattr(req, "latitude", None),
        "longitude":            getattr(req, "longitude", None),
        "year":                 getattr(req, "year", None),
        "pv_capacity_kw":       round(pv_kw, 2),
        "battery_capacity_kwh": round(battery_kwh, 1),
        "num_battery_packs":    num_packs,
        "diesel_capacity_kw":   round(diesel_kw, 1),
        "diesel_kw_comparison": round(diesel_kw_comparison, 1),
        "annual_load_kwh":      round(annual_load_kwh, 0),
        "pv_mounting_cost":     round(pv_mounting_cost, 0),
        "occupied_area_m2":     round(occupied_area_m2, 1),
        "panel_watts":          panel.watts,
        "panel_price_per_kw":   panel.price_usd_per_kw,
        "battery_pack_kwh":     bp.capacity_kwh,
        "inverter_kw":          float(inverter.power_kw),
        "inverter_count":       num_inverters,
        "total_inverter_kw":    round(inverter_total_kw, 3),
        "battery_power_kw":     round(inverter_total_kw, 3),
        "tray_count":           tray_count,
    }


def build_capex(sizes: dict, req, catalog) -> SystemCapex:
    """从规格参数和产品目录构建 SystemCapex。"""
    panel  = catalog.panel(req.panelModel)
    bp     = catalog.battery_pack(req.batteryPackModel)

    pv_kw       = sizes["pv_capacity_kw"]
    num_packs   = sizes["num_battery_packs"]
    diesel_kw   = sizes["diesel_capacity_kw"]

    # PV 组件
    panels_count    = req.bracketSets * catalog.bracket(req.bracketModel).panels_per_set
    pv_module_cost  = round(panels_count * panel.watts * panel.price_usd_per_wp, 2)

    # 储能系统（逆变器 + 电池包 + 托盘）
    inverter       = catalog.inverter_for_voltage(req.voltageLevel)
    num_inverters  = int(sizes.get("inverter_count", 0)) or 1
    inv_cost       = num_inverters * inverter.price_usd
    bat_cost       = num_packs * bp.price_usd
    acc            = catalog.accessories()
    pallet_cost    = num_packs * acc.get("battery_pallet", {}).get("per_pack_usd", 250)
    energy_storage = round(bat_cost + inv_cost + pallet_cost, 0)

    # 柴油发电机
    diesel_cost = 0.0
    if diesel_kw > 0 and req.dieselIsNew:
        dg = catalog.diesel_generator(power_kw=diesel_kw)
        diesel_cost = dg.price_usd

    # 附属成本
    intl_transport = acc["intl_transport"]["base_usd"] + req.bracketSets * acc["intl_transport"]["per_bracket_set_usd"]
    installation   = acc["installation"]["base_usd"]   + req.bracketSets * acc["installation"]["per_bracket_set_usd"]
    accessory_mat  = acc["accessory_materials"]["base_usd"] + req.bracketSets * acc["accessory_materials"]["per_bracket_set_usd"]
    other_initial  = acc["other_initial_usd"]

    return SystemCapex(
        pv_module_cost        = pv_module_cost,
        pv_mounting_cost      = sizes["pv_mounting_cost"],
        energy_storage_cost   = energy_storage,
        diesel_generator_cost = diesel_cost,
        intl_transport_cost   = round(intl_transport, 0),
        installation_cost     = round(installation, 0),
        accessory_cost        = round(accessory_mat, 0),
        other_initial_cost    = other_initial,
        profit_margin         = 0.20,
    )
