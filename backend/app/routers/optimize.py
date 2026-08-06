"""
Router for POST /api/optimize.
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

from fastapi import APIRouter

from app.schemas.optimize import OptimizeRequest, OptimizeResponse
from app.services.optimizer import OptimizeInput, optimize_with_diagnostics

_SERVICES = Path(__file__).resolve().parents[1] / "services"
if str(_SERVICES) not in sys.path:
    sys.path.insert(0, str(_SERVICES))

router = APIRouter(prefix="/api", tags=["optimize"])


@router.post("/optimize", response_model=OptimizeResponse)
def optimize_microgrid(req: OptimizeRequest):
    """Scan bracket-set candidates and return the exact-ranked options."""
    try:
        opt_input = OptimizeInput(
            annual_load_kwh=req.annualLoadKwh,
            peak_load_kw=req.peakLoadKw,
            peak_sun_hours=req.peakSunHours,
            storage_days=req.storageDays,
            diesel_price_usd_per_liter=req.dieselPriceUsdPerLiter,
            diesel_is_new=req.dieselIsNew,
            panel_model=req.panelModel,
            bracket_model=req.bracketModel,
            battery_pack_model=req.batteryPackModel,
            min_bracket_sets=req.minBracketSets,
            max_bracket_sets=req.maxBracketSets,
            objective=req.objective,
            available_area_m2=req.availableAreaM2,
            existing_diesel_kw=req.existingDieselKw,
            diesel_capacity_kw=req.dieselCapacityKw,
            allow_diesel=req.allowDiesel,
            voltage_level=req.voltageLevel,
            load_type=req.loadType,
            latitude=req.latitude,
            longitude=req.longitude,
            year=req.year,
            ems_control_method=req.emsControlMethod,
            ems_addons=req.emsAddons or [],
        )
        results, diagnostics = optimize_with_diagnostics(opt_input)
        if not results:
            return {
                "success": False,
                "error": "No feasible options satisfied the load, site, and diesel constraints.",
                "diagnostics": diagnostics,
            }

        return {
            "success": True,
            "dieselKw": results[0].diesel_kw if results else 0,
            "maxSetsAllowed": len(results),
            "diagnostics": diagnostics,
            "options": [
                {
                    "bracketSets": o.bracket_sets,
                    "pvKw": o.pv_kw,
                    "batteryKwh": o.battery_kwh,
                    "numPacks": o.num_packs,
                    "dieselKw": o.diesel_kw,
                    "solarFractionPct": o.solar_fraction_pct,
                    "lossOfLoadPct": o.loss_of_load_pct,
                    'isReliabilityRisk': o.is_reliability_risk,
                    'reliabilityNote': o.reliability_note,
                    "curtailmentPct": o.curtailment_pct,
                    "annualDieselLiters": o.annual_diesel_liters,
                    "annualDieselOnlyLiters": o.annual_diesel_only_liters,
                    "capexUsd": o.capex_usd,
                    "sellingPriceUsd": o.selling_price_usd,
                    "annualDieselCostUsd": o.annual_diesel_cost_usd,
                    "annualDieselOnlyCostUsd": o.annual_diesel_only_cost_usd,
                    "annualOmCostUsd": o.annual_om_cost_usd,
                    "annualSavingsUsd": o.annual_savings_usd,
                    "paybackYears": o.payback_years,
                    "npv10yrUsd": o.npv_10yr_usd,
                    "lcoeMicrogridUsd": o.lcoe_microgrid_usd_per_kwh,
                    "lcoeDieselOnlyUsd": o.lcoe_diesel_only_usd_per_kwh,
                    "label": o.label,
                    "isRecommended": o.is_recommended,
                    "isRunnerUp": o.is_runner_up,
                    "isThird": o.is_third,
                    "dieselIsNew": o.diesel_is_new,
                    "inverterKw": o.inverter_kw,
                    "inverterCount": o.inverter_count,
                    "trayCount": o.tray_count,
                    "siteAreaRequiredM2": o.site_area_required_m2,
                }
                for o in results
            ],
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "traceback": traceback.format_exc()}
