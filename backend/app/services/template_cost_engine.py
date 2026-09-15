"""基于 Excel 模板行的 CAPEX/OPEX 成本明细计算引擎."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.services.config_loader import ProductCatalog
from app.services.economic_analysis import (
    DieselOMParams,
    MicrogridOMParams,
    SystemCapex,
)
from app.services.reporting.template_layout import (
    NO,
    YES,
    TemplateDetailRowDefault,
    TemplateOpexRowDefault,
    get_internal_template_defaults,
    validate_internal_template_formulas,
    validate_template_layouts,
)

USD = "\u7f8e\u5143 / USD"
PRODUCT_CATALOG_SOURCE = "Product catalog"
ACCESSORY_RULES_SOURCE = "Accessory rules"
INTERNAL_TEMPLATE_SOURCE = "Internal template default"


@dataclass
class DetailLine:
    """One CAPEX detail line (a template row) with cost inputs."""

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
        """人类可读的“是/否”标签."""
        return YES if self.include else NO

    @property
    def subtotal_usd(self) -> float | None:
        """按数量/单价/汇率/税率/运费等计算的小计（$）."""
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
    """One OPEX line (a template row) with annual cost inputs."""

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
        """人类可读的“是/否”标签."""
        return YES if self.include else NO

    @property
    def annual_cost_usd(self) -> float | None:
        """按数量/单价/汇率计算的年度成本（$）."""
        return calc_opex_annual_cost(self.qty, self.unit_price, self.fx_to_usd)


@dataclass
class TemplateCostBreakdown:
    """Full CAPEX/OPEX breakdown built from template rows."""

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
        """光伏系统明细行合计（$，仅计入 include=True 的行）."""
        return sum_included(self.pv_lines)

    @property
    def bess_total_usd(self) -> float:
        """储能系统明细行合计（$，仅计入 include=True 的行）."""
        return sum_included(self.bess_lines)

    @property
    def diesel_total_usd(self) -> float:
        """柴油系统明细行合计（$，仅计入 include=True 的行）."""
        return sum_included(self.diesel_lines)

    @property
    def electrical_total_usd(self) -> float:
        """电气配套明细行合计（$，仅计入 include=True 的行）."""
        return sum_included(self.electrical_lines)

    @property
    def logistics_total_usd(self) -> float:
        """物流明细行合计（$，仅计入 include=True 的行）."""
        return sum_included(self.logistics_lines)


def calc_capex_subtotal(
    qty: float | int | None,
    unit_price: float | None,
    fx_to_usd: float = 1.0,
    tax_rate: float = 0.0,
    freight_usd: float = 0.0,
    other_adjust_usd: float = 0.0,
) -> float | None:
    """计算一条 CAPEX 明细行的小计（$）.

    Args:
        qty: 数量.
        unit_price: 单价.
        fx_to_usd: 汇率（本币 → $）.
        tax_rate: 税率（如 0.13）.
        freight_usd: 运费（$）.
        other_adjust_usd: 其他调整金额（$）.

    Returns:
        小计金额；qty 或 unit_price 缺失时返回 None.
    """
    if qty in (None, "") or unit_price in (None, ""):
        return None
    return round(
        float(qty)
        * float(unit_price)
        * float(fx_to_usd)
        * (1 + float(tax_rate))
        + float(freight_usd)
        + float(other_adjust_usd),
        2,
    )


def calc_opex_annual_cost(
    qty: float | int | None,
    unit_price: float | None,
    fx_to_usd: float = 1.0,
) -> float | None:
    """计算一条 OPEX 行的年度成本（$）.

    Args:
        qty: 数量.
        unit_price: 单价.
        fx_to_usd: 汇率（本币 → $）.

    Returns:
        年度成本；qty 或 unit_price 缺失时返回 None.
    """
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


def _value_or_default(value: Any, default: Any) -> Any:
    return default if value is None else value


def _fallback(mapping: dict[str, Any], key: str, default: Any) -> Any:
    return mapping.get(key) or default


def _truthy_or_default(value: Any, default: Any) -> Any:
    return value or default


def _mapping_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _diesel_model_value(system_config: dict[str, Any], diesel_kw: float) -> str:
    configured = system_config.get("dieselModel")
    if configured:
        return str(configured)
    return f"DG-{diesel_kw:.0f}kW" if diesel_kw > 0 else ""


def _predictive_dispatch_cost(
    system_config: dict[str, Any], accessories: dict[str, Any]
) -> float:
    addons = {
        str(item).lower() for item in _fallback(system_config, "emsAddons", [])
    }
    control_method = str(
        _fallback(system_config, "emsControlMethod", "")
    ).lower()
    if control_method != "prediction" and "prediction" not in addons:
        return 0.0
    costs = _mapping_or_empty(accessories.get("ems_addons", {}))
    return float(costs.get("prediction_control_usd", 0.0))


def _pallet_unit_price(total: float, tray_count: int) -> float | None:
    return (
        round(total / tray_count, 2) if tray_count > 0 and total > 0 else None
    )


def _diesel_generator_price(
    catalog: ProductCatalog, diesel_kw: float, diesel_is_new: bool
) -> float:
    if diesel_kw <= 0 or not diesel_is_new:
        return 0.0
    return float(catalog.diesel_generator(power_kw=diesel_kw).price_usd)


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
        key=_value_or_default(key, default.key),
        row=default.row,
        include=_value_or_default(include, default.include),
        system=default.system,
        subcategory=default.subcategory,
        item=default.item,
        brand=_value_or_default(brand, default.brand),
        model=_value_or_default(model, default.model),
        spec=_value_or_default(spec, default.spec),
        qty_unit=_value_or_default(qty_unit, default.qty_unit),
        qty=_value_or_default(qty, _numeric(default.qty)),
        unit_price=_value_or_default(unit_price, _numeric(default.unit_price)),
        currency=_value_or_default(currency, default.currency or USD),
        fx_to_usd=_value_or_default(
            fx_to_usd, _numeric(default.fx_to_usd) or 1.0
        ),
        tax_rate=_value_or_default(tax_rate, _numeric(default.tax_rate) or 0.0),
        freight_usd=_value_or_default(
            freight_usd, _numeric(default.freight_usd) or 0.0
        ),
        other_adjust_usd=_value_or_default(
            other_adjust_usd, _numeric(default.other_adjust_usd) or 0.0
        ),
        source=_value_or_default(source, default.source),
        remarks=_value_or_default(remarks, default.remarks),
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
        key=_value_or_default(key, default.key),
        row=default.row,
        include=_value_or_default(include, default.include),
        category=default.category,
        subcategory=default.subcategory,
        item=default.item,
        basis=_value_or_default(basis, default.basis),
        qty_unit=_value_or_default(qty_unit, default.qty_unit),
        qty=_value_or_default(qty, _numeric(default.qty)),
        unit_price=_value_or_default(unit_price, _numeric(default.unit_price)),
        currency=_value_or_default(currency, default.currency or USD),
        fx_to_usd=_value_or_default(
            fx_to_usd, _numeric(default.fx_to_usd) or 1.0
        ),
        source=_value_or_default(source, default.source),
        remarks=_value_or_default(remarks, default.remarks),
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
    """Sum the subtotal of every CAPEX detail line with include=True."""
    total = 0.0
    for line in lines:
        subtotal = line.subtotal_usd
        if line.include and subtotal is not None:
            total += subtotal
    return round(total, 2)


def sum_opex_included(lines: list[OpexLine]) -> float:
    """Sum the annual cost of every OPEX line with include=True."""
    total = 0.0
    for line in lines:
        cost = line.annual_cost_usd
        if line.include and cost is not None:
            total += cost
    return round(total, 2)


def _build_pv_lines(defaults, values: dict[str, Any]) -> list[DetailLine]:
    panel_count = values["panel_count"]
    inverter_count = values["inverter_count"]
    pv_sets = values["pv_sets"]
    return [
        _detail_line(
            defaults["module_primary"],
            include=panel_count > 0,
            brand=defaults["module_primary"].brand or "VoltageEnergy",
            model=values["panel_model"],
            spec=str(values["panel_watts"]),
            qty=panel_count,
            unit_price=values["panel_price"],
            source=PRODUCT_CATALOG_SOURCE,
        ),
        _detail_line(
            defaults["module_secondary"],
            include=False,
            qty=None,
            unit_price=None,
        ),
        _detail_line(
            defaults["inverter"],
            include=inverter_count > 0,
            brand=defaults["inverter"].brand or "VoltageEnergy",
            model=values["inverter_model"],
            spec=values["voltage_level"],
            qty=inverter_count,
            unit_price=values["inverter_price"],
            source=PRODUCT_CATALOG_SOURCE,
        ),
        _detail_line(
            defaults["combiner"], include=False, qty=None, unit_price=None
        ),
        _detail_line(
            defaults["mounting"],
            include=pv_sets > 0,
            brand=defaults["mounting"].brand or "VoltageEnergy",
            model="28m x 5.6m bracket set",
            qty=pv_sets,
            unit_price=12700.0,
            tax_rate=0.5,
            source="Bracket pricing rule",
        ),
        _detail_line(defaults["mc4"], include=False, qty=None, unit_price=None),
        _detail_line(
            defaults["dc_combiner_box"],
            include=False,
            qty=None,
            unit_price=None,
        ),
        _detail_line(
            defaults["other_aux"], include=False, qty=None, unit_price=None
        ),
    ]


def _build_bess_lines(defaults, values: dict[str, Any]) -> list[DetailLine]:
    battery_count = values["battery_count"]
    tray_count = values["tray_count"]
    pallet_unit_price = values["pallet_unit_price"]
    predictive_cost = values["predictive_dispatch_cost"]
    return [
        _detail_line(defaults["pcs"], include=False, qty=None, unit_price=None),
        _detail_line(
            defaults["battery_pack"],
            include=battery_count > 0,
            brand=defaults["battery_pack"].brand or "VoltageEnergy",
            model=values["battery_model"],
            spec=f"{values['battery_pack_kwh']:.2f} kWh",
            qty=battery_count,
            unit_price=values["battery_price"],
            source=PRODUCT_CATALOG_SOURCE,
        ),
        _detail_line(
            defaults["integrated_pallet"],
            include=tray_count > 0 and pallet_unit_price not in (None, 0),
            brand=defaults["integrated_pallet"].brand or "VoltageEnergy",
            model=defaults["integrated_pallet"].model or "Integrated pallet",
            qty=tray_count,
            unit_price=pallet_unit_price,
            source=ACCESSORY_RULES_SOURCE,
        ),
        _detail_line(
            defaults["battery_cabinet"],
            include=False,
            qty=None,
            unit_price=None,
        ),
        _detail_line(defaults["bms"], include=False, qty=None, unit_price=None),
        _detail_line(
            defaults["ems"],
            include=predictive_cost > 0,
            brand=defaults["ems"].brand or "VoltageEnergy",
            model="Predictive Dispatch EMS",
            spec="Forecast-based optimized dispatch",
            qty=1 if predictive_cost > 0 else None,
            unit_price=predictive_cost if predictive_cost > 0 else None,
            source=PRODUCT_CATALOG_SOURCE,
        ),
        _detail_line(
            defaults["hvac"], include=False, qty=None, unit_price=None
        ),
        _detail_line(
            defaults["fire_suppression"],
            include=False,
            qty=None,
            unit_price=None,
        ),
        _detail_line(
            defaults["bess_aux"], include=False, qty=None, unit_price=None
        ),
    ]


def _build_diesel_lines(defaults, values: dict[str, Any]) -> list[DetailLine]:
    diesel_kw = values["diesel_kw"]
    included = values["diesel_is_new"] and diesel_kw > 0
    return [
        _detail_line(
            defaults["generator"],
            include=included,
            brand=defaults["generator"].brand or "VoltageEnergy",
            model=values["diesel_model"],
            spec=f"{diesel_kw:.0f}kW"
            if diesel_kw > 0
            else defaults["generator"].spec,
            qty=1 if diesel_kw > 0 else None,
            unit_price=values["dg_price"] if values["dg_price"] > 0 else None,
            source=PRODUCT_CATALOG_SOURCE,
        ),
        *[
            _detail_line(
                defaults[key], include=False, qty=None, unit_price=None
            )
            for key in (
                "ats_panel",
                "day_tank",
                "exhaust",
                "starter_battery",
                "diesel_aux",
            )
        ],
    ]


def _build_electrical_lines(defaults, split: list[float]) -> list[DetailLine]:
    def active(index):
        return split[index] > 0

    def priced(index):
        return split[index] if active(index) else None

    return [
        _detail_line(
            defaults["switchgear"],
            include=active(0),
            qty=1 if active(0) else None,
            unit_price=priced(0),
            source=ACCESSORY_RULES_SOURCE,
        ),
        _detail_line(
            defaults["transformer"], include=False, qty=None, unit_price=None
        ),
        _detail_line(
            defaults["ac_cable"],
            include=active(1),
            qty=1 if active(1) else None,
            unit_price=priced(1),
            source=ACCESSORY_RULES_SOURCE,
        ),
        _detail_line(
            defaults["dc_cable"],
            include=active(2),
            qty=1 if active(2) else None,
            unit_price=priced(2),
            source=ACCESSORY_RULES_SOURCE,
        ),
        *[
            _detail_line(
                defaults[key], include=False, qty=None, unit_price=None
            )
            for key in ("grounding", "scada", "cable_tray", "electrical_aux")
        ],
    ]


def _build_logistics_lines(
    defaults, values: dict[str, Any]
) -> list[DetailLine]:
    transport = values["intl_transport"]
    installation = values["installation"]
    contingency = values["other_initial"]
    intl_qty, install_qty = values["intl_qty"], values["install_qty"]
    return [
        _detail_line(
            defaults["international_transport"],
            include=transport > 0,
            qty=intl_qty if transport > 0 else None,
            unit_price=round(transport / intl_qty, 2)
            if transport > 0
            else None,
            source=ACCESSORY_RULES_SOURCE,
        ),
        _detail_line(
            defaults["domestic_transport"],
            include=False,
            qty=None,
            unit_price=None,
        ),
        _detail_line(
            defaults["installation_labor"],
            include=installation > 0,
            qty=install_qty if installation > 0 else None,
            unit_price=round(installation / install_qty, 2)
            if installation > 0
            else None,
            source=ACCESSORY_RULES_SOURCE,
            remarks=defaults["installation_labor"].remarks or "Estimated",
        ),
        *[
            _detail_line(
                defaults[key], include=False, qty=None, unit_price=None
            )
            for key in (
                "commissioning",
                "crane_tools",
                "customs_clearance",
                "travel_accommodation",
            )
        ],
        _detail_line(
            defaults["contingency"],
            include=contingency > 0,
            qty=1 if contingency > 0 else None,
            unit_price=contingency if contingency > 0 else None,
            source=ACCESSORY_RULES_SOURCE,
        ),
    ]


def _build_opex_lines(
    defaults, annual_diesel_maintenance: float
) -> list[OpexLine]:
    lines = [
        _opex_line(
            defaults[key],
            include=True,
            qty=1,
            unit_price=_numeric(defaults[key].unit_price),
            source=INTERNAL_TEMPLATE_SOURCE,
        )
        for key in ("microgrid_om", "equipment_repair", "insurance")
    ]
    lines.append(
        _opex_line(
            defaults["diesel_maintenance"],
            include=True,
            qty=1,
            unit_price=annual_diesel_maintenance,
            source="Template formula 10_diesel_maintenance!E31",
        )
    )
    lines.extend(
        _opex_line(defaults[key], include=False, qty=1, unit_price=None)
        for key in ("remote_monitoring", "site_lease")
    )
    lines.append(
        _opex_line(
            defaults["other_annual"], include=False, qty=None, unit_price=None
        )
    )
    return lines


@dataclass(frozen=True)
class TemplateCatalogInputs:
    """Catalog-derived inputs used to build template default rows."""

    panel_model: str
    battery_model: str
    voltage_level: str
    panel: Any
    battery: Any
    inverter: Any
    pv_sets: int
    panel_count: int
    battery_count: int
    inverter_count: int
    inverter_kw: float
    tray_count: int
    battery_pack_kwh: float
    diesel_kw: float
    diesel_model: str
    predictive_dispatch_cost: float
    intl_transport: float
    installation: float
    other_initial: float
    pallet_unit_price: float | None
    dg_price: float
    electrical_split: list[float]
    intl_qty: int
    install_qty: int


def _resolve_template_catalog_inputs(
    system_config: dict[str, Any],
    catalog: ProductCatalog,
    diesel_is_new: bool,
    defaults,
) -> TemplateCatalogInputs:
    accessories = catalog.accessories()

    panel_model = str(_fallback(system_config, "panelModel", "655W"))
    battery_model = str(_fallback(system_config, "batteryModel", "LFP-10kWh"))
    bracket_model = str(_fallback(system_config, "bracketModel", "standard_32"))
    voltage_level = str(_fallback(system_config, "voltageLevel", "120V/240V"))

    panel = catalog.panel(panel_model)
    battery = catalog.battery_pack(battery_model)
    bracket = catalog.bracket(bracket_model)
    inverter = catalog.inverter_for_voltage(voltage_level)

    pv_sets = int(_fallback(system_config, "bracketSets", 0))
    panels_per_set = int(
        _fallback(system_config, "panelsPerSet", bracket.panels_per_set)
    )
    panel_count = pv_sets * panels_per_set
    battery_count = int(_fallback(system_config, "batteryPackCount", 0))
    default_inverter_count = math.ceil(
        max(1, battery_count) / inverter.packs_per_inverter
    )
    inverter_count = max(
        1,
        int(_fallback(system_config, "inverterCount", default_inverter_count)),
    )
    inverter_kw = float(
        _fallback(system_config, "inverterKw", inverter.power_kw)
    )
    tray_count = int(
        _fallback(system_config, "trayCount", max(1, inverter_count))
    )
    battery_pack_kwh = float(
        _fallback(system_config, "batteryPackKwh", battery.capacity_kwh)
    )
    diesel_kw = float(_fallback(system_config, "dieselCapacityKw", 0.0))
    diesel_model = _diesel_model_value(system_config, diesel_kw)
    predictive_dispatch_cost = _predictive_dispatch_cost(
        system_config, accessories
    )

    intl_transport = float(
        accessories["intl_transport"]["base_usd"]
    ) + pv_sets * float(accessories["intl_transport"]["per_bracket_set_usd"])
    installation = float(
        accessories["installation"]["base_usd"]
    ) + pv_sets * float(accessories["installation"]["per_bracket_set_usd"])
    accessory_cost = float(
        accessories["accessory_materials"]["base_usd"]
    ) + pv_sets * float(
        accessories["accessory_materials"]["per_bracket_set_usd"]
    )
    other_initial = float(accessories.get("other_initial_usd", 0.0))

    pallet_per_pack = float(
        accessories.get("battery_pallet", {}).get("per_pack_usd", 250.0)
    )
    pallet_total = round(battery_count * pallet_per_pack, 2)
    pallet_unit_price = _pallet_unit_price(pallet_total, tray_count)
    dg_price = _diesel_generator_price(catalog, diesel_kw, diesel_is_new)
    electrical_split = _scaled_split(accessory_cost, [26000.0, 200.0, 2000.0])
    intl_qty = int(
        _truthy_or_default(
            _numeric(defaults.logistics["international_transport"].qty), 1
        )
    )
    install_qty = int(
        _truthy_or_default(
            _numeric(defaults.logistics["installation_labor"].qty), 1
        )
    )

    return TemplateCatalogInputs(
        panel_model=panel_model,
        battery_model=battery_model,
        voltage_level=voltage_level,
        panel=panel,
        battery=battery,
        inverter=inverter,
        pv_sets=pv_sets,
        panel_count=panel_count,
        battery_count=battery_count,
        inverter_count=inverter_count,
        inverter_kw=inverter_kw,
        tray_count=tray_count,
        battery_pack_kwh=battery_pack_kwh,
        diesel_kw=diesel_kw,
        diesel_model=diesel_model,
        predictive_dispatch_cost=predictive_dispatch_cost,
        intl_transport=intl_transport,
        installation=installation,
        other_initial=other_initial,
        pallet_unit_price=pallet_unit_price,
        dg_price=dg_price,
        electrical_split=electrical_split,
        intl_qty=intl_qty,
        install_qty=install_qty,
    )


def build_template_cost_breakdown(
    *,
    system_config: dict[str, Any],
    simulation: dict[str, Any],
    catalog: ProductCatalog,
    diesel_is_new: bool = False,
) -> TemplateCostBreakdown:
    """构建完整的 CAPEX/OPEX 成本明细.

    Args:
        system_config: 系统配置（容量、型号等），键沿用前端命名.
        simulation: 仿真结果（用于运维成本估算等）.
        catalog: 产品目录，用于查询单价.
        diesel_is_new: 柴油机是否为新购（影响运维默认值）.

    Returns:
        完整的 TemplateCostBreakdown.
    """
    validate_template_layouts()
    validate_internal_template_formulas()
    defaults = get_internal_template_defaults()

    pricing = catalog.pricing()
    inputs = _resolve_template_catalog_inputs(
        system_config, catalog, diesel_is_new, defaults
    )

    pv_lines = _build_pv_lines(
        defaults.pv,
        {
            "panel_count": inputs.panel_count,
            "inverter_count": inputs.inverter_count,
            "pv_sets": inputs.pv_sets,
            "panel_model": inputs.panel_model,
            "panel_watts": int(
                _fallback(system_config, "panelWatts", inputs.panel.watts)
            ),
            "panel_price": round(inputs.panel.price_usd_per_panel, 2),
            "inverter_model": getattr(
                inputs.inverter,
                "model",
                f"{inputs.inverter_kw:.0f}kW Hybrid Inverter",
            ),
            "voltage_level": inputs.voltage_level,
            "inverter_price": float(inputs.inverter.price_usd),
        },
    )
    bess_lines = _build_bess_lines(
        defaults.bess,
        {
            "battery_count": inputs.battery_count,
            "tray_count": inputs.tray_count,
            "pallet_unit_price": inputs.pallet_unit_price,
            "predictive_dispatch_cost": inputs.predictive_dispatch_cost,
            "battery_model": inputs.battery_model,
            "battery_pack_kwh": inputs.battery_pack_kwh,
            "battery_price": float(inputs.battery.price_usd),
        },
    )
    diesel_lines = _build_diesel_lines(
        defaults.diesel,
        {
            "diesel_kw": inputs.diesel_kw,
            "diesel_is_new": diesel_is_new,
            "diesel_model": inputs.diesel_model,
            "dg_price": inputs.dg_price,
        },
    )
    electrical_lines = _build_electrical_lines(
        defaults.electrical, inputs.electrical_split
    )
    logistics_lines = _build_logistics_lines(
        defaults.logistics,
        {
            "intl_transport": inputs.intl_transport,
            "installation": inputs.installation,
            "other_initial": inputs.other_initial,
            "intl_qty": inputs.intl_qty,
            "install_qty": inputs.install_qty,
        },
    )

    diesel_om = build_template_diesel_om_params(simulation)
    annual_diesel_maintenance = calc_template_diesel_maintenance(diesel_om)

    opex_lines = _build_opex_lines(defaults.opex, annual_diesel_maintenance)

    profit_margin = float(pricing.get("profit_margin", 0.20))

    pv_total = sum_included(pv_lines)
    bess_total = sum_included(bess_lines)
    diesel_total = sum_included(diesel_lines)
    electrical_total = sum_included(electrical_lines)

    capex = SystemCapex(
        pv_module_cost=round(
            max(pv_total - line_subtotal_by_key(pv_lines, "mounting"), 0.0), 2
        ),
        pv_mounting_cost=line_subtotal_by_key(pv_lines, "mounting"),
        energy_storage_cost=bess_total,
        diesel_generator_cost=diesel_total,
        intl_transport_cost=line_subtotal_by_key(
            logistics_lines, "international_transport"
        ),
        installation_cost=line_subtotal_by_key(
            logistics_lines, "installation_labor"
        ),
        accessory_cost=electrical_total,
        other_initial_cost=line_subtotal_by_key(logistics_lines, "contingency"),
        profit_margin=profit_margin,
    )

    microgrid_om = MicrogridOMParams(
        pv_storage_om_annual=line_annual_cost_by_key(
            opex_lines, "microgrid_om"
        ),
        equipment_repair_annual=line_annual_cost_by_key(
            opex_lines, "equipment_repair"
        ),
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


def build_template_diesel_om_params(
    simulation: dict[str, Any],
) -> DieselOMParams:
    """按模板内置默认值构建 DieselOMParams（运行小时取自仿真结果）."""
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


def _air_filter_cost(
    params: DieselOMParams, annual_runtime: float, minor_services: int
) -> float:
    if params.S_air in (None, ""):
        return math.ceil(minor_services / 2) * params.C_af
    interval = float(params.S_air)
    return (
        0.0
        if interval <= 0
        else math.ceil(annual_runtime / interval) * params.C_af
    )


def _interval_service_cost(
    interval: Any, material_cost: float, labor_cost: float
) -> float:
    if interval in (None, "") or float(interval) <= 0:
        return 0.0
    return (material_cost + labor_cost) / float(interval)


def calc_template_diesel_maintenance(params: DieselOMParams) -> float:
    """按模板公式计算柴油机年度维护成本（$）."""
    annual_runtime = params.hours_b
    if annual_runtime in (None, ""):
        return 0.0

    annual_runtime = float(annual_runtime)
    if annual_runtime <= 0:
        return 0.0

    annual_minor_services = (
        math.ceil(annual_runtime / params.S_oil) if params.S_oil > 0 else 0
    )

    annual_minor_service_cost = annual_minor_services * (
        (params.t_pm * params.labor_rate)
        + (params.V_oil * params.P_oil)
        + params.C_of
        + params.C_ff
    )

    annual_air_filter_cost = _air_filter_cost(
        params, annual_runtime, annual_minor_services
    )
    annual_coolant_cost = _interval_service_cost(
        params.coolant_interval_years,
        params.coolant_gal_per_service * params.P_coolant,
        params.coolant_labor_hours * params.labor_rate,
    )
    annual_battery_cost = _interval_service_cost(
        params.battery_interval_years,
        params.C_battery,
        params.battery_labor_hours * params.labor_rate,
    )

    return round(
        annual_minor_service_cost
        + annual_air_filter_cost
        + annual_coolant_cost
        + annual_battery_cost,
        2,
    )


def line_subtotal_by_key(lines: list[DetailLine], key: str) -> float:
    """Return the subtotal of the line with the given key, or 0.0."""
    for line in lines:
        if line.key == key:
            return float(line.subtotal_usd or 0.0)
    return 0.0


def line_annual_cost_by_key(lines: list[OpexLine], key: str) -> float:
    """Return the annual cost of the line with the given key, or 0.0."""
    for line in lines:
        if line.key == key:
            return float(line.annual_cost_usd or 0.0)
    return 0.0
