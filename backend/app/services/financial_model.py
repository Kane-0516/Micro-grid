"""
financial_model.py
==================
离网微电网的财务经济性分析模块。

功能：
- 计算系统总投资成本（设备 + 安装）
- 计算年节省费用（替代柴油 / 电网电费）
- 计算回本年数（静态 / 动态）
- 生成投资回报分析报告
"""

from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np
import pandas as pd


# ─────────────────────────────────────────────────────────────
# 1. 设备成本参数库（可根据实际产品价格更新）
# ─────────────────────────────────────────────────────────────

@dataclass
class EquipmentCosts:
    """设备单价配置（元，人民币）。"""

    # 光伏相关
    pv_panel_per_kw: float = 2000          # 元/kW，光伏组件
    pv_mounting_per_set: float = 3000      # 元/套，折叠支架（每套含32块组件）
    pv_module_kw_per_panel: float = 0.4    # kW/块，单块组件功率

    # 储能相关
    battery_per_kwh: float = 1800          # 元/kWh，电池包
    bms_per_set: float = 500               # 元/套，BMS 系统

    # 逆变器/控制器
    inverter_per_kw: float = 800           # 元/kW，逆变器
    charge_controller_per_kw: float = 300  # 元/kW，充放电控制器

    # EMS 控制系统
    ems_edge_cost: float = 5000            # 元/套，边缘控制器
    ems_cloud_cost: float = 8000           # 元/套，云端 EMS（含首年服务费）
    ems_predictive_cost: float = 15000     # 元/套，基于预测的高级 EMS

    # 柴油发电机（备用）
    diesel_gen_per_kw: float = 1500        # 元/kW，柴油发电机

    # 安装与施工
    installation_rate: float = 0.15        # 安装费 = 设备费 × 15%

    # 其他
    transport_cost: float = 2000           # 元，运输费
    commissioning_cost: float = 1500       # 元，调试费


@dataclass
class OperationCosts:
    """运营成本参数。"""
    annual_maintenance_rate: float = 0.02   # 年维护费 = 设备费 × 2%
    battery_replacement_years: int = 10     # 电池更换周期（年）
    battery_replacement_cost_rate: float = 0.7  # 更换成本 = 初始电池成本 × 70%
    diesel_price_per_liter: float = 8.5     # 元/升，柴油价格
    diesel_kwh_per_liter: float = 3.2       # kWh/升，柴油发电效率（等效）


@dataclass
class EconomicParameters:
    """经济性分析参数。"""
    grid_electricity_price: float = 1.2    # 元/kWh，当地电网电价（或柴油发电成本）
    annual_electricity_growth: float = 0.03  # 电价年增长率 3%
    discount_rate: float = 0.06            # 贴现率 6%
    analysis_years: int = 25               # 分析周期（年）
    pv_degradation_rate: float = 0.005     # 光伏年衰减率 0.5%
    battery_degradation_rate: float = 0.02 # 电池年性能衰减率 2%
    subsidy_rate: float = 0.0              # 政府补贴比例（初始投资的百分比）


# ─────────────────────────────────────────────────────────────
# 2. 系统配置数据类
# ─────────────────────────────────────────────────────────────

@dataclass
class SystemConfiguration:
    """微电网系统配置参数。"""

    # 来自思维导图的用户输入
    input_mode: str = "已知负载"          # "已知负载" | "无负载" | "任意DIY"
    voltage_level: str = "120V/240V"      # 电压等级
    ems_mode: str = "边端"                # EMS 控制方式
    has_diesel_backup: bool = False       # 是否有柴油发电机备份

    # 光伏系统
    num_bracket_sets: int = 1             # 折叠支架套数（每套32块）
    panels_per_set: int = 32              # 每套组件数
    panel_power_kw: float = 0.4          # 单块组件功率（kW）

    # 电池系统
    battery_capacity_kwh: float = 0      # 电池总容量（kWh）
    battery_power_kw: float = 0          # 电池额定功率（kW）
    cloudy_day_autonomy: int = 1          # 阴天自主支撑天数

    # 逆变器
    num_inverters: int = 1               # 逆变器数量
    inverter_power_kw: float = 5.0       # 单台逆变器功率（kW）

    # 柴油发电机（如有）
    diesel_capacity_kw: float = 0        # 柴油机容量（kW）

    # 负载信息
    annual_load_kwh: float = 0           # 年用电量（kWh）
    peak_load_kw: float = 0             # 峰值负荷（kW）
    load_type: str = "residential"       # 负载类型

    @property
    def total_pv_kw(self) -> float:
        """总光伏装机容量（kW）。"""
        return self.num_bracket_sets * self.panels_per_set * self.panel_power_kw

    @property
    def total_inverter_kw(self) -> float:
        """逆变器总容量（kW）。"""
        return self.num_inverters * self.inverter_power_kw


# ─────────────────────────────────────────────────────────────
# 3. 投资成本计算
# ─────────────────────────────────────────────────────────────

def calculate_capex(
    config: SystemConfiguration,
    equip: EquipmentCosts | None = None,
) -> dict:
    """
    计算系统总初始投资（CAPEX）。

    Parameters
    ----------
    config : SystemConfiguration
        系统配置
    equip : EquipmentCosts
        设备单价（不传则使用默认值）

    Returns
    -------
    dict
        各项成本明细及总计（元）
    """
    if equip is None:
        equip = EquipmentCosts()

    # ① 光伏系统
    pv_panel_cost = config.total_pv_kw * equip.pv_panel_per_kw
    mounting_cost = config.num_bracket_sets * equip.pv_mounting_per_set

    # ② 电池系统
    battery_cost = config.battery_capacity_kwh * equip.battery_per_kwh
    bms_cost = equip.bms_per_set  # 每套系统一个 BMS

    # ③ 逆变器
    inverter_cost = config.total_inverter_kw * equip.inverter_per_kw

    # ④ EMS 控制系统
    ems_costs = {
        "边端": equip.ems_edge_cost,
        "云端": equip.ems_cloud_cost,
        "基于预测": equip.ems_predictive_cost,
    }
    ems_cost = ems_costs.get(config.ems_mode, equip.ems_edge_cost)

    # ⑤ 柴油发电机（备用）
    diesel_cost = config.diesel_capacity_kw * equip.diesel_gen_per_kw

    # ⑥ 汇总设备费
    equipment_total = (
        pv_panel_cost + mounting_cost +
        battery_cost + bms_cost +
        inverter_cost + ems_cost +
        diesel_cost
    )

    # ⑦ 安装费、运输、调试
    installation_cost = equipment_total * equip.installation_rate
    transport_cost = equip.transport_cost
    commissioning_cost = equip.commissioning_cost

    total_capex = equipment_total + installation_cost + transport_cost + commissioning_cost

    return {
        "pv_panels_cny": round(pv_panel_cost, 0),
        "pv_mounting_cny": round(mounting_cost, 0),
        "battery_cny": round(battery_cost, 0),
        "bms_cny": round(bms_cost, 0),
        "inverter_cny": round(inverter_cost, 0),
        "ems_cny": round(ems_cost, 0),
        "diesel_gen_cny": round(diesel_cost, 0),
        "equipment_subtotal_cny": round(equipment_total, 0),
        "installation_cny": round(installation_cost, 0),
        "transport_cny": round(transport_cost, 0),
        "commissioning_cny": round(commissioning_cost, 0),
        "total_capex_cny": round(total_capex, 0),
    }


# ─────────────────────────────────────────────────────────────
# 4. 年节省费用计算
# ─────────────────────────────────────────────────────────────

def calculate_annual_savings(
    sim_results: dict,
    config: SystemConfiguration,
    econ: EconomicParameters | None = None,
    op_costs: OperationCosts | None = None,
) -> dict:
    """
    计算第一年的净节省金额。

    Parameters
    ----------
    sim_results : dict
        PyPSA 仿真结果（来自 OffGridMicrogridSimulator.run_simulation()）
    config : SystemConfiguration
        系统配置
    econ : EconomicParameters
        经济性参数
    op_costs : OperationCosts
        运营成本参数
    Returns
    -------
    dict
        年收益与年成本明细（元/年）
    """
    if econ is None:
        econ = EconomicParameters()
    if op_costs is None:
        op_costs = OperationCosts()

    annual_load_kwh = sim_results.get("annual_load_kwh", config.annual_load_kwh)
    annual_pv_gen_kwh = sim_results.get("annual_pv_generation_kwh", 0)
    annual_diesel_kwh = sim_results.get("annual_diesel_kwh", 0)

    # ─── 年收益（节省的电费或柴油费）─────────────
    # 实际被光储系统满足的负荷
    served_by_solar_storage = annual_load_kwh - sim_results.get("annual_load_shed_kwh", 0) - annual_diesel_kwh
    served_by_solar_storage = max(0, served_by_solar_storage)

    # 如果没有太阳能，这些电力本来需要从电网或柴油机获取
    electricity_savings = served_by_solar_storage * econ.grid_electricity_price

    # 减去实际消耗的柴油费用（有柴油机时）
    diesel_cost = annual_diesel_kwh * (
        op_costs.diesel_price_per_liter / op_costs.diesel_kwh_per_liter
    )

    gross_savings = electricity_savings - diesel_cost

    # ─── 年运营成本（OPEX）────────────────────
    # 年维护费（设备费的 2%，需要传入 capex）
    # 简化：直接用估算值
    annual_maintenance = config.total_pv_kw * 200  # 约 200 元/kW/年

    net_annual_savings = gross_savings - annual_maintenance

    return {
        "served_by_solar_storage_kwh": round(served_by_solar_storage, 1),
        "gross_electricity_savings_cny": round(electricity_savings, 0),
        "diesel_cost_cny": round(diesel_cost, 0),
        "annual_maintenance_cny": round(annual_maintenance, 0),
        "net_annual_savings_cny": round(net_annual_savings, 0),
    }


# ─────────────────────────────────────────────────────────────
# 5. 回本年数与 NPV 计算
# ─────────────────────────────────────────────────────────────

def calculate_payback(
    total_capex_cny: float,
    year1_net_savings_cny: float,
    capex_details: dict,
    econ: EconomicParameters | None = None,
    op_costs: OperationCosts | None = None,
    battery_cost_cny: float = 0,
) -> dict:
    """
    计算静态回本年数和动态 NPV。

    Parameters
    ----------
    total_capex_cny : float
        总初始投资（元）
    year1_net_savings_cny : float
        第一年净节省（元）
    capex_details : dict
        投资明细（来自 calculate_capex）
    econ : EconomicParameters
        经济性参数
    op_costs : OperationCosts
        运营参数
    battery_cost_cny : float
        电池初始成本（用于计算更换费用）

    Returns
    -------
    dict
        回本年数、IRR、NPV 等指标
    """
    if econ is None:
        econ = EconomicParameters()
    if op_costs is None:
        op_costs = OperationCosts()

    # 扣除补贴后的实际投资
    effective_capex = total_capex_cny * (1 - econ.subsidy_rate)

    # ── 静态回本年数 ──────────────────────────
    if year1_net_savings_cny <= 0:
        simple_payback_years = float("inf")
    else:
        simple_payback_years = effective_capex / year1_net_savings_cny

    # ── 逐年现金流分析（NPV/IRR）──────────────
    cashflows = [-effective_capex]   # 第0年：初始投资（负）

    cumulative_cashflow = -effective_capex
    dynamic_payback_years = None

    for year in range(1, econ.analysis_years + 1):
        # 收益随电价增长
        annual_savings = year1_net_savings_cny * (1 + econ.annual_electricity_growth) ** (year - 1)

        # 光伏系统衰减（出力减少）
        pv_degradation_factor = (1 - econ.pv_degradation_rate) ** year
        annual_savings *= pv_degradation_factor

        # 电池更换成本（每隔 N 年）
        battery_replacement = 0
        if op_costs.battery_replacement_years > 0 and year % op_costs.battery_replacement_years == 0:
            battery_replacement = battery_cost_cny * op_costs.battery_replacement_cost_rate

        net_cashflow = annual_savings - battery_replacement
        cashflows.append(net_cashflow)

        # 动态回本年数
        cumulative_cashflow += net_cashflow
        if dynamic_payback_years is None and cumulative_cashflow >= 0:
            # 线性插值
            prev_cumulative = cumulative_cashflow - net_cashflow
            fraction = -prev_cumulative / net_cashflow
            dynamic_payback_years = year - 1 + fraction

    # ── NPV 计算 ────────────────────────────
    npv = sum(
        cf / (1 + econ.discount_rate) ** t
        for t, cf in enumerate(cashflows)
    )

    # ── IRR 计算（用二分法）──────────────────
    irr = _calculate_irr(cashflows)

    # ── 累计收益曲线 ──────────────────────────
    cumulative = np.cumsum(cashflows)

    # 25 年总节省
    total_savings = sum(cashflows[1:])

    return {
        # 核心指标
        "simple_payback_years": round(simple_payback_years, 1),
        "dynamic_payback_years": round(dynamic_payback_years, 1) if dynamic_payback_years else None,
        "npv_cny": round(npv, 0),
        "irr_percent": round(irr * 100, 1) if irr else None,

        # 辅助信息
        "effective_capex_cny": round(effective_capex, 0),
        "subsidy_amount_cny": round(total_capex_cny * econ.subsidy_rate, 0),
        "total_savings_25yr_cny": round(total_savings, 0),
        "analysis_years": econ.analysis_years,

        # 现金流数据（用于绘图）
        "_annual_cashflows": cashflows,
        "_cumulative_cashflows": cumulative.tolist(),
    }


def _calculate_irr(cashflows: list, max_iter: int = 1000, tol: float = 1e-6) -> float | None:
    """用二分法计算内部收益率（IRR）。"""
    def npv_at_rate(r):
        return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))

    # 检查是否有正现金流
    if all(cf <= 0 for cf in cashflows[1:]):
        return None

    # 二分搜索
    low, high = -0.5, 10.0
    for _ in range(max_iter):
        mid = (low + high) / 2
        if npv_at_rate(mid) > 0:
            low = mid
        else:
            high = mid
        if high - low < tol:
            return mid
    return mid


# ─────────────────────────────────────────────────────────────
# 6. 完整财务报告生成
# ─────────────────────────────────────────────────────────────

def generate_financial_report(
    config: SystemConfiguration,
    sim_results: dict,
    equip: EquipmentCosts | None = None,
    econ: EconomicParameters | None = None,
    op_costs: OperationCosts | None = None,
) -> dict:
    """
    生成完整的财务分析报告。

    Parameters
    ----------
    config : SystemConfiguration
        系统配置
    sim_results : dict
        PyPSA 仿真结果
    equip : EquipmentCosts
        设备单价
    econ : EconomicParameters
        经济性参数
    op_costs : OperationCosts
        运营参数

    Returns
    -------
    dict
        完整财务报告字典
    """
    if equip is None:
        equip = EquipmentCosts()
    if econ is None:
        econ = EconomicParameters()
    if op_costs is None:
        op_costs = OperationCosts()

    # ① 投资成本
    capex = calculate_capex(config, equip)

    # ② 年节省
    savings = calculate_annual_savings(sim_results, config, econ, op_costs)

    # ③ 回本分析
    payback = calculate_payback(
        total_capex_cny=capex["total_capex_cny"],
        year1_net_savings_cny=savings["net_annual_savings_cny"],
        capex_details=capex,
        econ=econ,
        op_costs=op_costs,
        battery_cost_cny=capex["battery_cny"],
    )

    return {
        "capex": capex,
        "annual_savings": savings,
        "payback": payback,
    }


def format_report(
    config: SystemConfiguration,
    sim_results: dict,
    financial: dict,
) -> str:
    """
    将分析结果格式化为可读的文本报告。

    Returns
    -------
    str
        格式化的报告字符串
    """
    capex = financial["capex"]
    savings = financial["annual_savings"]
    payback = financial["payback"]
    sim = sim_results

    pb_years = payback["simple_payback_years"]
    pb_str = f"{pb_years:.1f} 年" if pb_years != float("inf") else "无法回本（请检查配置）"

    dyn_pb = payback.get("dynamic_payback_years")
    dyn_pb_str = f"{dyn_pb:.1f} 年" if dyn_pb else "超出分析期"

    report = f"""
╔══════════════════════════════════════════════════════════════╗
║            离网微电网配置方案  ·  完整分析报告               ║
╚══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━  【系统配置】  ━━━━━━━━━━━━━━━━
  输入模式        : {config.input_mode}
  光伏阵列        : {config.num_bracket_sets} 套折叠支架 × {config.panels_per_set} 块组件
                    = {config.total_pv_kw:.1f} kW 总装机
  电池储能        : {config.battery_capacity_kwh:.0f} kWh / {config.battery_power_kw:.0f} kW
                    可支撑阴天天数: {config.cloudy_day_autonomy} 天
  逆变器          : {config.num_inverters} 台 × {config.inverter_power_kw:.0f} kW
                    = {config.total_inverter_kw:.0f} kW 总容量
  柴油备用        : {"无" if config.diesel_capacity_kw == 0 else f"{config.diesel_capacity_kw:.0f} kW"}
  电压等级        : {config.voltage_level}
  EMS 控制        : {config.ems_mode}

━━━━━━━━━━━━━━━━  【仿真结果】  ━━━━━━━━━━━━━━━━
  年总负载        : {sim.get("annual_load_kwh", 0):,.0f} kWh
  年光伏发电      : {sim.get("annual_pv_generation_kwh", 0):,.0f} kWh
  太阳能占比      : {sim.get("solar_fraction", 0):.1f} %
  弃光率          : {sim.get("curtailment_rate", 0):.1f} %
  失负荷率        : {sim.get("loss_of_load_rate", 0):.3f} %
  年柴油发电      : {sim.get("annual_diesel_kwh", 0):,.0f} kWh
  柴油机年运行    : {sim.get("diesel_run_hours", 0):,} 小时

━━━━━━━━━━━━━━━━  【投资成本】  ━━━━━━━━━━━━━━━━
  光伏组件        : ¥{capex["pv_panels_cny"]:>10,.0f}
  折叠支架        : ¥{capex["pv_mounting_cny"]:>10,.0f}
  电池储能        : ¥{capex["battery_cny"]:>10,.0f}
  逆变器          : ¥{capex["inverter_cny"]:>10,.0f}
  EMS 系统        : ¥{capex["ems_cny"]:>10,.0f}
  柴油发电机      : ¥{capex["diesel_gen_cny"]:>10,.0f}
  安装调试        : ¥{capex["installation_cny"] + capex["commissioning_cny"]:>10,.0f}
  运输费          : ¥{capex["transport_cny"]:>10,.0f}
  ─────────────────────────────────────────────
  ★ 总投资        : ¥{capex["total_capex_cny"]:>10,.0f}
  （政府补贴）    : ¥{payback["subsidy_amount_cny"]:>10,.0f}
  实际投资        : ¥{payback["effective_capex_cny"]:>10,.0f}

━━━━━━━━━━━━━━━━  【年度收益】  ━━━━━━━━━━━━━━━━
  光储满足负荷    : {savings["served_by_solar_storage_kwh"]:,.0f} kWh/年
  节省电费        : ¥{savings["gross_electricity_savings_cny"]:>10,.0f} /年
  减去柴油费      : ¥{savings["diesel_cost_cny"]:>10,.0f} /年
  减去维护费      : ¥{savings["annual_maintenance_cny"]:>10,.0f} /年
  ─────────────────────────────────────────────
  ★ 年净节省      : ¥{savings["net_annual_savings_cny"]:>10,.0f} /年

━━━━━━━━━━━━━━━━  【投资回报】  ━━━━━━━━━━━━━━━━
  ★ 静态回本年数  :  {pb_str}
  ★ 动态回本年数  :  {dyn_pb_str}（贴现率 {6}%）
  25 年总净收益   : ¥{payback["total_savings_25yr_cny"]:>10,.0f}
  净现值 (NPV)    : ¥{payback["npv_cny"]:>10,.0f}
  内部收益率(IRR) :  {f"{payback['irr_percent']:.1f}%" if payback['irr_percent'] else "N/A"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    return report
