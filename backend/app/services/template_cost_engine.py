from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.services.config_loader import ProductCatalog
from app.services.economic_analysis import DieselOMParams, MicrogridOMParams, SystemCapex
from app.services.reporting.template_layout import (
    YES,
    NO,
    TemplateDetailRowDefault,
    TemplateOpexRowDefault,
    get_internal_template_defaults,
    validate_internal_template_formulas,
    validate_template_layouts,
)


USD = "\u7f8e\u5143 / USD"


@dataclass
class DetailLine:
    key: str
    row: int
    include: bool
    system: str
    subcategory: str
    item: str
    brand: str = ""
    model: str = ""
    spec: str = ""
    qty_unit: str = ""
    qty: float | int | None = None
    unit_price: float | None = None
    currency: str = USD
    fx_to_usd: float = 1.0
    tax_rate: float = 0.0
    freight_usd: float = 0.0
    other_adjust_usd: float = 0.0
    source: str = ""
    remarks: str = ""

    @property
    def include_label(self) -> str:
        return YES if self.include else NO

    @property
    def subtotal_usd(self) -> float | None:
        return calc_capex_subtotal(
            self.qty,
            self.unit_price,
            self.fx_to_usd,
            self.tax_rate,
            self.freight_usd,
            self.other_adjust_usd,
        )


@dataclass
class OpexLine:
    key: str
    row: int
    include: bool
    category: str
    subcategory: str
    item: str
    basis: str
    qty_unit: str
    qty: float | int | None
    unit_price: float | None
    currency: str = USD
    fx_to_usd: float = 1.0
    source: str = ""
    remarks: str = ""

    @property
    def include_label(self) -> str:
        return YES if self.include else NO

    @property
    def annual_cost_usd(self) -> float | None:
        return calc_opex_annual_cost(self.qty, self.unit_price, self.fx_to_usd)


@dataclass
class TemplateCostBreakdown:
    pv_lines: list[DetailLine]
    bess_lines: list[DetailLine]
    diesel_lines: list[DetailLine]
    electrical_lines: list[DetailLine]
    logistics_lines: list[DetailLine]
    opex_lines: list[OpexLine]
    capex: SystemCapex
    microgrid_om: MicrogridOMParams
    diesel_om: DieselOMParams
    annual_diesel_maintenance_usd: float
    annual_fixed_opex_total_usd: float

    @property
    def pv_total_usd(self) -> float:
        return sum_included(self.pv_lines)

    @property
    def bess_total_usd(self) -> float:
        return sum_included(self.bess_lines)

    @property
    def diesel_total_usd(self) -> float:
        return sum_included(self.diesel_lines)

    @property
    def electrical_total_usd(self) -> float:
        return sum_included(self.electrical_lines)

    @property
    def logistics_total_usd(self) -> float:
        return sum_included(self.logistics_lines)


def calc_capex_subtotal(
    qty: float | int | None,
    unit_price: float | None,
    fx_to_usd: float = 1.0,
    tax_rate: float = 0.0,
    freight_usd: float = 0.0,
    other_adjust_usd: float = 0.0,
) -> float | None:
    if qty in (None, "") or unit_price in (None, ""):
        return None
    return round(
        float(qty) * float(unit_price) * float(fx_to_usd) * (1 + float(tax_rate))
        + float(freight_usd)
        + float(other_adjust_usd),
        2,
    )


def calc_opex_annual_cost(
    qty: float | int | None,
    unit_price: float | None,
    fx_to_usd: float = 1.0,
) -> float | None:
    if qty in (None, "") or unit_price in (None, ""):
        return None
    return round(float(qty) * float(unit_price) * float(fx_to_usd), 2)


def _numeric(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.startswith("="):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _detail_line(
    default: TemplateDetailRowDefault,
    *,
    key: str | None = None,
    include: bool | None = None,
    brand: str | None = None,
    model: str | None = None,
    spec: str | None = None,
    qty_unit: str | None = None,
    qty: float | int | None = None,
    unit_price: float | None = None,
    currency: str | None = None,
    fx_to_usd: float | None = None,
    tax_rate: float | None = None,
    freight_usd: float | None = None,
    other_adjust_usd: float | None = None,
    source: str | None = None,
    remarks: str | None = None,
) -> DetailLine:
    return DetailLine(
        key=default.key if key is None else key,
        row=default.row,
        include=default.include if include is None else include,
        system=default.system,
        subcategory=default.subcategory,
        item=default.item,
        brand=default.brand if brand is None else brand,
        model=default.model if model is None else model,
        spec=default.spec if spec is None else spec,
        qty_unit=default.qty_unit if qty_unit is None else qty_unit,
        qty=_numeric(default.qty) if qty is None else qty,
        unit_price=_numeric(default.unit_price) if unit_price is None else unit_price,
        currency=default.currency or USD if currency is None else currency,
        fx_to_usd=_numeric(default.fx_to_usd) or 1.0 if fx_to_usd is None else fx_to_usd,
        tax_rate=_numeric(default.tax_rate) or 0.0 if tax_rate is None else tax_rate,
        freight_usd=_numeric(default.freight_usd) or 0.0 if freight_usd is None else freight_usd,
        other_adjust_usd=_numeric(default.other_adjust_usd) or 0.0 if other_adjust_usd is None else other_adjust_usd,
        source=default.source if source is None else source,
        remarks=default.remarks if remarks is None else remarks,
    )


def _opex_line(
    default: TemplateOpexRowDefault,
    *,
    key: str | None = None,
    include: bool | None = None,
    basis: str | None = None,
    qty_unit: str | None = None,
    qty: float | int | None = None,
    unit_price: float | None = None,
    currency: str | None = None,
    fx_to_usd: float | None = None,
    source: str | None = None,
    remarks: str | None = None,
) -> OpexLine:
    return OpexLine(
        key=default.key if key is None else key,
        row=default.row,
        include=default.include if include is None else include,
        category=default.category,
        subcategory=default.subcategory,
        item=default.item,
        basis=default.basis if basis is None else basis,
        qty_unit=default.qty_unit if qty_unit is None else qty_unit,
        qty=_numeric(default.qty) if qty is None else qty,
        unit_price=_numeric(default.unit_price) if unit_price is None else unit_price,
        currency=default.currency or USD if currency is None else currency,
        fx_to_usd=_numeric(default.fx_to_usd) or 1.0 if fx_to_usd is None else fx_to_usd,
        source=default.source if source is None else source,
        remarks=default.remarks if remarks is None else remarks,
    )


def _scaled_split(total: float, base_parts: list[float]) -> list[float]:
    if total <= 0:
        return [0.0 for _ in base_parts]
    base_sum = sum(base_parts)
    if base_sum <= 0:
        return [0.0 for _ in base_parts]
    values = [round(total * base / base_sum, 2) for base in base_parts]
    diff = round(total - sum(values), 2)
    values[0] = round(values[0] + diff, 2)
    return values


def sum_included(lines: list[DetailLine]) -> float:
    total = 0.0
    for line in lines:
        subtotal = line.subtotal_usd
        if line.include and subtotal is not None:
            total += subtotal
    return round(total, 2)


def sum_opex_included(lines: list[OpexLine]) -> float:
    total = 0.0
    for line in lines:
        cost = line.annual_cost_usd
        if line.include and cost is not None:
            total += cost
    return round(total, 2)


def build_template_cost_breakdown(
    *,
    system_config: dict[str, Any],
    simulation: dict[str, Any],
    catalog: ProductCatalog,
    diesel_is_new: bool = False,
) -> TemplateCostBreakdown:
    validate_template_layouts()
    validate_internal_template_formulas()
    defaults = get_internal_template_defaults()

    pricing = catalog.pricing()
    accessories = catalog.accessories()

    panel_model = str(system_config.get("panelModel") or "655W")
    battery_model = str(system_config.get("batteryModel") or "LFP-10kWh")
    bracket_model = str(system_config.get("bracketModel") or "standard_32")
    voltage_level = str(system_config.get("voltageLevel") or "120V/240V")

    panel = catalog.panel(panel_model)
    battery = catalog.battery_pack(battery_model)
    bracket = catalog.bracket(bracket_model)
    inverter = catalog.inverter_for_voltage(voltage_level)

    pv_sets = int(system_config.get("bracketSets") or 0)
    panels_per_set = int(system_config.get("panelsPerSet") or bracket.panels_per_set)
    panel_count = pv_sets * panels_per_set
    battery_count = int(system_config.get("batteryPackCount") or 0)
    inverter_count = max(
        1,
        int(
            system_config.get("inverterCount")
            or math.ceil(max(1, battery_count) / inverter.packs_per_inverter)
            or 1
        ),
    )
    inverter_kw = float(system_config.get("inverterKw") or inverter.power_kw)
    tray_count = int(system_config.get("trayCount") or max(1, inverter_count))
    battery_pack_kwh = float(system_config.get("batteryPackKwh") or battery.capacity_kwh)
    diesel_kw = float(system_config.get("dieselCapacityKw") or 0.0)
    diesel_model = str(system_config.get("dieselModel") or (f"DG-{diesel_kw:.0f}kW" if diesel_kw > 0 else ""))
    ems_addons = {str(item).lower() for item in (system_config.get("emsAddons") or [])}
    ems_control_method = str(system_config.get("emsControlMethod") or "").lower()
    predictive_dispatch = ems_control_method == "prediction" or "prediction" in ems_addons
    ems_addon_costs = accessories.get("ems_addons", {}) if isinstance(accessories.get("ems_addons", {}), dict) else {}
    predictive_dispatch_cost = float(ems_addon_costs.get("prediction_control_usd", 0.0)) if predictive_dispatch else 0.0

    intl_transport = float(accessories["intl_transport"]["base_usd"]) + pv_sets * float(accessories["intl_transport"]["per_bracket_set_usd"])
    installation = float(accessories["installation"]["base_usd"]) + pv_sets * float(accessories["installation"]["per_bracket_set_usd"])
    accessory_cost = float(accessories["accessory_materials"]["base_usd"]) + pv_sets * float(accessories["accessory_materials"]["per_bracket_set_usd"])
    other_initial = float(accessories.get("other_initial_usd", 0.0))

    pallet_per_pack = float(accessories.get("battery_pallet", {}).get("per_pack_usd", 250.0))
    pallet_total = round(battery_count * pallet_per_pack, 2)
    pallet_unit_price = round(pallet_total / tray_count, 2) if tray_count > 0 and pallet_total > 0 else None

    dg_price = 0.0
    if diesel_kw > 0 and diesel_is_new:
        dg_price = float(catalog.diesel_generator(power_kw=diesel_kw).price_usd)

    electrical_split = _scaled_split(accessory_cost, [26000.0, 200.0, 2000.0])

    pv_lines = [
        _detail_line(defaults.pv["module_primary"], include=panel_count > 0, brand=defaults.pv["module_primary"].brand or "MicroGrid", model=panel_model, spec=str(int(system_config.get("panelWatts") or panel.watts)), qty=panel_count, unit_price=round(panel.price_usd_per_panel, 2), source="Product catalog"),
        _detail_line(defaults.pv["module_secondary"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.pv["inverter"], include=inverter_count > 0, brand=defaults.pv["inverter"].brand or "MicroGrid", model=getattr(inverter, "model", f"{inverter_kw:.0f}kW Hybrid Inverter"), spec=voltage_level, qty=inverter_count, unit_price=float(inverter.price_usd), source="Product catalog"),
        _detail_line(defaults.pv["combiner"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.pv["mounting"], include=pv_sets > 0, brand=defaults.pv["mounting"].brand or "MicroGrid", model="28m x 5.6m bracket set", qty=pv_sets, unit_price=12700.0, tax_rate=0.5, source="Bracket pricing rule"),
        _detail_line(defaults.pv["mc4"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.pv["dc_combiner_box"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.pv["other_aux"], include=False, qty=None, unit_price=None),
    ]

    bess_lines = [
        _detail_line(defaults.bess["pcs"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.bess["battery_pack"], include=battery_count > 0, brand=defaults.bess["battery_pack"].brand or "MicroGrid", model=battery_model, spec=f"{battery_pack_kwh:.2f} kWh", qty=battery_count, unit_price=float(battery.price_usd), source="Product catalog"),
        _detail_line(defaults.bess["integrated_pallet"], include=tray_count > 0 and pallet_unit_price not in (None, 0), brand=defaults.bess["integrated_pallet"].brand or "MicroGrid", model=defaults.bess["integrated_pallet"].model or "Integrated pallet", qty=tray_count, unit_price=pallet_unit_price, source="Accessory rules"),
        _detail_line(defaults.bess["battery_cabinet"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.bess["bms"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.bess["ems"], include=predictive_dispatch_cost > 0, brand=defaults.bess["ems"].brand or "MicroGrid", model="Predictive Dispatch EMS", spec="Forecast-based optimized dispatch", qty=1 if predictive_dispatch_cost > 0 else None, unit_price=predictive_dispatch_cost if predictive_dispatch_cost > 0 else None, source="Product catalog"),
        _detail_line(defaults.bess["hvac"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.bess["fire_suppression"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.bess["bess_aux"], include=False, qty=None, unit_price=None),
    ]

    diesel_lines = [
        _detail_line(defaults.diesel["generator"], include=diesel_is_new and diesel_kw > 0, brand=defaults.diesel["generator"].brand or "MicroGrid", model=diesel_model, spec=f"{diesel_kw:.0f}kW" if diesel_kw > 0 else defaults.diesel["generator"].spec, qty=1 if diesel_kw > 0 else None, unit_price=dg_price if dg_price > 0 else None, source="Product catalog"),
        _detail_line(defaults.diesel["ats_panel"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.diesel["day_tank"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.diesel["exhaust"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.diesel["starter_battery"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.diesel["diesel_aux"], include=False, qty=None, unit_price=None),
    ]

    electrical_lines = [
        _detail_line(defaults.electrical["switchgear"], include=electrical_split[0] > 0, qty=1 if electrical_split[0] > 0 else None, unit_price=electrical_split[0] if electrical_split[0] > 0 else None, source="Accessory rules"),
        _detail_line(defaults.electrical["transformer"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.electrical["ac_cable"], include=electrical_split[1] > 0, qty=1 if electrical_split[1] > 0 else None, unit_price=electrical_split[1] if electrical_split[1] > 0 else None, source="Accessory rules"),
        _detail_line(defaults.electrical["dc_cable"], include=electrical_split[2] > 0, qty=1 if electrical_split[2] > 0 else None, unit_price=electrical_split[2] if electrical_split[2] > 0 else None, source="Accessory rules"),
        _detail_line(defaults.electrical["grounding"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.electrical["scada"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.electrical["cable_tray"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.electrical["electrical_aux"], include=False, qty=None, unit_price=None),
    ]

    intl_qty = int(_numeric(defaults.logistics["international_transport"].qty) or 1)
    install_qty = int(_numeric(defaults.logistics["installation_labor"].qty) or 1)

    logistics_lines = [
        _detail_line(defaults.logistics["international_transport"], include=intl_transport > 0, qty=intl_qty if intl_transport > 0 else None, unit_price=round(intl_transport / intl_qty, 2) if intl_transport > 0 else None, source="Accessory rules"),
        _detail_line(defaults.logistics["domestic_transport"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.logistics["installation_labor"], include=installation > 0, qty=install_qty if installation > 0 else None, unit_price=round(installation / install_qty, 2) if installation > 0 else None, source="Accessory rules", remarks=defaults.logistics["installation_labor"].remarks or "Estimated"),
        _detail_line(defaults.logistics["commissioning"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.logistics["crane_tools"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.logistics["customs_clearance"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.logistics["travel_accommodation"], include=False, qty=None, unit_price=None),
        _detail_line(defaults.logistics["contingency"], include=other_initial > 0, qty=1 if other_initial > 0 else None, unit_price=other_initial if other_initial > 0 else None, source="Accessory rules"),
    ]

    diesel_om = build_template_diesel_om_params(simulation)
    annual_diesel_maintenance = calc_template_diesel_maintenance(diesel_om)

    opex_lines = [
        _opex_line(defaults.opex["microgrid_om"], include=True, qty=1, unit_price=_numeric(defaults.opex["microgrid_om"].unit_price), source="Internal template default"),
        _opex_line(defaults.opex["equipment_repair"], include=True, qty=1, unit_price=_numeric(defaults.opex["equipment_repair"].unit_price), source="Internal template default"),
        _opex_line(defaults.opex["insurance"], include=True, qty=1, unit_price=_numeric(defaults.opex["insurance"].unit_price), source="Internal template default"),
        _opex_line(defaults.opex["diesel_maintenance"], include=True, qty=1, unit_price=annual_diesel_maintenance, source="Template formula 10_diesel_maintenance!E31"),
        _opex_line(defaults.opex["remote_monitoring"], include=False, qty=1, unit_price=None),
        _opex_line(defaults.opex["site_lease"], include=False, qty=1, unit_price=None),
        _opex_line(defaults.opex["other_annual"], include=False, qty=None, unit_price=None),
    ]

    profit_margin = float(pricing.get("profit_margin", 0.20))

    pv_total = sum_included(pv_lines)
    bess_total = sum_included(bess_lines)
    diesel_total = sum_included(diesel_lines)
    electrical_total = sum_included(electrical_lines)

    capex = SystemCapex(
        pv_module_cost=round(max(pv_total - line_subtotal_by_key(pv_lines, "mounting"), 0.0), 2),
        pv_mounting_cost=line_subtotal_by_key(pv_lines, "mounting"),
        energy_storage_cost=bess_total,
        diesel_generator_cost=diesel_total,
        intl_transport_cost=line_subtotal_by_key(logistics_lines, "international_transport"),
        installation_cost=line_subtotal_by_key(logistics_lines, "installation_labor"),
        accessory_cost=electrical_total,
        other_initial_cost=line_subtotal_by_key(logistics_lines, "contingency"),
        profit_margin=profit_margin,
    )

    microgrid_om = MicrogridOMParams(
        pv_storage_om_annual=line_annual_cost_by_key(opex_lines, "microgrid_om"),
        equipment_repair_annual=line_annual_cost_by_key(opex_lines, "equipment_repair"),
        insurance_annual=line_annual_cost_by_key(opex_lines, "insurance"),
    )

    return TemplateCostBreakdown(
        pv_lines=pv_lines,
        bess_lines=bess_lines,
        diesel_lines=diesel_lines,
        electrical_lines=electrical_lines,
        logistics_lines=logistics_lines,
        opex_lines=opex_lines,
        capex=capex,
        microgrid_om=microgrid_om,
        diesel_om=diesel_om,
        annual_diesel_maintenance_usd=annual_diesel_maintenance,
        annual_fixed_opex_total_usd=sum_opex_included(opex_lines),
    )


def build_template_diesel_om_params(simulation: dict[str, Any]) -> DieselOMParams:
    hours_a = float(simulation.get("dieselRunHoursA") or 0.0)
    hours_b = float(simulation.get("mgDieselHours") or 0.0)
    return DieselOMParams(
        hours_a=hours_a,
        hours_b=hours_b,
        replacement_cycle_a_years=2,
        replacement_cycle_b_years=17,
        service_life_hours=15000,
        S_oil=250,
        t_pm=1.5,
        V_oil=2.15,
        P_oil=22.0,
        C_of=18.0,
        C_ff=20.0,
        C_af=30.0,
        S_air=500,
        labor_rate=125.0,
        coolant_interval_years=2,
        coolant_gal_per_service=2.0,
        P_coolant=15.0,
        coolant_labor_hours=1.0,
        battery_interval_years=2,
        C_battery=70.0,
        battery_labor_hours=0.8,
    )


def calc_template_diesel_maintenance(params: DieselOMParams) -> float:
    annual_runtime = params.hours_b
    if annual_runtime in (None, ""):
        return 0.0

    annual_runtime = float(annual_runtime)
    if annual_runtime <= 0:
        return 0.0

    annual_minor_services = math.ceil(annual_runtime / params.S_oil) if params.S_oil > 0 else 0

    annual_minor_service_cost = annual_minor_services * (
        (params.t_pm * params.labor_rate)
        + (params.V_oil * params.P_oil)
        + params.C_of
        + params.C_ff
    )

    if params.S_air in (None, ""):
        annual_air_filter_cost = math.ceil(annual_minor_services / 2) * params.C_af
    else:
        annual_air_filter_cost = 0.0 if float(params.S_air) <= 0 else math.ceil(annual_runtime / float(params.S_air)) * params.C_af

    if params.coolant_interval_years in (None, "") or float(params.coolant_interval_years) <= 0:
        annual_coolant_cost = 0.0
    else:
        annual_coolant_cost = (
            (params.coolant_gal_per_service * params.P_coolant)
            + (params.coolant_labor_hours * params.labor_rate)
        ) / float(params.coolant_interval_years)

    if params.battery_interval_years in (None, "") or float(params.battery_interval_years) <= 0:
        annual_battery_cost = 0.0
    else:
        annual_battery_cost = (
            params.C_battery
            + (params.battery_labor_hours * params.labor_rate)
        ) / float(params.battery_interval_years)

    return round(annual_minor_service_cost + annual_air_filter_cost + annual_coolant_cost + annual_battery_cost, 2)


def line_subtotal_by_key(lines: list[DetailLine], key: str) -> float:
    for line in lines:
        if line.key == key:
            return float(line.subtotal_usd or 0.0)
    return 0.0


def line_annual_cost_by_key(lines: list[OpexLine], key: str) -> float:
    for line in lines:
        if line.key == key:
            return float(line.annual_cost_usd or 0.0)
    return 0.0
