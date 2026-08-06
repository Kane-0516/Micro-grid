from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.services.economic_analysis import ProjectParameters, SystemCapex
from app.services.template_cost_engine import TemplateCostBreakdown


@dataclass
class HomerEconomicSettings:
    project_years: int = 25
    nominal_discount_rate: float = 0.10
    inflation_rate: float = 0.02
    pv_life_years: float = 25.0
    mounting_life_years: float = 25.0
    inverter_life_years: float = 15.0
    battery_float_life_years: float = 15.0
    battery_depth_of_discharge: float = 0.80
    bos_life_years: float = 25.0
    min_component_life_years: float = 0.5

    @property
    def real_discount_rate(self) -> float:
        return ((1.0 + self.nominal_discount_rate) / (1.0 + self.inflation_rate)) - 1.0


@dataclass
class EconomicComponent:
    name: str
    capital_cost: float
    replacement_cost: float
    life_years: float
    annual_om_cost: float = 0.0


def _line_total(lines: list[Any], key: str) -> float:
    for line in lines:
        if getattr(line, "key", None) == key and getattr(line, "include", False):
            subtotal = getattr(line, "subtotal_usd", None)
            if subtotal is not None:
                return float(subtotal)
    return 0.0


def _discount(value: float, year: float, real_discount_rate: float) -> float:
    return value / ((1.0 + real_discount_rate) ** year)


def _crf(rate: float, years: int) -> float:
    if years <= 0:
        return 0.0
    if abs(rate) < 1e-12:
        return 1.0 / years
    return rate * ((1.0 + rate) ** years) / (((1.0 + rate) ** years) - 1.0)


def _component_replacement_times(life_years: float, project_years: int) -> list[float]:
    if life_years <= 0 or not math.isfinite(life_years):
        return []
    times: list[float] = []
    t = float(life_years)
    while t < project_years - 1e-9:
        times.append(t)
        t += life_years
    return times


def _component_salvage_value(component: EconomicComponent, project_years: int) -> float:
    if component.replacement_cost <= 0 or component.life_years <= 0 or not math.isfinite(component.life_years):
        return 0.0

    replacement_times = _component_replacement_times(component.life_years, project_years)
    last_install_time = replacement_times[-1] if replacement_times else 0.0
    age_at_end = project_years - last_install_time
    remaining_fraction = max(0.0, 1.0 - age_at_end / component.life_years)
    return round(component.replacement_cost * remaining_fraction, 2)


def _component_year_cost(component: EconomicComponent, year: int, project_years: int) -> float:
    annual_cost = component.annual_om_cost
    if year == 1:
        annual_cost += component.capital_cost

    for replacement_time in _component_replacement_times(component.life_years, project_years):
        if year - 1 < replacement_time <= year:
            annual_cost += component.replacement_cost

    if year == project_years:
        annual_cost -= _component_salvage_value(component, project_years)

    return round(annual_cost, 2)


def _generator_life_years(service_life_hours: float, annual_runtime_hours: float, fallback: float) -> float:
    if annual_runtime_hours <= 0:
        return math.inf
    return max(fallback, service_life_hours / annual_runtime_hours)


def _battery_life_years(
    *,
    annual_discharge_kwh: float,
    battery_pack_count: int,
    battery_pack_kwh: float,
    battery_cycle_life: int,
    float_life_years: float,
    depth_of_discharge: float,
) -> float:
    if battery_pack_count <= 0 or battery_pack_kwh <= 0:
        return math.inf

    if annual_discharge_kwh <= 1e-6:
        return float_life_years

    lifetime_throughput_kwh = battery_pack_count * battery_pack_kwh * battery_cycle_life * depth_of_discharge
    throughput_limited_life = lifetime_throughput_kwh / annual_discharge_kwh
    return max(0.5, min(float_life_years, throughput_limited_life))


def _annual_generator_maintenance(diesel_om: Any, annual_runtime_hours: float) -> float:
    if annual_runtime_hours <= 0:
        return 0.0

    minor_services = math.ceil(annual_runtime_hours / float(diesel_om.S_oil)) if float(diesel_om.S_oil) > 0 else 0
    air_services = math.ceil(annual_runtime_hours / float(diesel_om.S_air)) if float(diesel_om.S_air) > 0 else 0

    materials = minor_services * (
        (float(diesel_om.V_oil) * float(diesel_om.P_oil))
        + float(diesel_om.C_of)
        + float(diesel_om.C_ff)
    ) + air_services * float(diesel_om.C_af)

    labor = minor_services * float(diesel_om.t_pm) * float(diesel_om.labor_rate)

    coolant = 0.0
    if float(diesel_om.coolant_interval_years) > 0:
        coolant = (
            (float(diesel_om.coolant_gal_per_service) * float(diesel_om.P_coolant))
            + (float(diesel_om.coolant_labor_hours) * float(diesel_om.labor_rate))
        ) / float(diesel_om.coolant_interval_years)

    starter_battery = 0.0
    if float(diesel_om.battery_interval_years) > 0:
        starter_battery = (
            float(diesel_om.C_battery)
            + (float(diesel_om.battery_labor_hours) * float(diesel_om.labor_rate))
        ) / float(diesel_om.battery_interval_years)

    return round(materials + labor + coolant + starter_battery, 2)


def _build_microgrid_components(
    *,
    capex: SystemCapex,
    breakdown: TemplateCostBreakdown,
    microgrid_generator_capital_cost: float,
    microgrid_generator_replacement_cost: float,
    microgrid_generator_life_years: float,
    battery_life_years: float,
    annual_microgrid_generator_maintenance: float,
    project_years: int,
    settings: HomerEconomicSettings,
) -> list[EconomicComponent]:
    pv_module_cost = _line_total(breakdown.pv_lines, "module_primary") + _line_total(breakdown.pv_lines, "module_secondary")
    pv_mounting_cost = _line_total(breakdown.pv_lines, "mounting")
    inverter_cost = _line_total(breakdown.pv_lines, "inverter")
    battery_cost = _line_total(breakdown.bess_lines, "battery_pack") + _line_total(breakdown.bess_lines, "integrated_pallet")

    bos_cost = max(
        capex.equipment_subtotal
        - pv_module_cost
        - pv_mounting_cost
        - inverter_cost
        - battery_cost
        - microgrid_generator_capital_cost,
        0.0,
    )

    components = [
        EconomicComponent("PV Modules", pv_module_cost, pv_module_cost, settings.pv_life_years),
        EconomicComponent("PV Mounting", pv_mounting_cost, pv_mounting_cost, settings.mounting_life_years),
        EconomicComponent("Converter", inverter_cost, inverter_cost, settings.inverter_life_years),
        EconomicComponent("Battery Bank", battery_cost, battery_cost, battery_life_years),
        EconomicComponent("Balance of System", bos_cost, 0.0, settings.bos_life_years),
    ]

    if microgrid_generator_replacement_cost > 0 and math.isfinite(microgrid_generator_life_years):
        components.append(
            EconomicComponent(
                "Microgrid Generator",
                microgrid_generator_capital_cost,
                microgrid_generator_replacement_cost,
                microgrid_generator_life_years,
                annual_om_cost=annual_microgrid_generator_maintenance,
            )
        )

    return [component for component in components if component.capital_cost > 0 or component.annual_om_cost > 0]


def _build_diesel_only_components(
    *,
    diesel_only_generator_capital_cost: float,
    diesel_only_generator_replacement_cost: float,
    diesel_only_generator_life_years: float,
    annual_diesel_only_generator_maintenance: float,
) -> list[EconomicComponent]:
    return [
        EconomicComponent(
            "Diesel-only Generator",
            diesel_only_generator_capital_cost,
            diesel_only_generator_replacement_cost,
            diesel_only_generator_life_years,
            annual_om_cost=annual_diesel_only_generator_maintenance,
        )
    ]


def _yearly_costs(
    components: list[EconomicComponent],
    project_years: int,
    annual_fuel_cost: float,
    annual_fixed_om: float,
) -> list[float]:
    yearly = []
    for year in range(1, project_years + 1):
        component_cost = sum(_component_year_cost(component, year, project_years) for component in components)
        yearly.append(round(component_cost + annual_fuel_cost + annual_fixed_om, 2))
    return yearly


def _npc_component_breakdown(
    components: list[EconomicComponent],
    project_years: int,
    real_discount_rate: float,
) -> dict[str, float]:
    capital_npc = 0.0
    replacement_npc = 0.0
    salvage_npc = 0.0

    for component in components:
        if component.capital_cost > 0:
            capital_npc += _discount(component.capital_cost, 1.0, real_discount_rate)

        for replacement_time in _component_replacement_times(component.life_years, project_years):
            replacement_npc += _discount(component.replacement_cost, replacement_time, real_discount_rate)

        salvage_value = _component_salvage_value(component, project_years)
        if salvage_value > 0:
            salvage_npc += _discount(salvage_value, float(project_years), real_discount_rate)

    return {
        "capital_npc_usd": round(capital_npc, 2),
        "replacement_npc_usd": round(replacement_npc, 2),
        "salvage_npc_usd": round(salvage_npc, 2),
    }


def generate_homer_economic_report(
    *,
    project: ProjectParameters,
    capex: SystemCapex,
    breakdown: TemplateCostBreakdown,
    microgrid_simulation: dict[str, Any],
    diesel_only_simulation: dict[str, Any],
    battery_pack_count: int,
    battery_pack_kwh: float,
    battery_cycle_life: int,
    microgrid_generator_capital_cost: float,
    microgrid_generator_replacement_cost: float,
    diesel_only_generator_capital_cost: float,
    diesel_only_generator_replacement_cost: float,
    settings: HomerEconomicSettings | None = None,
) -> dict[str, Any]:
    settings = settings or HomerEconomicSettings(project_years=int(project.analysis_years))
    project_years = int(project.analysis_years)
    real_discount_rate = settings.real_discount_rate

    microgrid_runtime_hours = float(microgrid_simulation.get("annual_diesel_hours", 0.0))
    diesel_only_runtime_hours = float(diesel_only_simulation.get("annual_diesel_hours", 0.0))

    microgrid_generator_life = _generator_life_years(
        float(breakdown.diesel_om.service_life_hours),
        microgrid_runtime_hours,
        settings.min_component_life_years,
    )
    diesel_only_generator_life = _generator_life_years(
        float(breakdown.diesel_om.service_life_hours),
        diesel_only_runtime_hours,
        settings.min_component_life_years,
    )

    battery_life_years = _battery_life_years(
        annual_discharge_kwh=float(microgrid_simulation.get("annual_battery_discharge_kwh", 0.0)),
        battery_pack_count=battery_pack_count,
        battery_pack_kwh=battery_pack_kwh,
        battery_cycle_life=battery_cycle_life,
        float_life_years=settings.battery_float_life_years,
        depth_of_discharge=settings.battery_depth_of_discharge,
    )

    annual_microgrid_generator_maintenance = _annual_generator_maintenance(breakdown.diesel_om, microgrid_runtime_hours)
    annual_diesel_only_generator_maintenance = _annual_generator_maintenance(breakdown.diesel_om, diesel_only_runtime_hours)

    microgrid_components = _build_microgrid_components(
        capex=capex,
        breakdown=breakdown,
        microgrid_generator_capital_cost=microgrid_generator_capital_cost,
        microgrid_generator_replacement_cost=microgrid_generator_replacement_cost,
        microgrid_generator_life_years=microgrid_generator_life,
        battery_life_years=battery_life_years,
        annual_microgrid_generator_maintenance=annual_microgrid_generator_maintenance,
        project_years=project_years,
        settings=settings,
    )
    diesel_only_components = _build_diesel_only_components(
        diesel_only_generator_capital_cost=diesel_only_generator_capital_cost,
        diesel_only_generator_replacement_cost=diesel_only_generator_replacement_cost,
        diesel_only_generator_life_years=diesel_only_generator_life,
        annual_diesel_only_generator_maintenance=annual_diesel_only_generator_maintenance,
    )

    microgrid_fixed_om = float(breakdown.microgrid_om.total_annual_om)
    diesel_only_fixed_om = 0.0

    microgrid_yearly_costs = _yearly_costs(
        microgrid_components,
        project_years,
        annual_fuel_cost=float(project.microgrid_annual_fuel_cost),
        annual_fixed_om=microgrid_fixed_om,
    )
    diesel_only_yearly_costs = _yearly_costs(
        diesel_only_components,
        project_years,
        annual_fuel_cost=float(project.dieselonly_annual_fuel_cost),
        annual_fixed_om=diesel_only_fixed_om,
    )

    annual_served_microgrid = max(
        float(microgrid_simulation.get("annual_load_kwh", project.annual_load_kwh))
        - float(microgrid_simulation.get("annual_load_shed_kwh", 0.0)),
        0.0,
    )
    annual_served_diesel = max(
        float(diesel_only_simulation.get("annual_load_kwh", project.annual_load_kwh))
        - float(diesel_only_simulation.get("annual_load_shed_kwh", 0.0)),
        0.0,
    )

    rows: list[dict[str, Any]] = []
    cumulative_mg_npc = 0.0
    cumulative_diesel_npc = 0.0
    cumulative_savings_npc = 0.0
    cumulative_mg_discounted_energy = 0.0
    cumulative_diesel_discounted_energy = 0.0
    breakeven_year: int | None = None
    lcoe_crossover_year: int | None = None

    for year in range(1, project_years + 1):
        mg_cost = microgrid_yearly_costs[year - 1]
        diesel_cost = diesel_only_yearly_costs[year - 1]
        discount_factor = 1.0 / ((1.0 + real_discount_rate) ** year)

        mg_cost_discounted = mg_cost * discount_factor
        diesel_cost_discounted = diesel_cost * discount_factor

        cumulative_mg_npc += mg_cost_discounted
        cumulative_diesel_npc += diesel_cost_discounted
        cumulative_savings_npc += (diesel_cost_discounted - mg_cost_discounted)

        cumulative_mg_discounted_energy += annual_served_microgrid * discount_factor
        cumulative_diesel_discounted_energy += annual_served_diesel * discount_factor

        mg_coe_to_date = (
            cumulative_mg_npc / cumulative_mg_discounted_energy
            if cumulative_mg_discounted_energy > 0
            else 0.0
        )
        diesel_coe_to_date = (
            cumulative_diesel_npc / cumulative_diesel_discounted_energy
            if cumulative_diesel_discounted_energy > 0
            else 0.0
        )

        if breakeven_year is None and cumulative_savings_npc >= 0:
            breakeven_year = year
        if lcoe_crossover_year is None and mg_coe_to_date <= diesel_coe_to_date:
            lcoe_crossover_year = year

        rows.append(
            {
                "year": year,
                "mgAnnualCost": round(mg_cost, 2),
                "dieselAnnualCost": round(diesel_cost, 2),
                "mgCumulative": round(cumulative_mg_npc, 2),
                "dieselCumulative": round(cumulative_diesel_npc, 2),
                "mgLcoe": round(mg_coe_to_date, 4),
                "dieselLcoe": round(diesel_coe_to_date, 4),
                "annualRevenue": round((diesel_cost - mg_cost) * discount_factor, 2),
                "cumulativeRevenue": round(cumulative_savings_npc, 2),
            }
        )

    comparison = pd.DataFrame(rows)

    microgrid_npc_components = _npc_component_breakdown(
        microgrid_components,
        project_years,
        real_discount_rate,
    )
    diesel_only_npc_components = _npc_component_breakdown(
        diesel_only_components,
        project_years,
        real_discount_rate,
    )

    total_microgrid_npc = round(cumulative_mg_npc, 2)
    total_diesel_npc = round(cumulative_diesel_npc, 2)
    total_annualized_microgrid_cost = round(total_microgrid_npc * _crf(real_discount_rate, project_years), 2)
    total_annualized_diesel_cost = round(total_diesel_npc * _crf(real_discount_rate, project_years), 2)

    final_microgrid_coe = round(total_annualized_microgrid_cost / annual_served_microgrid, 4) if annual_served_microgrid > 0 else 0.0
    final_diesel_coe = round(total_annualized_diesel_cost / annual_served_diesel, 4) if annual_served_diesel > 0 else 0.0
    microgrid_operating_cost = round(float(project.microgrid_annual_fuel_cost) + microgrid_fixed_om + annual_microgrid_generator_maintenance, 2)
    diesel_only_operating_cost = round(float(project.dieselonly_annual_fuel_cost) + annual_diesel_only_generator_maintenance, 2)
    annual_operating_savings = round(diesel_only_operating_cost - microgrid_operating_cost, 2)
    simple_payback_years = (
        round(float(capex.selling_price) / annual_operating_savings, 1)
        if annual_operating_savings > 0
        else None
    )

    summary = {
        "project_name": project.project_name,
        "analysis_years": project_years,
        "annual_load_kwh": float(project.annual_load_kwh),
        "selling_price_usd": float(capex.selling_price),
        "total_cost_usd": float(capex.equipment_subtotal),
        "profit_amount_usd": float(capex.profit_amount),
        "microgrid_annual_om_usd": round(microgrid_fixed_om + annual_microgrid_generator_maintenance, 2),
        "mg_annual_fuel_usd": round(float(project.microgrid_annual_fuel_cost), 2),
        "diesel_annual_fuel_usd": round(float(project.dieselonly_annual_fuel_cost), 2),
        "annual_operating_savings_usd": annual_operating_savings,
        "simple_payback_years": simple_payback_years,
        "breakeven_year": breakeven_year,
        "lcoe_crossover_year": lcoe_crossover_year,
        "final_mg_lcoe": final_microgrid_coe,
        "final_diesel_lcoe": final_diesel_coe,
        "final_cumulative_revenue": round(total_diesel_npc - total_microgrid_npc, 2),
        "microgrid_npc_usd": total_microgrid_npc,
        "diesel_only_npc_usd": total_diesel_npc,
        "npc_savings_usd": round(total_diesel_npc - total_microgrid_npc, 2),
        "microgrid_annualized_cost_usd": total_annualized_microgrid_cost,
        "diesel_only_annualized_cost_usd": total_annualized_diesel_cost,
        "microgrid_operating_cost_usd": microgrid_operating_cost,
        "diesel_only_operating_cost_usd": diesel_only_operating_cost,
        "microgrid_fixed_om_usd": round(microgrid_fixed_om, 2),
        "microgrid_generator_maintenance_usd": round(annual_microgrid_generator_maintenance, 2),
        "diesel_only_generator_maintenance_usd": round(annual_diesel_only_generator_maintenance, 2),
        "microgrid_capital_npc_usd": microgrid_npc_components["capital_npc_usd"],
        "microgrid_replacement_npc_usd": microgrid_npc_components["replacement_npc_usd"],
        "microgrid_salvage_npc_usd": microgrid_npc_components["salvage_npc_usd"],
        "diesel_only_capital_npc_usd": diesel_only_npc_components["capital_npc_usd"],
        "diesel_only_replacement_npc_usd": diesel_only_npc_components["replacement_npc_usd"],
        "diesel_only_salvage_npc_usd": diesel_only_npc_components["salvage_npc_usd"],
        "real_discount_rate_pct": round(real_discount_rate * 100.0, 2),
        "nominal_discount_rate_pct": round(settings.nominal_discount_rate * 100.0, 2),
        "inflation_rate_pct": round(settings.inflation_rate * 100.0, 2),
        "microgrid_generator_life_years": None if not math.isfinite(microgrid_generator_life) else round(microgrid_generator_life, 2),
        "diesel_only_generator_life_years": None if not math.isfinite(diesel_only_generator_life) else round(diesel_only_generator_life, 2),
        "battery_life_years": None if not math.isfinite(battery_life_years) else round(battery_life_years, 2),
    }

    return {
        "summary": summary,
        "tables": {"comparison": comparison},
        "assumptions": {
            "real_discount_rate": real_discount_rate,
            "battery_life_years": battery_life_years,
            "microgrid_generator_life_years": microgrid_generator_life,
            "diesel_only_generator_life_years": diesel_only_generator_life,
        },
    }
