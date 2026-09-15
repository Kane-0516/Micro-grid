"""复现 HOMER Pro 经济性模型的 CAPEX/OPEX/LCOE 计算."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.services.economic_analysis import ProjectParameters, SystemCapex
from app.services.template_cost_engine import TemplateCostBreakdown

_SIM_ANNUAL_DIESEL_HOURS = "annual_diesel_hours"
_SIM_ANNUAL_BATTERY_DISCHARGE = "annual_battery_discharge_kwh"
_SIM_ANNUAL_LOAD = "annual_load_kwh"
_SIM_ANNUAL_LOAD_SHED = "annual_load_shed_kwh"

_SUMMARY_KEY_PROJECT_NAME = "project_name"
_SUMMARY_KEY_ANALYSIS_YEARS = "analysis_years"
_SUMMARY_KEY_ANNUAL_LOAD = "annual_load_kwh"
_SUMMARY_KEY_SELLING_PRICE = "selling_price_usd"
_SUMMARY_KEY_TOTAL_COST = "total_cost_usd"
_SUMMARY_KEY_PROFIT_AMOUNT = "profit_amount_usd"
_SUMMARY_KEY_MICROGRID_ANNUAL_OM = "microgrid_annual_om_usd"
_SUMMARY_KEY_MG_ANNUAL_FUEL = "mg_annual_fuel_usd"
_SUMMARY_KEY_DIESEL_ANNUAL_FUEL = "diesel_annual_fuel_usd"
_SUMMARY_KEY_ANNUAL_OPERATING_SAVINGS = "annual_operating_savings_usd"
_SUMMARY_KEY_SIMPLE_PAYBACK = "simple_payback_years"
_SUMMARY_KEY_BREAKEVEN_YEAR = "breakeven_year"
_SUMMARY_KEY_LCOE_CROSSOVER = "lcoe_crossover_year"
_SUMMARY_KEY_FINAL_MG_LCOE = "final_mg_lcoe"
_SUMMARY_KEY_FINAL_DIESEL_LCOE = "final_diesel_lcoe"
_SUMMARY_KEY_FINAL_CUMULATIVE_REVENUE = "final_cumulative_revenue"
_SUMMARY_KEY_MICROGRID_NPC = "microgrid_npc_usd"
_SUMMARY_KEY_DIESEL_ONLY_NPC = "diesel_only_npc_usd"
_SUMMARY_KEY_NPC_SAVINGS = "npc_savings_usd"
_SUMMARY_KEY_MICROGRID_ANNUALIZED = "microgrid_annualized_cost_usd"
_SUMMARY_KEY_DIESEL_ANNUALIZED = "diesel_only_annualized_cost_usd"
_SUMMARY_KEY_MICROGRID_OPERATING = "microgrid_operating_cost_usd"
_SUMMARY_KEY_DIESEL_OPERATING = "diesel_only_operating_cost_usd"
_SUMMARY_KEY_MICROGRID_FIXED_OM = "microgrid_fixed_om_usd"
_SUMMARY_KEY_MICROGRID_GEN_MAINT = "microgrid_generator_maintenance_usd"
_SUMMARY_KEY_DIESEL_GEN_MAINT = "diesel_only_generator_maintenance_usd"
_SUMMARY_KEY_MICROGRID_CAPITAL_NPC = "microgrid_capital_npc_usd"
_SUMMARY_KEY_MICROGRID_REPLACEMENT_NPC = "microgrid_replacement_npc_usd"
_SUMMARY_KEY_MICROGRID_SALVAGE_NPC = "microgrid_salvage_npc_usd"
_SUMMARY_KEY_DIESEL_CAPITAL_NPC = "diesel_only_capital_npc_usd"
_SUMMARY_KEY_DIESEL_REPLACEMENT_NPC = "diesel_only_replacement_npc_usd"
_SUMMARY_KEY_DIESEL_SALVAGE_NPC = "diesel_only_salvage_npc_usd"
_SUMMARY_KEY_REAL_DISCOUNT_PCT = "real_discount_rate_pct"
_SUMMARY_KEY_NOMINAL_DISCOUNT_PCT = "nominal_discount_rate_pct"
_SUMMARY_KEY_INFLATION_PCT = "inflation_rate_pct"
_SUMMARY_KEY_MICROGRID_GEN_LIFE = "microgrid_generator_life_years"
_SUMMARY_KEY_DIESEL_GEN_LIFE = "diesel_only_generator_life_years"
_SUMMARY_KEY_BATTERY_LIFE = "battery_life_years"

_NPC_KEY_CAPITAL = "capital_npc_usd"
_NPC_KEY_REPLACEMENT = "replacement_npc_usd"
_NPC_KEY_SALVAGE = "salvage_npc_usd"


@dataclass
class HomerEconomicSettings:
    """Project-level economic assumptions for the HOMER-style model."""

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
        """Fisher-equation real discount rate derived from the nominal rate."""
        return (
            (1.0 + self.nominal_discount_rate) / (1.0 + self.inflation_rate)
        ) - 1.0


@dataclass
class EconomicComponent:
    """One capital component in the lifecycle cost model."""

    name: str
    capital_cost: float
    replacement_cost: float
    life_years: float
    annual_om_cost: float = 0.0


@dataclass
class _ComparisonAccumulators:
    cumulative_mg_npc: float = 0.0
    cumulative_diesel_npc: float = 0.0
    cumulative_savings_npc: float = 0.0
    cumulative_mg_discounted_energy: float = 0.0
    cumulative_diesel_discounted_energy: float = 0.0
    breakeven_year: int | None = None
    lcoe_crossover_year: int | None = None


@dataclass
class _EconomicSummaryContext:
    project: ProjectParameters
    capex: SystemCapex
    settings: HomerEconomicSettings
    project_years: int
    real_discount_rate: float
    microgrid_fixed_om: float
    annual_microgrid_generator_maintenance: float
    annual_diesel_only_generator_maintenance: float
    microgrid_generator_life: float
    diesel_only_generator_life: float
    battery_life_years: float
    accumulators: _ComparisonAccumulators
    total_microgrid_npc: float
    total_diesel_npc: float
    total_annualized_microgrid_cost: float
    total_annualized_diesel_cost: float
    final_microgrid_coe: float
    final_diesel_coe: float
    microgrid_operating_cost: float
    diesel_only_operating_cost: float
    annual_operating_savings: float
    simple_payback_years: float | None
    microgrid_npc_components: dict[str, float]
    diesel_only_npc_components: dict[str, float]


def _line_total(lines: list[Any], key: str) -> float:
    for line in lines:
        if getattr(line, "key", None) == key and getattr(
            line, "include", False
        ):
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


def _component_replacement_times(
    life_years: float, project_years: int
) -> list[float]:
    if life_years <= 0 or not math.isfinite(life_years):
        return []
    times: list[float] = []
    t = float(life_years)
    while t < project_years - 1e-9:
        times.append(t)
        t += life_years
    return times


def _component_salvage_value(
    component: EconomicComponent, project_years: int
) -> float:
    if (
        component.replacement_cost <= 0
        or component.life_years <= 0
        or not math.isfinite(component.life_years)
    ):
        return 0.0

    replacement_times = _component_replacement_times(
        component.life_years, project_years
    )
    last_install_time = replacement_times[-1] if replacement_times else 0.0
    age_at_end = project_years - last_install_time
    remaining_fraction = max(0.0, 1.0 - age_at_end / component.life_years)
    return round(component.replacement_cost * remaining_fraction, 2)


def _component_year_cost(
    component: EconomicComponent, year: int, project_years: int
) -> float:
    annual_cost = component.annual_om_cost
    if year == 1:
        annual_cost += component.capital_cost

    for replacement_time in _component_replacement_times(
        component.life_years, project_years
    ):
        if year - 1 < replacement_time <= year:
            annual_cost += component.replacement_cost

    if year == project_years:
        annual_cost -= _component_salvage_value(component, project_years)

    return round(annual_cost, 2)


def _generator_life_years(
    service_life_hours: float, annual_runtime_hours: float, fallback: float
) -> float:
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

    lifetime_throughput_kwh = (
        battery_pack_count
        * battery_pack_kwh
        * battery_cycle_life
        * depth_of_discharge
    )
    throughput_limited_life = lifetime_throughput_kwh / annual_discharge_kwh
    return max(0.5, min(float_life_years, throughput_limited_life))


def _interval_annual_cost(
    *,
    interval_years: float,
    annual_cost: float,
) -> float:
    if interval_years <= 0:
        return 0.0
    return annual_cost / interval_years


def _annual_generator_maintenance(
    diesel_om: Any, annual_runtime_hours: float
) -> float:
    if annual_runtime_hours <= 0:
        return 0.0

    minor_services = (
        math.ceil(annual_runtime_hours / float(diesel_om.S_oil))
        if float(diesel_om.S_oil) > 0
        else 0
    )
    air_services = (
        math.ceil(annual_runtime_hours / float(diesel_om.S_air))
        if float(diesel_om.S_air) > 0
        else 0
    )

    materials = minor_services * (
        (float(diesel_om.V_oil) * float(diesel_om.P_oil))
        + float(diesel_om.C_of)
        + float(diesel_om.C_ff)
    ) + air_services * float(diesel_om.C_af)

    labor = minor_services * float(diesel_om.t_pm) * float(diesel_om.labor_rate)

    coolant = _interval_annual_cost(
        interval_years=float(diesel_om.coolant_interval_years),
        annual_cost=(
            (
                float(diesel_om.coolant_gal_per_service)
                * float(diesel_om.P_coolant)
            )
            + (
                float(diesel_om.coolant_labor_hours)
                * float(diesel_om.labor_rate)
            )
        ),
    )

    starter_battery = _interval_annual_cost(
        interval_years=float(diesel_om.battery_interval_years),
        annual_cost=(
            float(diesel_om.C_battery)
            + (
                float(diesel_om.battery_labor_hours)
                * float(diesel_om.labor_rate)
            )
        ),
    )

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
    settings: HomerEconomicSettings,
) -> list[EconomicComponent]:
    pv_module_cost = _line_total(
        breakdown.pv_lines, "module_primary"
    ) + _line_total(breakdown.pv_lines, "module_secondary")
    pv_mounting_cost = _line_total(breakdown.pv_lines, "mounting")
    inverter_cost = _line_total(breakdown.pv_lines, "inverter")
    battery_cost = _line_total(
        breakdown.bess_lines, "battery_pack"
    ) + _line_total(breakdown.bess_lines, "integrated_pallet")

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
        EconomicComponent(
            "PV Modules", pv_module_cost, pv_module_cost, settings.pv_life_years
        ),
        EconomicComponent(
            "PV Mounting",
            pv_mounting_cost,
            pv_mounting_cost,
            settings.mounting_life_years,
        ),
        EconomicComponent(
            "Converter",
            inverter_cost,
            inverter_cost,
            settings.inverter_life_years,
        ),
        EconomicComponent(
            "Battery Bank", battery_cost, battery_cost, battery_life_years
        ),
        EconomicComponent(
            "Balance of System", bos_cost, 0.0, settings.bos_life_years
        ),
    ]

    if microgrid_generator_replacement_cost > 0 and math.isfinite(
        microgrid_generator_life_years
    ):
        components.append(
            EconomicComponent(
                "Microgrid Generator",
                microgrid_generator_capital_cost,
                microgrid_generator_replacement_cost,
                microgrid_generator_life_years,
                annual_om_cost=annual_microgrid_generator_maintenance,
            )
        )

    return [
        component
        for component in components
        if component.capital_cost > 0 or component.annual_om_cost > 0
    ]


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
        component_cost = sum(
            _component_year_cost(component, year, project_years)
            for component in components
        )
        yearly.append(
            round(component_cost + annual_fuel_cost + annual_fixed_om, 2)
        )
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
            capital_npc += _discount(
                component.capital_cost, 1.0, real_discount_rate
            )

        for replacement_time in _component_replacement_times(
            component.life_years, project_years
        ):
            replacement_npc += _discount(
                component.replacement_cost, replacement_time, real_discount_rate
            )

        salvage_value = _component_salvage_value(component, project_years)
        if salvage_value > 0:
            salvage_npc += _discount(
                salvage_value, float(project_years), real_discount_rate
            )

    return {
        _NPC_KEY_CAPITAL: round(capital_npc, 2),
        _NPC_KEY_REPLACEMENT: round(replacement_npc, 2),
        _NPC_KEY_SALVAGE: round(salvage_npc, 2),
    }


def _resolve_settings(
    project: ProjectParameters,
    settings: HomerEconomicSettings | None,
) -> HomerEconomicSettings:
    return settings or HomerEconomicSettings(
        project_years=int(project.analysis_years)
    )


def _simulation_float(
    simulation: dict[str, Any], key: str, default: float = 0.0
) -> float:
    return float(simulation.get(key, default))


def _annual_served_kwh(
    simulation: dict[str, Any], fallback_load_kwh: float
) -> float:
    load_kwh = _simulation_float(
        simulation, _SIM_ANNUAL_LOAD, fallback_load_kwh
    )
    shed_kwh = _simulation_float(simulation, _SIM_ANNUAL_LOAD_SHED, 0.0)
    return max(load_kwh - shed_kwh, 0.0)


def _life_years_or_none(value: float) -> float | None:
    return None if not math.isfinite(value) else round(value, 2)


def _coe_to_date(npc: float, discounted_energy: float) -> float:
    return npc / discounted_energy if discounted_energy > 0 else 0.0


def _maybe_set_breakeven(
    accumulators: _ComparisonAccumulators, year: int
) -> None:
    if (
        accumulators.breakeven_year is None
        and accumulators.cumulative_savings_npc >= 0
    ):
        accumulators.breakeven_year = year


def _maybe_set_lcoe_crossover(
    accumulators: _ComparisonAccumulators,
    year: int,
    mg_coe_to_date: float,
    diesel_coe_to_date: float,
) -> None:
    if (
        accumulators.lcoe_crossover_year is None
        and mg_coe_to_date <= diesel_coe_to_date
    ):
        accumulators.lcoe_crossover_year = year


def _append_comparison_row(
    accumulators: _ComparisonAccumulators,
    *,
    year: int,
    mg_cost: float,
    diesel_cost: float,
    discount_factor: float,
    annual_served_microgrid: float,
    annual_served_diesel: float,
) -> dict[str, Any]:
    mg_cost_discounted = mg_cost * discount_factor
    diesel_cost_discounted = diesel_cost * discount_factor

    accumulators.cumulative_mg_npc += mg_cost_discounted
    accumulators.cumulative_diesel_npc += diesel_cost_discounted
    accumulators.cumulative_savings_npc += (
        diesel_cost_discounted - mg_cost_discounted
    )
    accumulators.cumulative_mg_discounted_energy += (
        annual_served_microgrid * discount_factor
    )
    accumulators.cumulative_diesel_discounted_energy += (
        annual_served_diesel * discount_factor
    )

    mg_coe_to_date = _coe_to_date(
        accumulators.cumulative_mg_npc,
        accumulators.cumulative_mg_discounted_energy,
    )
    diesel_coe_to_date = _coe_to_date(
        accumulators.cumulative_diesel_npc,
        accumulators.cumulative_diesel_discounted_energy,
    )

    _maybe_set_breakeven(accumulators, year)
    _maybe_set_lcoe_crossover(
        accumulators, year, mg_coe_to_date, diesel_coe_to_date
    )

    return {
        "year": year,
        "mgAnnualCost": round(mg_cost, 2),
        "dieselAnnualCost": round(diesel_cost, 2),
        "mgCumulative": round(accumulators.cumulative_mg_npc, 2),
        "dieselCumulative": round(accumulators.cumulative_diesel_npc, 2),
        "mgLcoe": round(mg_coe_to_date, 4),
        "dieselLcoe": round(diesel_coe_to_date, 4),
        "annualRevenue": round((diesel_cost - mg_cost) * discount_factor, 2),
        "cumulativeRevenue": round(accumulators.cumulative_savings_npc, 2),
    }


def _build_comparison_table(
    *,
    microgrid_yearly_costs: list[float],
    diesel_only_yearly_costs: list[float],
    project_years: int,
    real_discount_rate: float,
    annual_served_microgrid: float,
    annual_served_diesel: float,
) -> tuple[pd.DataFrame, _ComparisonAccumulators]:
    accumulators = _ComparisonAccumulators()
    rows: list[dict[str, Any]] = []

    for year in range(1, project_years + 1):
        discount_factor = 1.0 / ((1.0 + real_discount_rate) ** year)
        rows.append(
            _append_comparison_row(
                accumulators,
                year=year,
                mg_cost=microgrid_yearly_costs[year - 1],
                diesel_cost=diesel_only_yearly_costs[year - 1],
                discount_factor=discount_factor,
                annual_served_microgrid=annual_served_microgrid,
                annual_served_diesel=annual_served_diesel,
            )
        )

    return pd.DataFrame(rows), accumulators


def _simple_payback_years(
    capex: SystemCapex, annual_operating_savings: float
) -> float | None:
    if annual_operating_savings <= 0:
        return None
    return round(float(capex.selling_price) / annual_operating_savings, 1)


def _build_economic_summary(context: _EconomicSummaryContext) -> dict[str, Any]:
    return {
        _SUMMARY_KEY_PROJECT_NAME: context.project.project_name,
        _SUMMARY_KEY_ANALYSIS_YEARS: context.project_years,
        _SUMMARY_KEY_ANNUAL_LOAD: float(context.project.annual_load_kwh),
        _SUMMARY_KEY_SELLING_PRICE: float(context.capex.selling_price),
        _SUMMARY_KEY_TOTAL_COST: float(context.capex.equipment_subtotal),
        _SUMMARY_KEY_PROFIT_AMOUNT: float(context.capex.profit_amount),
        _SUMMARY_KEY_MICROGRID_ANNUAL_OM: round(
            context.microgrid_fixed_om
            + context.annual_microgrid_generator_maintenance,
            2,
        ),
        _SUMMARY_KEY_MG_ANNUAL_FUEL: round(
            float(context.project.microgrid_annual_fuel_cost), 2
        ),
        _SUMMARY_KEY_DIESEL_ANNUAL_FUEL: round(
            float(context.project.dieselonly_annual_fuel_cost), 2
        ),
        _SUMMARY_KEY_ANNUAL_OPERATING_SAVINGS: context.annual_operating_savings,
        _SUMMARY_KEY_SIMPLE_PAYBACK: context.simple_payback_years,
        _SUMMARY_KEY_BREAKEVEN_YEAR: context.accumulators.breakeven_year,
        _SUMMARY_KEY_LCOE_CROSSOVER: context.accumulators.lcoe_crossover_year,
        _SUMMARY_KEY_FINAL_MG_LCOE: context.final_microgrid_coe,
        _SUMMARY_KEY_FINAL_DIESEL_LCOE: context.final_diesel_coe,
        _SUMMARY_KEY_FINAL_CUMULATIVE_REVENUE: round(
            context.total_diesel_npc - context.total_microgrid_npc, 2
        ),
        _SUMMARY_KEY_MICROGRID_NPC: context.total_microgrid_npc,
        _SUMMARY_KEY_DIESEL_ONLY_NPC: context.total_diesel_npc,
        _SUMMARY_KEY_NPC_SAVINGS: round(
            context.total_diesel_npc - context.total_microgrid_npc, 2
        ),
        _SUMMARY_KEY_MICROGRID_ANNUALIZED: (
            context.total_annualized_microgrid_cost
        ),
        _SUMMARY_KEY_DIESEL_ANNUALIZED: context.total_annualized_diesel_cost,
        _SUMMARY_KEY_MICROGRID_OPERATING: context.microgrid_operating_cost,
        _SUMMARY_KEY_DIESEL_OPERATING: context.diesel_only_operating_cost,
        _SUMMARY_KEY_MICROGRID_FIXED_OM: round(context.microgrid_fixed_om, 2),
        _SUMMARY_KEY_MICROGRID_GEN_MAINT: round(
            context.annual_microgrid_generator_maintenance, 2
        ),
        _SUMMARY_KEY_DIESEL_GEN_MAINT: round(
            context.annual_diesel_only_generator_maintenance, 2
        ),
        _SUMMARY_KEY_MICROGRID_CAPITAL_NPC: (
            context.microgrid_npc_components[_NPC_KEY_CAPITAL]
        ),
        _SUMMARY_KEY_MICROGRID_REPLACEMENT_NPC: (
            context.microgrid_npc_components[_NPC_KEY_REPLACEMENT]
        ),
        _SUMMARY_KEY_MICROGRID_SALVAGE_NPC: context.microgrid_npc_components[
            _NPC_KEY_SALVAGE
        ],
        _SUMMARY_KEY_DIESEL_CAPITAL_NPC: context.diesel_only_npc_components[
            _NPC_KEY_CAPITAL
        ],
        _SUMMARY_KEY_DIESEL_REPLACEMENT_NPC: context.diesel_only_npc_components[
            _NPC_KEY_REPLACEMENT
        ],
        _SUMMARY_KEY_DIESEL_SALVAGE_NPC: context.diesel_only_npc_components[
            _NPC_KEY_SALVAGE
        ],
        _SUMMARY_KEY_REAL_DISCOUNT_PCT: round(
            context.real_discount_rate * 100.0, 2
        ),
        _SUMMARY_KEY_NOMINAL_DISCOUNT_PCT: round(
            context.settings.nominal_discount_rate * 100.0, 2
        ),
        _SUMMARY_KEY_INFLATION_PCT: round(
            context.settings.inflation_rate * 100.0, 2
        ),
        _SUMMARY_KEY_MICROGRID_GEN_LIFE: _life_years_or_none(
            context.microgrid_generator_life
        ),
        _SUMMARY_KEY_DIESEL_GEN_LIFE: _life_years_or_none(
            context.diesel_only_generator_life
        ),
        _SUMMARY_KEY_BATTERY_LIFE: _life_years_or_none(
            context.battery_life_years
        ),
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
    """构建完整的 HOMER 风格经济性报告（LCOE / NPC / 回本年等）.

    汇总项目参数、CAPEX 明细、双场景仿真结果与电池/发电机规格，
    计算全生命周期成本并生成年度对比表。

    Args:
        project: 项目级经济参数（年限、折现率等）.
        capex: CAPEX 明细.
        breakdown: 模板成本明细（含运维成本）.
        microgrid_simulation: 微电网场景仿真结果.
        diesel_only_simulation: 纯柴油场景仿真结果.
        battery_pack_count: 电池包数量.
        battery_pack_kwh: 单包容量（kWh）.
        battery_cycle_life: 电池循环寿命.
        microgrid_generator_capital_cost: 微电网方案柴油机购置成本.
        microgrid_generator_replacement_cost: 微电网方案柴油机更换成本.
        diesel_only_generator_capital_cost: 纯柴油方案柴油机购置成本.
        diesel_only_generator_replacement_cost: 纯柴油方案柴油机更换成本.
        settings: 经济性模型设置；None 时从 project 推导.

    Returns:
        包含 summary、comparison_table 等键的完整报告字典.
    """
    settings = _resolve_settings(project, settings)
    project_years = int(project.analysis_years)
    real_discount_rate = settings.real_discount_rate

    microgrid_runtime_hours = _simulation_float(
        microgrid_simulation, _SIM_ANNUAL_DIESEL_HOURS
    )
    diesel_only_runtime_hours = _simulation_float(
        diesel_only_simulation, _SIM_ANNUAL_DIESEL_HOURS
    )

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
        annual_discharge_kwh=_simulation_float(
            microgrid_simulation, _SIM_ANNUAL_BATTERY_DISCHARGE
        ),
        battery_pack_count=battery_pack_count,
        battery_pack_kwh=battery_pack_kwh,
        battery_cycle_life=battery_cycle_life,
        float_life_years=settings.battery_float_life_years,
        depth_of_discharge=settings.battery_depth_of_discharge,
    )

    annual_microgrid_generator_maintenance = _annual_generator_maintenance(
        breakdown.diesel_om, microgrid_runtime_hours
    )
    annual_diesel_only_generator_maintenance = _annual_generator_maintenance(
        breakdown.diesel_om, diesel_only_runtime_hours
    )

    microgrid_components = _build_microgrid_components(
        capex=capex,
        breakdown=breakdown,
        microgrid_generator_capital_cost=microgrid_generator_capital_cost,
        microgrid_generator_replacement_cost=microgrid_generator_replacement_cost,
        microgrid_generator_life_years=microgrid_generator_life,
        battery_life_years=battery_life_years,
        annual_microgrid_generator_maintenance=annual_microgrid_generator_maintenance,
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

    annual_served_microgrid = _annual_served_kwh(
        microgrid_simulation, float(project.annual_load_kwh)
    )
    annual_served_diesel = _annual_served_kwh(
        diesel_only_simulation, float(project.annual_load_kwh)
    )

    comparison, accumulators = _build_comparison_table(
        microgrid_yearly_costs=microgrid_yearly_costs,
        diesel_only_yearly_costs=diesel_only_yearly_costs,
        project_years=project_years,
        real_discount_rate=real_discount_rate,
        annual_served_microgrid=annual_served_microgrid,
        annual_served_diesel=annual_served_diesel,
    )

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

    total_microgrid_npc = round(accumulators.cumulative_mg_npc, 2)
    total_diesel_npc = round(accumulators.cumulative_diesel_npc, 2)
    total_annualized_microgrid_cost = round(
        total_microgrid_npc * _crf(real_discount_rate, project_years), 2
    )
    total_annualized_diesel_cost = round(
        total_diesel_npc * _crf(real_discount_rate, project_years), 2
    )

    final_microgrid_coe = (
        round(total_annualized_microgrid_cost / annual_served_microgrid, 4)
        if annual_served_microgrid > 0
        else 0.0
    )
    final_diesel_coe = (
        round(total_annualized_diesel_cost / annual_served_diesel, 4)
        if annual_served_diesel > 0
        else 0.0
    )
    microgrid_operating_cost = round(
        float(project.microgrid_annual_fuel_cost)
        + microgrid_fixed_om
        + annual_microgrid_generator_maintenance,
        2,
    )
    diesel_only_operating_cost = round(
        float(project.dieselonly_annual_fuel_cost)
        + annual_diesel_only_generator_maintenance,
        2,
    )
    annual_operating_savings = round(
        diesel_only_operating_cost - microgrid_operating_cost, 2
    )
    simple_payback = _simple_payback_years(capex, annual_operating_savings)

    summary = _build_economic_summary(
        _EconomicSummaryContext(
            project=project,
            capex=capex,
            settings=settings,
            project_years=project_years,
            real_discount_rate=real_discount_rate,
            microgrid_fixed_om=microgrid_fixed_om,
            annual_microgrid_generator_maintenance=annual_microgrid_generator_maintenance,
            annual_diesel_only_generator_maintenance=annual_diesel_only_generator_maintenance,
            microgrid_generator_life=microgrid_generator_life,
            diesel_only_generator_life=diesel_only_generator_life,
            battery_life_years=battery_life_years,
            accumulators=accumulators,
            total_microgrid_npc=total_microgrid_npc,
            total_diesel_npc=total_diesel_npc,
            total_annualized_microgrid_cost=total_annualized_microgrid_cost,
            total_annualized_diesel_cost=total_annualized_diesel_cost,
            final_microgrid_coe=final_microgrid_coe,
            final_diesel_coe=final_diesel_coe,
            microgrid_operating_cost=microgrid_operating_cost,
            diesel_only_operating_cost=diesel_only_operating_cost,
            annual_operating_savings=annual_operating_savings,
            simple_payback_years=simple_payback,
            microgrid_npc_components=microgrid_npc_components,
            diesel_only_npc_components=diesel_only_npc_components,
        )
    )

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
