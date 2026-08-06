"""
optimizer.py
============
微电网容量自动优化模块。

给定年用电量 + 峰值负荷 + 选址参数，通过多维参数搜索找出
PV / 储能 / 柴发的最优组合，并按NPC(净现值成本)排序后返回方案列表。
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import time
from dataclasses import dataclass, field
from typing import List, Optional

from app.core.catalog import get_catalog
from app.services.config_loader import ProductCatalog
from app.services.economic_analysis import ProjectParameters
from app.services.homer_economic_model import generate_homer_economic_report
from app.services.simulator import quick_estimate, run_pypsa
from app.services.template_cost_engine import (
    build_template_cost_breakdown,
    build_template_diesel_om_params,
    calc_template_diesel_maintenance,
)
from app.services.layout_optimizer import max_systems_for_area
from app.services.site_rules import tray_count_for_inverters


@dataclass
class OptimizeInput:
    annual_load_kwh: float
    peak_load_kw: float = 0.0
    peak_sun_hours: float = 4.5
    storage_days: int = 1
    diesel_price_usd_per_liter: float = 0.95
    fuel_efficiency_kwh_per_l: float = 3.5
    discount_rate: float = 0.08
    project_years: int = 25
    diesel_is_new: bool = False

    panel_model: str = "655W"
    bracket_model: str = "standard_32"
    battery_pack_model: str = "LFP-16kWh"

    min_bracket_sets: int = 1
    max_bracket_sets: int = 20

    available_area_m2: Optional[float] = None
    existing_diesel_kw: Optional[float] = None
    diesel_capacity_kw: Optional[float] = None
    objective: str = "payback"
    allow_diesel: Optional[bool] = None
    voltage_level: Optional[str] = None
    load_type: str = "commercial"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    ems_control_method: str = "edge"
    ems_addons: list[str] = field(default_factory=list)


@dataclass
class OptimizeOption:
    bracket_sets: int
    pv_kw: float
    battery_kwh: float
    num_packs: int
    diesel_kw: float
    solar_fraction_pct: float
    annual_diesel_kwh: float
    annual_diesel_liters: float
    annual_diesel_only_liters: float
    capex_usd: float
    selling_price_usd: float
    annual_diesel_cost_usd: float
    annual_diesel_only_cost_usd: float
    annual_om_cost_usd: float
    annual_savings_usd: float
    payback_years: float
    npv_10yr_usd: float
    lcoe_microgrid_usd_per_kwh: float
    lcoe_diesel_only_usd_per_kwh: float
    label: str = ""
    is_recommended: bool = False
    is_runner_up: bool = False
    is_third: bool = False
    score: float = 0.0
    diesel_is_new: bool = False
    loss_of_load_pct: float = 0.0
    is_reliability_risk: bool = False
    reliability_note: str = ''
    curtailment_pct: float = 0.0
    inverter_kw: Optional[float] = None
    inverter_count: Optional[int] = None
    tray_count: Optional[int] = None
    site_area_required_m2: Optional[float] = None


_STANDARD_DIESEL_KW = [10, 15, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500]
_OPTIMIZE_RESULT_CACHE: dict[str, List["OptimizeOption"]] = {}
_OPTIMIZE_DIAGNOSTICS_CACHE: dict[str, dict] = {}
_OPTIMIZE_RESULT_CACHE_MAX = 32
_MAX_RECOMMENDED_LOSS_OF_LOAD_PCT = 0.01
_PYPSA_REFINE_MAX_CANDIDATES = 10
_PYPSA_REFINE_SEED_CANDIDATES = 6
logger = logging.getLogger(__name__)


def _nearest_diesel(kw: float, min_kw: float = 10.0) -> float:
    for std in _STANDARD_DIESEL_KW:
        if std >= kw and std >= min_kw:
            return float(std)
    return float(_STANDARD_DIESEL_KW[-1])


def _cache_key(req: OptimizeInput) -> str:
    catalog = get_catalog()
    simulation_defaults = catalog.simulation_defaults()
    diesel_fuel_curve_key = {}
    for kw in _STANDARD_DIESEL_KW:
        try:
            dg = catalog.diesel_generator(power_kw=kw)
            diesel_fuel_curve_key[str(kw)] = [
                round(float(getattr(dg, "fuel_intercept_coeff", 0.033)), 6),
                round(float(getattr(dg, "fuel_slope_coeff", 0.273)), 6),
            ]
        except Exception:
            continue
    payload = {
        "annual_load_kwh": round(req.annual_load_kwh, 3),
        "peak_load_kw": round(req.peak_load_kw, 3),
        "peak_sun_hours": round(req.peak_sun_hours, 3),
        "storage_days": req.storage_days,
        "diesel_price_usd_per_liter": round(req.diesel_price_usd_per_liter, 4),
        "fuel_efficiency_kwh_per_l": round(req.fuel_efficiency_kwh_per_l, 4),
        "discount_rate": round(req.discount_rate, 6),
        "project_years": req.project_years,
        "diesel_is_new": req.diesel_is_new,
        "panel_model": req.panel_model,
        "bracket_model": req.bracket_model,
        "battery_pack_model": req.battery_pack_model,
        "min_bracket_sets": req.min_bracket_sets,
        "max_bracket_sets": req.max_bracket_sets,
        "available_area_m2": None if req.available_area_m2 is None else round(req.available_area_m2, 3),
        "existing_diesel_kw": None if req.existing_diesel_kw is None else round(req.existing_diesel_kw, 3),
        "objective": req.objective,
        "allow_diesel": req.allow_diesel,
        "voltage_level": req.voltage_level,
        "load_type": req.load_type,
        "latitude": None if req.latitude is None else round(req.latitude, 6),
        "longitude": None if req.longitude is None else round(req.longitude, 6),
        "year": req.year,
        "ems_control_method": str(req.ems_control_method or "edge").lower(),
        "ems_addons": sorted(str(item).lower() for item in (req.ems_addons or [])),
        "pv_generation_correction_factor": round(float(simulation_defaults.get("pv_generation_correction_factor", 1.0)), 6),
        "converter_kw_per_pv_kw": round(float(simulation_defaults.get("converter_kw_per_pv_kw", 0.5)), 6),
        "diesel_dispatch_mode": str(simulation_defaults.get("diesel_dispatch_mode", "cc")).lower(),
        "cycle_charging_target_load_pu": round(float(simulation_defaults.get("cycle_charging_target_load_pu", 0.58)), 6),
        "cycle_charging_start_soc_pu": round(float(simulation_defaults.get("cycle_charging_start_soc_pu", 0.55)), 6),
        "diesel_fuel_curve_key": diesel_fuel_curve_key,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Optional[List["OptimizeOption"]]:
    cached = _OPTIMIZE_RESULT_CACHE.get(key)
    if cached is None:
        return None
    return [OptimizeOption(**vars(opt)) for opt in cached]


def _cache_put(key: str, options: List["OptimizeOption"]) -> None:
    _OPTIMIZE_RESULT_CACHE[key] = [OptimizeOption(**vars(opt)) for opt in options]
    _OPTIMIZE_DIAGNOSTICS_CACHE.pop(key, None)
    while len(_OPTIMIZE_RESULT_CACHE) > _OPTIMIZE_RESULT_CACHE_MAX:
        oldest = next(iter(_OPTIMIZE_RESULT_CACHE))
        _OPTIMIZE_RESULT_CACHE.pop(oldest, None)
        _OPTIMIZE_DIAGNOSTICS_CACHE.pop(oldest, None)


def _estimate_peak_load(annual_kwh: float, load_type: str = "commercial") -> float:
    factors = {
        "residential": 2.8,
        "commercial": 2.24,
        "industrial": 1.8,
    }
    factor = factors.get(load_type, 2.24)
    avg_kw = annual_kwh / 8760
    return avg_kw * factor


def _solar_fraction(pv_kw: float, annual_load_kwh: float, peak_sun_hours: float, battery_kwh: float, system_eff: float = 0.78) -> float:
    pv_annual_kwh = pv_kw * peak_sun_hours * 365 * system_eff
    battery_boost = min(0.15, battery_kwh / 100 * 0.03)
    raw_sf = pv_annual_kwh / annual_load_kwh + battery_boost
    return min(0.97, max(0.0, raw_sf))


def _build_capex(
    catalog: ProductCatalog,
    bracket_sets: int,
    num_packs: int,
    diesel_kw: float,
    diesel_is_new: bool,
    panel_model: str,
    battery_pack_model: str,
    voltage_level: Optional[str] = None,
) -> tuple[float, float, float, int, int]:
    panel = catalog.panel(panel_model)
    bracket = catalog.bracket()

    panels_per_set = bracket.panels_per_set
    pv_module_cost = bracket_sets * panels_per_set * panel.watts * panel.price_usd_per_wp

    acc = catalog.accessories()
    mounting_per_set = acc.get("pv_mounting_cost_per_set_usd", 19050)
    pv_mounting_cost = bracket_sets * mounting_per_set

    inverter = catalog.inverter_for_voltage(voltage_level or "120V/240V")
    bp = catalog.battery_pack(battery_pack_model)
    num_inv = max(1, math.ceil(num_packs / inverter.packs_per_inverter))
    inv_cost = num_inv * inverter.price_usd
    bat_cost = num_packs * bp.price_usd
    tray_count = num_inv
    pal_cost = num_packs * acc.get("battery_pallet", {}).get("per_pack_usd", 250)
    storage_cost = inv_cost + bat_cost + pal_cost

    diesel_cost = 0.0
    if diesel_is_new and diesel_kw > 0:
        dg = catalog.diesel_generator(power_kw=diesel_kw)
        diesel_cost = dg.price_usd

    acc = catalog.accessories()
    it = acc.get("intl_transport", {})
    ins = acc.get("installation", {})
    am = acc.get("accessory_materials", {})
    intl_transport = it.get("base_usd", 3000) + bracket_sets * it.get("per_bracket_set_usd", 1950)
    installation = ins.get("base_usd", 1000) + bracket_sets * ins.get("per_bracket_set_usd", 1000)
    accessories = am.get("base_usd", 8500) + bracket_sets * am.get("per_bracket_set_usd", 5000)
    other_initial = acc.get("other_initial_usd", 4200)

    capex = (
        pv_module_cost + pv_mounting_cost + storage_cost + diesel_cost +
        intl_transport + installation + accessories + other_initial
    )

    pass_through = diesel_cost + installation
    selling_price = (capex - pass_through) * 1.20 + pass_through

    return round(capex, 2), round(selling_price, 2), inverter.power_kw, num_inv, tray_count


def _annual_om(bracket_sets: int, num_packs: int) -> float:
    base = 1000 + 200 + 3000
    scale = bracket_sets / 4
    return round(base * max(0.5, scale), 0)


def _diesel_om_annual(diesel_kw: float, run_hours: float) -> float:
    return round(diesel_kw * 0.5 + run_hours * 1.20, 0)


def _npv(capex: float, annual_savings: float, rate: float, years: int) -> float:
    if rate == 0:
        return annual_savings * years - capex
    annuity_factor = (1 - (1 + rate) ** (-years)) / rate
    return round(annual_savings * annuity_factor - capex, 0)


def optimize_with_diagnostics(req: OptimizeInput) -> tuple[List[OptimizeOption], dict]:
    cache_key = _cache_key(req)
    cached = _cache_get(cache_key)
    if cached is not None:
        diagnostics = _OPTIMIZE_DIAGNOSTICS_CACHE.get(cache_key, {
            "cacheHit": True,
            "candidateCount": len(cached),
        }).copy()
        diagnostics["cacheHit"] = True
        return cached, diagnostics

    import numpy as np

    t0 = time.perf_counter()
    stage_seconds: dict[str, float] = {
        "sharedProfiles": 0.0,
        "dieselBaseline": 0.0,
        "prescreen": 0.0,
        "simulation": 0.0,
        "costing": 0.0,
        "economics": 0.0,
        "ranking": 0.0,
    }

    catalog = get_catalog()
    panel = catalog.panel(req.panel_model)
    bracket = catalog.bracket(req.bracket_model)
    bp = catalog.battery_pack(req.battery_pack_model)

    area_per_set = bracket.area_m2
    max_sets_area = req.max_bracket_sets
    if req.available_area_m2 is not None and req.available_area_m2 > 0:
        max_sets_area = max(1, max_systems_for_area(
            available_area_m2=req.available_area_m2,
            bracket_length_m=bracket.footprint_length_m,
            bracket_width_m=bracket.footprint_width_m,
            spacing_m=catalog.bracket_spacing_m(),
        ))
    effective_max_sets = min(req.max_bracket_sets, max_sets_area)

    # ── Compute peak_kw (used for diesel and battery search ranges) ──
    peak_kw = req.peak_load_kw if req.peak_load_kw > 0 else _estimate_peak_load(req.annual_load_kwh, req.load_type)

    # ── Task 3.5: Diesel search range filtering ──────────────────────
    requested_diesel_kw = (
        float(req.diesel_capacity_kw)
        if req.diesel_capacity_kw is not None and req.diesel_capacity_kw > 0
        else None
    )
    if req.allow_diesel is False:
        diesel_candidates: List[float] = [0.0]
        effective_is_new = False
    elif req.existing_diesel_kw is not None:
        diesel_candidates = [float(req.existing_diesel_kw)]
        effective_is_new = False
    elif requested_diesel_kw is not None:
        diesel_candidates = [requested_diesel_kw]
        effective_is_new = req.diesel_is_new
    else:
        # Filter _STANDARD_DIESEL_KW to range [0.5*peak_kw, 3.0*peak_kw]
        diesel_candidates = [
            float(kw) for kw in _STANDARD_DIESEL_KW
            if 0.5 * peak_kw <= kw <= 3.0 * peak_kw
        ]
        # Always include the nearest size to peak_kw as a guaranteed candidate
        nearest = min(_STANDARD_DIESEL_KW, key=lambda kw: abs(kw - peak_kw))
        if float(nearest) not in diesel_candidates:
            diesel_candidates.append(float(nearest))
        diesel_candidates = sorted(set(diesel_candidates))
        # Ensure at least one candidate
        if not diesel_candidates:
            diesel_candidates = [float(_nearest_diesel(peak_kw * 1.2))]
        effective_is_new = req.diesel_is_new

    # For diesel baseline simulation, use the largest diesel candidate
    diesel_kw_baseline = max(diesel_candidates) if diesel_candidates[0] > 0 else 0.0

    # ── Task 3.6: Battery search range calculation ───────────────────
    daily_load_kwh = req.annual_load_kwh / 365 if req.annual_load_kwh > 0 else 0.0
    min_packs = max(1, math.ceil(peak_kw * 1.0 / bp.capacity_kwh))
    max_packs = max(min_packs, math.ceil(daily_load_kwh * req.storage_days / (bp.capacity_kwh * 0.9)))
    # Generate ~8 evenly-spaced integer pack counts
    if max_packs <= min_packs:
        battery_candidates = [min_packs]
    else:
        battery_candidates = sorted(set(
            [int(round(x)) for x in np.linspace(min_packs, max_packs, 8)]
        ))

    # ── Task 3.1: Build multi-dimensional candidate grid (PV x Battery x Diesel) ──
    candidate_sets = list(range(req.min_bracket_sets, effective_max_sets + 1))

    # Legacy _candidate_size kept for backward compatibility (not used in main loop)
    def _candidate_size(sets: int) -> tuple[float, int, float]:
        pv_kw = sets * bracket.panels_per_set * panel.kw
        _daily_load_kwh = req.annual_load_kwh / 365 if req.annual_load_kwh > 0 else 0.0
        autonomy_factor = 0.5 if diesel_kw_baseline > 0 else 1.0
        target_kwh = max(
            pv_kw * 3 * req.storage_days,
            _daily_load_kwh * autonomy_factor * req.storage_days / 0.9,
        )
        num_packs_legacy = max(1, math.ceil(target_kwh / bp.capacity_kwh))
        battery_kwh = num_packs_legacy * bp.capacity_kwh
        return pv_kw, num_packs_legacy, battery_kwh

    options: List[OptimizeOption] = []

    # ── Pre-generate shared data (all candidates share load and PV curves) ──
    use_pypsa = (req.latitude is not None and req.longitude is not None
                 and req.year is not None)
    _shared_load = None
    _shared_pv_cf = None
    if use_pypsa:
        stage_start = time.perf_counter()
        from app.services.microgrid_simulator import generate_load_profile, generate_pv_profile
        simulation_defaults = catalog.simulation_defaults()
        pv_generation_correction_factor = float(simulation_defaults.get("pv_generation_correction_factor", 1.0))
        _shared_load = generate_load_profile(
            annual_consumption_kwh=req.annual_load_kwh,
            load_type=req.load_type,
            year=req.year,
        )
        _shared_pv_cf = generate_pv_profile(
            latitude=req.latitude, longitude=req.longitude,
            year=req.year, panel_capacity_kw=1.0,
            generation_correction_factor=pv_generation_correction_factor,
        )
        stage_seconds["sharedProfiles"] += time.perf_counter() - stage_start

    diesel_only_raw = None
    diesel_only_liters = None
    if use_pypsa:
        stage_start = time.perf_counter()
        from app.services.microgrid_simulator import DieselOnlySimulator
        diesel_only_kw = diesel_kw_baseline if diesel_kw_baseline > 0 else 20.0
        diesel_only_sim = DieselOnlySimulator(
            diesel_capacity_kw=diesel_only_kw,
            load_profile=_shared_load,
            diesel_kwh_per_liter=req.fuel_efficiency_kwh_per_l,
            verbose=False,
        )
        diesel_only_sim.build_network()
        diesel_only_raw = diesel_only_sim.run_simulation(solver_name="highs")
        diesel_only_liters = int(round(diesel_only_raw["diesel_liters_per_year"], 0))
        stage_seconds["dieselBaseline"] += time.perf_counter() - stage_start

    def _inverter_sizing(pv_kw: float, num_packs: int) -> tuple[float, int, float, int]:
        inverter = catalog.inverter_for_voltage(req.voltage_level or "120V/240V")
        packs_per_inverter = max(1, int(getattr(inverter, "packs_per_inverter", 6)))
        pack_based = math.ceil(num_packs / packs_per_inverter)
        converter_kw_per_pv_kw = float(catalog.simulation_defaults().get("converter_kw_per_pv_kw", 0.5))
        target_converter_kw = max(0.0, pv_kw * converter_kw_per_pv_kw)
        pv_ratio_based = math.ceil(target_converter_kw / max(float(inverter.power_kw), 1e-6))
        inverter_count = max(1, pack_based, pv_ratio_based)
        total_inverter_kw = inverter_count * float(inverter.power_kw)
        tray_cnt = tray_count_for_inverters(inverter_count)
        return float(inverter.power_kw), inverter_count, total_inverter_kw, tray_cnt

    def _quick_simulation(pv_kw: float, battery_kwh: float, cand_diesel_kw: float) -> dict:
        return quick_estimate(
            pv_kw,
            cand_diesel_kw,
            cand_diesel_kw,
            battery_kwh,
            req.annual_load_kwh,
            req.fuel_efficiency_kwh_per_l,
        )

    def _pypsa_simulation(pv_kw: float, battery_kwh: float, cand_diesel_kw: float) -> dict:
        from app.services.microgrid_simulator import OffGridMicrogridSimulator
        from app.services.simulator import build_diesel_spec, normalize_diesel_dispatch_mode, _run_homer_style_dispatch
        from app.services.solution_pipeline import DieselFuelModel

        pv_profile = _shared_pv_cf
        simulation_defaults = catalog.simulation_defaults()
        predictive_dispatch = (
            str(req.ems_control_method or "").lower() == "prediction"
            or "prediction" in {str(item).lower() for item in (req.ems_addons or [])}
        )
        dispatch_mode = normalize_diesel_dispatch_mode(
            "lp" if predictive_dispatch else simulation_defaults.get("diesel_dispatch_mode", "cc")
        )
        cycle_charging_target_load_pu = float(simulation_defaults.get("cycle_charging_target_load_pu", 0.58))
        cycle_charging_start_soc_pu = float(simulation_defaults.get("cycle_charging_start_soc_pu", 0.55))
        dg = catalog.diesel_generator(power_kw=cand_diesel_kw) if cand_diesel_kw > 0 else None
        diesel_fuel_intercept_coeff = float(getattr(dg, "fuel_intercept_coeff", 0.033))
        diesel_fuel_slope_coeff = float(getattr(dg, "fuel_slope_coeff", 0.273))
        num_packs_sim = max(1, math.ceil(battery_kwh / max(bp.capacity_kwh, 1e-6)))
        _, _, bat_power_kw, _ = _inverter_sizing(pv_kw, num_packs_sim)
        sim = OffGridMicrogridSimulator(
            pv_capacity_kw=pv_kw,
            battery_capacity_kwh=battery_kwh,
            battery_power_kw=bat_power_kw,
            diesel_capacity_kw=cand_diesel_kw,
            load_profile=_shared_load,
            pv_profile=pv_profile,
            diesel_fuel_cost=req.diesel_price_usd_per_liter / max(req.fuel_efficiency_kwh_per_l, 1e-6),
            diesel_committable=False,
            verbose=False,
        )
        sim.build_network()
        mg_results = sim.run_simulation(solver_name="highs")

        if cand_diesel_kw > 0:
            microgrid_spec = build_diesel_spec(
                cand_diesel_kw,
                req.fuel_efficiency_kwh_per_l,
                intercept_coeff=diesel_fuel_intercept_coeff,
                slope_coeff=diesel_fuel_slope_coeff,
            )
            diesel_series = mg_results.get("_diesel_series", _shared_load * 0.0)
            diesel_status = mg_results.get("_diesel_status_series", diesel_series.gt(max(0.01, microgrid_spec.capacity_kw * 0.01)).astype(float))
            if diesel_status.empty or diesel_status.sum() <= 0:
                diesel_status = diesel_series.gt(max(0.01, microgrid_spec.capacity_kw * 0.01)).astype(float)
            diesel_status = diesel_status.fillna(0.0).clip(lower=0.0)
            effective_diesel_series = diesel_series.where(
                diesel_status <= 0.5,
                diesel_series.clip(lower=microgrid_spec.min_load_kw),
            )
            mg_diesel_liters = round(DieselFuelModel.annual_fuel_L(effective_diesel_series, microgrid_spec), 0)
            mg_diesel_hours = int((diesel_status > 0.5).sum())
        else:
            mg_diesel_liters = 0
            mg_diesel_hours = 0
            mg_diesel_kwh = 0.0
            mg_battery_discharge_kwh = float(mg_results["annual_battery_discharge_kwh"])

        if dispatch_mode == "cc" and cand_diesel_kw > 0:
            cc_dispatch = _run_homer_style_dispatch(
                mode="cc",
                pv_kw=pv_kw,
                battery_kwh=battery_kwh,
                battery_power_kw=bat_power_kw,
                diesel_kw=cand_diesel_kw,
                load_profile=_shared_load,
                pv_profile=pv_profile,
                diesel_eff=req.fuel_efficiency_kwh_per_l,
                battery_reserve_soc_pu=0.25,
                cycle_charging_target_load_pu=cycle_charging_target_load_pu,
                cycle_charging_start_soc_pu=cycle_charging_start_soc_pu,
                diesel_fuel_intercept_coeff=diesel_fuel_intercept_coeff,
                diesel_fuel_slope_coeff=diesel_fuel_slope_coeff,
            )
            mg_diesel_liters = int(cc_dispatch["diesel_liters"])
            mg_diesel_hours = int(cc_dispatch["diesel_hours"])
            mg_diesel_kwh = float(cc_dispatch["diesel_kwh"])
            mg_battery_discharge_kwh = float(cc_dispatch["battery_discharge_kwh"])
        else:
            mg_diesel_kwh = float(mg_results["annual_diesel_kwh"])
            mg_battery_discharge_kwh = float(mg_results["annual_battery_discharge_kwh"])

        return {
            "solar_fraction": round(mg_results["solar_fraction"], 1),
            "loss_of_load_pct": round(mg_results["loss_of_load_rate"], 3),
            "curtailment_pct": round(mg_results["curtailment_rate"], 1),
            "mg_diesel_liters": int(mg_diesel_liters),
            "mg_diesel_hours": mg_diesel_hours,
            "diesel_only_liters": diesel_only_liters,
            "diesel_run_hours_a": int(diesel_only_raw["diesel_run_hours"]),
            "annual_fuel_saving_liters": int(diesel_only_liters - mg_diesel_liters),
            "annual_diesel_kwh": round(float(mg_diesel_kwh), 1),
            "annual_battery_discharge_kwh": round(float(mg_battery_discharge_kwh), 1),
            "annual_load_kwh": round(float(mg_results["annual_load_kwh"]), 1),
            "annual_load_shed_kwh": round(float(mg_results["annual_load_shed_kwh"]), 1),
            "annual_diesel_hours": mg_diesel_hours,
            "annual_diesel_start_count": 0,
            "diesel_dispatch_mode": dispatch_mode,
            "diesel_only_annual_load_kwh": round(float(diesel_only_raw["annual_load_kwh"]), 1),
            "diesel_only_annual_load_shed_kwh": round(float(diesel_only_raw["annual_load_shed_kwh"]), 1),
            "solar_diesel_analysis": None,
        }

    # ── Task 3.4: _evaluate_candidate accepts (pv_sets, num_packs, cand_diesel_kw) ──
    def _evaluate_candidate(sets: int, num_packs_cand: int, cand_diesel_kw: float, sim_r: dict) -> OptimizeOption:
        pv_kw = sets * bracket.panels_per_set * panel.kw
        battery_kwh = num_packs_cand * bp.capacity_kwh
        sf_pct = round(float(sim_r["solar_fraction"]), 1)
        annual_diesel_kwh = float(sim_r["annual_diesel_kwh"])
        annual_diesel_liters = float(sim_r["mg_diesel_liters"])
        annual_diesel_cost = annual_diesel_liters * req.diesel_price_usd_per_liter
        diesel_run_hours = float(sim_r["annual_diesel_hours"])
        inverter_kw_val, inverter_count, total_inverter_kw, tray_cnt = _inverter_sizing(pv_kw, num_packs_cand)

        # Get dg_price for this specific diesel size
        cand_dg_price = catalog.diesel_generator(power_kw=max(cand_diesel_kw, 20.0)).price_usd if cand_diesel_kw > 0 else 0.0

        stage_start = time.perf_counter()
        cost_breakdown = build_template_cost_breakdown(
            system_config={
                "bracketSets": sets,
                "panelModel": req.panel_model,
                "bracketModel": req.bracket_model,
                "batteryModel": req.battery_pack_model,
                "batteryPackCount": num_packs_cand,
                "batteryPackKwh": bp.capacity_kwh,
                "batteryCapacityKwh": battery_kwh,
                "dieselCapacityKw": cand_diesel_kw,
                "dieselModel": f"DG-{cand_diesel_kw:.0f}kW" if cand_diesel_kw > 0 else "",
                "inverterKw": inverter_kw_val,
                "inverterCount": inverter_count,
                "totalInverterKw": total_inverter_kw,
                "trayCount": tray_cnt,
                "pvCapacityKw": pv_kw,
                "panelsPerSet": bracket.panels_per_set,
                "panelWatts": panel.watts,
                "voltageLevel": req.voltage_level or "120V/240V",
                "emsControlMethod": req.ems_control_method,
                "emsAddons": req.ems_addons or [],
            },
            simulation={
                "mgDieselHours": diesel_run_hours,
                "dieselRunHoursA": 8760 if cand_diesel_kw > 0 else 0,
            },
            catalog=catalog,
            diesel_is_new=effective_is_new,
        )
        stage_seconds["costing"] += time.perf_counter() - stage_start

        proj = ProjectParameters(
            project_name=f"Optimization candidate {sets} sets",
            analysis_years=req.project_years,
            annual_load_kwh=float(req.annual_load_kwh),
            diesel_price_per_liter=req.diesel_price_usd_per_liter,
            microgrid_diesel_liters=float(sim_r["mg_diesel_liters"]),
            dieselonly_diesel_liters=float(sim_r["diesel_only_liters"]),
        )
        stage_start = time.perf_counter()
        econ_report = generate_homer_economic_report(
            project=proj,
            capex=cost_breakdown.capex,
            breakdown=cost_breakdown,
            microgrid_simulation={
                "annual_load_kwh": sim_r["annual_load_kwh"],
                "annual_load_shed_kwh": sim_r["annual_load_shed_kwh"],
                "annual_battery_discharge_kwh": sim_r["annual_battery_discharge_kwh"],
                "annual_diesel_hours": sim_r["annual_diesel_hours"],
            },
            diesel_only_simulation={
                "annual_load_kwh": sim_r["diesel_only_annual_load_kwh"],
                "annual_load_shed_kwh": sim_r["diesel_only_annual_load_shed_kwh"],
                "annual_diesel_hours": sim_r["diesel_run_hours_a"],
            },
            battery_pack_count=num_packs_cand,
            battery_pack_kwh=bp.capacity_kwh,
            battery_cycle_life=bp.cycle_life,
            microgrid_generator_capital_cost=float(cost_breakdown.capex.diesel_generator_cost),
            microgrid_generator_replacement_cost=float(cand_dg_price) if cand_diesel_kw > 0 else 0.0,
            diesel_only_generator_capital_cost=float(cand_dg_price) if effective_is_new else 0.0,
            diesel_only_generator_replacement_cost=float(cand_dg_price),
        )
        stage_seconds["economics"] += time.perf_counter() - stage_start
        econ_summary = econ_report["summary"]

        annual_om_total = cost_breakdown.annual_fixed_opex_total_usd
        annual_diesel_only_cost = float(econ_summary["diesel_only_operating_cost_usd"])
        annual_savings = annual_diesel_only_cost - float(econ_summary["microgrid_operating_cost_usd"])
        capex_val = cost_breakdown.capex.equipment_subtotal
        selling_price = cost_breakdown.capex.selling_price

        payback = float(econ_summary["breakeven_year"]) if econ_summary.get("breakeven_year") else 99.0
        npv = float(econ_summary["npc_savings_usd"])
        lcoe_mg = float(econ_summary["final_mg_lcoe"])
        lcoe_diesel_only = float(econ_summary["final_diesel_lcoe"])
        loss_of_load_pct = round(float(sim_r["loss_of_load_pct"]), 3)
        is_reliability_risk = loss_of_load_pct > _MAX_RECOMMENDED_LOSS_OF_LOAD_PCT
        reliability_note = "容量不足/存在缺供风险" if is_reliability_risk else ""

        # ── Task 3.3: NPC-based ranking (no solar fraction threshold) ──
        # Use microgrid_npc_usd from economic report as score.
        # score = -npc so that lower NPC = higher score (sort reverse=True)
        npc = float(econ_summary.get("microgrid_npc_usd", lcoe_mg * req.annual_load_kwh * req.project_years))
        score = -npc

        return OptimizeOption(
            bracket_sets=sets,
            pv_kw=round(pv_kw, 2),
            battery_kwh=round(battery_kwh, 1),
            num_packs=num_packs_cand,
            diesel_kw=cand_diesel_kw,
            solar_fraction_pct=sf_pct,
            annual_diesel_kwh=round(annual_diesel_kwh, 0),
            annual_diesel_liters=round(annual_diesel_liters, 0),
            annual_diesel_only_liters=round(float(sim_r["diesel_only_liters"]), 0),
            capex_usd=capex_val,
            selling_price_usd=selling_price,
            annual_diesel_cost_usd=round(annual_diesel_cost, 0),
            annual_diesel_only_cost_usd=round(annual_diesel_only_cost, 0),
            annual_om_cost_usd=round(annual_om_total, 0),
            annual_savings_usd=round(annual_savings, 0),
            payback_years=payback,
            npv_10yr_usd=round(npv, 0),
            lcoe_microgrid_usd_per_kwh=lcoe_mg,
            lcoe_diesel_only_usd_per_kwh=lcoe_diesel_only,
            score=score,
            diesel_is_new=effective_is_new,
            loss_of_load_pct=loss_of_load_pct,
            is_reliability_risk=is_reliability_risk,
            reliability_note=reliability_note,
            curtailment_pct=round(float(sim_r.get("curtailment_pct", 0.0)), 2),
            inverter_kw=inverter_kw_val,
            inverter_count=inverter_count,
            tray_count=tray_cnt,
            site_area_required_m2=round(sets * area_per_set, 1),
        )

    # ── Task 3.2: Prescreen stage with analytical NPC estimate ──────────
    # Build the full 3D candidate grid
    candidate_grid: list[tuple[int, int, float]] = []
    for sets in candidate_sets:
        for num_p in battery_candidates:
            for d_kw in diesel_candidates:
                candidate_grid.append((sets, num_p, d_kw))

    _PRESCREEN_TOP_N = 20

    # Analytical NPC estimate for prescreen
    prescreen_start = time.perf_counter()
    system_eff = 0.78
    annuity_factor = (1 - (1 + req.discount_rate) ** (-req.project_years)) / req.discount_rate if req.discount_rate > 0 else float(req.project_years)
    annual_load = req.annual_load_kwh

    prescreen_scores: list[tuple[float, int, int, float]] = []
    for (sets, num_p, d_kw) in candidate_grid:
        pv_kw = sets * bracket.panels_per_set * panel.kw
        battery_kwh = num_p * bp.capacity_kwh
        # Estimate solar generation
        solar_gen = pv_kw * req.peak_sun_hours * 365 * system_eff
        # Estimate diesel consumption
        diesel_needed_kwh = max(0.0, annual_load - solar_gen)
        diesel_liters_est = diesel_needed_kwh / max(req.fuel_efficiency_kwh_per_l, 1e-6) if d_kw > 0 else 0.0
        # Estimate capex (simplified using _build_capex)
        try:
            capex_est, _, _, _, _ = _build_capex(
                catalog, sets, num_p, d_kw, effective_is_new,
                req.panel_model, req.battery_pack_model, req.voltage_level,
            )
        except Exception:
            capex_est = 50000.0 + sets * 20000 + num_p * bp.price_usd
        # Estimate 25yr fuel cost (PV of fuel)
        annual_fuel_cost = diesel_liters_est * req.diesel_price_usd_per_liter
        pv_fuel = annual_fuel_cost * annuity_factor
        # Estimate O&M
        annual_om_est = _annual_om(sets, num_p)
        pv_om = annual_om_est * annuity_factor
        # Simplified NPC = capex + PV(fuel) + PV(O&M)
        npc_est = capex_est + pv_fuel + pv_om
        prescreen_scores.append((npc_est, sets, num_p, d_kw))

    # Rank by NPC ascending, select top-N for full simulation
    prescreen_scores.sort(key=lambda x: x[0])
    top_candidates = prescreen_scores[:_PRESCREEN_TOP_N]
    stage_seconds["prescreen"] += time.perf_counter() - prescreen_start

    # ── Run full simulation for top-N candidates ─────────────────────
    for (_, sets, num_p, d_kw) in top_candidates:
        pv_kw = sets * bracket.panels_per_set * panel.kw
        battery_kwh = num_p * bp.capacity_kwh
        if use_pypsa:
            stage_start = time.perf_counter()
            sim_r = _pypsa_simulation(pv_kw, battery_kwh, d_kw)
            stage_seconds["simulation"] += time.perf_counter() - stage_start
        else:
            stage_start = time.perf_counter()
            sim_r = _quick_simulation(pv_kw, battery_kwh, d_kw)
            stage_seconds["simulation"] += time.perf_counter() - stage_start
        options.append(_evaluate_candidate(sets, num_p, d_kw, sim_r))

    # ── Task 3.3: NPC-based ranking and labeling ─────────────────────
    stage_start = time.perf_counter()
    options.sort(key=lambda o: o.score, reverse=True)

    # Label top 3 by NPC (no solar fraction threshold elimination)
    for i, opt in enumerate(options):
        if i == 0:
            opt.is_recommended = True
            opt.label = '方案1 NPC最优'
        elif i == 1:
            opt.is_runner_up = True
            opt.label = '方案2 次优'
        elif i == 2:
            opt.is_third = True
            opt.label = '方案3 备选'
        else:
            opt.label = f'{opt.bracket_sets}套 {opt.diesel_kw:.0f}kW柴发 {opt.num_packs}组电池'

    # Flag reliability risks but do NOT eliminate
    for opt in options:
        if opt.is_reliability_risk:
            opt.reliability_note = opt.reliability_note or '容量不足/存在缺供风险'

    final_options = options
    stage_seconds["ranking"] += time.perf_counter() - stage_start
    _cache_put(cache_key, final_options)
    total_seconds = time.perf_counter() - t0

    # ── Task 3.7: Update diagnostics and caching ─────────────────────
    diagnostics = {
        "cacheHit": False,
        "candidateCount": len(final_options),
        "candidateGridSize": len(candidate_grid),
        "prescreenTopN": _PRESCREEN_TOP_N,
        "dieselCandidates": diesel_candidates,
        "batteryCandidates": battery_candidates,
        "refinedCandidateCount": len(top_candidates),
        "refinedBracketSets": sorted(set(t[1] for t in top_candidates)),
        "twoStagePrescreen": True,
        "timingSeconds": {k: round(v, 3) for k, v in stage_seconds.items()},
        "totalSeconds": round(total_seconds, 3),
        "usePypsa": use_pypsa,
    }
    _OPTIMIZE_DIAGNOSTICS_CACHE[cache_key] = diagnostics.copy()
    logger.info("Optimize timing: %s", diagnostics)
    return final_options, diagnostics


def optimize(req: OptimizeInput) -> List[OptimizeOption]:
    results, _ = optimize_with_diagnostics(req)
    return results
