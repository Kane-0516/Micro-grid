"""
services/simulator.py - fast estimate and full PyPSA simulation
"""
from __future__ import annotations

import sys
from copy import deepcopy
from pathlib import Path

import pandas as pd

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from functools import lru_cache

from app.services.microgrid_simulator import OffGridMicrogridSimulator, generate_load_profile, generate_pv_profile
from app.services.solution_pipeline import DieselFuelModel, DieselOnlySimulator, DieselSpec


_ANALYSIS_AVG_START_YEAR = 2001
_ANALYSIS_AVG_END_YEAR = 2020
_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@lru_cache(maxsize=64)
def _generate_load_profile_cached(
    annual_consumption_kwh: float,
    load_type: str,
    year: int,
) -> pd.Series:
    return generate_load_profile(
        annual_consumption_kwh=annual_consumption_kwh,
        load_type=load_type,
        year=year,
    )


@lru_cache(maxsize=128)
def _run_diesel_only_cached(
    diesel_only_kw: float,
    diesel_only_eff: float,
    annual_load_kwh: float,
    load_type: str,
    year: int,
) -> dict:
    load_profile = _generate_load_profile_cached(
        annual_consumption_kwh=annual_load_kwh,
        load_type=load_type,
        year=year,
    )
    diesel_only_spec = build_diesel_spec(diesel_only_kw, diesel_only_eff)
    result = DieselOnlySimulator(
        diesel_spec=diesel_only_spec,
        load_profile=load_profile,
        verbose=False,
    ).run()
    return deepcopy(result)


def normalize_diesel_dispatch_mode(mode: str | None) -> str:
    normalized = (mode or "lf").strip().lower()
    if normalized in {"lf", "load-following", "load_following"}:
        return "lf"
    if normalized in {"cc", "cycle-charging", "cycle_charging"}:
        return "cc"
    if normalized not in {"lp", "proxy", "uc"}:
        return "lf"
    return normalized


def build_diesel_spec(
    diesel_kw: float,
    fuel_efficiency_kwh_per_liter: float,
    min_load_pct: float = 0.25,
    intercept_coeff: float = 0.033,
    slope_coeff: float = 0.273,
) -> DieselSpec:
    if diesel_kw <= 0:
        return DieselSpec(capacity_kw=0.0, min_load_pct=min_load_pct, F0=intercept_coeff, F1=0.0)

    return DieselSpec(
        capacity_kw=diesel_kw,
        min_load_pct=min_load_pct,
        F0=round(intercept_coeff, 5),
        F1=round(slope_coeff, 5),
    )


def build_diesel_spec_from_generator(
    diesel_kw: float,
    fuel_efficiency_kwh_per_liter: float,
    generator=None,
    min_load_pct: float = 0.25,
) -> DieselSpec:
    return build_diesel_spec(
        diesel_kw=diesel_kw,
        fuel_efficiency_kwh_per_liter=fuel_efficiency_kwh_per_liter,
        min_load_pct=min_load_pct,
        intercept_coeff=float(getattr(generator, "fuel_intercept_coeff", 0.033)),
        slope_coeff=float(getattr(generator, "fuel_slope_coeff", 0.273)),
    )


def _resolve_monthly_diesel_status(
    diesel_series: pd.Series,
    diesel_status: pd.Series,
    diesel_dispatch_mode: str,
) -> pd.Series:
    if normalize_diesel_dispatch_mode(diesel_dispatch_mode) in {"lf", "lp", "cc"}:
        return diesel_series.gt(0.01).astype(float)
    return diesel_status.fillna(0.0).clip(lower=0.0)


def _extract_monthly_dispatch_metrics(
    pv_kw: float,
    pv_generation_series: pd.Series,
    diesel_series: pd.Series,
    diesel_status: pd.Series,
    diesel_dispatch_mode: str,
) -> dict[str, list[float]]:
    monthly_pv_generation = pv_generation_series.resample("ME").sum()
    monthly_diesel_energy = diesel_series.resample("ME").sum()
    monthly_diesel_hours = _resolve_monthly_diesel_status(
        diesel_series=diesel_series,
        diesel_status=diesel_status,
        diesel_dispatch_mode=diesel_dispatch_mode,
    ).resample("ME").sum()
    monthly_pv_equivalent_hours = (
        monthly_pv_generation / max(pv_kw, 1e-6) if pv_kw > 0 else monthly_pv_generation * 0.0
    )
    return {
        "pv_equivalent_hours": [float(v) for v in monthly_pv_equivalent_hours.to_list()],
        "pv_generation_kwh": [float(v) for v in monthly_pv_generation.to_list()],
        "diesel_hours": [float(v) for v in monthly_diesel_hours.to_list()],
        "diesel_generation_kwh": [float(v) for v in monthly_diesel_energy.to_list()],
    }

def _empty_homer_dispatch_result(mode: str) -> dict:
    return {
        "mode": mode,
        "label": mode.upper(),
        "diesel_liters": 0,
        "diesel_kwh": 0.0,
        "diesel_hours": 0,
        "diesel_starts": 0,
        "load_shed_kwh": 0.0,
        "loss_of_load_pct": 0.0,
        "curtailment_kwh": 0.0,
        "curtailment_pct": 0.0,
        "battery_discharge_kwh": 0.0,
    }


def _run_homer_style_dispatch(
    mode: str,
    pv_kw: float,
    battery_kwh: float,
    battery_power_kw: float,
    diesel_kw: float,
    load_profile: pd.Series,
    pv_profile: pd.Series,
    diesel_eff: float,
    battery_efficiency: float = 0.95,
    battery_reserve_soc_pu: float = 0.15,
    cycle_charging_target_load_pu: float = 0.58,
    cycle_charging_start_soc_pu: float = 0.55,
    diesel_fuel_intercept_coeff: float = 0.033,
    diesel_fuel_slope_coeff: float = 0.273,
) -> dict:
    mode = (mode or "lf").lower()
    if diesel_kw <= 0:
        return _empty_homer_dispatch_result(mode)

    spec = build_diesel_spec(
        diesel_kw,
        diesel_eff,
        intercept_coeff=diesel_fuel_intercept_coeff,
        slope_coeff=diesel_fuel_slope_coeff,
    )
    reserve_soc = max(0.0, min(battery_kwh, battery_kwh * battery_reserve_soc_pu))
    cc_start_soc = max(reserve_soc, min(battery_kwh, battery_kwh * cycle_charging_start_soc_pu))
    target_soc = battery_kwh * 0.90
    cycle_charging_target_kw = diesel_kw * max(0.0, min(1.0, cycle_charging_target_load_pu))
    soc = battery_kwh * 0.50
    eta = max(0.01, min(1.0, battery_efficiency))

    diesel_values = []
    battery_discharge_values = []
    load_shed_values = []
    curtail_values = []

    for ts, load_raw in load_profile.items():
        load = max(0.0, float(load_raw))
        pv_cf = float(pv_profile.loc[ts]) if ts in pv_profile.index else 0.0
        pv_available = max(0.0, pv_kw * pv_cf)

        pv_to_load = min(pv_available, load)
        remaining_load = load - pv_to_load
        excess_pv = pv_available - pv_to_load

        charge_room_ac = max(0.0, (battery_kwh - soc) / eta) if battery_kwh > 0 else 0.0
        pv_charge = min(excess_pv, battery_power_kw, charge_room_ac)
        soc += pv_charge * eta
        curtail = max(0.0, excess_pv - pv_charge)

        mode_for_hour = "cc" if mode == "cc" or (mode == "cd" and soc < battery_kwh * 0.40) else "lf"
        discharge_floor_soc = cc_start_soc if mode_for_hour == "cc" and remaining_load > 1e-6 else reserve_soc
        max_discharge = min(battery_power_kw, max(0.0, (soc - discharge_floor_soc) * eta)) if battery_kwh > 0 else 0.0
        battery_discharge = min(remaining_load, max_discharge)
        soc -= battery_discharge / eta if eta > 0 else 0.0
        remaining_load -= battery_discharge

        diesel_output = 0.0
        load_shed = 0.0
        if remaining_load > 1e-6:
            if mode_for_hour == "cc":
                diesel_output = min(diesel_kw, max(remaining_load, spec.min_load_kw, cycle_charging_target_kw))
            else:
                diesel_output = min(diesel_kw, max(remaining_load, spec.min_load_kw))
            served_by_diesel = min(remaining_load, diesel_output)
            remaining_load -= served_by_diesel
            diesel_surplus = max(0.0, diesel_output - served_by_diesel)
            if diesel_surplus > 0 and battery_kwh > 0:
                charge_room_ac = max(0.0, (target_soc - soc) / eta)
                diesel_charge = min(diesel_surplus, battery_power_kw, charge_room_ac)
                soc += diesel_charge * eta
                curtail += max(0.0, diesel_surplus - diesel_charge)
            else:
                curtail += diesel_surplus
            if remaining_load > 1e-6:
                load_shed = remaining_load

        diesel_values.append(diesel_output)
        battery_discharge_values.append(battery_discharge)
        load_shed_values.append(load_shed)
        curtail_values.append(curtail)

    diesel_series = pd.Series(diesel_values, index=load_profile.index, dtype=float)
    diesel_status = diesel_series.gt(0.01).astype(float)
    load_shed_series = pd.Series(load_shed_values, index=load_profile.index, dtype=float)
    curtail_series = pd.Series(curtail_values, index=load_profile.index, dtype=float)
    battery_discharge_series = pd.Series(battery_discharge_values, index=load_profile.index, dtype=float)

    annual_load = float(load_profile.sum())
    annual_load_shed = float(load_shed_series.sum())
    annual_curtail = float(curtail_series.sum())
    annual_fuel = round(DieselFuelModel.annual_fuel_L(diesel_series, spec), 0)
    starts = int((diesel_status.diff().fillna(diesel_status.iloc[0]) > 0.5).sum())

    return {
        "mode": mode,
        "label": {"lf": "HOMER LF", "cc": "HOMER CC", "cd": "HOMER CD"}.get(mode, mode.upper()),
        "diesel_liters": int(annual_fuel),
        "diesel_kwh": round(float(diesel_series.sum()), 1),
        "diesel_hours": int(diesel_status.sum()),
        "diesel_starts": starts,
        "load_shed_kwh": round(annual_load_shed, 1),
        "loss_of_load_pct": round(annual_load_shed / max(annual_load, 1e-6) * 100.0, 3),
        "curtailment_kwh": round(annual_curtail, 1),
        "curtailment_pct": round(annual_curtail / max(annual_load, 1e-6) * 100.0, 3),
        "battery_discharge_kwh": round(float(battery_discharge_series.sum()), 1),
    }


def _build_homer_dispatch_comparison(
    pv_kw: float,
    battery_kwh: float,
    battery_power_kw: float,
    diesel_kw: float,
    load_profile: pd.Series,
    pv_profile: pd.Series,
    diesel_eff: float,
    pypsa_results: dict,
    pypsa_diesel_liters: float,
    pypsa_diesel_hours: int,
    pypsa_diesel_starts: int,
    battery_reserve_soc_pu: float,
    cycle_charging_target_load_pu: float = 0.58,
    cycle_charging_start_soc_pu: float = 0.55,
    diesel_fuel_intercept_coeff: float = 0.033,
    diesel_fuel_slope_coeff: float = 0.273,
) -> dict:
    annual_load = float(pypsa_results.get("annual_load_kwh", load_profile.sum()))
    load_shed = float(pypsa_results.get("annual_load_shed_kwh", 0.0))
    pypsa_row = {
        "mode": "pypsa",
        "label": "PyPSA optimized",
        "diesel_liters": int(round(pypsa_diesel_liters, 0)),
        "diesel_kwh": round(float(pypsa_results.get("annual_diesel_kwh", 0.0)), 1),
        "diesel_hours": int(pypsa_diesel_hours),
        "diesel_starts": int(pypsa_diesel_starts),
        "load_shed_kwh": round(load_shed, 1),
        "loss_of_load_pct": round(load_shed / max(annual_load, 1e-6) * 100.0, 3),
        "curtailment_kwh": round(float(pypsa_results.get("annual_curtailment_kwh", 0.0)), 1),
        "curtailment_pct": round(float(pypsa_results.get("curtailment_rate", 0.0)), 3),
        "battery_discharge_kwh": round(float(pypsa_results.get("annual_battery_discharge_kwh", 0.0)), 1),
    }
    homer_rows = [
        _run_homer_style_dispatch(
            mode=mode,
            pv_kw=pv_kw,
            battery_kwh=battery_kwh,
            battery_power_kw=battery_power_kw,
            diesel_kw=diesel_kw,
            load_profile=load_profile,
            pv_profile=pv_profile,
            diesel_eff=diesel_eff,
            battery_reserve_soc_pu=battery_reserve_soc_pu,
            cycle_charging_target_load_pu=cycle_charging_target_load_pu,
            cycle_charging_start_soc_pu=cycle_charging_start_soc_pu,
            diesel_fuel_intercept_coeff=diesel_fuel_intercept_coeff,
            diesel_fuel_slope_coeff=diesel_fuel_slope_coeff,
        )
        for mode in ("lf", "cc", "cd")
    ]
    return {
        "note": "HOMER 行是基于公开调度描述实现的 LF/CC/CD 近似对照，不是 HOMER Pro 专有仿真引擎。",
        "note_en": "HOMER rows are transparent LF/CC/CD approximations based on public dispatch descriptions; they are not the proprietary HOMER Pro engine.",
        "note_zh": "HOMER 行是基于公开调度描述实现的 LF/CC/CD 近似对照，不是 HOMER Pro 专有仿真引擎。",
        "rows": [pypsa_row] + homer_rows,
    }


def _build_single_year_solar_diesel_analysis(
    pv_kw: float,
    year: int,
    pv_generation_series: pd.Series,
    diesel_series: pd.Series,
    diesel_status: pd.Series,
    diesel_dispatch_mode: str,
) -> dict:
    monthly = _extract_monthly_dispatch_metrics(
        pv_kw=pv_kw,
        pv_generation_series=pv_generation_series,
        diesel_series=diesel_series,
        diesel_status=diesel_status,
        diesel_dispatch_mode=diesel_dispatch_mode,
    )

    rows = []
    for idx in range(12):
        rows.append(
            {
                "month": idx + 1,
                "label": _MONTH_LABELS[idx],
                "pvEquivalentHours": round(float(monthly["pv_equivalent_hours"][idx]), 1),
                "pvGenerationKwh": round(float(monthly["pv_generation_kwh"][idx]), 1),
                "dieselHours": int(round(float(monthly["diesel_hours"][idx]), 0)),
                "dieselGenerationKwh": round(float(monthly["diesel_generation_kwh"][idx]), 1),
            }
        )

    solar_hours_series = pd.Series([row["pvEquivalentHours"] for row in rows], dtype=float)
    diesel_hours_series = pd.Series([row["dieselHours"] for row in rows], dtype=float)
    correlation = solar_hours_series.corr(diesel_hours_series * -1.0)

    return {
        "annualPvEquivalentHours": round(float(solar_hours_series.sum()), 1) if pv_kw > 0 else 0.0,
        "weatherDieselCorrelation": round(float(correlation), 3) if pd.notna(correlation) else None,
        "solarSource": f"simulation_{year}",
        "analysisPeriod": str(year),
        "monthly": rows,
    }


@lru_cache(maxsize=32)
def _build_twenty_year_average_solar_diesel_analysis(
    pv_kw: float,
    battery_kwh: float,
    microgrid_diesel_kw: float,
    annual_load_kwh: float,
    load_type: str,
    microgrid_diesel_eff: float,
    diesel_price: float,
    latitude: float | None = None,
    longitude: float | None = None,
    diesel_dispatch_mode: str = "lf",
    pv_generation_correction_factor: float = 1.0,
    start_year: int = _ANALYSIS_AVG_START_YEAR,
    end_year: int = _ANALYSIS_AVG_END_YEAR,
) -> dict:
    if latitude is None or longitude is None:
        return {
            "annualPvEquivalentHours": None,
            "weatherDieselCorrelation": None,
            "solarSource": None,
            "analysisPeriod": None,
            "monthly": [],
        }

    dispatch_mode = normalize_diesel_dispatch_mode(diesel_dispatch_mode)
    monthly_records: list[dict[str, list[float]]] = []
    simulated_years: list[int] = []

    for sim_year in range(start_year, end_year + 1):
        try:
            pv_profile = generate_pv_profile(
                latitude=latitude,
                longitude=longitude,
                year=sim_year,
                panel_capacity_kw=pv_kw,
                generation_correction_factor=pv_generation_correction_factor,
            )
            load_profile = _generate_load_profile_cached(
                annual_consumption_kwh=annual_load_kwh,
                load_type=load_type,
                year=sim_year,
            )
            sim = OffGridMicrogridSimulator(
                pv_capacity_kw=pv_kw,
                battery_capacity_kwh=battery_kwh,
                battery_power_kw=battery_kwh / 4.0,
                diesel_capacity_kw=microgrid_diesel_kw,
                load_profile=load_profile,
                pv_profile=pv_profile,
                diesel_fuel_cost=diesel_price / max(microgrid_diesel_eff, 1e-6),
                # Keep LF/CC/CD-style analyses as LP dispatch. Unit commitment
                # is reserved for explicit "uc" runs because full-year binary
                # dispatch is too slow for interactive reports.
                diesel_committable=dispatch_mode == "uc",
                verbose=False,
            )
            sim.build_network()
            year_results = sim.run_simulation(solver_name="highs")
            monthly_records.append(
                _extract_monthly_dispatch_metrics(
                    pv_kw=pv_kw,
                    pv_generation_series=year_results.get("_pv_series", load_profile * 0.0),
                    diesel_series=year_results.get("_diesel_series", load_profile * 0.0),
                    diesel_status=year_results.get("_diesel_status_series", load_profile * 0.0),
                    diesel_dispatch_mode=dispatch_mode,
                )
            )
            simulated_years.append(sim_year)
        except Exception:
            continue

    if not monthly_records:
        return {
            "annualPvEquivalentHours": None,
            "weatherDieselCorrelation": None,
            "solarSource": None,
            "analysisPeriod": f"{start_year}-{end_year}",
            "monthly": [],
        }

    monthly_pv_hours = pd.DataFrame([record["pv_equivalent_hours"] for record in monthly_records]).mean(axis=0)
    monthly_pv_generation = pd.DataFrame([record["pv_generation_kwh"] for record in monthly_records]).mean(axis=0)
    monthly_diesel_hours = pd.DataFrame([record["diesel_hours"] for record in monthly_records]).mean(axis=0)
    monthly_diesel_generation = pd.DataFrame([record["diesel_generation_kwh"] for record in monthly_records]).mean(axis=0)

    rows = []
    for idx in range(12):
        rows.append(
            {
                "month": idx + 1,
                "label": _MONTH_LABELS[idx],
                "pvEquivalentHours": round(float(monthly_pv_hours.iloc[idx]), 1),
                "pvGenerationKwh": round(float(monthly_pv_generation.iloc[idx]), 1),
                "dieselHours": int(round(float(monthly_diesel_hours.iloc[idx]), 0)),
                "dieselGenerationKwh": round(float(monthly_diesel_generation.iloc[idx]), 1),
            }
        )

    solar_hours_series = pd.Series([row["pvEquivalentHours"] for row in rows], dtype=float)
    diesel_hours_series = pd.Series([row["dieselHours"] for row in rows], dtype=float)
    correlation = solar_hours_series.corr(diesel_hours_series * -1.0)
    return {
        "annualPvEquivalentHours": round(float(solar_hours_series.sum()), 1) if pv_kw > 0 else 0.0,
        "weatherDieselCorrelation": round(float(correlation), 3) if pd.notna(correlation) else None,
        "solarSource": f"simulation_average_{start_year}_{end_year}",
        "analysisPeriod": f"{simulated_years[0]}-{simulated_years[-1]} ({len(simulated_years)}y)",
        "monthly": rows,
    }


def build_solar_diesel_analysis(
    pv_kw: float,
    battery_kwh: float,
    microgrid_diesel_kw: float,
    annual_load_kwh: float,
    load_type: str,
    microgrid_diesel_eff: float,
    diesel_price: float,
    latitude: float | None = None,
    longitude: float | None = None,
    diesel_dispatch_mode: str = "lf",
    pv_generation_correction_factor: float = 1.0,
) -> dict:
    try:
        return _build_twenty_year_average_solar_diesel_analysis(
            pv_kw=round(float(pv_kw), 3),
            battery_kwh=round(float(battery_kwh), 3),
            microgrid_diesel_kw=round(float(microgrid_diesel_kw), 3),
            annual_load_kwh=round(float(annual_load_kwh), 3),
            load_type=load_type,
            microgrid_diesel_eff=round(float(microgrid_diesel_eff), 6),
            diesel_price=round(float(diesel_price), 6),
            latitude=round(float(latitude), 4) if latitude is not None else None,
            longitude=round(float(longitude), 4) if longitude is not None else None,
            diesel_dispatch_mode=diesel_dispatch_mode,
            pv_generation_correction_factor=round(float(pv_generation_correction_factor), 6),
        )
    except Exception:
        return {
            "annualPvEquivalentHours": None,
            "weatherDieselCorrelation": None,
            "solarSource": None,
            "analysisPeriod": None,
            "monthly": [],
        }


def quick_estimate(
    pv_kw: float,
    diesel_kw: float,
    diesel_only_kw: float,
    battery_kwh: float,
    annual_load_kwh: float,
    diesel_eff: float = 3.5,
) -> dict:
    """
    Fast diesel estimate for non-simulated responses.
    """
    ref_solar_frac = 0.896
    ref_pv_kw = 84.0
    ref_load_kwh = 131_400.0

    avg_load_kw = annual_load_kwh / 8760.0
    pv_to_load = pv_kw / max(avg_load_kw, 0.1)
    ref_ratio = ref_pv_kw / (ref_load_kwh / 8760.0)

    solar_frac = min(0.97, ref_solar_frac * (pv_to_load / ref_ratio) ** 0.6)

    mg_diesel_kwh = annual_load_kwh * (1.0 - solar_frac)
    mg_diesel_liters = round(mg_diesel_kwh / diesel_eff, 0)
    mg_diesel_hours = round(mg_diesel_kwh / max(diesel_kw * 0.6, 0.1), 0)
    mg_diesel_hours = int(min(mg_diesel_hours, 8760))

    if diesel_only_kw > 0:
        diesel_only_spec = build_diesel_spec(diesel_only_kw, diesel_eff)
        avg_load_kw = annual_load_kwh / 8760.0 if annual_load_kwh > 0 else 0.0
        avg_dispatch_kw = max(avg_load_kw, diesel_only_spec.min_load_kw)
        diesel_only_liters = round(
            (diesel_only_spec.F0 * diesel_only_kw + diesel_only_spec.F1 * avg_dispatch_kw) * 8760,
            0,
        )
    else:
        diesel_only_liters = 0

    return {
        "solar_fraction": round(solar_frac * 100, 1),
        "loss_of_load_pct": 0.0,
        "curtailment_pct": round(max(0, (solar_frac - 0.7) * 30), 1),
        "mg_diesel_liters": int(mg_diesel_liters),
        "mg_diesel_hours": int(mg_diesel_hours),
        "diesel_only_liters": int(diesel_only_liters),
        "diesel_run_hours_a": 8760,
        "annual_fuel_saving_liters": int(diesel_only_liters - mg_diesel_liters),
        "annual_diesel_kwh": round(mg_diesel_kwh, 1),
        "annual_battery_discharge_kwh": round(min(annual_load_kwh * 0.35, battery_kwh * 365 * 0.6), 1),
        "annual_load_kwh": round(annual_load_kwh, 1),
        "annual_load_shed_kwh": 0.0,
        "annual_diesel_hours": int(mg_diesel_hours),
        "annual_diesel_start_count": 0,
        "diesel_dispatch_mode": "quick",
        "diesel_only_annual_load_kwh": round(annual_load_kwh, 1),
        "diesel_only_annual_load_shed_kwh": 0.0,
        "solar_diesel_analysis": None,
    }


@lru_cache(maxsize=128)
def _run_pypsa_cached(
    pv_kw: float,
    battery_kwh: float,
    battery_power_kw: float,
    microgrid_diesel_kw: float,
    diesel_only_kw: float,
    annual_load_kwh: float,
    load_type: str,
    microgrid_diesel_eff: float,
    diesel_only_eff: float,
    diesel_price: float,
    latitude: float,
    longitude: float,
    year: int,
    diesel_dispatch_mode: str = "lf",
    battery_reserve_soc_pu: float = 0.15,
    pv_generation_correction_factor: float = 1.0,
    cycle_charging_target_load_pu: float = 0.58,
    cycle_charging_start_soc_pu: float = 0.55,
    diesel_fuel_intercept_coeff: float = 0.033,
    diesel_fuel_slope_coeff: float = 0.273,
) -> dict:
    """Run the full-year PyPSA simulation and cache exact repeated requests."""
    dispatch_mode = normalize_diesel_dispatch_mode(diesel_dispatch_mode)
    pv_profile = generate_pv_profile(
        latitude=latitude,
        longitude=longitude,
        year=year,
        panel_capacity_kw=pv_kw,
        generation_correction_factor=pv_generation_correction_factor,
    )
    load_profile = _generate_load_profile_cached(
        annual_consumption_kwh=annual_load_kwh,
        load_type=load_type,
        year=year,
    )
    bat_power_kw = max(0.0, float(battery_power_kw)) or battery_kwh / 4.0
    sim = OffGridMicrogridSimulator(
        pv_capacity_kw=pv_kw,
        battery_capacity_kwh=battery_kwh,
        battery_power_kw=bat_power_kw,
        diesel_capacity_kw=microgrid_diesel_kw,
        load_profile=load_profile,
        pv_profile=pv_profile,
        diesel_fuel_cost=diesel_price / max(microgrid_diesel_eff, 1e-6),
        # LF/CC/proxy use continuous dispatch with minimum-load fuel accounting
        # after the solve. Only explicit UC enables binary generator status.
        diesel_committable=dispatch_mode == "uc",
        battery_reserve_soc_pu=(0.25 if dispatch_mode == "cc" else battery_reserve_soc_pu),
        diesel_min_up_time=(2 if dispatch_mode == "cc" else 1),
        diesel_min_down_time=(2 if dispatch_mode == "cc" else 1),
        verbose=False,
    )
    sim.build_network()
    mg_results = sim.run_simulation(solver_name="highs")

    if microgrid_diesel_kw > 0:
        microgrid_spec = build_diesel_spec(
            microgrid_diesel_kw,
            microgrid_diesel_eff,
            intercept_coeff=diesel_fuel_intercept_coeff,
            slope_coeff=diesel_fuel_slope_coeff,
        )
        diesel_series = mg_results.get("_diesel_series", load_profile * 0.0)
        if dispatch_mode in {"lf", "lp", "cc"}:
            diesel_status = mg_results.get("_diesel_status_series", pd.Series(0.0, index=load_profile.index))
            if diesel_status.empty:
                diesel_status = diesel_series.gt(max(0.01, microgrid_spec.capacity_kw * 0.01)).astype(float)
            diesel_status = diesel_status.fillna(0.0).clip(lower=0.0)
            if diesel_status.sum() <= 0:
                diesel_status = diesel_series.gt(max(0.01, microgrid_spec.capacity_kw * 0.01)).astype(float)
            effective_diesel_series = diesel_series.where(
                diesel_status <= 0.5,
                diesel_series.clip(lower=microgrid_spec.min_load_kw),
            )
            if dispatch_mode == "cc":
                # HOMER-style cycle charging approximation:
                # keep the generator treated as active for fuel/runtime accounting
                # whenever it is producing, even if the battery absorbs part of the surplus.
                diesel_status = diesel_status.where(diesel_series <= 0.01, 1.0)
        else:
            diesel_status = mg_results.get("_diesel_status_series", diesel_series.gt(0.01).astype(float))
            effective_diesel_series = diesel_series.where(
                diesel_status <= 0.5,
                diesel_series.clip(lower=microgrid_spec.min_load_kw),
            )
        mg_diesel_liters = round(DieselFuelModel.annual_fuel_L(effective_diesel_series, microgrid_spec), 0)
        mg_diesel_hours = int((diesel_status > 0.5).sum())
        mg_diesel_starts = int((diesel_status.diff().fillna(diesel_status.iloc[0]) > 0.5).sum())
    else:
        mg_diesel_liters = 0
        mg_diesel_hours = 0
        mg_diesel_starts = 0

    if dispatch_mode == "cc" and microgrid_diesel_kw > 0:
        cc_dispatch = _run_homer_style_dispatch(
            mode="cc",
            pv_kw=pv_kw,
            battery_kwh=battery_kwh,
            battery_power_kw=bat_power_kw,
            diesel_kw=microgrid_diesel_kw,
            load_profile=load_profile,
            pv_profile=pv_profile,
            diesel_eff=microgrid_diesel_eff,
            battery_reserve_soc_pu=0.25,
            cycle_charging_target_load_pu=cycle_charging_target_load_pu,
            cycle_charging_start_soc_pu=cycle_charging_start_soc_pu,
            diesel_fuel_intercept_coeff=diesel_fuel_intercept_coeff,
            diesel_fuel_slope_coeff=diesel_fuel_slope_coeff,
        )
        mg_diesel_liters = int(cc_dispatch["diesel_liters"])
        mg_diesel_hours = int(cc_dispatch["diesel_hours"])
        mg_diesel_starts = int(cc_dispatch["diesel_starts"])
        mg_diesel_kwh = float(cc_dispatch["diesel_kwh"])
        mg_battery_discharge_kwh = float(cc_dispatch["battery_discharge_kwh"])
    else:
        mg_diesel_kwh = float(mg_results["annual_diesel_kwh"])
        mg_battery_discharge_kwh = float(mg_results["annual_battery_discharge_kwh"])

    comparison_results = dict(mg_results)
    comparison_results["annual_diesel_kwh"] = mg_diesel_kwh
    comparison_results["annual_battery_discharge_kwh"] = mg_battery_discharge_kwh
    homer_dispatch_comparison = _build_homer_dispatch_comparison(
        pv_kw=pv_kw,
        battery_kwh=battery_kwh,
        battery_power_kw=bat_power_kw,
        diesel_kw=microgrid_diesel_kw,
        load_profile=load_profile,
        pv_profile=pv_profile,
        diesel_eff=microgrid_diesel_eff,
        pypsa_results=comparison_results,
        pypsa_diesel_liters=mg_diesel_liters,
        pypsa_diesel_hours=mg_diesel_hours,
        pypsa_diesel_starts=mg_diesel_starts,
        battery_reserve_soc_pu=battery_reserve_soc_pu,
        cycle_charging_target_load_pu=cycle_charging_target_load_pu,
        cycle_charging_start_soc_pu=cycle_charging_start_soc_pu,
        diesel_fuel_intercept_coeff=diesel_fuel_intercept_coeff,
        diesel_fuel_slope_coeff=diesel_fuel_slope_coeff,
    )

    diesel_only_results = _run_diesel_only_cached(
        diesel_only_kw=round(float(diesel_only_kw), 6),
        diesel_only_eff=round(float(diesel_only_eff), 8),
        annual_load_kwh=round(float(annual_load_kwh), 6),
        load_type=str(load_type),
        year=int(year),
    )
    diesel_only_liters = int(round(diesel_only_results["annual_diesel_liters"], 0))
    solar_diesel_analysis = _build_single_year_solar_diesel_analysis(
        pv_kw=pv_kw,
        year=year,
        pv_generation_series=mg_results.get("_pv_series", load_profile * 0.0),
        diesel_series=mg_results.get("_diesel_series", load_profile * 0.0),
        diesel_status=mg_results.get("_diesel_status_series", load_profile * 0.0),
        diesel_dispatch_mode=dispatch_mode,
    )

    return {
        "solar_fraction": round(mg_results["solar_fraction"], 1),
        "loss_of_load_pct": round(mg_results["loss_of_load_rate"], 3),
        "curtailment_pct": round(mg_results["curtailment_rate"], 1),
        "mg_diesel_liters": int(mg_diesel_liters),
        "mg_diesel_hours": mg_diesel_hours,
        "diesel_only_liters": diesel_only_liters,
        "diesel_run_hours_a": int(diesel_only_results["diesel_run_hours"]),
        "annual_fuel_saving_liters": int(diesel_only_liters - mg_diesel_liters),
        "annual_diesel_kwh": round(float(mg_diesel_kwh), 1),
        "annual_battery_discharge_kwh": round(float(mg_battery_discharge_kwh), 1),
        "annual_load_kwh": round(float(mg_results["annual_load_kwh"]), 1),
        "annual_load_shed_kwh": round(float(mg_results["annual_load_shed_kwh"]), 1),
        "annual_diesel_hours": mg_diesel_hours,
        "annual_diesel_start_count": mg_diesel_starts,
        "diesel_dispatch_mode": dispatch_mode,
        "diesel_only_annual_load_kwh": round(float(diesel_only_results["annual_load_kwh"]), 1),
        "diesel_only_annual_load_shed_kwh": round(float(diesel_only_results["annual_load_shed_kwh"]), 1),
        "solar_diesel_analysis": solar_diesel_analysis,
        "homer_dispatch_comparison": homer_dispatch_comparison,
    }


def run_pypsa(
    pv_kw: float,
    battery_kwh: float,
    microgrid_diesel_kw: float,
    diesel_only_kw: float,
    annual_load_kwh: float,
    load_type: str,
    microgrid_diesel_eff: float,
    diesel_only_eff: float,
    diesel_price: float,
    latitude: float,
    longitude: float,
    year: int,
    diesel_dispatch_mode: str = "lf",
    battery_reserve_soc_pu: float = 0.15,
    battery_power_kw: float | None = None,
    pv_generation_correction_factor: float = 1.0,
    cycle_charging_target_load_pu: float = 0.58,
    cycle_charging_start_soc_pu: float = 0.55,
    diesel_fuel_intercept_coeff: float = 0.033,
    diesel_fuel_slope_coeff: float = 0.273,
) -> dict:
    """Run the full-year PyPSA simulation with exact-input result caching."""
    result = _run_pypsa_cached(
        pv_kw=round(float(pv_kw), 6),
        battery_kwh=round(float(battery_kwh), 6),
        battery_power_kw=round(float(battery_power_kw if battery_power_kw is not None else battery_kwh / 4.0), 6),
        microgrid_diesel_kw=round(float(microgrid_diesel_kw), 6),
        diesel_only_kw=round(float(diesel_only_kw), 6),
        annual_load_kwh=round(float(annual_load_kwh), 6),
        load_type=str(load_type),
        microgrid_diesel_eff=round(float(microgrid_diesel_eff), 8),
        diesel_only_eff=round(float(diesel_only_eff), 8),
        diesel_price=round(float(diesel_price), 8),
        latitude=round(float(latitude), 6),
        longitude=round(float(longitude), 6),
        year=int(year),
        diesel_dispatch_mode=normalize_diesel_dispatch_mode(diesel_dispatch_mode),
        battery_reserve_soc_pu=round(float(battery_reserve_soc_pu), 6),
        pv_generation_correction_factor=round(float(pv_generation_correction_factor), 6),
        cycle_charging_target_load_pu=round(float(cycle_charging_target_load_pu), 6),
        cycle_charging_start_soc_pu=round(float(cycle_charging_start_soc_pu), 6),
        diesel_fuel_intercept_coeff=round(float(diesel_fuel_intercept_coeff), 6),
        diesel_fuel_slope_coeff=round(float(diesel_fuel_slope_coeff), 6),
    )
    return deepcopy(result)
