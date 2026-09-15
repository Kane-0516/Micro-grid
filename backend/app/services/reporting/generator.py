"""基于 Excel 模板填充方案数据，按受众隐藏对应工作表."""

from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any

from openpyxl import load_workbook

from app.core.catalog import get_catalog
from app.schemas.report import SendReportRequest
from app.services.reporting.audience import is_internal_email
from app.services.reporting.template_layout import (
    CUSTOMER_TEMPLATE_PATH,
    INTERNAL_TEMPLATE_PATH,
    NO,
    YES,
    WorkbookLayout,
    customer_sheet,
    get_customer_template_layout,
    get_internal_template_defaults,
    get_internal_template_layout,
    internal_sheet,
    validate_internal_template_formulas,
    validate_template_layouts,
)
from app.services.template_cost_engine import (
    DetailLine,
    OpexLine,
    TemplateCostBreakdown,
    build_template_cost_breakdown,
)


def _blank(value: Any) -> Any:
    return None if value in ("", None) else value


def _is_formula(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("=")


def _safe_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    numeric = _safe_float(value)
    return None if numeric is None else int(round(numeric))


def _set_full_recalc(workbook) -> None:
    calc = getattr(workbook, "calculation", None)
    if calc is None:
        return
    if hasattr(calc, "calcMode"):
        calc.calcMode = "auto"
    if hasattr(calc, "forceFullCalc"):
        calc.forceFullCalc = True
    if hasattr(calc, "fullCalcOnLoad"):
        calc.fullCalcOnLoad = True


def _hide_dropdown_sheet(workbook) -> None:
    for sheet_name in workbook.sheetnames:
        if "99_" in sheet_name:
            workbook[sheet_name].sheet_state = "hidden"


def _hide_customer_only_sheets(workbook, internal: bool) -> None:
    if internal:
        return
    for sheet_name in workbook.sheetnames:
        if sheet_name.startswith("02_CAPEX"):
            workbook[sheet_name].sheet_state = "hidden"


def _hide_internal_only_sheets(workbook, internal: bool) -> None:
    if not internal:
        return
    for sheet_name in workbook.sheetnames:
        if sheet_name.startswith("12_历史项目参考"):
            workbook[sheet_name].sheet_state = "hidden"


def _rename_customer_sheet_titles(workbook, internal: bool) -> None:
    if internal:
        return
    rename_map = {
        0: "01_\u9879\u76ee\u57fa\u7840\u4fe1\u606f",
        1: "\u9690\u85cf_CAPEX\u6c47\u603b",
        2: "02_\u5149\u4f0f\u7cfb\u7edf\u660e\u7ec6",
        3: "03_\u50a8\u80fd\u7cfb\u7edf\u660e\u7ec6",
        4: "04_\u67f4\u6cb9\u673a\u7cfb\u7edf\u660e\u7ec6",
        5: "05_\u7535\u6c14\u914d\u5957\u660e\u7ec6",
    }
    for index, title in rename_map.items():
        workbook.worksheets[index].title = title


def get_report_file_name(email: str) -> str:
    """Build the download file name for a report sent to the given email.

    Args:
        email: Recipient email address.

    Returns:
        A file name of the form
        VoltageEnergy_Microgrid_<audience>_<local>_<date>.xlsx.
    """
    audience = "internal" if is_internal_email(email) else "customer"
    local = (email or "").split("@", 1)[0].strip().lower() or "report"
    local = re.sub(r"[^a-z0-9._-]+", "_", local).strip("_") or "report"
    stamp = datetime.now().strftime("%Y%m%d")
    return f"VoltageEnergy_Microgrid_{audience}_{local}_{stamp}.xlsx"


def _derive_diesel_price_usd(
    summary: dict[str, Any], simulation: dict[str, Any]
) -> float | None:
    candidates = (
        (
            summary.get("dieselAnnualFuelUsd"),
            simulation.get("dieselOnlyLiters"),
        ),
        (summary.get("mgAnnualFuelUsd"), simulation.get("mgDieselLiters")),
        (
            simulation.get("annualFuelSavingUsd"),
            simulation.get("annualFuelSavingLiters"),
        ),
    )
    for numerator, denominator in candidates:
        num = _safe_float(numerator)
        den = _safe_float(denominator)
        if num is not None and den not in (None, 0):
            return round(num / den, 4)
    return None


def _project_site_text(
    req: SendReportRequest, system_config: dict[str, Any]
) -> str | None:
    parts = [part for part in [req.contact.city, req.contact.state] if part]
    latitude = _safe_float(system_config.get("latitude"))
    if latitude is not None:
        parts.append(f"lat {latitude:.4f}")
    return ", ".join(parts) if parts else None


def _economic_assumptions_text(
    system_config: dict[str, Any], summary: dict[str, Any]
) -> str | None:
    project_years = _safe_int(
        system_config.get("projectYears") or summary.get("analysisYears")
    )
    nominal_pct = _safe_float(
        summary.get("nominalDiscountRatePct")
        or system_config.get("nominalDiscountRatePct")
    )
    inflation_pct = _safe_float(
        summary.get("inflationRatePct") or system_config.get("inflationRatePct")
    )
    real_pct = _safe_float(summary.get("realDiscountRatePct"))

    parts: list[str] = []
    if project_years is not None:
        parts.append(f"Project life {project_years} years")
    if nominal_pct is not None:
        parts.append(f"Nominal discount rate {nominal_pct:.2f}%")
    if inflation_pct is not None:
        parts.append(f"Inflation rate {inflation_pct:.2f}%")
    if real_pct is not None:
        parts.append(f"Real discount rate {real_pct:.2f}%")
    parts.append(
        "Operating cost is annual fuel plus maintenance/O&M; NPC "
        "composition lists discounted capital, replacement, and "
        "salvage-credit contributions only"
    )
    return "; ".join(parts) if parts else None


def _append_numeric_note(
    notes: list[str],
    source: dict[str, Any],
    key: str,
    template: str,
    *,
    integer: bool = False,
) -> None:
    value = (
        _safe_int(source.get(key)) if integer else _safe_float(source.get(key))
    )
    if value is not None:
        notes.append(template.format(value=value))


def _asset_life_notes(
    summary: dict[str, Any],
    simulation: dict[str, Any],
    system_config: dict[str, Any],
) -> str | None:
    notes: list[str] = []
    dispatch_mode = system_config.get("dieselDispatchMode")
    if dispatch_mode:
        notes.append(f"Dispatch mode {dispatch_mode}")

    simulation_notes = (
        ("mgDieselHours", "Microgrid diesel runtime {value} h/yr"),
        ("dieselRunHoursA", "Diesel-only runtime {value} h/yr"),
    )
    summary_notes = (
        ("microgridGeneratorLifeYears", "MG generator life {value:.1f} years"),
        (
            "dieselOnlyGeneratorLifeYears",
            "Diesel-only generator life {value:.1f} years",
        ),
        ("batteryLifeYears", "Battery life {value:.1f} years"),
        ("mgAnnualFuelUsd", "MG fuel ${value:.2f}/yr"),
        ("microgridFixedOmUsd", "MG fixed O&M ${value:.2f}/yr"),
        (
            "microgridGeneratorMaintenanceUsd",
            "MG generator maintenance ${value:.2f}/yr",
        ),
        ("dieselAnnualFuelUsd", "Diesel-only fuel ${value:.2f}/yr"),
        (
            "dieselOnlyGeneratorMaintenanceUsd",
            "Diesel-only maintenance ${value:.2f}/yr",
        ),
        ("microgridCapitalNpcUsd", "MG capital NPC ${value:.2f}"),
        ("microgridReplacementNpcUsd", "MG replacement NPC ${value:.2f}"),
        ("microgridSalvageNpcUsd", "MG salvage credit ${value:.2f}"),
        ("dieselOnlyCapitalNpcUsd", "Diesel-only capital NPC ${value:.2f}"),
        (
            "dieselOnlyReplacementNpcUsd",
            "Diesel-only replacement NPC ${value:.2f}",
        ),
        ("dieselOnlySalvageNpcUsd", "Diesel-only salvage credit ${value:.2f}"),
    )
    for key, template in simulation_notes:
        _append_numeric_note(notes, simulation, key, template, integer=True)
    for key, template in summary_notes:
        _append_numeric_note(notes, summary, key, template)

    return "; ".join(notes) if notes else None


def _build_basic_values(req: SendReportRequest) -> dict[str, Any]:
    system_config = req.systemConfig or {}
    summary = req.summary or {}
    simulation = req.simulation or {}
    annual_load = _safe_float(
        summary.get("annualLoadKwh") or system_config.get("annualLoadKwh")
    )
    project_name = (
        summary.get("projectName")
        or (
            f"{req.contact.company} Microgrid Proposal"
            if req.contact.company
            else None
        )
        or "Microgrid Proposal"
    )
    site = _project_site_text(req, system_config)
    project_note_parts = [
        note
        for note in [
            summary.get("siteLayoutNote"),
            _asset_life_notes(summary, simulation, system_config),
        ]
        if note
    ]
    return {
        "project_name": project_name,
        "client_owner": req.contact.company
        or f"{req.contact.firstName} {req.contact.lastName}".strip()
        or None,
        "country_region": system_config.get("country") or "United States",
        "site": site,
        "quotation_date": datetime.now(),
        "project_stage": "Early Estimate",
        "pv_size_kwp": _safe_float(system_config.get("pvCapacityKw")),
        "bess_size_kwh": _safe_float(system_config.get("batteryCapacityKwh")),
        "diesel_size_kw": _safe_float(system_config.get("dieselCapacityKw")),
        "daily_energy_demand_kwh": round(annual_load / 365.0, 2)
        if annual_load
        else None,
        "design_life_years": _safe_int(summary.get("analysisYears")) or 25,
        "base_currency": "USD",
        "tax_basis_notes": _economic_assumptions_text(system_config, summary),
        "project_notes": " | ".join(project_note_parts)
        if project_note_parts
        else None,
    }


def _write_basic_sheet(
    ws, layout: WorkbookLayout, values: dict[str, Any]
) -> None:
    for key, row in layout.basic.rows.items():
        ws[f"{layout.basic.input_column}{row}"] = _blank(values.get(key))


def _write_internal_detail_sheet(
    ws, section_layout, lines: list[DetailLine]
) -> None:
    for line in lines:
        row = section_layout.rows[line.key]
        ws[f"B{row}"] = _blank(line.system)
        ws[f"C{row}"] = _blank(line.subcategory)
        ws[f"D{row}"] = _blank(line.item)
        ws[f"E{row}"] = _blank(line.brand)
        ws[f"F{row}"] = _blank(line.model)
        ws[f"G{row}"] = _blank(line.spec)
        ws[f"H{row}"] = _blank(line.qty_unit)
        ws[f"I{row}"] = _blank(line.qty)
        ws[f"J{row}"] = _blank(line.unit_price)
        ws[f"K{row}"] = _blank(line.currency)
        ws[f"L{row}"] = _blank(line.fx_to_usd)
        ws[f"M{row}"] = _blank(line.tax_rate)
        ws[f"N{row}"] = _blank(line.freight_usd)
        ws[f"O{row}"] = _blank(line.other_adjust_usd)
        ws[f"Q{row}"] = _blank(line.source)
        ws[f"R{row}"] = _blank(line.remarks)
        ws[f"S{row}"] = YES if line.include else NO


def _write_customer_detail_sheet(
    ws, section_layout, lines: list[DetailLine]
) -> None:
    for line in lines:
        row = section_layout.rows[line.key]
        ws[f"B{row}"] = _blank(line.system)
        ws[f"C{row}"] = _blank(line.subcategory)
        ws[f"D{row}"] = _blank(line.item)
        ws[f"E{row}"] = _blank(line.brand)
        ws[f"F{row}"] = _blank(line.model)
        ws[f"G{row}"] = _blank(line.spec)
        ws[f"H{row}"] = _blank(line.qty_unit)
        ws[f"I{row}"] = _blank(line.qty)


def _write_internal_opex_sheet(
    ws, section_layout, lines: list[OpexLine]
) -> None:
    defaults = get_internal_template_defaults().opex
    for line in lines:
        row = section_layout.rows[line.key]
        default = defaults[line.key]
        ws[f"B{row}"] = _blank(line.category)
        ws[f"C{row}"] = _blank(line.subcategory)
        ws[f"D{row}"] = _blank(line.item)
        ws[f"E{row}"] = _blank(line.basis)
        ws[f"F{row}"] = _blank(line.qty_unit)
        ws[f"G{row}"] = _blank(line.qty)
        if not _is_formula(default.unit_price):
            ws[f"H{row}"] = _blank(line.unit_price)
        ws[f"I{row}"] = _blank(line.currency)
        ws[f"J{row}"] = _blank(line.fx_to_usd)
        ws[f"L{row}"] = _blank(line.source)
        ws[f"M{row}"] = _blank(line.remarks)
        ws[f"N{row}"] = YES if line.include else NO


def _write_internal_runtime_inputs(
    ws_fuel,
    layout: WorkbookLayout,
    req: SendReportRequest,
    breakdown: TemplateCostBreakdown,
) -> None:
    summary = req.summary or {}
    simulation = req.simulation or {}
    cells = layout.fuel_input_cells or {}
    diesel_price = _derive_diesel_price_usd(summary, simulation)
    values = {
        "diesel_price_usd_per_liter": diesel_price,
        "estimated_annual_runtime_hours": _safe_float(
            simulation.get("mgDieselHours")
        ),
        "estimated_annual_fuel_use_liters": _safe_float(
            simulation.get("mgDieselLiters")
        ),
    }
    for key, cell in cells.items():
        if key in values and values[key] is not None:
            ws_fuel[cell] = values[key]

    ws_maintenance = internal_sheet(ws_fuel.parent, "diesel_maintenance")
    for attr, cell in (
        layout.diesel_maintenance_adjustment_cells or {}
    ).items():
        ws_maintenance[cell] = getattr(breakdown.diesel_om, attr)


def _build_breakdown(req: SendReportRequest) -> TemplateCostBreakdown:
    return build_template_cost_breakdown(
        system_config=req.systemConfig or {},
        simulation=req.simulation or {},
        catalog=get_catalog(),
        diesel_is_new=bool((req.systemConfig or {}).get("dieselIsNew")),
    )


def build_solution_report(req: SendReportRequest) -> bytes:
    """Fill the Excel template with the solution data and return it.

    Args:
        req: The report request, including contact and solution data.

    Returns:
        The generated .xlsx file content.
    """
    validate_template_layouts()
    validate_internal_template_formulas()
    internal = is_internal_email(req.contact.email)
    layout = (
        get_internal_template_layout()
        if internal
        else get_customer_template_layout()
    )
    workbook = load_workbook(
        INTERNAL_TEMPLATE_PATH if internal else CUSTOMER_TEMPLATE_PATH,
        data_only=False,
    )
    _set_full_recalc(workbook)
    _hide_dropdown_sheet(workbook)
    _hide_customer_only_sheets(workbook, internal)
    _hide_internal_only_sheets(workbook, internal)

    breakdown = _build_breakdown(req)
    basic_values = _build_basic_values(req)

    basic_ws = (
        internal_sheet(workbook, "basic")
        if internal
        else customer_sheet(workbook, "basic")
    )
    _write_basic_sheet(basic_ws, layout, basic_values)

    section_lines = {
        "pv": breakdown.pv_lines,
        "bess": breakdown.bess_lines,
        "diesel": breakdown.diesel_lines,
        "electrical": breakdown.electrical_lines,
    }
    for section_key, lines in section_lines.items():
        ws = (
            internal_sheet(workbook, section_key)
            if internal
            else customer_sheet(workbook, section_key)
        )
        if internal:
            _write_internal_detail_sheet(
                ws, layout.sections[section_key], lines
            )
        else:
            _write_customer_detail_sheet(
                ws, layout.sections[section_key], lines
            )

    if internal:
        _write_internal_detail_sheet(
            internal_sheet(workbook, "logistics"),
            layout.sections["logistics"],
            breakdown.logistics_lines,
        )
        _write_internal_opex_sheet(
            internal_sheet(workbook, "opex"),
            layout.sections["opex"],
            breakdown.opex_lines,
        )
        _write_internal_runtime_inputs(
            internal_sheet(workbook, "fuel"), layout, req, breakdown
        )
    else:
        _rename_customer_sheet_titles(workbook, internal)

    buf = io.BytesIO()
    workbook.save(buf)
    return buf.getvalue()
