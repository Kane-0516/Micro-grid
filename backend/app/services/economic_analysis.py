"""微电网解决方案经济性分析（USD 版本）.

对应案例分析表格，完整复现以下功能：
  1. 系统初始投资成本（CAPEX）计算（含利润率）
  2. 柴油发电机详细运维成本模型（A工况/B工况）
     - 常规材料（机油、机油滤芯、燃油滤芯、空气滤芯）
     - 常规人工
     - 冷却液（按年更换周期）
     - 启动电池（按年更换周期）
     - 发电机购置/更换成本
  3. 年度视图 & 累计视图表格
  4. 度电成本（LCOE）对比：微电网 vs 纯柴油
  5. 年度收益 & 累计收益分析
  6. 完整解决方案报告（文本 + DataFrame）

关键验证数据（40kW案例）：
  A工况（纯柴油，8760h/年）：
    - 年常规材料 = ceil(8760/250)×(2.15×22+18+20) + ceil(8760/500)×30
                 = 36×85.30 + 18×30 = 3610.80 + 540 ≈ $3,611 ✓
    - 年常规人工 = 36×1.5×125 = $6,750 ✓
    - 年合计(Y1) = 3610.80 + 6750 + 0 + 0 = $10,361 ✓

  B工况（微电网，889h/年）：
    - 年常规材料 = ceil(889/250)×85.30 + ceil(889/500)×30
                 = 4×85.30 + 2×30 = 341.20 + 60 = $401 ✓
    - 年常规人工 = 4×1.5×125 = $750 ✓
    - 年合计(Y1) = 401.20 + 750 = $1,151 ✓
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import pandas as pd

_YEAR_COLUMN = "年份(t)"
_CUMULATIVE_REVENUE_COLUMN = "累计收益($)"
_MICROGRID_LCOE_COLUMN = "微电网LCOE($/kWh)"
_DIESEL_LCOE_COLUMN = "柴油LCOE($/kWh)"


# ─────────────────────────────────────────────────────────────
# 1. 参数数据类
# ─────────────────────────────────────────────────────────────


@dataclass
class SystemCapex:
    """系统初始投资成本明细（美元）.

    对应案例参数表第 1~11 行。
    """

    pv_module_cost: float = 26_828.80  # 光伏组件（含运输）
    pv_mounting_cost: float = 76_200.00  # 光伏支架（含50%进口关税）
    energy_storage_cost: float = 76_100.00  # 储能系统（逆变器+电池包+托盘）
    diesel_generator_cost: float = 45_000.00  # 柴油发电机组（或租赁）
    intl_transport_cost: float = (
        10_800.00  # 国际运输（国内零件运输——海外项目交付）
    )
    installation_cost: float = 5_000.00  # 一次性全部安装费（5人，每人$400/天）
    accessory_cost: float = (
        28_500.00  # 其他附件（配电箱+直流线缆+交流线缆+电池材料等）
    )
    other_initial_cost: float = 4_200.00  # 其他初始成本（不含光储设备）
    profit_margin: float = 0.20  # 利润率（20%）

    @property
    def equipment_subtotal(self) -> float:
        """成本合计（不含利润）."""
        return (
            self.pv_module_cost
            + self.pv_mounting_cost
            + self.energy_storage_cost
            + self.diesel_generator_cost
            + self.intl_transport_cost
            + self.installation_cost
            + self.accessory_cost
            + self.other_initial_cost
        )

    @property
    def profit_base(self) -> float:
        """利润计算基数（不含柴油发电机和安装费 — 两者均为直通成本）.

        验证：(272,628.80 - 45,000 - 5,000) × 20% + 272,628.80 = $317,155 ✓
        """
        return (
            self.equipment_subtotal
            - self.diesel_generator_cost
            - self.installation_cost
        )

    @property
    def selling_price(self) -> float:
        """含利润的对外售价（取整）.

        利润仅计入光伏/储能/支架/运输/附件等设备成本，
        柴油发电机和安装费为直通成本（不加利润）。
        """
        return round(
            self.equipment_subtotal + self.profit_base * self.profit_margin
        )

    @property
    def profit_amount(self) -> float:
        """利润金额."""
        return self.selling_price - self.equipment_subtotal


@dataclass
class MicrogridOMParams:
    """微电网系统（光储部分）年度运维成本（美元/年）.

    对应案例参数表第 8~10 行，从第 2 年起每年计入。
    """

    pv_storage_om_annual: float = 1_000.0  # 光储运维费（第8行）
    equipment_repair_annual: float = 200.0  # 设备修理费（第9行）
    insurance_annual: float = 3_000.0  # 保险费（第10行）

    @property
    def total_annual_om(self) -> float:
        """年度光储运维合计."""
        return (
            self.pv_storage_om_annual
            + self.equipment_repair_annual
            + self.insurance_annual
        )


@dataclass
class DieselOMParams:
    """柴油发电机运维参数.

    对应案例参数表第 19~39 行。
    """

    # ── 运行寿命 ──────────────────────────────
    service_life_hours: float = 15_000  # 总使用寿命（小时）

    # A工况（纯柴油发电机模式）
    hours_a: float = 8_760  # 年运行小时数（第20行）
    replacement_cycle_a_years: int = 2  # 更换周期（年）（第21行）

    # B工况（微电网模式）
    hours_b: float = 889  # 年运行小时数（第22行）
    replacement_cycle_b_years: int = 17  # 更换周期（年）（第23行）

    diesel_generator_unit_cost: float = 45_000.0  # 发电机购置/更换单价

    # ── 小保养参数 ─────────────────────────────
    S_oil: float = 250  # 小保养间隔（小时/次）（第24行）
    t_pm: float = 1.50  # 小保养人工时（小时/次）（第25行）
    V_oil: float = 2.15  # 每次换油量（加仑）（第26行）
    P_oil: float = 22.00  # 机油单价（美元/加仑）（第27行）
    C_of: float = 18.00  # 机油滤芯价（美元/次）（第28行）
    C_ff: float = 20.00  # 燃油滤芯价（美元/次）（第29行）
    C_af: float = 30.00  # 空气滤芯价（美元/次）（第30行）
    S_air: float = 500  # 空气滤芯更换间隔（小时）（第32行）
    labor_rate: float = 125.00  # 维保人工费率（美元/小时）（第31行）

    # ── 冷却液 ─────────────────────────────────
    coolant_interval_years: int = 2  # 更换周期（年）（第33行）
    coolant_gal_per_service: float = 2.00  # 每次用量（加仑）（第34行）
    P_coolant: float = 33.00  # 冷却液单价（美元/加仑）（第35行）
    coolant_labor_hours: float = 1.00  # 更换人工时（第36行）

    # ── 启动电池 ───────────────────────────────
    battery_interval_years: int = 4  # 更换周期（年）（第37行）
    C_battery: float = 180.00  # 电池价格（美元）（第38行）
    battery_labor_hours: float = 0.50  # 更换人工时（第39行）


@dataclass
class ProjectParameters:
    """项目基本参数."""

    project_name: str = "40kW 离网微电网项目"
    analysis_years: int = 25
    annual_load_kwh: float = 131_400.0  # 年总用电量（kWh）（第18行）

    # 柴油消耗
    diesel_price_per_liter: float = 0.95  # 柴油单价（美元/升）（第15行）
    microgrid_diesel_liters: float = (
        5_599.0  # 微电网模式年用油量（升）（第16行）
    )
    dieselonly_diesel_liters: float = (
        45_764.0  # 纯柴油模式年用油量（升）（第17行）
    )

    @property
    def microgrid_annual_fuel_cost(self) -> float:
        """微电网模式（B工况）年燃料成本（$）."""
        return self.microgrid_diesel_liters * self.diesel_price_per_liter

    @property
    def dieselonly_annual_fuel_cost(self) -> float:
        """纯柴油模式（A工况）年燃料成本（$）."""
        return self.dieselonly_diesel_liters * self.diesel_price_per_liter


# ─────────────────────────────────────────────────────────────
# 2. 柴油发电机运维成本计算器
# ─────────────────────────────────────────────────────────────


class DieselOMCalculator:
    """柴油发电机逐年运维成本计算器.

    支持两种工况：
    - A工况（纯柴油）：8760 h/年，每2年更换发电机
    - B工况（微电网）：889 h/年，每17年更换发电机

    计算逻辑：
        n_services = ceil(annual_hours / S_oil)     →  年保养次数
        n_air      = ceil(annual_hours / S_air)     →  年空气滤芯换次数
        materials  = n_services × (V_oil×P_oil + C_of + C_ff) + n_air × C_af
        labor      = n_services × t_pm × labor_rate
        coolant    = gal × price + hours × rate
                     （每 coolant_interval_years 年）
        battery    = C_battery + hours × rate
                     （每 battery_interval_years 年）
        annual_om  = materials + labor + coolant + battery
    """

    def __init__(
        self,
        params: DieselOMParams,
        annual_hours: float,
        include_generator_replacement: bool = True,
        replacement_cycle_years: int = 2,
        analysis_years: int = 10,
    ):
        """Configure the diesel O&M calculator.

        Args:
            params: Diesel O&M cost parameters (materials, labor, etc.).
            annual_hours: Annual generator run hours for this scenario.
            include_generator_replacement: Whether to include periodic
                generator replacement cost.
            replacement_cycle_years: Years between generator replacements.
            analysis_years: Number of years to project costs over.
        """
        self.p = params
        self.annual_hours = annual_hours
        self.include_generator_replacement = include_generator_replacement
        self.replacement_cycle_years = replacement_cycle_years
        self.analysis_years = analysis_years

        # 预计算（每年固定量）
        self._n_services: int = math.ceil(annual_hours / params.S_oil)
        self._n_air: int = math.ceil(annual_hours / params.S_air)

    # ── 单项费用 ──────────────────────────────────────────────

    def _materials_raw(self) -> float:
        """年常规材料费（未取整，用于精确合计）."""
        p = self.p
        return (
            self._n_services * (p.V_oil * p.P_oil + p.C_of + p.C_ff)
            + self._n_air * p.C_af
        )

    def _labor_raw(self) -> float:
        """年常规人工费（未取整）."""
        return self._n_services * self.p.t_pm * self.p.labor_rate

    def _coolant_raw(self) -> float:
        """单次冷却液更换费用（未取整）."""
        p = self.p
        return (
            p.coolant_gal_per_service * p.P_coolant
            + p.coolant_labor_hours * p.labor_rate
        )

    def _battery_raw(self) -> float:
        """单次启动电池更换费用（未取整）."""
        p = self.p
        return p.C_battery + p.battery_labor_hours * p.labor_rate

    # ── 逐年计算 ─────────────────────────────────────────────

    def calculate_year(self, year: int) -> dict:
        """计算指定年份的柴油机运维成本明细.

        Returns:
        -------
        dict  含 operating_hours, regular_materials, regular_labor,
              coolant, battery, annual_total, generator_capex
        """
        p = self.p

        materials = self._materials_raw()
        labor = self._labor_raw()

        # 冷却液：每 coolant_interval_years 年更换一次
        coolant = (
            self._coolant_raw()
            if (year % p.coolant_interval_years == 0)
            else 0.0
        )

        # 启动电池：每 battery_interval_years 年更换一次
        battery = (
            self._battery_raw()
            if (year % p.battery_interval_years == 0)
            else 0.0
        )

        annual_om = materials + labor + coolant + battery

        # 发电机购置/更换（第1, 1+cycle, 1+2×cycle ... 年）
        generator_capex = 0.0
        if self.include_generator_replacement:
            if (year - 1) % self.replacement_cycle_years == 0:
                generator_capex = p.diesel_generator_unit_cost

        return {
            "year": year,
            "operating_hours": self.annual_hours,
            "regular_materials": round(materials, 2),
            "regular_labor": round(labor, 2),
            "coolant": round(coolant, 2),
            "battery": round(battery, 2),
            "annual_total": round(annual_om, 0),
            "generator_capex": round(generator_capex, 0),
        }

    # ── 表格生成 ─────────────────────────────────────────────

    def generate_annual_table(self, currency: str = "$") -> pd.DataFrame:
        """生成年度视图表格（对应案例"年度视图"）.

        Columns: 年度, 当年小时, 当年常规材料, 当年常规人工,
                 当年冷却液, 当年电池, 当年合计, 柴油发电机购置/更换成本
        """
        rows = []
        for yr in range(1, self.analysis_years + 1):
            d = self.calculate_year(yr)
            rows.append(
                {
                    "年度": yr,
                    "当年小时": int(d["operating_hours"]),
                    f"当年常规材料({currency})": d["regular_materials"],
                    f"当年常规人工({currency})": d["regular_labor"],
                    f"当年冷却液({currency})": d["coolant"],
                    f"当年电池({currency})": d["battery"],
                    f"当年合计({currency})": d["annual_total"],
                    f"发电机购置/更换({currency})": d["generator_capex"],
                }
            )
        return pd.DataFrame(rows)

    def generate_cumulative_table(self, currency: str = "$") -> pd.DataFrame:
        """生成累计视图表格（对应案例"累计视图"）.

        Columns: 年度, 累计小时, 累计常规材料, 累计常规人工,
                 累计冷却液, 累计电池, 累计总计, 累计发电机购置/更换成本
        """
        rows = []
        cum = dict.fromkeys(
            [
                "hours",
                "materials",
                "labor",
                "coolant",
                "battery",
                "total",
                "capex",
            ],
            0.0,
        )

        for yr in range(1, self.analysis_years + 1):
            d = self.calculate_year(yr)
            cum["hours"] += d["operating_hours"]
            cum["materials"] += d["regular_materials"]
            cum["labor"] += d["regular_labor"]
            cum["coolant"] += d["coolant"]
            cum["battery"] += d["battery"]
            cum["total"] += d["annual_total"]
            cum["capex"] += d["generator_capex"]

            rows.append(
                {
                    "年度": yr,
                    "累计小时": int(cum["hours"]),
                    f"累计常规材料({currency})": round(cum["materials"], 0),
                    f"累计常规人工({currency})": round(cum["labor"], 0),
                    f"累计冷却液({currency})": round(cum["coolant"], 0),
                    f"累计电池({currency})": round(cum["battery"], 0),
                    f"累计总计({currency})": round(cum["total"], 0),
                    f"累计发电机购置/更换({currency})": round(cum["capex"], 0),
                }
            )
        return pd.DataFrame(rows)


# ─────────────────────────────────────────────────────────────
# 3. 微电网经济性对比分析
# ─────────────────────────────────────────────────────────────


class MicrogridEconomicAnalysis:
    """微电网系统 vs 纯柴油发电机系统  全生命周期经济性对比分析.

    计算框架：
    ┌───────────────────────────────────────────────────────────┐
    │  微电网方案年度投入：                                      │
    │    Year 1 = 系统售价 + 柴油机B工况O&M + 燃料              │
    │    Year N = 光储年运维 + 柴油机B工况O&M + 燃料           │
    │                                                           │
    │  纯柴油方案年度投入：                                      │
    │    Year N = 发电机购置/更换 + 柴油机A工况O&M + 燃料       │
    │                                                           │
    │  年度收益 = 纯柴油年投入 - 微电网年投入                   │
    │  LCOE = 累计总投入 / 累计发电量                            │
    └───────────────────────────────────────────────────────────┘
    """

    def __init__(
        self,
        project: ProjectParameters | None = None,
        capex: SystemCapex | None = None,
        mg_om: MicrogridOMParams | None = None,
        diesel_om: DieselOMParams | None = None,
        microgrid_has_generator: bool = True,
    ):
        """Configure the microgrid-vs-diesel-only comparison.

        Args:
            project: Project-level economic parameters (years, discount
                rate, etc.); defaults are used when omitted.
            capex: Microgrid capital expenditure breakdown.
            mg_om: Microgrid annual O&M parameters.
            diesel_om: Diesel generator O&M parameters.
            microgrid_has_generator: Whether the microgrid scenario also
                includes a backup diesel generator.
        """
        self.proj = project or ProjectParameters()
        self.capex = capex or SystemCapex()
        self.mg_om = mg_om or MicrogridOMParams()
        self.d_params = diesel_om or DieselOMParams()

        # A工况：纯柴油模式（每2年更换发电机）
        self.diesel_only_calc = DieselOMCalculator(
            params=self.d_params,
            annual_hours=self.d_params.hours_a,
            include_generator_replacement=True,
            replacement_cycle_years=self.d_params.replacement_cycle_a_years,
            analysis_years=self.proj.analysis_years,
        )

        # B工况：微电网中的柴油机（每17年更换）
        self.mg_diesel_calc = DieselOMCalculator(
            params=self.d_params,
            annual_hours=self.d_params.hours_b,
            include_generator_replacement=microgrid_has_generator,
            replacement_cycle_years=self.d_params.replacement_cycle_b_years,
            analysis_years=self.proj.analysis_years,
        )

    # ── 逐年投入 ─────────────────────────────────────────────

    def microgrid_annual_cost(self, year: int) -> float:
        """微电网方案第 year 年总投入成本（$）.

        Year 1 : 系统售价 + 柴油O&M(B工况) + 燃料
        Year N : 光储年运维 + 柴油O&M(B工况) + 燃料
        """
        dm = self.mg_diesel_calc.calculate_year(year)
        fuel = self.proj.microgrid_annual_fuel_cost

        if year == 1:
            return self.capex.selling_price + dm["annual_total"] + fuel
        else:
            return self.mg_om.total_annual_om + dm["annual_total"] + fuel

    def dieselonly_annual_cost(self, year: int) -> float:
        """纯柴油方案第 year 年总投入成本（$）.

        Year N : 发电机购置/更换 + A工况O&M + 燃料
        """
        dm = self.diesel_only_calc.calculate_year(year)
        fuel = self.proj.dieselonly_annual_fuel_cost
        return dm["annual_total"] + dm["generator_capex"] + fuel

    # ── 核心表格 ─────────────────────────────────────────────

    def generate_comparison_table(self) -> pd.DataFrame:
        """生成对比计算表格（对应案例"计算/Calculation"表）.

        Columns:
            年份(t),
            微电网每年投入, 柴油发电机每年投入,
            微电网累计投入, 柴油发电机累计投入,
            微电网LCOE($/kWh), 柴油LCOE($/kWh),
            每年收益($), 累计收益($)
        """
        rows = []
        cum_mg = cum_diesel = cum_revenue = 0.0

        for yr in range(1, self.proj.analysis_years + 1):
            mg_cost = self.microgrid_annual_cost(yr)
            diesel_cost = self.dieselonly_annual_cost(yr)

            cum_mg += mg_cost
            cum_diesel += diesel_cost

            cum_kwh = yr * self.proj.annual_load_kwh
            mg_lcoe = cum_mg / cum_kwh
            diesel_lcoe = cum_diesel / cum_kwh

            annual_rev = diesel_cost - mg_cost
            cum_revenue += annual_rev

            rows.append(
                {
                    _YEAR_COLUMN: yr,
                    "微电网每年投入($)": round(mg_cost, 0),
                    "柴油发电机每年投入($)": round(diesel_cost, 0),
                    "微电网累计投入($)": round(cum_mg, 0),
                    "柴油累计投入($)": round(cum_diesel, 0),
                    _MICROGRID_LCOE_COLUMN: round(mg_lcoe, 2),
                    _DIESEL_LCOE_COLUMN: round(diesel_lcoe, 2),
                    "每年收益($)": round(annual_rev, 0),
                    _CUMULATIVE_REVENUE_COLUMN: round(cum_revenue, 0),
                }
            )

        return pd.DataFrame(rows)

    # ── 关键指标 ─────────────────────────────────────────────

    def find_breakeven_year(self) -> tuple[Optional[int], float]:
        """求累计收益转正的年份（投资回本年）.

        Returns (year, cumulative_revenue) or (None, final_cum_revenue)
        """
        cum_revenue = 0.0
        for yr in range(1, self.proj.analysis_years + 1):
            cum_revenue += self.dieselonly_annual_cost(
                yr
            ) - self.microgrid_annual_cost(yr)
            if cum_revenue >= 0:
                return yr, cum_revenue
        return None, cum_revenue

    def find_lcoe_crossover_year(self) -> Optional[int]:
        """求微电网 LCOE 低于柴油 LCOE 的首个年份."""
        cum_mg = cum_diesel = 0.0
        for yr in range(1, self.proj.analysis_years + 1):
            cum_mg += self.microgrid_annual_cost(yr)
            cum_diesel += self.dieselonly_annual_cost(yr)
            kwh = yr * self.proj.annual_load_kwh
            if cum_mg / kwh <= cum_diesel / kwh:
                return yr
        return None

    def summary_metrics(self) -> dict:
        """返回核心摘要指标字典."""
        comp = self.generate_comparison_table()
        last = comp.iloc[-1]
        be_year, _ = self.find_breakeven_year()
        lc_year = self.find_lcoe_crossover_year()

        return {
            "project_name": self.proj.project_name,
            "analysis_years": self.proj.analysis_years,
            "annual_load_kwh": self.proj.annual_load_kwh,
            "selling_price_usd": self.capex.selling_price,
            "total_cost_usd": self.capex.equipment_subtotal,
            "profit_amount_usd": self.capex.profit_amount,
            "microgrid_annual_om_usd": self.mg_om.total_annual_om,
            "mg_annual_fuel_usd": self.proj.microgrid_annual_fuel_cost,
            "diesel_annual_fuel_usd": self.proj.dieselonly_annual_fuel_cost,
            "breakeven_year": be_year,
            "lcoe_crossover_year": lc_year,
            "final_mg_lcoe": float(last[_MICROGRID_LCOE_COLUMN]),
            "final_diesel_lcoe": float(last[_DIESEL_LCOE_COLUMN]),
            "final_cumulative_revenue": float(last[_CUMULATIVE_REVENUE_COLUMN]),
        }


# ─────────────────────────────────────────────────────────────
# 4. 报告格式化
# ─────────────────────────────────────────────────────────────


def _fmt(value: float, prefix: str = "$", suffix: str = "") -> str:
    """格式化金额."""
    return f"{prefix}{value:>12,.2f}{suffix}"


def _fmt0(value: float, prefix: str = "$") -> str:
    """格式化整数金额."""
    return f"{prefix}{value:>10,.0f}"


def format_capex_section(capex: SystemCapex) -> str:
    """格式化 CAPEX 明细为文本报告段落."""
    c = capex
    return f"""
━━━━━━━━━━━━━━━━  【系统初始投资成本（CAPEX）】  ━━━━━━━━━━━━━━━━
  光伏组件（含运输）           : {_fmt(c.pv_module_cost)}
  光伏支架                     : {_fmt(c.pv_mounting_cost)}
  储能系统（含运输）           : {_fmt(c.energy_storage_cost)}
  柴油发电机组                 : {_fmt(c.diesel_generator_cost)}
  国际运输费                   : {_fmt(c.intl_transport_cost)}
  一次性安装费                 : {_fmt(c.installation_cost)}
  其他附件                     : {_fmt(c.accessory_cost)}
  其他初始成本（不含光储设备）  : {_fmt(c.other_initial_cost)}
  ─────────────────────────────────────────────────────────────
  ★ 成本合计                   : {_fmt(c.equipment_subtotal)}
  利润率                       :  {c.profit_margin * 100:.0f}%
  利润金额                     : {_fmt(c.profit_amount)}
  ★★ 含 {c.profit_margin * 100:.0f}% 利润的对外售价             : {_fmt(c.selling_price)}"""


def format_diesel_params_section(p: DieselOMParams) -> str:
    """格式化柴油机运维参数为文本报告段落."""
    oil_cost = p.V_oil * p.P_oil
    n_a = math.ceil(p.hours_a / p.S_oil)
    n_b = math.ceil(p.hours_b / p.S_oil)
    na_air = math.ceil(p.hours_a / p.S_air)
    nb_air = math.ceil(p.hours_b / p.S_air)
    coolant_cost = (
        p.coolant_gal_per_service * p.P_coolant
        + p.coolant_labor_hours * p.labor_rate
    )
    battery_cost = p.C_battery + p.battery_labor_hours * p.labor_rate

    mat_a = n_a * (oil_cost + p.C_of + p.C_ff) + na_air * p.C_af
    lab_a = n_a * p.t_pm * p.labor_rate
    mat_b = n_b * (oil_cost + p.C_of + p.C_ff) + nb_air * p.C_af
    lab_b = n_b * p.t_pm * p.labor_rate

    return f"""
━━━━━━━━━━━━━━━━  【柴油发电机运维参数】  ━━━━━━━━━━━━━━━━
  小保养间隔 (S_oil)           :  {p.S_oil:.0f} 小时/次
  小保养人工时 (t_pm)          :  {p.t_pm:.2f} 小时/次 × ${p.labor_rate:.2f}/h = ${p.t_pm * p.labor_rate:.2f}/次
  机油用量 (V_oil)             :  {p.V_oil:.2f} 加仑/次 × ${p.P_oil:.2f}/gal = ${oil_cost:.2f}/次
  机油滤芯 (C_of)              :  ${p.C_of:.2f}/次
  燃油滤芯 (C_ff)              :  ${p.C_ff:.2f}/次
  空气滤芯 (C_af)              :  ${p.C_af:.2f}/次（每 {p.S_air:.0f}h 更换一次）
  人工费率 (labor_rate)        :  ${p.labor_rate:.2f}/小时

  冷却液更换周期               :  每 {p.coolant_interval_years} 年（${coolant_cost:.2f}/次）
    {p.coolant_gal_per_service:.2f} gal × ${p.P_coolant:.2f} + {p.coolant_labor_hours:.2f}h × ${p.labor_rate:.2f}
  启动电池更换周期             :  每 {p.battery_interval_years} 年（${battery_cost:.2f}/次）
    ${p.C_battery:.2f} + {p.battery_labor_hours:.2f}h × ${p.labor_rate:.2f}

  ┌─────────────────────────────────────────────────────────────┐
  │              A工况（纯柴油）         B工况（微电网）        │
  │  年运行小时  {p.hours_a:>8.0f} h          {p.hours_b:>6.0f} h             │
  │  年保养次数  {n_a:>8d} 次          {n_b:>6d} 次             │
  │  年空滤更换  {na_air:>8d} 次          {nb_air:>6d} 次             │
  │  年常规材料  ${mat_a:>9,.2f}        ${mat_b:>9,.2f}          │
  │  年常规人工  ${lab_a:>9,.2f}        ${lab_b:>9,.2f}          │
  │  发电机寿命  每 {p.replacement_cycle_a_years} 年更换              每 {p.replacement_cycle_b_years} 年更换         │
  └─────────────────────────────────────────────────────────────┘"""


def format_comparison_section(
    df: pd.DataFrame,
    proj: ProjectParameters,
    breakeven_year: Optional[int],
    lcoe_cross: Optional[int],
) -> str:
    """格式化年度对比表为文本报告段落."""
    be_str = (
        f"第 {breakeven_year} 年"
        if breakeven_year
        else f">  {proj.analysis_years} 年"
    )
    lc_str = (
        f"第 {lcoe_cross} 年" if lcoe_cross else f">  {proj.analysis_years} 年"
    )
    last = df.iloc[-1]

    header = (
        f"\n{'年份(t)':<8}"
        f"{'微电网年投入':>14}"
        f"{'柴油年投入':>14}"
        f"{'微电网LCOE':>12}"
        f"{'柴油LCOE':>10}"
        f"{'年收益':>13}"
        f"{'累计收益':>14}"
    )
    sep = "  " + "─" * 84

    rows_str = ""
    for _, row in df.iterrows():
        cum_rev = row[_CUMULATIVE_REVENUE_COLUMN]
        flag = (
            " <<< 回本!"
            if cum_rev >= 0 and (row[_YEAR_COLUMN] == breakeven_year)
            else ""
        )
        lcoe_flag = " <<< LCOE交叉!" if row[_YEAR_COLUMN] == lcoe_cross else ""
        rows_str += (
            f"  {row[_YEAR_COLUMN]:<6.0f}"
            f"  ${row['微电网每年投入($)']:>11,.0f}"
            f"  ${row['柴油发电机每年投入($)']:>11,.0f}"
            f"  ${row[_MICROGRID_LCOE_COLUMN]:>8.2f}/kWh"
            f"  ${row[_DIESEL_LCOE_COLUMN]:>6.2f}/kWh"
            f"  ${row['每年收益($)']:>10,.0f}"
            f"  ${row[_CUMULATIVE_REVENUE_COLUMN]:>12,.0f}"
            f"{flag}{lcoe_flag}\n"
        )

    return f"""
━━━━━━━━━━━━━━━━  【经济性对比分析（{proj.analysis_years} 年）】  ━━━━━━━━━━━━━━━━
{header}
{sep}
{rows_str}
━━━━━━━━━━━━━━━━  【投资回报摘要】  ━━━━━━━━━━━━━━━━
  ★ LCOE 交叉年（微电网LCOE 首次低于柴油）  :  {lc_str}
  ★ 累计收益转正（投资回本年）               :  {be_str}
  第 {proj.analysis_years} 年末累计收益                       :  ${last[_CUMULATIVE_REVENUE_COLUMN]:>10,.0f}
  第 {proj.analysis_years} 年末微电网 LCOE                    :  ${last[_MICROGRID_LCOE_COLUMN]:>6.2f} /kWh
  第 {proj.analysis_years} 年末柴油 LCOE                      :  ${last[_DIESEL_LCOE_COLUMN]:>6.2f} /kWh"""


def format_full_report(analysis: MicrogridEconomicAnalysis) -> str:
    """生成完整的微电网解决方案文本报告."""
    proj = analysis.proj
    capex = analysis.capex
    mg_om = analysis.mg_om
    dp = analysis.d_params

    comp = analysis.generate_comparison_table()
    be_yr, _ = analysis.find_breakeven_year()
    lc_yr = analysis.find_lcoe_crossover_year()

    header = f"""
╔═══════════════════════════════════════════════════════════════════╗
║         微电网解决方案  ·  完整经济分析报告（USD）                ║
║         {proj.project_name:<52}   ║
╚═══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━  【项目基本参数】  ━━━━━━━━━━━━━━━━
  年总用电量                   :  {proj.annual_load_kwh:>10,.0f} kWh/年
  柴油单价                     :  ${proj.diesel_price_per_liter:.2f} /升
  微电网模式年用油量           :  {proj.microgrid_diesel_liters:>10,.0f} 升/年（HOMER Pro 仿真值）
  纯柴油模式年用油量           :  {proj.dieselonly_diesel_liters:>10,.0f} 升/年（HOMER Pro 仿真值）
  微电网年燃料成本             :  ${proj.microgrid_annual_fuel_cost:>9,.2f}
  纯柴油年燃料成本             :  ${proj.dieselonly_annual_fuel_cost:>9,.2f}
  燃料成本节省（年）           :  ${proj.dieselonly_annual_fuel_cost - proj.microgrid_annual_fuel_cost:>9,.2f}
  分析年限                     :  {proj.analysis_years} 年"""

    om_section = f"""
━━━━━━━━━━━━━━━━  【微电网光储年度运维（第2年起）】  ━━━━━━━━━━━━━━━━
  光储运维费（年）             :  ${mg_om.pv_storage_om_annual:>8,.0f}
  设备修理费（年）             :  ${mg_om.equipment_repair_annual:>8,.0f}
  保险费（年）                 :  ${mg_om.insurance_annual:>8,.0f}
  ─────────────────────────────────────────────────────────────
  ★ 年度光储运维合计           :  ${mg_om.total_annual_om:>8,.0f}"""

    capex_section = format_capex_section(capex)
    dp_section = format_diesel_params_section(dp)
    comp_section = format_comparison_section(comp, proj, be_yr, lc_yr)

    footer = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  注：
  1. 柴油消耗数据来源于 HOMER Pro 仿真；实际值可根据负载调整。
  2. A工况（纯柴油）发电机年运行 {dp.hours_a:.0f}h，每 {dp.replacement_cycle_a_years} 年更换一次。
  3. B工况（微电网）发电机年运行 {dp.hours_b:.0f}h，每 {dp.replacement_cycle_b_years} 年更换一次。
  4. 柴油单价（${proj.diesel_price_per_liter}）可根据国际油价动态调整。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"""

    return (
        header + capex_section + om_section + dp_section + comp_section + footer
    )


# ─────────────────────────────────────────────────────────────
# 5. 主入口：生成完整解决方案报告
# ─────────────────────────────────────────────────────────────


def generate_solution_report(
    project: ProjectParameters | None = None,
    capex: SystemCapex | None = None,
    mg_om: MicrogridOMParams | None = None,
    diesel_om: DieselOMParams | None = None,
    microgrid_has_generator: bool = True,
) -> dict:
    """生成完整的微电网解决方案报告（含经济分析）.

    Args:
        project: 项目基本参数；不传则使用40kW案例默认值。
        capex: 系统初始投资；不传则使用案例默认值。
        mg_om: 光储年运维参数；不传则使用案例默认值。
        diesel_om: 柴油机运维参数；不传则使用案例默认值。
        microgrid_has_generator: 微电网方案是否含柴油备用发电机。

    Returns:
        包含以下键的字典：
        report（str，格式化文本报告，可直接 print）、
        tables（dict[DataFrame]，所有明细表格）、
        summary（dict，核心指标摘要）、
        analysis（MicrogridEconomicAnalysis，分析对象，可继续调用）。
    """
    analysis = MicrogridEconomicAnalysis(
        project, capex, mg_om, diesel_om, microgrid_has_generator
    )

    # ── 生成所有表格 ──────────────────────────────────────────
    tables = {
        # 纯柴油 A工况
        "diesel_only_annual": (
            analysis.diesel_only_calc.generate_annual_table()
        ),
        "diesel_only_cumulative": (
            analysis.diesel_only_calc.generate_cumulative_table()
        ),
        # 微电网 B工况柴油机
        "microgrid_diesel_annual": (
            analysis.mg_diesel_calc.generate_annual_table()
        ),
        "microgrid_diesel_cumulative": (
            analysis.mg_diesel_calc.generate_cumulative_table()
        ),
        # LCOE对比
        "comparison": analysis.generate_comparison_table(),
    }

    return {
        "report": format_full_report(analysis),
        "tables": tables,
        "summary": analysis.summary_metrics(),
        "analysis": analysis,
    }


# ─────────────────────────────────────────────────────────────
# 命令行直接运行
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = generate_solution_report()

    print(result["report"])

    print("\n\n" + "═" * 70)
    print("  附表 1：纯柴油发电机运维成本（年度视图）")
    print("═" * 70)
    print(result["tables"]["diesel_only_annual"].to_string(index=False))

    print("\n" + "═" * 70)
    print("  附表 2：微电网柴油机运维成本（年度视图）")
    print("═" * 70)
    print(result["tables"]["microgrid_diesel_annual"].to_string(index=False))

    print("\n" + "═" * 70)
    print("  附表 3：LCOE 对比与收益分析")
    print("═" * 70)
    print(result["tables"]["comparison"].to_string(index=False))
