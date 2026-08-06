"""
Build the solution Excel workbook.
"""
from __future__ import annotations

import datetime
import io
import math

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


NAVY = "003C71"
SUBHDR = "1F4E79"
LIGHT_BLUE = "DEEAF1"
LIGHT_GREEN = "E2EFDA"
LIGHT_GRAY = "F2F2F2"
WHITE = "FFFFFF"
ACCENT = "FFC000"


def _cfont(size: int = 11, bold: bool = False, color: str = "000000", italic: bool = False) -> Font:
    return Font(name="Calibri", size=size, bold=bold, color=color, italic=italic)


def _sfill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def _tborder(style: str = "thin") -> Border:
    side = Side(style=style, color="8EA9C1")
    return Border(left=side, right=side, top=side, bottom=side)


def _cell_set(cell, value, font=None, fill_=None, align=None, border=None):
    cell.value = value
    if font:
        cell.font = font
    if fill_:
        cell.fill = fill_
    if align:
        cell.alignment = align
    if border:
        cell.border = border


def _set_col_w(ws, widths):
    for index, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(index)].width = width


def _fmt_money(value: float) -> str:
    return f"$ {value:,.0f}"


def _fmt_optional_money(value: float) -> str:
    return _fmt_money(value) if value else "-"


def _sheet_title(ws, cell_ref: str, text: str):
    ws.merge_cells(f"{cell_ref}:B1")
    ws.row_dimensions[1].height = 26
    _cell_set(
        ws[cell_ref],
        text,
        font=_cfont(13, bold=True, color="FFFFFF"),
        fill_=_sfill(SUBHDR),
        align=Alignment(horizontal="center", vertical="center"),
    )


def build_excel(req) -> bytes:
    sc = req.systemConfig or {}
    cx = req.capex or {}
    sim = req.simulation or {}
    sm = req.summary or {}
    ct = req.comparisonTable or []
    con = req.contact
    now = datetime.datetime.now().strftime("%Y-%m-%d")

    pv_sets = int(sc.get("bracketSets", 0))
    pv_pps = int(sc.get("panelsPerSet", 32))
    pv_total = pv_sets * pv_pps
    pv_kw = float(sc.get("pvCapacityKw", 0))
    pv_model = str(sc.get("panelModel", "-"))
    pv_watts = int(sc.get("panelWatts", 655))
    bat_count = int(sc.get("batteryPackCount", 0))
    bat_kwh_total = float(sc.get("batteryCapacityKwh", 0))
    bat_kwh_each = round(bat_kwh_total / bat_count, 1) if bat_count else 16
    bat_model = str(sc.get("batteryModel", "LFP-16kWh"))
    gen_kw = float(sc.get("dieselCapacityKw", 0))
    gen_model = str(sc.get("dieselModel", "-"))
    volt_level = str(sc.get("voltageLevel", "48V"))
    ems_mode = str(sc.get("emsMode", "edge"))
    ann_load = float(sc.get("annualLoadKwh", 0))
    area_m2 = float(sc.get("occupiedAreaM2", 0))
    num_inv = max(1, math.ceil(bat_count / 6))
    layout_note = str(sm.get("siteLayoutNote", "") or "").strip()
    measured_site_area = str(sm.get("measuredSiteAreaDisplay", "") or "").strip()
    usable_site_area = str(sm.get("usableSiteAreaDisplay", "") or "").strip()
    layout_max_sets = sm.get("layoutMaxBracketSets")

    if pv_kw > 0 and gen_kw > 0:
        project_type = "PV + BESS + Diesel Microgrid"
    elif pv_kw > 0:
        project_type = "PV + BESS Microgrid"
    else:
        project_type = "Off-grid Power System"

    pv_mod_cost = float(cx.get("pvModuleCost", 0))
    mount_cost = float(cx.get("pvMountingCost", 0))
    bess_cost = float(cx.get("energyStorageCost", 0))
    gen_cost = float(cx.get("dieselGeneratorCost", 0))
    trans_cost = float(cx.get("intlTransportCost", 0))
    inst_cost = float(cx.get("installationCost", 0))
    acc_cost = float(cx.get("accessoryCost", 0))
    other_cost = float(cx.get("otherInitialCost", 0))
    subtotal = float(cx.get("equipmentSubtotal", 0))
    profit_pct = float(cx.get("profitMargin", 0))
    profit_amt = float(cx.get("profitAmount", 0))
    selling = float(cx.get("sellingPrice", 0))

    wb = Workbook()

    # Sheet 1: BOM
    ws1 = wb.active
    ws1.title = "BOM"
    _set_col_w(ws1, [8, 20, 22, 26, 30, 16, 10, 10, 40])

    ws1.row_dimensions[1].height = 58
    ws1.merge_cells("A1:I1")
    _cell_set(
        ws1["A1"],
        "Key Components List / BOM",
        font=_cfont(20, bold=True, color=NAVY),
        align=Alignment(horizontal="center", vertical="center", wrap_text=True),
    )

    ws1.row_dimensions[2].height = 30
    ws1.merge_cells("A2:G2")
    _cell_set(
        ws1["A2"],
        f"Project Name: {con.firstName} {con.lastName} / {con.company}",
        font=_cfont(11, color="2F5496"),
        align=Alignment(horizontal="left", vertical="center"),
        fill_=_sfill(LIGHT_BLUE),
    )
    ws1.merge_cells("H2:I2")
    _cell_set(
        ws1["H2"],
        f"Product Type: {project_type}",
        font=_cfont(11, color="2F5496"),
        align=Alignment(horizontal="left", vertical="center"),
        fill_=_sfill(LIGHT_BLUE),
    )

    headers = [
        "NO.",
        "Part Number",
        "Part Name",
        "English Name",
        "Specification / Model",
        "Dimensions",
        "Qty",
        "Unit",
        "Notes",
    ]
    ws1.row_dimensions[3].height = 40
    for col_index, header in enumerate(headers, 1):
        cell = ws1.cell(3, col_index, header)
        cell.font = _cfont(11, bold=True, color="FFFFFF")
        cell.fill = _sfill(SUBHDR)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = _tborder()

    pv_dimensions = "2384x1303x33 mm" if pv_watts >= 655 else "-"
    bom_rows = [
        (
            1,
            "",
            "Hybrid Inverter",
            "Hybrid Inverter",
            "18K-2P-LV",
            "",
            num_inv,
            "EA",
            f"Input: PV + Battery ({volt_level}), Output: AC 230V/50Hz; supports off-grid & grid-tied modes",
        ),
        (
            2,
            "",
            "Battery Pack",
            "Battery Pack",
            bat_model,
            "",
            bat_count,
            "EA",
            f"LFP, {bat_kwh_each} kWh/pack, total {bat_kwh_total:.0f} kWh; cycle life >= 4,000 cycles; BMS included",
        ),
        (
            3,
            "",
            "Industrial PC / EMS",
            "Industrial PC / EMS",
            "ECU-1170",
            "",
            1,
            "EA",
            f"MicroGrid EMS; control mode: {ems_mode}; real-time monitoring and remote O&M",
        ),
        (
            4,
            "ES1-S002-1",
            "Integrated Skid",
            "Integrated Skid",
            "",
            "",
            pv_sets,
            "SET",
            "Main material: Q355B hot-dip galvanized; integrated pallet spliced weldment",
        ),
        (
            5,
            "ES1-S001-1",
            "Foldable Mounting System",
            "Foldable Mounting System",
            "",
            "",
            pv_sets,
            "SET",
            f"A set consisting of {pv_pps} rows of PV modules; steel-aluminum structure; foldable design",
        ),
        (
            6,
            "",
            "BOS Box",
            "BOS Box",
            "",
            "",
            pv_sets,
            "EA",
            "Balance of System box; includes DC/AC breakers, combiner, surge protection, metering",
        ),
        (
            7,
            "ES1-E004-1",
            "PV Panel Module",
            "PV Panel Module",
            pv_model,
            pv_dimensions,
            pv_total,
            "EA",
            f"{pv_model}; {pv_watts}Wp; total {pv_kw:.1f} kW; footprint about {area_m2:.0f} m2",
        ),
    ]
    if gen_kw > 0:
        diesel_hours = float(sim.get("mgDieselHours", 0))
        diesel_only_hours = max(float(sim.get("dieselRunHoursA", 8760)), 1)
        reduction = (1 - diesel_hours / diesel_only_hours) * 100
        bom_rows.append(
            (
                8,
                "ES1-E005-1",
                "Diesel Generator",
                "Diesel Generator",
                gen_model if gen_model and gen_model != "-" else f"{gen_kw:.0f}kW genset",
                "",
                1,
                "EA",
                f"{gen_kw:.0f} kW; backup power for cloudy days; annual run hours reduced about {reduction:.0f}% vs diesel-only",
            )
        )

    for offset, row_data in enumerate(bom_rows, start=4):
        bg = _sfill(LIGHT_GRAY if offset % 2 == 0 else WHITE)
        for col_index, value in enumerate(row_data, 1):
            cell = ws1.cell(offset, col_index, value)
            cell.fill = bg
            cell.border = _tborder()
            cell.font = _cfont(11, bold=(col_index in (3, 4)))
            cell.alignment = Alignment(
                horizontal="center" if col_index in (1, 6, 7, 8) else "left",
                vertical="center",
                wrap_text=True,
            )
        ws1.row_dimensions[offset].height = 42

    sig_row = 4 + len(bom_rows) + 1
    ws1.row_dimensions[sig_row].height = 28
    ws1.merge_cells(f"A{sig_row}:I{sig_row}")
    _cell_set(
        ws1[f"A{sig_row}"],
        f"Prepared by:              Checked by:              Approved by:              Date: {now}",
        font=_cfont(10, color="595959"),
        align=Alignment(horizontal="left", vertical="center"),
        fill_=_sfill(LIGHT_BLUE),
    )

    note_row = sig_row + 1
    ws1.merge_cells(f"A{note_row}:I{note_row}")
    ws1.row_dimensions[note_row].height = 20
    _cell_set(
        ws1[f"A{note_row}"],
        "Notes: All specifications are subject to final purchase-order confirmation. Quantities should be verified on site.",
        font=_cfont(9, italic=True, color="808080"),
        align=Alignment(horizontal="left", vertical="center"),
    )

    # Sheet 2: Economic analysis / customer summary
    ws2 = wb.create_sheet("Economic Analysis")
    _set_col_w(ws2, [38, 24, 18, 18, 18, 18, 18, 18, 18])

    ws2.merge_cells("A1:B1")
    ws2.row_dimensions[1].height = 26
    _cell_set(
        ws2["A1"],
        "Economic Analysis",
        font=_cfont(13, bold=True, color="FFFFFF"),
        fill_=_sfill(SUBHDR),
        align=Alignment(horizontal="center", vertical="center"),
    )

    current_row = 2

    capex_rows = [
        ("PV Modules", pv_mod_cost),
        ("Mounting System", mount_cost),
        ("Battery Storage (BESS)", bess_cost),
        ("Diesel Generator", gen_cost),
        ("International Freight", trans_cost),
        ("Installation", inst_cost),
        ("Accessories", acc_cost),
        ("Other Initial Cost", other_cost),
    ]
    for label, amount in capex_rows:
        bg = LIGHT_GRAY if current_row % 2 == 0 else WHITE
        for col_index, value in enumerate((label, _fmt_optional_money(amount)), 1):
            cell = ws2.cell(current_row, col_index, value)
            cell.font = _cfont(11, bold=(col_index == 1))
            cell.fill = _sfill(bg)
            cell.border = _tborder()
            cell.alignment = Alignment(horizontal="right" if col_index == 2 else "left", vertical="center")
        ws2.row_dimensions[current_row].height = 18
        current_row += 1

    pricing_rows = [
        ("Total Cost (excl. margin)", _fmt_money(subtotal), LIGHT_BLUE),
        (f"Gross Profit ({profit_pct:.1f}%)", _fmt_money(profit_amt), WHITE),
        ("System Quote (incl. margin)", _fmt_money(selling), ACCENT),
    ]
    for label, value, bg_color in pricing_rows:
        for col_index, cell_value in enumerate((label, value), 1):
            cell = ws2.cell(current_row, col_index, cell_value)
            cell.font = _cfont(11, bold=True, color=NAVY if "Quote" in label else "000000")
            cell.fill = _sfill(bg_color)
            cell.border = _tborder()
            cell.alignment = Alignment(horizontal="right" if col_index == 2 else "left", vertical="center")
        ws2.row_dimensions[current_row].height = 20
        current_row += 1

    ws2.merge_cells(f"A{current_row}:B{current_row}")
    ws2.row_dimensions[current_row].height = 24
    _cell_set(
        ws2[f"A{current_row}"],
        "Economic Summary",
        font=_cfont(13, bold=True, color="FFFFFF"),
        fill_=_sfill(SUBHDR),
        align=Alignment(horizontal="center", vertical="center"),
    )
    current_row += 1

    econ_rows = [
        ("Annual Load", f"{ann_load:,.0f} kWh"),
        ("Solar Fraction", f"{float(sim.get('solarFractionPct', 0)):.1f}%"),
        ("Annual Fuel Saving", f"{float(sim.get('annualFuelSavingLiters', 0)):,.0f} L/yr"),
        ("Annual Fuel Cost Saving", _fmt_money(float(sim.get("annualFuelSavingUsd", 0)))),
        ("Total Cost (excl. margin)", _fmt_money(float(sm.get("totalCostUsd", subtotal)))),
        ("System Quote (incl. margin)", _fmt_money(float(sm.get("sellingPriceUsd", selling)))),
        ("Gross Profit", _fmt_money(float(sm.get("profitAmountUsd", profit_amt)))),
        ("MG Annual O&M", _fmt_money(float(sm.get("mgAnnualOmUsd", 0)))),
        ("MG Annual Fuel Cost", _fmt_money(float(sm.get("mgAnnualFuelUsd", 0)))),
        ("Diesel-only Annual Fuel Cost", _fmt_money(float(sm.get("dieselAnnualFuelUsd", 0)))),
        ("Microgrid LCOE", f"$ {float(sm.get('finalMgLcoe', 0)):.4f}/kWh"),
        ("Diesel-only LCOE", f"$ {float(sm.get('finalDieselLcoe', 0)):.4f}/kWh"),
        ("Payback Period", f"Year {sm.get('breakevenYear', '-')}"),
        ("20-year Net Revenue", _fmt_money(float(sm.get("finalCumulativeRevenue", 0)))),
    ]
    for label, value in econ_rows:
        is_highlight = label in {"Payback Period", "20-year Net Revenue"}
        bg = LIGHT_GREEN if is_highlight else (LIGHT_GRAY if current_row % 2 == 0 else WHITE)
        for col_index, cell_value in enumerate((label, value), 1):
            cell = ws2.cell(current_row, col_index, cell_value)
            cell.font = _cfont(11, bold=is_highlight)
            cell.fill = _sfill(bg)
            cell.border = _tborder()
            cell.alignment = Alignment(horizontal="right" if col_index == 2 else "left", vertical="center")
        ws2.row_dimensions[current_row].height = 18
        current_row += 1

    if layout_note:
        ws2.merge_cells(f"A{current_row}:B{current_row}")
        ws2.row_dimensions[current_row].height = 48
        layout_lines = [layout_note]
        if measured_site_area:
            layout_lines.append(f"Measured site area: {measured_site_area}")
        if usable_site_area:
            layout_lines.append(f"Area basis used for layout: {usable_site_area}")
        if layout_max_sets not in (None, ""):
            layout_lines.append(f"Layout-based max bracket sets: {layout_max_sets}")
        _cell_set(
            ws2[f"A{current_row}"],
            "Site Layout Note\n" + "\n".join(layout_lines),
            font=_cfont(10, color="404040"),
            fill_=_sfill(LIGHT_BLUE),
            align=Alignment(horizontal="left", vertical="center", wrap_text=True),
            border=_tborder(),
        )
        current_row += 2

    if ct:
        ws2.merge_cells(f"A{current_row}:I{current_row}")
        ws2.row_dimensions[current_row].height = 24
        _cell_set(
            ws2[f"A{current_row}"],
            "Annual Cost Comparison (MG vs Diesel-only)",
            font=_cfont(12, bold=True, color="FFFFFF"),
            fill_=_sfill(SUBHDR),
            align=Alignment(horizontal="center", vertical="center"),
        )
        current_row += 1

        comparison_headers = [
            "Year",
            "MG Annual",
            "Diesel Annual",
            "MG Cumulative",
            "Diesel Cumulative",
            "MG LCOE",
            "Diesel LCOE",
            "Annual Revenue",
            "Cumulative Revenue",
        ]
        for col_index, header in enumerate(comparison_headers, 1):
            cell = ws2.cell(current_row, col_index, header)
            cell.font = _cfont(10, bold=True, color="FFFFFF")
            cell.fill = _sfill("2E74B5")
            cell.border = _tborder()
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws2.row_dimensions[current_row].height = 34
        current_row += 1

        breakeven_year = sm.get("breakevenYear")
        for index, row in enumerate(ct):
            is_breakeven = breakeven_year is not None and row.get("year") == breakeven_year
            bg_fill = _sfill(LIGHT_GREEN if is_breakeven else (LIGHT_GRAY if index % 2 == 0 else WHITE))
            row_values = [
                row.get("year"),
                f"${row.get('mgAnnualCost', 0):,.0f}",
                f"${row.get('dieselAnnualCost', 0):,.0f}",
                f"${row.get('mgCumulative', 0):,.0f}",
                f"${row.get('dieselCumulative', 0):,.0f}",
                f"${row.get('mgLcoe', 0):.4f}",
                f"${row.get('dieselLcoe', 0):.4f}",
                f"${row.get('annualRevenue', 0):,.0f}",
                f"${row.get('cumulativeRevenue', 0):,.0f}",
            ]
            for col_index, value in enumerate(row_values, 1):
                cell = ws2.cell(current_row, col_index, value)
                cell.font = _cfont(10, bold=is_breakeven)
                cell.fill = bg_fill
                cell.border = _tborder()
                cell.alignment = Alignment(horizontal="center", vertical="center")
            ws2.row_dimensions[current_row].height = 16
            current_row += 1

    # Sheet 3: Contact information
    ws3 = wb.create_sheet("Contact")
    _set_col_w(ws3, [28, 40])
    ws3.merge_cells("A1:B1")
    ws3.row_dimensions[1].height = 26
    _cell_set(
        ws3["A1"],
        "Customer Contact Information",
        font=_cfont(13, bold=True, color="FFFFFF"),
        fill_=_sfill(SUBHDR),
        align=Alignment(horizontal="center", vertical="center"),
    )

    contact_rows = [
        ("Full Name", f"{con.firstName} {con.lastName}".strip()),
        ("Company", con.company),
        ("Email", con.email),
        ("Phone", con.phone),
        ("State", con.state),
        ("City", con.city),
        ("Report Date", now),
        ("System", "MicroGrid Microgrid Advisor v2.0"),
    ]
    for row_index, (label, value) in enumerate(contact_rows, start=2):
        bg = LIGHT_GRAY if row_index % 2 == 0 else WHITE
        for col_index, cell_value in enumerate((label, value), 1):
            cell = ws3.cell(row_index, col_index, cell_value)
            cell.font = _cfont(11, bold=(col_index == 1))
            cell.fill = _sfill(bg)
            cell.border = _tborder()
            cell.alignment = Alignment(vertical="center")
        ws3.row_dimensions[row_index].height = 20

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
