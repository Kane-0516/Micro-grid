"""routers/calculate.py - POST /api/calculate."""

from __future__ import annotations

import hashlib
import json
import sys
import threading
import time
import traceback
from pathlib import Path

from fastapi import APIRouter

from app.schemas.calculate import CalculateRequest, CalculateResponse

# Ensure services/ is importable for legacy analysis modules.
_SERVICES = Path(__file__).resolve().parents[1] / "services"
if str(_SERVICES) not in sys.path:
    sys.path.insert(0, str(_SERVICES))


router = APIRouter(prefix="/api", tags=["calculate"])
_CALCULATE_CACHE_TTL_SEC = 15 * 60
_CALCULATE_CACHE_MAX = 64
_calculate_cache: dict[str, tuple[float, dict]] = {}
_calculate_cache_lock = threading.Lock()


def _to_serializable(obj):
    import numpy as np
    import pandas as pd

    if isinstance(obj, dict):
        return {k: _to_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_serializable(i) for i in obj]
    if isinstance(obj, pd.DataFrame):
        return obj.to_dict(orient="records")
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def _calculate_cache_key(
    req: CalculateRequest,
    simulate: bool,
    simulation_defaults: dict | None = None,
) -> str:
    payload = {
        "simulate": simulate,
        "request": req.model_dump(mode="json"),
        "simulationDefaults": simulation_defaults or {},
    }
    raw = json.dumps(
        payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_cached_calculate_response(cache_key: str) -> dict | None:
    now = time.time()
    with _calculate_cache_lock:
        cached = _calculate_cache.get(cache_key)
        if cached is None:
            return None
        expires_at, payload = cached
        if expires_at <= now:
            _calculate_cache.pop(cache_key, None)
            return None
        return payload


def _set_cached_calculate_response(cache_key: str, payload: dict) -> None:
    now = time.time()
    expires_at = now + _CALCULATE_CACHE_TTL_SEC
    with _calculate_cache_lock:
        expired_keys = [
            key for key, (ttl, _) in _calculate_cache.items() if ttl <= now
        ]
        for key in expired_keys:
            _calculate_cache.pop(key, None)
        if len(_calculate_cache) >= _CALCULATE_CACHE_MAX:
            oldest_key = min(
                _calculate_cache.items(), key=lambda item: item[1][0]
            )[0]
            _calculate_cache.pop(oldest_key, None)
        _calculate_cache[cache_key] = (expires_at, payload)


def _predictive_dispatch_enabled(req: CalculateRequest) -> bool:
    addons = {str(item).lower() for item in (req.emsAddons or [])}
    return (
        str(req.emsControlMethod or "").lower() == "prediction"
        or "prediction" in addons
    )


def _diesel_model(actual_dg, actual_diesel_kw: float) -> str:
    if actual_dg is not None and hasattr(actual_dg, "model"):
        return actual_dg.model
    return f"DG-{actual_diesel_kw:.0f}kW" if actual_diesel_kw > 0 else ""


def _diesel_display_name(actual_dg, actual_diesel_kw: float) -> str:
    if actual_dg is not None:
        return actual_dg.display_name
    return (
        f"{actual_diesel_kw:.0f}kW Diesel Generator"
        if actual_diesel_kw > 0
        else ""
    )


def _run_simulation(
    *,
    simulate: bool,
    req: CalculateRequest,
    sizes: dict,
    actual_dg,
    actual_diesel_eff: float,
    baseline_diesel_eff: float,
    simulation_defaults: dict,
):
    from app.services.simulator import quick_estimate, run_pypsa

    pv_kw = sizes["pv_capacity_kw"]
    battery_kwh = sizes["battery_capacity_kwh"]
    actual_diesel_kw = sizes["diesel_capacity_kw"]
    compare_diesel_kw = sizes["diesel_kw_comparison"]
    annual_load = sizes["annual_load_kwh"]
    if not simulate or pv_kw <= 0:
        return quick_estimate(
            pv_kw,
            actual_diesel_kw,
            compare_diesel_kw,
            battery_kwh,
            annual_load,
            baseline_diesel_eff,
        )
    dispatch_mode = (
        "lp" if _predictive_dispatch_enabled(req) else req.dieselDispatchMode
    )
    return run_pypsa(
        pv_kw,
        battery_kwh,
        actual_diesel_kw,
        compare_diesel_kw,
        annual_load,
        req.loadType,
        actual_diesel_eff,
        baseline_diesel_eff,
        req.dieselPriceUsd,
        req.latitude,
        req.longitude,
        req.year,
        dispatch_mode,
        battery_power_kw=sizes.get("battery_power_kw"),
        pv_generation_correction_factor=float(
            simulation_defaults.get("pv_generation_correction_factor", 1.0)
        ),
        cycle_charging_target_load_pu=float(
            simulation_defaults.get("cycle_charging_target_load_pu", 0.58)
        ),
        cycle_charging_start_soc_pu=float(
            simulation_defaults.get("cycle_charging_start_soc_pu", 0.55)
        ),
        diesel_fuel_intercept_coeff=float(
            getattr(actual_dg, "fuel_intercept_coeff", 0.033)
        ),
        diesel_fuel_slope_coeff=float(
            getattr(actual_dg, "fuel_slope_coeff", 0.273)
        ),
    )


COMPARISON_COLUMNS = (
    "year",
    "mgAnnualCost",
    "dieselAnnualCost",
    "mgCumulative",
    "dieselCumulative",
    "mgLcoe",
    "dieselLcoe",
    "annualRevenue",
    "cumulativeRevenue",
)


def _comparison_table(comp_df) -> list[dict]:
    missing_columns = [
        name for name in COMPARISON_COLUMNS if name not in comp_df.columns
    ]
    if missing_columns:
        raise KeyError(
            f"Comparison table columns mismatch. missing={missing_columns} "
            f"available={list(comp_df.columns)}"
        )
    converters = {
        "year": int,
        **{name: float for name in COMPARISON_COLUMNS if name != "year"},
    }
    return [
        {name: converters[name](row[name]) for name in COMPARISON_COLUMNS}
        for _, row in comp_df.iterrows()
    ]


@router.post("/calculate", response_model=CalculateResponse)
def calculate(req: CalculateRequest, simulate: bool = False):
    """Microgrid techno-economic analysis endpoint.

    - simulate=false: fast estimate path
    - simulate=true: full PyPSA simulation path
    """
    try:
        # Product-config defaults affect PV generation and converter sizing, so
        # include them in the short-lived response cache key.
        from app.core.catalog import get_catalog

        catalog = get_catalog()
        simulation_defaults = catalog.simulation_defaults()
        cache_key = _calculate_cache_key(req, simulate, simulation_defaults)
        cached_payload = _get_cached_calculate_response(cache_key)
        if cached_payload is not None:
            return cached_payload

        # Defer heavy imports so health/geocode routes can start quickly.
        from app.services.calculator import compute_sizes
        from app.services.economic_analysis import ProjectParameters
        from app.services.homer_economic_model import (
            HomerEconomicSettings,
            generate_homer_economic_report,
        )
        from app.services.template_cost_engine import (
            build_template_cost_breakdown,
        )

        sizes = compute_sizes(req, catalog)

        pv_kw = sizes["pv_capacity_kw"]
        battery_kwh = sizes["battery_capacity_kwh"]
        actual_diesel_kw = sizes["diesel_capacity_kw"]
        compare_diesel_kw = sizes["diesel_kw_comparison"]
        annual_load = sizes["annual_load_kwh"]
        num_packs = sizes["num_battery_packs"]

        baseline_dg = catalog.diesel_generator(power_kw=compare_diesel_kw)
        baseline_diesel_eff = getattr(
            baseline_dg, "fuel_efficiency_kwh_per_liter", 3.5
        )
        actual_dg = (
            catalog.diesel_generator(power_kw=actual_diesel_kw)
            if actual_diesel_kw > 0
            else None
        )
        actual_diesel_eff = (
            getattr(
                actual_dg, "fuel_efficiency_kwh_per_liter", baseline_diesel_eff
            )
            if actual_dg is not None
            else baseline_diesel_eff
        )
        panel = catalog.panel(req.panelModel)
        bracket = catalog.bracket(req.bracketModel)
        bp = catalog.battery_pack(req.batteryPackModel)
        sim_r = _run_simulation(
            simulate=simulate,
            req=req,
            sizes=sizes,
            actual_dg=actual_dg,
            actual_diesel_eff=actual_diesel_eff,
            baseline_diesel_eff=baseline_diesel_eff,
            simulation_defaults=simulation_defaults,
        )
        diesel_display_name = _diesel_display_name(actual_dg, actual_diesel_kw)

        cost_breakdown = build_template_cost_breakdown(
            system_config={
                "bracketSets": req.bracketSets,
                "panelModel": req.panelModel,
                "bracketModel": req.bracketModel,
                "batteryModel": req.batteryPackModel,
                "batteryPackCount": num_packs,
                "batteryPackKwh": sizes["battery_pack_kwh"],
                "batteryCapacityKwh": battery_kwh,
                "dieselCapacityKw": sizes["diesel_capacity_kw"],
                "dieselModel": _diesel_model(actual_dg, actual_diesel_kw),
                "inverterKw": sizes.get("inverter_kw"),
                "inverterCount": sizes.get("inverter_count"),
                "totalInverterKw": sizes.get("total_inverter_kw"),
                "trayCount": sizes.get("tray_count"),
                "pvCapacityKw": pv_kw,
                "panelsPerSet": bracket.panels_per_set,
                "panelWatts": panel.watts,
                "voltageLevel": req.voltageLevel,
                "emsControlMethod": req.emsControlMethod,
                "emsAddons": req.emsAddons or [],
            },
            simulation={
                "mgDieselHours": sim_r["mg_diesel_hours"],
                "dieselRunHoursA": sim_r["diesel_run_hours_a"],
            },
            catalog=catalog,
            diesel_is_new=req.dieselIsNew,
        )
        capex = cost_breakdown.capex

        econ_settings = HomerEconomicSettings(
            project_years=int(req.projectYears),
            nominal_discount_rate=float(req.nominalDiscountRatePct) / 100.0,
            inflation_rate=float(req.inflationRatePct) / 100.0,
        )

        proj = ProjectParameters(
            analysis_years=int(req.projectYears),
            project_name=(
                f"{actual_diesel_kw:.0f}kW Diesel / {pv_kw:.1f}kW PV "
                "Off-Grid Microgrid"
                if actual_diesel_kw > 0
                else f"{pv_kw:.1f}kW PV + Storage Off-Grid Microgrid"
            ),
            annual_load_kwh=float(annual_load),
            diesel_price_per_liter=req.dieselPriceUsd,
            microgrid_diesel_liters=float(sim_r["mg_diesel_liters"]),
            dieselonly_diesel_liters=float(sim_r["diesel_only_liters"]),
        )
        report = generate_homer_economic_report(
            project=proj,
            capex=capex,
            breakdown=cost_breakdown,
            microgrid_simulation={
                "annual_load_kwh": sim_r["annual_load_kwh"],
                "annual_load_shed_kwh": sim_r["annual_load_shed_kwh"],
                "annual_battery_discharge_kwh": sim_r[
                    "annual_battery_discharge_kwh"
                ],
                "annual_diesel_hours": sim_r["annual_diesel_hours"],
            },
            diesel_only_simulation={
                "annual_load_kwh": sim_r["diesel_only_annual_load_kwh"],
                "annual_load_shed_kwh": sim_r[
                    "diesel_only_annual_load_shed_kwh"
                ],
                "annual_diesel_hours": sim_r["diesel_run_hours_a"],
            },
            battery_pack_count=num_packs,
            battery_pack_kwh=sizes["battery_pack_kwh"],
            battery_cycle_life=bp.cycle_life,
            microgrid_generator_capital_cost=float(capex.diesel_generator_cost),
            microgrid_generator_replacement_cost=float(actual_dg.price_usd)
            if actual_dg is not None
            else 0.0,
            diesel_only_generator_capital_cost=(
                float(baseline_dg.price_usd)
                if (not req.hasGenerator) or req.dieselIsNew
                else 0.0
            ),
            diesel_only_generator_replacement_cost=float(baseline_dg.price_usd),
            settings=econ_settings,
        )
        summary = report["summary"]
        comp_df = report["tables"]["comparison"]

        comparison_table = _comparison_table(comp_df)

        fuel_saving_usd = round(
            (sim_r["diesel_only_liters"] - sim_r["mg_diesel_liters"])
            * req.dieselPriceUsd,
            0,
        )

        response_payload = {
            "success": True,
            "simulated": simulate,
            "systemConfig": {
                "scenario": req.scenario,
                "pvCapacityKw": pv_kw,
                "batteryCapacityKwh": battery_kwh,
                "batteryPackCount": num_packs,
                "dieselCapacityKw": sizes["diesel_capacity_kw"],
                "dieselKwComparison": compare_diesel_kw,
                "bracketSets": req.bracketSets,
                "panelModel": req.panelModel,
                "panelWatts": panel.watts,
                "panelPricePerWp": panel.price_usd_per_wp,
                "panelsPerSet": bracket.panels_per_set,
                "batteryModel": req.batteryPackModel,
                "batteryPackKwh": bp.capacity_kwh,
                "annualLoadKwh": annual_load,
                "voltageLevel": req.voltageLevel,
                "emsMode": req.emsControlMethod,
                "occupiedAreaM2": sizes["occupied_area_m2"],
                "loadType": req.loadType,
                "latitude": req.latitude,
                "longitude": req.longitude,
                "year": req.year,
                "dieselModel": _diesel_model(actual_dg, actual_diesel_kw),
                "dieselModelDisplay": diesel_display_name,
                "dieselDispatchMode": sim_r.get(
                    "diesel_dispatch_mode", req.dieselDispatchMode
                ),
                "projectYears": int(req.projectYears),
                "nominalDiscountRatePct": float(req.nominalDiscountRatePct),
                "inflationRatePct": float(req.inflationRatePct),
                "dieselIsNew": req.dieselIsNew,
                "hasGenerator": actual_diesel_kw > 0,
                "inverterKw": sizes.get("inverter_kw"),
                "inverterCount": sizes.get("inverter_count"),
                "totalInverterKw": sizes.get("total_inverter_kw"),
                "trayCount": sizes.get("tray_count"),
                "siteAreaRequiredM2": sizes.get("occupied_area_m2"),
            },
            "capex": {
                "pvModuleCost": capex.pv_module_cost,
                "pvMountingCost": capex.pv_mounting_cost,
                "energyStorageCost": capex.energy_storage_cost,
                "dieselGeneratorCost": capex.diesel_generator_cost,
                "intlTransportCost": capex.intl_transport_cost,
                "installationCost": capex.installation_cost,
                "accessoryCost": capex.accessory_cost,
                "otherInitialCost": capex.other_initial_cost,
                "equipmentSubtotal": capex.equipment_subtotal,
                "profitMargin": capex.profit_margin,
                "profitAmount": capex.profit_amount,
                "sellingPrice": capex.selling_price,
            },
            "simulation": {
                "solarFractionPct": float(sim_r["solar_fraction"]),
                "lossOfLoadPct": float(sim_r["loss_of_load_pct"]),
                "curtailmentPct": float(sim_r["curtailment_pct"]),
                "mgDieselLiters": int(sim_r["mg_diesel_liters"]),
                "mgDieselHours": int(sim_r["mg_diesel_hours"]),
                "mgDieselStarts": int(
                    sim_r.get("annual_diesel_start_count", 0)
                ),
                "dieselOnlyLiters": int(sim_r["diesel_only_liters"]),
                "dieselRunHoursA": int(sim_r["diesel_run_hours_a"]),
                "annualFuelSavingLiters": int(
                    sim_r["annual_fuel_saving_liters"]
                ),
                "annualFuelSavingUsd": fuel_saving_usd,
                "solarDieselAnalysis": sim_r.get("solar_diesel_analysis"),
                "homerDispatchComparison": sim_r.get(
                    "homer_dispatch_comparison"
                ),
            },
            "summary": {
                "projectName": summary["project_name"],
                "analysisYears": summary["analysis_years"],
                "annualLoadKwh": summary["annual_load_kwh"],
                "sellingPriceUsd": summary["selling_price_usd"],
                "totalCostUsd": summary["total_cost_usd"],
                "profitAmountUsd": summary["profit_amount_usd"],
                "mgAnnualOmUsd": summary["microgrid_annual_om_usd"],
                "mgAnnualFuelUsd": summary["mg_annual_fuel_usd"],
                "dieselAnnualFuelUsd": summary["diesel_annual_fuel_usd"],
                "annualOperatingSavingsUsd": summary[
                    "annual_operating_savings_usd"
                ],
                "simplePaybackYears": summary["simple_payback_years"],
                "breakevenYear": summary["breakeven_year"],
                "lcoeCrossoverYear": summary["lcoe_crossover_year"],
                "finalMgLcoe": summary["final_mg_lcoe"],
                "finalDieselLcoe": summary["final_diesel_lcoe"],
                "finalCumulativeRevenue": summary["final_cumulative_revenue"],
                "microgridNpcUsd": summary["microgrid_npc_usd"],
                "dieselOnlyNpcUsd": summary["diesel_only_npc_usd"],
                "npcSavingsUsd": summary["npc_savings_usd"],
                "microgridAnnualizedCostUsd": summary[
                    "microgrid_annualized_cost_usd"
                ],
                "dieselOnlyAnnualizedCostUsd": summary[
                    "diesel_only_annualized_cost_usd"
                ],
                "microgridOperatingCostUsd": summary[
                    "microgrid_operating_cost_usd"
                ],
                "dieselOnlyOperatingCostUsd": summary[
                    "diesel_only_operating_cost_usd"
                ],
                "microgridFixedOmUsd": summary["microgrid_fixed_om_usd"],
                "microgridGeneratorMaintenanceUsd": summary[
                    "microgrid_generator_maintenance_usd"
                ],
                "dieselOnlyGeneratorMaintenanceUsd": summary[
                    "diesel_only_generator_maintenance_usd"
                ],
                "microgridCapitalNpcUsd": summary["microgrid_capital_npc_usd"],
                "microgridReplacementNpcUsd": summary[
                    "microgrid_replacement_npc_usd"
                ],
                "microgridSalvageNpcUsd": summary["microgrid_salvage_npc_usd"],
                "dieselOnlyCapitalNpcUsd": summary[
                    "diesel_only_capital_npc_usd"
                ],
                "dieselOnlyReplacementNpcUsd": summary[
                    "diesel_only_replacement_npc_usd"
                ],
                "dieselOnlySalvageNpcUsd": summary[
                    "diesel_only_salvage_npc_usd"
                ],
                "realDiscountRatePct": summary["real_discount_rate_pct"],
                "nominalDiscountRatePct": summary["nominal_discount_rate_pct"],
                "inflationRatePct": summary["inflation_rate_pct"],
                "microgridGeneratorLifeYears": summary[
                    "microgrid_generator_life_years"
                ],
                "dieselOnlyGeneratorLifeYears": summary[
                    "diesel_only_generator_life_years"
                ],
                "batteryLifeYears": summary["battery_life_years"],
            },
            "comparisonTable": comparison_table,
        }
        response_payload = _to_serializable(response_payload)
        _set_cached_calculate_response(cache_key, response_payload)
        return response_payload

    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
