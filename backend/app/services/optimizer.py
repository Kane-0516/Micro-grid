"""微电网容量自动优化模块.

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

import numpy as np

from app.core.catalog import get_catalog
from app.services.config_loader import ProductCatalog
from app.services.economic_analysis import ProjectParameters
from app.services.homer_economic_model import generate_homer_economic_report
from app.services.layout_optimizer import max_systems_for_area
from app.services.simulator import quick_estimate
from app.services.site_rules import tray_count_for_inverters
from app.services.template_cost_engine import (
    build_template_cost_breakdown,
)


@dataclass
class OptimizeInput:
    """Input parameters for the capacity optimizer."""

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
    """One candidate system configuration ranked by the optimizer."""

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
    reliability_note: str = ""
    curtailment_pct: float = 0.0
    inverter_kw: Optional[float] = None
    inverter_count: Optional[int] = None
    tray_count: Optional[int] = None
    site_area_required_m2: Optional[float] = None


_STANDARD_DIESEL_KW = [
    10,
    15,
    20,
    30,
    40,
    50,
    60,
    80,
    100,
    120,
    150,
    200,
    250,
    300,
    400,
    500,
]
_OPTIMIZE_RESULT_CACHE: dict[str, List["OptimizeOption"]] = {}
_OPTIMIZE_DIAGNOSTICS_CACHE: dict[str, dict] = {}
_OPTIMIZE_RESULT_CACHE_MAX = 32
_MAX_RECOMMENDED_LOSS_OF_LOAD_PCT = 0.01
_PYPSA_REFINE_MAX_CANDIDATES = 10
_PYPSA_REFINE_SEED_CANDIDATES = 6
_DEFAULT_VOLTAGE_LEVEL = "120V/240V"
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
        "available_area_m2": None
        if req.available_area_m2 is None
        else round(req.available_area_m2, 3),
        "existing_diesel_kw": None
        if req.existing_diesel_kw is None
        else round(req.existing_diesel_kw, 3),
        "objective": req.objective,
        "allow_diesel": req.allow_diesel,
        "voltage_level": req.voltage_level,
        "load_type": req.load_type,
        "latitude": None if req.latitude is None else round(req.latitude, 6),
        "longitude": None if req.longitude is None else round(req.longitude, 6),
        "year": req.year,
        "ems_control_method": str(req.ems_control_method or "edge").lower(),
        "ems_addons": sorted(
            str(item).lower() for item in (req.ems_addons or [])
        ),
        "pv_generation_correction_factor": round(
            float(
                simulation_defaults.get("pv_generation_correction_factor", 1.0)
            ),
            6,
        ),
        "converter_kw_per_pv_kw": round(
            float(simulation_defaults.get("converter_kw_per_pv_kw", 0.5)), 6
        ),
        "diesel_dispatch_mode": str(
            simulation_defaults.get("diesel_dispatch_mode", "cc")
        ).lower(),
        "cycle_charging_target_load_pu": round(
            float(
                simulation_defaults.get("cycle_charging_target_load_pu", 0.58)
            ),
            6,
        ),
        "cycle_charging_start_soc_pu": round(
            float(simulation_defaults.get("cycle_charging_start_soc_pu", 0.55)),
            6,
        ),
        "diesel_fuel_curve_key": diesel_fuel_curve_key,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _cache_get(key: str) -> Optional[List["OptimizeOption"]]:
    cached = _OPTIMIZE_RESULT_CACHE.get(key)
    if cached is None:
        return None
    return [OptimizeOption(**vars(opt)) for opt in cached]


def _cache_put(key: str, options: List["OptimizeOption"]) -> None:
    _OPTIMIZE_RESULT_CACHE[key] = [
        OptimizeOption(**vars(opt)) for opt in options
    ]
    _OPTIMIZE_DIAGNOSTICS_CACHE.pop(key, None)
    while len(_OPTIMIZE_RESULT_CACHE) > _OPTIMIZE_RESULT_CACHE_MAX:
        oldest = next(iter(_OPTIMIZE_RESULT_CACHE))
        _OPTIMIZE_RESULT_CACHE.pop(oldest, None)
        _OPTIMIZE_DIAGNOSTICS_CACHE.pop(oldest, None)


def _estimate_peak_load(
    annual_kwh: float, load_type: str = "commercial"
) -> float:
    factors = {
        "residential": 2.8,
        "commercial": 2.24,
        "industrial": 1.8,
    }
    factor = factors.get(load_type, 2.24)
    avg_kw = annual_kwh / 8760
    return avg_kw * factor


def _solar_fraction(
    pv_kw: float,
    annual_load_kwh: float,
    peak_sun_hours: float,
    battery_kwh: float,
    system_eff: float = 0.78,
) -> float:
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
    pv_module_cost = (
        bracket_sets * panels_per_set * panel.watts * panel.price_usd_per_wp
    )

    acc = catalog.accessories()
    mounting_per_set = acc.get("pv_mounting_cost_per_set_usd", 19050)
    pv_mounting_cost = bracket_sets * mounting_per_set

    inverter = catalog.inverter_for_voltage(
        voltage_level or _DEFAULT_VOLTAGE_LEVEL
    )
    bp = catalog.battery_pack(battery_pack_model)
    num_inv = max(1, math.ceil(num_packs / inverter.packs_per_inverter))
    inv_cost = num_inv * inverter.price_usd
    bat_cost = num_packs * bp.price_usd
    tray_count = num_inv
    pal_cost = num_packs * acc.get("battery_pallet", {}).get(
        "per_pack_usd", 250
    )
    storage_cost = inv_cost + bat_cost + pal_cost

    diesel_cost = 0.0
    if diesel_is_new and diesel_kw > 0:
        dg = catalog.diesel_generator(power_kw=diesel_kw)
        diesel_cost = dg.price_usd

    acc = catalog.accessories()
    it = acc.get("intl_transport", {})
    ins = acc.get("installation", {})
    am = acc.get("accessory_materials", {})
    intl_transport = it.get("base_usd", 3000) + bracket_sets * it.get(
        "per_bracket_set_usd", 1950
    )
    installation = ins.get("base_usd", 1000) + bracket_sets * ins.get(
        "per_bracket_set_usd", 1000
    )
    accessories = am.get("base_usd", 8500) + bracket_sets * am.get(
        "per_bracket_set_usd", 5000
    )
    other_initial = acc.get("other_initial_usd", 4200)

    capex = (
        pv_module_cost
        + pv_mounting_cost
        + storage_cost
        + diesel_cost
        + intl_transport
        + installation
        + accessories
        + other_initial
    )

    pass_through = diesel_cost + installation
    selling_price = (capex - pass_through) * 1.20 + pass_through

    return (
        round(capex, 2),
        round(selling_price, 2),
        inverter.power_kw,
        num_inv,
        tray_count,
    )


def _annual_om(bracket_sets: int) -> float:
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


def _resolve_diesel_candidates(
    req: OptimizeInput,
    peak_kw: float,
) -> tuple[List[float], bool]:
    requested_kw = (
        float(req.diesel_capacity_kw)
        if req.diesel_capacity_kw is not None and req.diesel_capacity_kw > 0
        else None
    )
    if req.allow_diesel is False:
        return [0.0], False
    if req.existing_diesel_kw is not None:
        return [float(req.existing_diesel_kw)], False
    if requested_kw is not None:
        return [requested_kw], req.diesel_is_new

    candidates = [
        float(kw)
        for kw in _STANDARD_DIESEL_KW
        if 0.5 * peak_kw <= kw <= 3.0 * peak_kw
    ]
    nearest = min(_STANDARD_DIESEL_KW, key=lambda kw: abs(kw - peak_kw))
    candidates.append(float(nearest))
    candidates = sorted(set(candidates))
    if not candidates:
        candidates = [float(_nearest_diesel(peak_kw * 1.2))]
    return candidates, req.diesel_is_new


def _resolve_battery_candidates(
    req: OptimizeInput,
    peak_kw: float,
    pack_capacity_kwh: float,
) -> list[int]:
    daily_load_kwh = (
        req.annual_load_kwh / 365 if req.annual_load_kwh > 0 else 0.0
    )
    min_packs = max(1, math.ceil(peak_kw / pack_capacity_kwh))
    max_packs = max(
        min_packs,
        math.ceil(
            daily_load_kwh * req.storage_days / (pack_capacity_kwh * 0.9)
        ),
    )
    if max_packs <= min_packs:
        return [min_packs]
    return sorted(
        {int(round(value)) for value in np.linspace(min_packs, max_packs, 8)}
    )


def _build_candidate_grid(
    candidate_sets: list[int],
    battery_candidates: list[int],
    diesel_candidates: List[float],
) -> list[tuple[int, int, float]]:
    return [
        (sets, packs, diesel_kw)
        for sets in candidate_sets
        for packs in battery_candidates
        for diesel_kw in diesel_candidates
    ]


def _label_ranked_options(options: List[OptimizeOption]) -> None:
    labels = ("方案1 NPC最优", "方案2 次优", "方案3 备选")
    for index, option in enumerate(options):
        if index < len(labels):
            option.label = labels[index]
            option.is_recommended = index == 0
            option.is_runner_up = index == 1
            option.is_third = index == 2
        else:
            option.label = (
                f"{option.bracket_sets}套 {option.diesel_kw:.0f}kW柴发 "
                f"{option.num_packs}组电池"
            )
        if option.is_reliability_risk:
            option.reliability_note = (
                option.reliability_note or "容量不足/存在缺供风险"
            )


def _prescreen_candidates(
    req: OptimizeInput,
    catalog: ProductCatalog,
    panel,
    bracket,
    battery_pack,
    effective_is_new: bool,
    candidate_grid: list[tuple[int, int, float]],
    top_n: int,
) -> list[tuple[float, int, int, float]]:
    system_eff = 0.78
    annuity_factor = (
        (1 - (1 + req.discount_rate) ** (-req.project_years))
        / req.discount_rate
        if req.discount_rate > 0
        else float(req.project_years)
    )
    scores: list[tuple[float, int, int, float]] = []
    for sets, num_packs, diesel_kw in candidate_grid:
        pv_kw = sets * bracket.panels_per_set * panel.kw
        solar_generation = pv_kw * req.peak_sun_hours * 365 * system_eff
        diesel_needed_kwh = max(0.0, req.annual_load_kwh - solar_generation)
        diesel_liters = (
            diesel_needed_kwh / max(req.fuel_efficiency_kwh_per_l, 1e-6)
            if diesel_kw > 0
            else 0.0
        )
        try:
            capex, _, _, _, _ = _build_capex(
                catalog,
                sets,
                num_packs,
                diesel_kw,
                effective_is_new,
                req.panel_model,
                req.battery_pack_model,
                req.voltage_level,
            )
        except Exception:
            capex = 50000.0 + sets * 20000 + num_packs * battery_pack.price_usd
        annual_fuel_cost = diesel_liters * req.diesel_price_usd_per_liter
        annual_om = _annual_om(sets)
        npc = capex + (annual_fuel_cost + annual_om) * annuity_factor
        scores.append((npc, sets, num_packs, diesel_kw))
    scores.sort(key=lambda item: item[0])
    return scores[:top_n]


def _evaluate_candidate(
    context: dict,
    sets: int,
    num_packs: int,
    diesel_kw: float,
    simulation: dict,
) -> OptimizeOption:
    req = context["req"]
    catalog = context["catalog"]
    panel = context["panel"]
    bracket = context["bracket"]
    battery_pack = context["battery_pack"]
    inverter_sizing = context["inverter_sizing"]
    stage_seconds = context["stage_seconds"]
    effective_is_new = context["effective_is_new"]

    pv_kw = sets * bracket.panels_per_set * panel.kw
    battery_kwh = num_packs * battery_pack.capacity_kwh
    inverter_kw, inverter_count, total_inverter_kw, tray_count = (
        inverter_sizing(pv_kw, num_packs)
    )
    generator_price = 0.0
    if diesel_kw > 0:
        generator_price = catalog.diesel_generator(
            power_kw=max(diesel_kw, 20.0)
        ).price_usd

    stage_start = time.perf_counter()
    cost_breakdown = build_template_cost_breakdown(
        system_config={
            "bracketSets": sets,
            "panelModel": req.panel_model,
            "bracketModel": req.bracket_model,
            "batteryModel": req.battery_pack_model,
            "batteryPackCount": num_packs,
            "batteryPackKwh": battery_pack.capacity_kwh,
            "batteryCapacityKwh": battery_kwh,
            "dieselCapacityKw": diesel_kw,
            "dieselModel": f"DG-{diesel_kw:.0f}kW" if diesel_kw > 0 else "",
            "inverterKw": inverter_kw,
            "inverterCount": inverter_count,
            "totalInverterKw": total_inverter_kw,
            "trayCount": tray_count,
            "pvCapacityKw": pv_kw,
            "panelsPerSet": bracket.panels_per_set,
            "panelWatts": panel.watts,
            "voltageLevel": req.voltage_level or _DEFAULT_VOLTAGE_LEVEL,
            "emsControlMethod": req.ems_control_method,
            "emsAddons": req.ems_addons or [],
        },
        simulation={
            "mgDieselHours": float(simulation["annual_diesel_hours"]),
            "dieselRunHoursA": 8760 if diesel_kw > 0 else 0,
        },
        catalog=catalog,
        diesel_is_new=effective_is_new,
    )
    stage_seconds["costing"] += time.perf_counter() - stage_start

    project = ProjectParameters(
        project_name=f"Optimization candidate {sets} sets",
        analysis_years=req.project_years,
        annual_load_kwh=float(req.annual_load_kwh),
        diesel_price_per_liter=req.diesel_price_usd_per_liter,
        microgrid_diesel_liters=float(simulation["mg_diesel_liters"]),
        dieselonly_diesel_liters=float(simulation["diesel_only_liters"]),
    )
    stage_start = time.perf_counter()
    economic_report = generate_homer_economic_report(
        project=project,
        capex=cost_breakdown.capex,
        breakdown=cost_breakdown,
        microgrid_simulation={
            "annual_load_kwh": simulation["annual_load_kwh"],
            "annual_load_shed_kwh": simulation["annual_load_shed_kwh"],
            "annual_battery_discharge_kwh": simulation[
                "annual_battery_discharge_kwh"
            ],
            "annual_diesel_hours": simulation["annual_diesel_hours"],
        },
        diesel_only_simulation={
            "annual_load_kwh": simulation["diesel_only_annual_load_kwh"],
            "annual_load_shed_kwh": simulation[
                "diesel_only_annual_load_shed_kwh"
            ],
            "annual_diesel_hours": simulation["diesel_run_hours_a"],
        },
        battery_pack_count=num_packs,
        battery_pack_kwh=battery_pack.capacity_kwh,
        battery_cycle_life=battery_pack.cycle_life,
        microgrid_generator_capital_cost=float(
            cost_breakdown.capex.diesel_generator_cost
        ),
        microgrid_generator_replacement_cost=(
            float(generator_price) if diesel_kw > 0 else 0.0
        ),
        diesel_only_generator_capital_cost=(
            float(generator_price) if effective_is_new else 0.0
        ),
        diesel_only_generator_replacement_cost=float(generator_price),
    )
    stage_seconds["economics"] += time.perf_counter() - stage_start
    summary = economic_report["summary"]

    annual_diesel_liters = float(simulation["mg_diesel_liters"])
    annual_diesel_only_cost = float(summary["diesel_only_operating_cost_usd"])
    annual_savings = annual_diesel_only_cost - float(
        summary["microgrid_operating_cost_usd"]
    )
    lcoe_microgrid = float(summary["final_mg_lcoe"])
    loss_of_load = round(float(simulation["loss_of_load_pct"]), 3)
    reliability_risk = loss_of_load > _MAX_RECOMMENDED_LOSS_OF_LOAD_PCT
    npc = float(
        summary.get(
            "microgrid_npc_usd",
            lcoe_microgrid * req.annual_load_kwh * req.project_years,
        )
    )
    return OptimizeOption(
        bracket_sets=sets,
        pv_kw=round(pv_kw, 2),
        battery_kwh=round(battery_kwh, 1),
        num_packs=num_packs,
        diesel_kw=diesel_kw,
        solar_fraction_pct=round(float(simulation["solar_fraction"]), 1),
        annual_diesel_kwh=round(float(simulation["annual_diesel_kwh"]), 0),
        annual_diesel_liters=round(annual_diesel_liters, 0),
        annual_diesel_only_liters=round(
            float(simulation["diesel_only_liters"]),
            0,
        ),
        capex_usd=cost_breakdown.capex.equipment_subtotal,
        selling_price_usd=cost_breakdown.capex.selling_price,
        annual_diesel_cost_usd=round(
            annual_diesel_liters * req.diesel_price_usd_per_liter,
            0,
        ),
        annual_diesel_only_cost_usd=round(annual_diesel_only_cost, 0),
        annual_om_cost_usd=round(
            cost_breakdown.annual_fixed_opex_total_usd,
            0,
        ),
        annual_savings_usd=round(annual_savings, 0),
        payback_years=(
            float(summary["breakeven_year"])
            if summary.get("breakeven_year")
            else 99.0
        ),
        npv_10yr_usd=round(float(summary["npc_savings_usd"]), 0),
        lcoe_microgrid_usd_per_kwh=lcoe_microgrid,
        lcoe_diesel_only_usd_per_kwh=float(summary["final_diesel_lcoe"]),
        score=-npc,
        diesel_is_new=effective_is_new,
        loss_of_load_pct=loss_of_load,
        is_reliability_risk=reliability_risk,
        reliability_note="容量不足/存在缺供风险" if reliability_risk else "",
        curtailment_pct=round(float(simulation.get("curtailment_pct", 0.0)), 2),
        inverter_kw=inverter_kw,
        inverter_count=inverter_count,
        tray_count=tray_count,
        site_area_required_m2=round(
            sets * context["area_per_set"],
            1,
        ),
    )


def _effective_max_bracket_sets(
    req: OptimizeInput,
    catalog: ProductCatalog,
    bracket,
) -> int:
    if req.available_area_m2 is None or req.available_area_m2 <= 0:
        return req.max_bracket_sets
    area_limit = max(
        1,
        max_systems_for_area(
            available_area_m2=req.available_area_m2,
            bracket_length_m=bracket.footprint_length_m,
            bracket_width_m=bracket.footprint_width_m,
            spacing_m=catalog.bracket_spacing_m(),
        ),
    )
    return min(req.max_bracket_sets, area_limit)


def _prepare_shared_profiles(
    req: OptimizeInput,
    catalog: ProductCatalog,
) -> tuple[bool, object | None, object | None, float]:
    use_pypsa = (
        req.latitude is not None
        and req.longitude is not None
        and req.year is not None
    )
    if not use_pypsa:
        return False, None, None, 0.0

    started_at = time.perf_counter()
    from app.services.microgrid_simulator import (
        generate_load_profile,
        generate_pv_profile,
    )

    correction_factor = float(
        catalog.simulation_defaults().get(
            "pv_generation_correction_factor",
            1.0,
        )
    )
    load_profile = generate_load_profile(
        annual_consumption_kwh=req.annual_load_kwh,
        load_type=req.load_type,
        year=req.year,
    )
    pv_profile = generate_pv_profile(
        latitude=req.latitude,
        longitude=req.longitude,
        year=req.year,
        panel_capacity_kw=1.0,
        generation_correction_factor=correction_factor,
    )
    return True, load_profile, pv_profile, time.perf_counter() - started_at


def _run_diesel_baseline(
    req: OptimizeInput,
    use_pypsa: bool,
    diesel_kw_baseline: float,
    load_profile,
) -> tuple[dict | None, int | None, float]:
    if not use_pypsa:
        return None, None, 0.0

    started_at = time.perf_counter()
    from app.services.microgrid_simulator import DieselOnlySimulator

    simulator = DieselOnlySimulator(
        diesel_capacity_kw=(
            diesel_kw_baseline if diesel_kw_baseline > 0 else 20.0
        ),
        load_profile=load_profile,
        diesel_kwh_per_liter=req.fuel_efficiency_kwh_per_l,
        verbose=False,
    )
    simulator.build_network()
    results = simulator.run_simulation(solver_name="highs")
    liters = int(round(results["diesel_liters_per_year"], 0))
    return results, liters, time.perf_counter() - started_at


def _select_candidate_simulation(
    use_pypsa: bool,
    quick_simulation,
    pypsa_simulation,
    pv_kw: float,
    battery_kwh: float,
    diesel_kw: float,
) -> dict:
    simulation = pypsa_simulation if use_pypsa else quick_simulation
    return simulation(pv_kw, battery_kwh, diesel_kw)


def _run_pypsa_candidate(
    context: dict,
    pv_kw: float,
    battery_kwh: float,
    diesel_kw: float,
) -> dict:
    from app.services.microgrid_simulator import OffGridMicrogridSimulator
    from app.services.simulator import (
        _microgrid_dispatch_metrics,
        normalize_diesel_dispatch_mode,
    )

    req = context["req"]
    catalog = context["catalog"]
    battery_pack = context["battery_pack"]
    load_profile = context["load_profile"]
    pv_profile = context["pv_profile"]
    defaults = catalog.simulation_defaults()
    predictive = str(
        req.ems_control_method or ""
    ).lower() == "prediction" or "prediction" in {
        str(item).lower() for item in (req.ems_addons or [])
    }
    dispatch_mode = normalize_diesel_dispatch_mode(
        "lp" if predictive else defaults.get("diesel_dispatch_mode", "cc")
    )
    target_load = float(defaults.get("cycle_charging_target_load_pu", 0.58))
    start_soc = float(defaults.get("cycle_charging_start_soc_pu", 0.55))
    generator = (
        catalog.diesel_generator(power_kw=diesel_kw) if diesel_kw > 0 else None
    )
    intercept = float(getattr(generator, "fuel_intercept_coeff", 0.033))
    slope = float(getattr(generator, "fuel_slope_coeff", 0.273))
    pack_count = max(
        1,
        math.ceil(battery_kwh / max(battery_pack.capacity_kwh, 1e-6)),
    )
    _, _, battery_power_kw, _ = context["inverter_sizing"](
        pv_kw,
        pack_count,
    )
    simulator = OffGridMicrogridSimulator(
        pv_capacity_kw=pv_kw,
        battery_capacity_kwh=battery_kwh,
        battery_power_kw=battery_power_kw,
        diesel_capacity_kw=diesel_kw,
        load_profile=load_profile,
        pv_profile=pv_profile,
        diesel_fuel_cost=(
            req.diesel_price_usd_per_liter
            / max(req.fuel_efficiency_kwh_per_l, 1e-6)
        ),
        diesel_committable=False,
        verbose=False,
    )
    simulator.build_network()
    results = simulator.run_simulation(solver_name="highs")
    diesel_liters, diesel_hours, _, diesel_kwh, battery_discharge = (
        _microgrid_dispatch_metrics(
            results,
            load_profile,
            pv_profile,
            dispatch_mode,
            pv_kw,
            battery_kwh,
            battery_power_kw,
            diesel_kw,
            req.fuel_efficiency_kwh_per_l,
            0.25,
            target_load,
            start_soc,
            intercept,
            slope,
        )
    )
    diesel_only = context["diesel_only_raw"]
    diesel_only_liters = context["diesel_only_liters"]
    return {
        "solar_fraction": round(results["solar_fraction"], 1),
        "loss_of_load_pct": round(results["loss_of_load_rate"], 3),
        "curtailment_pct": round(results["curtailment_rate"], 1),
        "mg_diesel_liters": int(diesel_liters),
        "mg_diesel_hours": diesel_hours,
        "diesel_only_liters": diesel_only_liters,
        "diesel_run_hours_a": int(diesel_only["diesel_run_hours"]),
        "annual_fuel_saving_liters": int(diesel_only_liters - diesel_liters),
        "annual_diesel_kwh": round(float(diesel_kwh), 1),
        "annual_battery_discharge_kwh": round(float(battery_discharge), 1),
        "annual_load_kwh": round(float(results["annual_load_kwh"]), 1),
        "annual_load_shed_kwh": round(
            float(results["annual_load_shed_kwh"]),
            1,
        ),
        "annual_diesel_hours": diesel_hours,
        "annual_diesel_start_count": 0,
        "diesel_dispatch_mode": dispatch_mode,
        "diesel_only_annual_load_kwh": round(
            float(diesel_only["annual_load_kwh"]),
            1,
        ),
        "diesel_only_annual_load_shed_kwh": round(
            float(diesel_only["annual_load_shed_kwh"]),
            1,
        ),
        "solar_diesel_analysis": None,
    }


def _evaluate_top_candidates(
    top_candidates: list[tuple[float, int, int, float]],
    bracket,
    panel,
    battery_pack,
    use_pypsa: bool,
    quick_simulation,
    pypsa_simulation,
    evaluation_context: dict,
    stage_seconds: dict[str, float],
) -> List[OptimizeOption]:
    options: List[OptimizeOption] = []
    for _, sets, num_packs, diesel_kw in top_candidates:
        pv_kw = sets * bracket.panels_per_set * panel.kw
        battery_kwh = num_packs * battery_pack.capacity_kwh
        started_at = time.perf_counter()
        simulation = _select_candidate_simulation(
            use_pypsa,
            quick_simulation,
            pypsa_simulation,
            pv_kw,
            battery_kwh,
            diesel_kw,
        )
        stage_seconds["simulation"] += time.perf_counter() - started_at
        options.append(
            _evaluate_candidate(
                evaluation_context,
                sets,
                num_packs,
                diesel_kw,
                simulation,
            )
        )
    return options


def optimize_with_diagnostics(
    req: OptimizeInput,
) -> tuple[List[OptimizeOption], dict]:
    """Run the capacity optimizer and also return search diagnostics.

    Args:
        req: Optimizer input parameters.

    Returns:
        A tuple of (ranked candidate options, diagnostics dict).
    """
    cache_key = _cache_key(req)
    cached = _cache_get(cache_key)
    if cached is not None:
        diagnostics = _OPTIMIZE_DIAGNOSTICS_CACHE.get(
            cache_key,
            {
                "cacheHit": True,
                "candidateCount": len(cached),
            },
        ).copy()
        diagnostics["cacheHit"] = True
        return cached, diagnostics

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
    effective_max_sets = _effective_max_bracket_sets(req, catalog, bracket)

    # ── Compute peak_kw (used for diesel and battery search ranges) ──
    peak_kw = (
        req.peak_load_kw
        if req.peak_load_kw > 0
        else _estimate_peak_load(req.annual_load_kwh, req.load_type)
    )

    # ── Task 3.5: Diesel search range filtering ──────────────────────
    diesel_candidates, effective_is_new = _resolve_diesel_candidates(
        req, peak_kw
    )

    # For diesel baseline simulation, use the largest diesel candidate
    diesel_kw_baseline = (
        max(diesel_candidates) if diesel_candidates[0] > 0 else 0.0
    )

    # ── Task 3.6: Battery search range calculation ───────────────────
    battery_candidates = _resolve_battery_candidates(
        req, peak_kw, bp.capacity_kwh
    )

    # ── Task 3.1: Build multi-dimensional candidate grid ─────────────
    # (PV x Battery x Diesel)
    candidate_sets = list(range(req.min_bracket_sets, effective_max_sets + 1))

    # ── Pre-generate shared data (all candidates share load and PV curves) ──
    (
        use_pypsa,
        _shared_load,
        _shared_pv_cf,
        shared_profile_seconds,
    ) = _prepare_shared_profiles(
        req,
        catalog,
    )
    stage_seconds["sharedProfiles"] += shared_profile_seconds

    (
        diesel_only_raw,
        diesel_only_liters,
        diesel_baseline_seconds,
    ) = _run_diesel_baseline(
        req,
        use_pypsa,
        diesel_kw_baseline,
        _shared_load,
    )
    stage_seconds["dieselBaseline"] += diesel_baseline_seconds

    def _inverter_sizing(
        pv_kw: float, num_packs: int
    ) -> tuple[float, int, float, int]:
        inverter = catalog.inverter_for_voltage(
            req.voltage_level or _DEFAULT_VOLTAGE_LEVEL
        )
        packs_per_inverter = max(
            1, int(getattr(inverter, "packs_per_inverter", 6))
        )
        pack_based = math.ceil(num_packs / packs_per_inverter)
        converter_kw_per_pv_kw = float(
            catalog.simulation_defaults().get("converter_kw_per_pv_kw", 0.5)
        )
        target_converter_kw = max(0.0, pv_kw * converter_kw_per_pv_kw)
        pv_ratio_based = math.ceil(
            target_converter_kw / max(float(inverter.power_kw), 1e-6)
        )
        inverter_count = max(1, pack_based, pv_ratio_based)
        total_inverter_kw = inverter_count * float(inverter.power_kw)
        tray_cnt = tray_count_for_inverters(inverter_count)
        return (
            float(inverter.power_kw),
            inverter_count,
            total_inverter_kw,
            tray_cnt,
        )

    def _quick_simulation(
        pv_kw: float, battery_kwh: float, cand_diesel_kw: float
    ) -> dict:
        return quick_estimate(
            pv_kw,
            cand_diesel_kw,
            cand_diesel_kw,
            battery_kwh,
            req.annual_load_kwh,
            req.fuel_efficiency_kwh_per_l,
        )

    simulation_context = {
        "req": req,
        "catalog": catalog,
        "battery_pack": bp,
        "load_profile": _shared_load,
        "pv_profile": _shared_pv_cf,
        "inverter_sizing": _inverter_sizing,
        "diesel_only_raw": diesel_only_raw,
        "diesel_only_liters": diesel_only_liters,
    }

    def _pypsa_simulation(
        pv_kw: float,
        battery_kwh: float,
        diesel_kw: float,
    ) -> dict:
        return _run_pypsa_candidate(
            simulation_context,
            pv_kw,
            battery_kwh,
            diesel_kw,
        )

    evaluation_context = {
        "req": req,
        "catalog": catalog,
        "panel": panel,
        "bracket": bracket,
        "battery_pack": bp,
        "inverter_sizing": _inverter_sizing,
        "stage_seconds": stage_seconds,
        "effective_is_new": effective_is_new,
        "area_per_set": area_per_set,
    }

    # ── Task 3.2: Prescreen stage with analytical NPC estimate ──────────
    # Build the full 3D candidate grid
    candidate_grid = _build_candidate_grid(
        candidate_sets,
        battery_candidates,
        diesel_candidates,
    )

    _PRESCREEN_TOP_N = 20

    prescreen_start = time.perf_counter()
    top_candidates = _prescreen_candidates(
        req,
        catalog,
        panel,
        bracket,
        bp,
        effective_is_new,
        candidate_grid,
        _PRESCREEN_TOP_N,
    )
    stage_seconds["prescreen"] += time.perf_counter() - prescreen_start

    options = _evaluate_top_candidates(
        top_candidates,
        bracket,
        panel,
        bp,
        use_pypsa,
        _quick_simulation,
        _pypsa_simulation,
        evaluation_context,
        stage_seconds,
    )

    # ── Task 3.3: NPC-based ranking and labeling ─────────────────────
    stage_start = time.perf_counter()
    options.sort(key=lambda o: o.score, reverse=True)

    _label_ranked_options(options)

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
        "refinedBracketSets": sorted({item[1] for item in top_candidates}),
        "twoStagePrescreen": True,
        "timingSeconds": {k: round(v, 3) for k, v in stage_seconds.items()},
        "totalSeconds": round(total_seconds, 3),
        "usePypsa": use_pypsa,
    }
    _OPTIMIZE_DIAGNOSTICS_CACHE[cache_key] = diagnostics.copy()
    logger.info("Optimize timing: %s", diagnostics)
    return final_options, diagnostics


def optimize(req: OptimizeInput) -> List[OptimizeOption]:
    """Run the capacity optimizer and return ranked candidate options."""
    results, _ = optimize_with_diagnostics(req)
    return results
