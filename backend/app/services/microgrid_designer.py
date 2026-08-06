"""
microgrid_designer.py
=====================
微电网一键设计器 —— 用 PyPSA 替代 HOMER Pro 完成能量仿真，
再调用 economic_analysis.py 生成完整经济报告。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOMER Pro 参数 → PyPSA 替代方案对照表
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
参数（HOMER Pro）                  PyPSA 替代                  状态
─────────────────────────────────────────────────────────────
第16行：微电网年用油量（L）         OffGridMicrogridSimulator    ✅ 完全替代
         annual_diesel_kwh ÷ 3.2                              （精度取决于光照模型）
第17行：纯柴油年用油量（L）         DieselOnlySimulator          ✅ 完全替代
         diesel_kwh_generated ÷ 3.2
第18行：年总用电量（kWh）           load_profile.sum()           ✅ 完全替代
第20行：A工况年运行小时（8760h）    固定值 8760                  ✅ 恒成立（纯柴油全年运行）
第22行：B工况年运行小时（889h）     OffGridMicrogridSimulator    ✅ 完全替代
         diesel_run_hours
─────────────────────────────────────────────────────────────
光照数据（影响精度）
  简化模型（当前）：正弦曲线 + 随机云遮                        ⚠ 近似
  高精度模型（推荐）：atlite + ERA5 真实气象数据                ✅ 精确
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

最简使用示例：
    designer = MicrogridDesigner(
        annual_load_kwh     = 131_400,
        diesel_capacity_kw  = 40,
        pv_capacity_kw      = 84,
        battery_capacity_kwh= 160,
        latitude            = 25.0,   # 示例默认值，不代表固定地点
    )
    result = designer.design()
    print(result["report"])

电流规格输入示例（北美 240V 分相制）：
    designer = MicrogridDesigner(
        voltage_v           = 240,
        current_schedule    = [(8,10,140),(10,17,50),(17,20,140),(20,32,20)],
        annual_kwh_override = 131_400,   # 可选：归一化到 HOMER Pro 值
        diesel_capacity_kw  = 40,
        pv_capacity_kw      = 84,
        battery_capacity_kwh= 160,
    )
"""

from __future__ import annotations

import math
import warnings
from dataclasses import dataclass
from typing import Optional

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

# ── 依赖本项目模块 ────────────────────────────────────────────
from app.services.microgrid_simulator import (
    OffGridMicrogridSimulator,
    DieselOnlySimulator,
    generate_load_profile,
    generate_load_profile_from_current_spec,
    generate_pv_profile,
)
from app.services.economic_analysis import (
    SystemCapex,
    MicrogridOMParams,
    DieselOMParams,
    ProjectParameters,
    generate_solution_report,
)
from app.core.catalog import get_catalog


# ─────────────────────────────────────────────────────────────
# 1. 成本估算辅助函数（从系统规格自动推算 CAPEX）
# ─────────────────────────────────────────────────────────────

def estimate_capex_usd(
    pv_capacity_kw: float,
    battery_capacity_kwh: float,
    battery_power_kw: float,
    diesel_capacity_kw: float,
    # ── 产品型号（从 products.yaml 读取，None = 使用默认型号）──
    panel_model: Optional[str]         = None,
    battery_pack_model: Optional[str]  = None,
    # ── 单价参数（优先使用产品目录值；显式传入可覆盖目录值）─
    pv_panel_usd_per_kw: float         = None,
    # 若 None，则从 config_loader 读取对应组件的 $/kW
    # 默认型号（655W, $0.32/Wp）= $320/kW ✓

    pv_mounting_usd_per_kw: float       = 909.1,
    # 支架体系（含50%进口关税）
    # 标定：$76,200 ÷ 83.84kW = $909.09/kW ✓

    energy_storage_usd_per_kwh: float   = None,
    # 若 None，则从 config_loader 读取电池包的 $/kWh（默认 LFP-10kWh = $310/kWh）
    # 储能系统综合单价（逆变器+电池包+托盘）
    # 标定：$76,100 ÷ 160kWh = $475.625/kWh ✓
    # 组成：电池$310/kWh + 逆变器$562.5/kW(4h率) + 托盘固定$4000

    diesel_usd_per_kw: float            = None,
    # 若 None，则从 config_loader 按容量查找柴油机型号
    # 标定：$45,000 ÷ 40kW = $1,125/kW ✓

    intl_transport_usd: float           = None,  # None = 从 accessories() 读取
    installation_usd: float             = None,
    accessory_usd: float                = None,
    other_initial_usd: float            = None,
    profit_margin: float                = None,  # None = 从 pricing() 读取
) -> SystemCapex:
    """
    根据系统规格估算 CAPEX，返回 SystemCapex 对象。

    支持从 products.yaml 自动读取组件单价，也可通过参数覆盖。

    Parameters
    ----------
    pv_capacity_kw : float
        光伏装机容量（kW）
    battery_capacity_kwh : float
        电池总容量（kWh）
    battery_power_kw : float
        电池额定功率（kW，通常 = capacity/4）
    diesel_capacity_kw : float
        柴油发电机额定功率（kW）
    panel_model : str | None
        光伏组件型号（如 "655W"、"600W"）；None = 使用 products.yaml 默认型号。
    battery_pack_model : str | None
        电池包型号（如 "LFP-10kWh"、"LFP-20kWh"）；None = 使用默认型号。

    Notes
    -----
    以 40kW 北美参考案例标定，误差 < $100。
    验证：pv=83.84kW, bat=160kWh, bat_kw=40kW, diesel=40kW
        → 成本合计 ≈ $272,629（误差 < $100）
        → 售价    ≈ $317,155（误差 < $100）

    对于精确报价，请直接构建 SystemCapex 并传入 MicrogridDesigner。
    """
    # ── 从产品目录读取单价（若参数未显式提供）───────────────
    cat = get_catalog()

    if pv_panel_usd_per_kw is None:
        panel = cat.panel(panel_model)
        pv_panel_usd_per_kw = panel.price_usd_per_kw   # $/kW = $/Wp × 1000

    if energy_storage_usd_per_kwh is None:
        bat_price_per_kwh = cat.battery_price_per_kwh(battery_pack_model)
        # 储能综合单价 = 电池 $/kWh + 逆变器分摊 + 托盘分摊
        # 标定值：$310/kWh(电池) + $562.5/kW×(bat_kw/bat_kwh) + $4000/bat_kwh
        inverter_per_kwh = 562.5 * battery_power_kw / max(battery_capacity_kwh, 1)
        pallet_per_kwh   = 4_000.0 / max(battery_capacity_kwh, 1)
        energy_storage_usd_per_kwh = bat_price_per_kwh + inverter_per_kwh + pallet_per_kwh

    if diesel_usd_per_kw is None:
        dg = cat.diesel_generator(power_kw=diesel_capacity_kw)
        diesel_usd_per_kw = dg.price_usd / max(dg.power_kw, 1)

    # ── 附属成本和定价策略（从目录读取）────────────────────
    acc     = cat.accessories()
    pricing = cat.pricing()
    if intl_transport_usd is None:
        intl_transport_usd = acc.get("intl_transport_usd", 10_800.0)
    if installation_usd is None:
        installation_usd   = acc.get("installation_usd",    5_000.0)
    if accessory_usd is None:
        accessory_usd      = acc.get("accessory_usd",      28_500.0)
    if other_initial_usd is None:
        other_initial_usd  = acc.get("other_initial_usd",   4_200.0)
    if profit_margin is None:
        profit_margin      = float(pricing.get("profit_margin", 0.20))

    # ── 计算各项成本 ─────────────────────────────────────
    pv_panel_cost  = round(pv_capacity_kw       * pv_panel_usd_per_kw,       2)
    mounting_cost  = round(pv_capacity_kw       * pv_mounting_usd_per_kw,    2)
    storage_cost   = round(battery_capacity_kwh * energy_storage_usd_per_kwh, 2)
    diesel_cost    = round(diesel_capacity_kw   * diesel_usd_per_kw,          2)

    return SystemCapex(
        pv_module_cost        = pv_panel_cost,
        pv_mounting_cost      = mounting_cost,
        energy_storage_cost   = storage_cost,
        diesel_generator_cost = diesel_cost,
        intl_transport_cost   = intl_transport_usd,
        installation_cost     = installation_usd,
        accessory_cost        = accessory_usd,
        other_initial_cost    = other_initial_usd,
        profit_margin         = profit_margin,
    )


def estimate_diesel_om_params(
    diesel_capacity_kw: float,
    hours_a: float = 8_760,
    hours_b: float = None,       # 由仿真确定；若 None 则暂用默认值
    replacement_cycle_a_years: int = 2,
    replacement_cycle_b_years: int = 17,
    diesel_usd_per_kw: float = 1_125.0,
) -> DieselOMParams:
    """
    根据柴油机功率估算 DieselOMParams（更换成本按 $/kW 比例缩放）。
    """
    return DieselOMParams(
        hours_a                    = hours_a,
        hours_b                    = hours_b if hours_b is not None else 889,
        replacement_cycle_a_years  = replacement_cycle_a_years,
        replacement_cycle_b_years  = replacement_cycle_b_years,
        diesel_generator_unit_cost = round(diesel_capacity_kw * diesel_usd_per_kw, 0),
    )


# ─────────────────────────────────────────────────────────────
# 2. 主设计器类
# ─────────────────────────────────────────────────────────────

class MicrogridDesigner:
    """
    离网微电网一键设计器。

    用 PyPSA 替代 HOMER Pro，完整流程：
        1. 构建负载时序（从年用电量、负载类型、或电流规格）
        2. 构建光伏出力时序（简化模型；推荐替换为 atlite+ERA5）
        3. 运行微电网 PyPSA 仿真 → 获得柴油消耗、运行小时等
        4. 运行纯柴油基准仿真 → 获得对照基准
        5. 自动构建 ProjectParameters（替代手动填写 HOMER Pro 结果）
        6. 调用 economic_analysis.generate_solution_report() 生成完整报告

    最少输入：
        annual_load_kwh + diesel_capacity_kw + pv_capacity_kw + battery_capacity_kwh

    推荐输入（电流规格）：
        voltage_v + current_schedule（+ annual_kwh_override）
        + diesel_capacity_kw + pv_capacity_kw + battery_capacity_kwh
    """

    def __init__(
        self,
        # ── 系统规格（必填）──────────────────────────────────────
        diesel_capacity_kw: float,
        pv_capacity_kw: float,
        battery_capacity_kwh: float,

        # ── 负载（三种方式，优先级：load_profile > current_schedule > annual_load_kwh）
        annual_load_kwh: float = None,
        load_type: str = "commercial",       # "residential" / "commercial" / "industrial"
        load_profile: pd.Series = None,      # 优先：直接提供 8760h 时序

        # ── 电流规格（替代 load_type，构建精确负载曲线）────────
        voltage_v: float = None,
        current_schedule: list = None,       # [(start_h, end_h, amps), ...]
        annual_kwh_override: float = None,   # 归一化到此值（用于对齐 HOMER Pro）

        # ── 地理与气象 ──────────────────────────────────────────
        latitude: float = 35.0,
        year: int = 2020,

        # ── 柴油参数 ────────────────────────────────────────────
        diesel_price_per_liter: float = 0.95,
        diesel_kwh_per_liter: float = 3.2,    # 柴油发电效率（kWh/L）

        # ── 电池参数 ────────────────────────────────────────────
        battery_power_kw: float = None,       # 默认 = capacity/4（4h 额定）

        # ── 产品型号（从 products.yaml 读取，None = 使用默认型号）──
        panel_model: str = None,
        battery_pack_model: str = None,

        # ── 成本参数（可选，不传则自动估算）────────────────────
        capex: SystemCapex = None,
        mg_om: MicrogridOMParams = None,
        diesel_om: DieselOMParams = None,

        verbose: bool = True,
    ):
        self.diesel_kw   = diesel_capacity_kw
        self.panel_model = panel_model
        self.battery_pack_model = battery_pack_model
        self.pv_kw       = pv_capacity_kw
        self.bat_kwh     = battery_capacity_kwh
        self.bat_kw      = battery_power_kw if battery_power_kw else battery_capacity_kwh / 4.0
        self.latitude    = latitude
        self.year        = year
        self.diesel_price = diesel_price_per_liter
        self.diesel_eff  = diesel_kwh_per_liter
        self.verbose     = verbose

        # ── 构建负载时序 ─────────────────────────────────────────
        if load_profile is not None:
            self.load_profile    = load_profile
            self._annual_kwh     = float(load_profile.sum())
            self._load_source    = "用户提供时序"

        elif voltage_v is not None and current_schedule is not None:
            override = annual_kwh_override or annual_load_kwh
            self.load_profile = generate_load_profile_from_current_spec(
                voltage_v          = voltage_v,
                current_schedule   = current_schedule,
                year               = year,
                annual_kwh_override= override,
            )
            self._annual_kwh  = float(override or self.load_profile.sum())
            self._load_source = (
                f"电流规格（{voltage_v}V, {len(current_schedule)} 时段"
                + (f", 归一化到 {override:,.0f} kWh" if override else "") + "）"
            )

        elif annual_load_kwh is not None:
            self.load_profile = generate_load_profile(
                annual_consumption_kwh = annual_load_kwh,
                load_type              = load_type,
                year                   = year,
            )
            self._annual_kwh  = annual_load_kwh
            self._load_source = f"负载类型 [{load_type}]，年用电 {annual_load_kwh:,.0f} kWh"

        else:
            raise ValueError(
                "必须提供以下之一：\n"
                "  1. load_profile（直接时序）\n"
                "  2. voltage_v + current_schedule（电流规格）\n"
                "  3. annual_load_kwh（年用电量）"
            )

        # ── 构建光伏出力时序 ─────────────────────────────────────
        self.pv_profile = generate_pv_profile(
            latitude          = latitude,
            year              = year,
            panel_capacity_kw = pv_capacity_kw,
        )

        # ── 成本参数（若未提供则自动估算，使用产品目录单价）────
        self.capex = capex or estimate_capex_usd(
            pv_capacity_kw       = pv_capacity_kw,
            battery_capacity_kwh = battery_capacity_kwh,
            battery_power_kw     = self.bat_kw,
            diesel_capacity_kw   = diesel_capacity_kw,
            panel_model          = panel_model,
            battery_pack_model   = battery_pack_model,
        )
        self.mg_om = mg_om or MicrogridOMParams()
        self.diesel_om = diesel_om or estimate_diesel_om_params(
            diesel_capacity_kw = diesel_capacity_kw,
        )

        # ── 仿真结果（design() 运行后填充）─────────────────────
        self.mg_sim: dict = {}
        self.diesel_sim: dict = {}

    # ── 仿真方法 ─────────────────────────────────────────────

    def run_microgrid_simulation(self, solver_name: str = "highs") -> dict:
        """
        运行光储柴微电网 PyPSA 仿真。

        替代 HOMER Pro 第16/22行：
            microgrid_diesel_liters  = annual_diesel_kwh / diesel_kwh_per_liter
            hours_b                  = diesel_run_hours
        """
        sim = OffGridMicrogridSimulator(
            pv_capacity_kw       = self.pv_kw,
            battery_capacity_kwh = self.bat_kwh,
            battery_power_kw     = self.bat_kw,
            diesel_capacity_kw   = self.diesel_kw,
            load_profile         = self.load_profile,
            pv_profile           = self.pv_profile,
            diesel_fuel_cost     = self.diesel_price / self.diesel_eff,
            verbose              = False,
        )
        sim.build_network()
        results = sim.run_simulation(solver_name=solver_name)

        # 换算 kWh → 升
        results["microgrid_diesel_liters"] = round(
            results["annual_diesel_kwh"] / self.diesel_eff, 0
        )
        results["diesel_run_hours_b"] = results["diesel_run_hours"]

        self.mg_sim = results
        return results

    def run_dieselonly_simulation(self, solver_name: str = "highs") -> dict:
        """
        运行纯柴油基准 PyPSA 仿真。

        替代 HOMER Pro 第17/20行：
            dieselonly_diesel_liters = diesel_liters_per_year
            hours_a                  = 8760（恒成立）
        """
        sim = DieselOnlySimulator(
            diesel_capacity_kw         = self.diesel_kw,
            load_profile               = self.load_profile,
            diesel_fuel_cost_usd_per_kwh = self.diesel_price / self.diesel_eff,
            diesel_kwh_per_liter       = self.diesel_eff,
            verbose                    = False,
        )
        sim.build_network()
        results = sim.run_simulation(solver_name=solver_name)

        self.diesel_sim = results
        return results

    def _build_project_params(self) -> ProjectParameters:
        """从 PyPSA 仿真结果构建 ProjectParameters（替代手填 HOMER Pro 值）"""
        return ProjectParameters(
            project_name                = f"离网微电网 {self.diesel_kw:.0f}kW 柴油 / {self.pv_kw:.0f}kW 光伏",
            annual_load_kwh             = self._annual_kwh,
            diesel_price_per_liter      = self.diesel_price,
            microgrid_diesel_liters     = self.mg_sim["microgrid_diesel_liters"],
            dieselonly_diesel_liters    = self.diesel_sim["diesel_liters_per_year"],
        )

    def _update_diesel_om_hours(self) -> None:
        """用仿真结果更新 DieselOMParams 中的 B工况实际运行小时"""
        self.diesel_om.hours_b = float(self.mg_sim.get("diesel_run_hours_b", 889))

    # ── 主入口 ───────────────────────────────────────────────

    def design(self, solver_name: str = "highs") -> dict:
        """
        一键执行完整微电网设计与经济分析。

        流程
        ----
        1. 运行微电网 PyPSA 仿真（8760h）
        2. 运行纯柴油基准 PyPSA 仿真（8760h）
        3. 从仿真结果自动构建 ProjectParameters
        4. 调用 generate_solution_report() 生成经济报告

        Returns
        -------
        dict
            与 generate_solution_report() 相同格式，额外包含：
            - microgrid_simulation  : 微电网仿真详细结果
            - dieselonly_simulation : 纯柴油仿真详细结果
            - pypsa_summary         : PyPSA 关键指标摘要
        """
        if self.verbose:
            print(f"\n{'='*64}")
            print("  微电网一键设计器  （PyPSA 能量仿真 + 经济分析）")
            print(f"{'='*64}")
            print(f"  负载来源    : {self._load_source}")
            print(f"  年用电量    : {self._annual_kwh:>12,.0f} kWh")
            print(f"  光伏容量    : {self.pv_kw:>12.1f} kW")
            print(f"  电池容量    : {self.bat_kwh:>12.1f} kWh  ({self.bat_kw:.1f} kW)")
            print(f"  柴油机容量  : {self.diesel_kw:>12.1f} kW")
            print(f"  安装地点    : 纬度 {self.latitude}°N，{self.year} 年")
            print(f"  柴油价格    : ${self.diesel_price:.2f}/L（{self.diesel_eff} kWh/L）")

        # ── Step 1：微电网仿真 ────────────────────────────────
        if self.verbose:
            print(f"\n  [Step 1] 运行微电网 PyPSA 仿真（8760 个时步）...")

        mg = self.run_microgrid_simulation(solver_name)

        if self.verbose:
            print(f"  [完成]")
            print(f"    太阳能占比  : {mg['solar_fraction']:>7.1f} %")
            print(f"    失负荷率    : {mg['loss_of_load_rate']:>7.3f} %")
            print(f"    弃光率      : {mg['curtailment_rate']:>7.1f} %")
            print(f"    年柴油发电  : {mg['annual_diesel_kwh']:>10,.0f} kWh")
            print(f"    年柴油用量  : {mg['microgrid_diesel_liters']:>10,.0f} 升  ← 替代 HOMER Pro 第16行")
            print(f"    柴油运行时  : {mg['diesel_run_hours_b']:>10,} h/年   ← 替代 HOMER Pro 第22行")

        # ── Step 2：纯柴油基准仿真 ───────────────────────────
        if self.verbose:
            print(f"\n  [Step 2] 运行纯柴油基准 PyPSA 仿真...")

        ds = self.run_dieselonly_simulation(solver_name)

        if self.verbose:
            print(f"  [完成]")
            print(f"    年总用电量  : {ds['annual_load_kwh']:>10,.0f} kWh  ← 替代 HOMER Pro 第18行")
            print(f"    年柴油用量  : {ds['diesel_liters_per_year']:>10,.0f} 升  ← 替代 HOMER Pro 第17行")
            print(f"    年运行小时  : {ds['diesel_run_hours']:>10,} h/年   ← 替代 HOMER Pro 第20行（恒8760）")
            fuel_save = ds['diesel_liters_per_year'] - mg['microgrid_diesel_liters']
            print(f"    年燃料节省  : {fuel_save:>10,.0f} 升（≈ ${fuel_save*self.diesel_price:,.0f}）")

        # ── Step 3：更新柴油机运行小时并构建参数 ────────────
        self._update_diesel_om_hours()
        proj = self._build_project_params()

        if self.verbose:
            print(f"\n  [Step 3] 生成经济分析报告...")

        # ── Step 4：经济分析 ─────────────────────────────────
        report = generate_solution_report(
            project   = proj,
            capex     = self.capex,
            mg_om     = self.mg_om,
            diesel_om = self.diesel_om,
        )

        # 附加 PyPSA 仿真摘要
        report["microgrid_simulation"]  = mg
        report["dieselonly_simulation"] = ds
        report["pypsa_summary"] = {
            # 微电网性能指标
            "solar_fraction_pct":        mg["solar_fraction"],
            "loss_of_load_pct":          mg["loss_of_load_rate"],
            "curtailment_pct":           mg["curtailment_rate"],
            "mg_diesel_liters":          mg["microgrid_diesel_liters"],
            "mg_diesel_hours_b":         mg["diesel_run_hours_b"],
            # 纯柴油基准
            "diesel_only_liters":        ds["diesel_liters_per_year"],
            "diesel_run_hours_a":        ds["diesel_run_hours"],
            # 节省对比
            "annual_fuel_saving_liters": ds["diesel_liters_per_year"] - mg["microgrid_diesel_liters"],
            "annual_fuel_saving_usd":    round(
                (ds["diesel_liters_per_year"] - mg["microgrid_diesel_liters"]) * self.diesel_price, 0
            ),
            # 注明光照模型
            "pv_model": "simplified (sin curve + random cloud); use atlite+ERA5 for accuracy",
        }

        s = report["summary"]
        if self.verbose:
            pb = s["breakeven_year"]
            print(f"  [完成]")
            print(f"    系统成本合计: ${s['total_cost_usd']:>10,.0f}")
            print(f"    对外售价    : ${s['selling_price_usd']:>10,.0f}")
            lco_yr = s['lcoe_crossover_year']
            lco_str = f"第 {lco_yr} 年" if lco_yr else ">分析期"
            pb_str  = f"第 {pb} 年"    if pb     else ">分析期"
            print(f"    LCOE 交叉年 : {lco_str}")
            print(f"    投资回本年  : {pb_str}")
            print(f"    10年累计收益: ${s['final_cumulative_revenue']:>10,.0f}")

        return report


# ─────────────────────────────────────────────────────────────
# 3. 快捷函数
# ─────────────────────────────────────────────────────────────

def design_from_annual_load(
    annual_load_kwh: float,
    diesel_capacity_kw: float,
    pv_capacity_kw: float,
    battery_capacity_kwh: float,
    latitude: float = 35.0,
    diesel_price_per_liter: float = 0.95,
    load_type: str = "commercial",
    verbose: bool = True,
) -> dict:
    """
    最简快捷入口：只需年用电量和系统规格。

    Parameters
    ----------
    annual_load_kwh      : 年总用电量（kWh）
    diesel_capacity_kw   : 柴油发电机容量（kW）
    pv_capacity_kw       : 光伏装机容量（kW）
    battery_capacity_kwh : 电池总容量（kWh）

    Returns
    -------
    dict  与 MicrogridDesigner.design() 相同
    """
    return MicrogridDesigner(
        annual_load_kwh      = annual_load_kwh,
        diesel_capacity_kw   = diesel_capacity_kw,
        pv_capacity_kw       = pv_capacity_kw,
        battery_capacity_kwh = battery_capacity_kwh,
        latitude             = latitude,
        diesel_price_per_liter = diesel_price_per_liter,
        load_type            = load_type,
        verbose              = verbose,
    ).design()


def design_from_current_spec(
    voltage_v: float,
    current_schedule: list,
    diesel_capacity_kw: float,
    pv_capacity_kw: float,
    battery_capacity_kwh: float,
    annual_kwh_override: float = None,
    latitude: float = 35.0,
    diesel_price_per_liter: float = 0.95,
    verbose: bool = True,
) -> dict:
    """
    从电流规格快速设计。

    Parameters
    ----------
    voltage_v          : 系统电压（V），如 240
    current_schedule   : 电流时刻表，[(start_h, end_h, amps), ...]
    annual_kwh_override: 可选，将负载形状归一化到该年总用电量
                         （用于对齐 HOMER Pro 或实测值）

    示例（40kW 北美案例）：
        result = design_from_current_spec(
            voltage_v          = 240,
            current_schedule   = [(8,10,140),(10,17,50),(17,20,140),(20,32,20)],
            annual_kwh_override= 131_400,
            diesel_capacity_kw = 40,
            pv_capacity_kw     = 84,
            battery_capacity_kwh=160,
            latitude           = 25.0,   # 示例默认值，不代表固定地点
        )
    """
    return MicrogridDesigner(
        voltage_v            = voltage_v,
        current_schedule     = current_schedule,
        annual_kwh_override  = annual_kwh_override,
        diesel_capacity_kw   = diesel_capacity_kw,
        pv_capacity_kw       = pv_capacity_kw,
        battery_capacity_kwh = battery_capacity_kwh,
        latitude             = latitude,
        diesel_price_per_liter = diesel_price_per_liter,
        verbose              = verbose,
    ).design()


# ─────────────────────────────────────────────────────────────
# 4. 命令行运行（40kW 案例验证）
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 64)
    print("  演示 1：从年用电量设计（最简输入）")
    print("=" * 64)
    result1 = design_from_annual_load(
        annual_load_kwh      = 131_400,
        diesel_capacity_kw   = 40,
        pv_capacity_kw       = 84,
        battery_capacity_kwh = 160,
        latitude             = 25.0,   # 示例默认值，不代表固定地点
        diesel_price_per_liter = 0.95,
    )
    print(result1["report"])

    print("\n" + "=" * 64)
    print("  PyPSA 仿真结果 vs HOMER Pro 参考值对比")
    print("=" * 64)
    ps = result1["pypsa_summary"]
    print(f"  {'指标':<30} {'PyPSA':>12}  {'HOMER Pro':>12}")
    print("  " + "-" * 58)
    print(f"  {'微电网年用油量 (L)':<30} {ps['mg_diesel_liters']:>12,.0f}  {'5,599':>12}")
    print(f"  {'柴油机B工况运行小时 (h)':<30} {ps['mg_diesel_hours_b']:>12,}  {'889':>12}")
    print(f"  {'纯柴油年用油量 (L)':<30} {ps['diesel_only_liters']:>12,.0f}  {'45,764':>12}")
    print(f"  {'纯柴油A工况运行小时 (h)':<30} {ps['diesel_run_hours_a']:>12,}  {'8,760':>12}")
    print(f"  {'太阳能占比 (%)':<30} {ps['solar_fraction_pct']:>12.1f}  {'N/A':>12}")
    print(f"  {'失负荷率 (%)':<30} {ps['loss_of_load_pct']:>12.3f}  {'N/A':>12}")
    print(f"\n  注：差异原因 → PyPSA 使用简化光照模型（正弦曲线）")
    print(f"              HOMER Pro 使用真实 ERA5 气象数据")
    print(f"  提升精度  → 将 generate_pv_profile() 替换为 atlite+ERA5 数据")

    print("\n" + "=" * 64)
    print("  演示 2：从电流规格设计（归一化到 HOMER Pro 值）")
    print("=" * 64)
    result2 = design_from_current_spec(
        voltage_v          = 240,
        current_schedule   = [
            (8,  10, 140),   # 08:00-10:00：140A（早高峰）
            (10, 17, 50),    # 10:00-17:00：50A（日间低谷）
            (17, 20, 140),   # 17:00-20:00：140A（晚高峰）
            (20, 32, 20),    # 20:00-08:00：20A（夜间基荷）
        ],
        annual_kwh_override  = 131_400,   # 归一化到 HOMER Pro 仿真值
        diesel_capacity_kw   = 40,
        pv_capacity_kw       = 84,
        battery_capacity_kwh = 160,
        latitude             = 25.0,   # 示例默认值，不代表固定地点
    )
    # 仅打印摘要
    s2 = result2["summary"]
    ps2 = result2["pypsa_summary"]
    print(f"  年用电量    : {s2['annual_load_kwh']:>10,.0f} kWh")
    print(f"  微电网年用油: {ps2['mg_diesel_liters']:>10,.0f} 升")
    print(f"  纯柴油年用油: {ps2['diesel_only_liters']:>10,.0f} 升")
    be2 = s2['breakeven_year']
    print(f"  投资回本年  : {('第 ' + str(be2) + ' 年') if be2 else '>分析期'}")
    print(f"  10年累计收益: ${s2['final_cumulative_revenue']:>10,.0f}")
