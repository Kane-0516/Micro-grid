"""
config_loader.py
================
产品规格配置加载器。

从 products.yaml 读取所有硬件型号及价格，
若文件不存在或格式错误，自动降级到内置默认值（兼容旧代码）。

主要接口
--------
get_catalog()           → ProductCatalog（单例，全局共享）
reload_catalog(path)    → 重新加载（运行时切换配置文件）

ProductCatalog 方法
-------------------
panel(model)            → PVPanel
bracket(model)          → BracketSystem
battery_pack(model)     → BatteryPack
inverter_for_voltage(v) → Inverter
diesel_generator(kw)    → DieselGenerator
accessories()           → dict
pricing()               → dict

list_panels()           → 打印所有可用组件型号和价格
list_all()              → 打印完整产品目录
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional

# ── YAML 可选依赖（若未安装则降级为内置默认）─────────────────
try:
    import yaml
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False

# 配置文件默认路径（与本模块同目录）
_DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "products.yaml")


# ─────────────────────────────────────────────────────────────
# 产品数据类
# ─────────────────────────────────────────────────────────────

@dataclass
class PVPanel:
    """光伏组件规格"""
    model:               str
    display_name:        str
    watts:               float        # 额定功率（Wp）
    price_usd_per_wp:    float        # 出厂含运价（$/Wp）
    efficiency_pct:      float = 20.0
    temp_coeff_pct_per_c: float = -0.35
    description:         str   = ""

    @property
    def kw(self) -> float:
        """组件额定功率（kW）"""
        return self.watts / 1000.0

    @property
    def price_usd_per_kw(self) -> float:
        """单位容量价格（$/kW），等于 price_per_wp × 1000"""
        return self.price_usd_per_wp * 1000.0

    @property
    def price_usd_per_panel(self) -> float:
        """单块组件价格（$）"""
        return self.price_usd_per_wp * self.watts

    def __str__(self) -> str:
        return (
            f"{self.model}  {self.display_name}\n"
            f"  额定功率: {self.watts} Wp  |  "
            f"效率: {self.efficiency_pct}%  |  "
            f"价格: ${self.price_usd_per_wp:.3f}/Wp = ${self.price_usd_per_kw:.0f}/kW"
        )


@dataclass
class BracketSystem:
    """折叠支架规格"""
    model:           str
    display_name:    str
    panels_per_set:  int             # 每套组件数
    area_m2:         float           # 占地面积（m²）
    footprint_length_m: float = 28.0 # 支架物理长度（m）
    footprint_width_m:  float = 5.6  # 支架物理宽度（m）
    description:     str = ""

    def bracket_power_kw(self, panel: PVPanel) -> float:
        """搭配给定组件型号时，每套支架的光伏容量（kW）"""
        return self.panels_per_set * panel.kw

    def bracket_cost_usd(self, panel: PVPanel) -> float:
        """每套支架的组件采购费（$）"""
        return self.panels_per_set * panel.price_usd_per_panel

    def __str__(self) -> str:
        return (
            f"{self.model}  {self.display_name}\n"
            f"  {self.panels_per_set} 块/套  |  占地 {self.area_m2} m²/套  |  "
            f"{self.footprint_length_m}m × {self.footprint_width_m}m"
        )


@dataclass
class BatteryPack:
    """电池包规格"""
    model:                  str
    display_name:           str
    capacity_kwh:           float
    price_usd:              float       # 单包价格（$）
    voltage_v:              float = 51.2
    cycle_life:             int   = 4000
    depth_of_discharge_pct: float = 90.0
    description:            str   = ""

    @property
    def price_usd_per_kwh(self) -> float:
        return self.price_usd / self.capacity_kwh

    def __str__(self) -> str:
        return (
            f"{self.model}  {self.display_name}\n"
            f"  {self.capacity_kwh} kWh  |  "
            f"${self.price_usd:,.0f}/包 (${self.price_usd_per_kwh:.0f}/kWh)  |  "
            f"循环寿命 {self.cycle_life} 次"
        )


@dataclass
class Inverter:
    """储能逆变器规格"""
    model:               str
    display_name:        str
    power_kw:            float
    price_usd:           float
    voltage_levels:      list = field(default_factory=list)
    packs_per_inverter:  int  = 6   # 每台逆变器管理的电池包数（用于逆变器台数估算）
    description:         str  = ""

    def __str__(self) -> str:
        vlvl = " / ".join(self.voltage_levels)
        return (
            f"{self.model}  {self.display_name}\n"
            f"  {self.power_kw} kW  |  ${self.price_usd:,.0f}/台  |  适配: {vlvl}  |  "
            f"{self.packs_per_inverter}包/台"
        )


@dataclass
class DieselGenerator:
    """柴油发电机规格"""
    model:                        str
    display_name:                 str
    power_kw:                     float
    price_usd:                    float
    fuel_efficiency_kwh_per_liter: float = 3.5
    fuel_intercept_coeff:         float = 0.033
    fuel_slope_coeff:             float = 0.273
    description:                  str   = ""

    def __str__(self) -> str:
        return (
            f"{self.model}  {self.display_name}\n"
            f"  {self.power_kw} kW  |  ${self.price_usd:,.0f}  |  "
            f"效率 {self.fuel_efficiency_kwh_per_liter} kWh/L  |  "
            f"燃油曲线 F0={self.fuel_intercept_coeff}, F1={self.fuel_slope_coeff}"
        )


# ─────────────────────────────────────────────────────────────
# 内置默认值（不依赖 YAML 文件）
# ─────────────────────────────────────────────────────────────

_BUILTIN_DEFAULTS = {
    "pv_panels": {
        "default_model": "655W",
        "models": {
            "710W":  {"display_name": "710Wp Ultra-High Eff. TOPCon N-type", "watts": 710,  "price_usd_per_wp": 0.36, "efficiency_pct": 22.8},
            "655W":  {"display_name": "655Wp 高效单晶硅 PERC", "watts": 655,  "price_usd_per_wp": 0.32, "efficiency_pct": 21.3},
            "600W":  {"display_name": "600Wp 单晶硅标准型",     "watts": 600,  "price_usd_per_wp": 0.30, "efficiency_pct": 20.5},
            "550W":  {"display_name": "550Wp 单晶硅",           "watts": 550,  "price_usd_per_wp": 0.30, "efficiency_pct": 20.0},
            "400W":  {"display_name": "400Wp 多晶硅经济型",     "watts": 400,  "price_usd_per_wp": 0.28, "efficiency_pct": 16.8},
            "430W":  {"display_name": "430Wp 单晶硅经济型",     "watts": 430,  "price_usd_per_wp": 0.29, "efficiency_pct": 18.5},
        },
    },
    "bracket_systems": {
        "default_model": "standard_32",
        "spacing_m": 3.048,
        "models": {
            "standard_32": {"display_name": "标准折叠支架（32块）", "panels_per_set": 32, "area_m2": 156.8, "footprint_length_m": 28.0, "footprint_width_m": 5.6},
            "large_48":    {"display_name": "大型折叠支架（48块）", "panels_per_set": 48, "area_m2": 235.2, "footprint_length_m": 42.0, "footprint_width_m": 5.6},
            "compact_24":  {"display_name": "紧凑折叠支架（24块）", "panels_per_set": 24, "area_m2": 117.6, "footprint_length_m": 21.0, "footprint_width_m": 5.6},
        },
    },
    "battery_packs": {
        "default_model": "LFP-16kWh",
        "price_usd_per_kwh_fallback": 194.0,
        "models": {
            "LFP-5kWh":   {"display_name": "磷酸铁锂 5kWh",  "capacity_kwh": 5,  "price_usd": 1600,  "voltage_v": 48.0,  "cycle_life": 3500},
            "LFP-10kWh":  {"display_name": "磷酸铁锂 10kWh", "capacity_kwh": 10, "price_usd": 2500,  "voltage_v": 51.2,  "cycle_life": 4000},
            "LFP-16kWh":  {"display_name": "磷酸铁锂 16kWh（标准型）", "capacity_kwh": 16, "price_usd": 3100, "voltage_v": 51.2, "cycle_life": 6000},
            "LFP-20kWh":  {"display_name": "磷酸铁锂 20kWh", "capacity_kwh": 20, "price_usd": 6000,  "voltage_v": 51.2,  "cycle_life": 4000},
            "LFP-40kWh":  {"display_name": "磷酸铁锂 40kWh", "capacity_kwh": 40, "price_usd": 11200, "voltage_v": 51.2,  "cycle_life": 6000},
        },
    },
    "inverters": {
        "models": {
            "INV-5000W-240V":  {"display_name": "5kW 分相逆变器",  "power_kw": 5.0,  "price_usd": 7500,  "voltage_levels": ["120V/240V"], "packs_per_inverter": 6},
            "INV-7500W-208V":  {"display_name": "7.5kW 三相逆变器", "power_kw": 7.5,  "price_usd": 7500,  "voltage_levels": ["120V/208V"], "packs_per_inverter": 6},
            "INV-15000W-480V": {"display_name": "15kW 工业逆变器",  "power_kw": 15.0, "price_usd": 15000, "voltage_levels": ["220V/380V", "230V/400V", "277V/480V"], "packs_per_inverter": 8},
        },
        "voltage_default_map": {
            "120V/240V": "INV-5000W-240V",
            "120V/208V": "INV-7500W-208V",
            "220V/380V": "INV-15000W-480V",
            "230V/400V": "INV-15000W-480V",
            "277V/480V": "INV-15000W-480V",
        },
    },
    "diesel_generators": {
        "price_usd_per_kw": 1125.0,
        "models": {
            "DG-20kW":  {"display_name": "20kW 柴油机", "power_kw": 20,  "price_usd": 22500,  "fuel_efficiency_kwh_per_liter": 3.5},
            "DG-30kW":  {"display_name": "30kW 柴油机", "power_kw": 30,  "price_usd": 33500,  "fuel_efficiency_kwh_per_liter": 3.5, "fuel_intercept_coeff": 0.033, "fuel_slope_coeff": 0.224},
            "DG-40kW":  {"display_name": "40kW 柴油机", "power_kw": 40,  "price_usd": 45000,  "fuel_efficiency_kwh_per_liter": 3.5},
            "DG-60kW":  {"display_name": "60kW 柴油机", "power_kw": 60,  "price_usd": 67500,  "fuel_efficiency_kwh_per_liter": 3.6},
            "DG-100kW": {"display_name": "100kW 柴油机","power_kw": 100, "price_usd": 112500, "fuel_efficiency_kwh_per_liter": 3.8},
        },
    },
    "accessories": {
        # 结构化格式（与 products.yaml 一致）
        # 以 40kW 参考案例（4套支架）标定：
        #   国际运输: 3000 + 4×1950 = $10,800  ✓
        #   安装调试: 1000 + 4×1000 =  $5,000  ✓
        #   附件材料: 8500 + 4×5000 = $28,500  ✓
        "pv_mounting_cost_per_set_usd": 19050.0,
        "intl_transport": {
            "base_usd":            3000.0,
            "per_bracket_set_usd": 1950.0,
        },
        "installation": {
            "base_usd":            1000.0,
            "per_bracket_set_usd": 1000.0,
        },
        "accessory_materials": {
            "base_usd":            8500.0,
            "per_bracket_set_usd": 5000.0,
        },
        "other_initial_usd":    4200.0,
        "battery_pallet": {
            "per_pack_usd":        250.0,   # $250/包 × 16包 = $4,000 ✓
            "reference_pack_kwh":  10.0,
        },
        "ems_addons": {
            "prediction_control_usd": 5000.0,
        },
    },
    "site_layout": {
        "tray_length_m":          6.2,
        "tray_width_m":           4.4,
        "diesel_reserved_area_m2": 75.0,
        "inverters_per_tray":     2,
    },
    "simulation_defaults": {
        "system_efficiency":      0.78,
        "default_year":           2020,
        "default_load_type":      "residential",
        "diesel_dispatch_mode":   "cc",
        "pv_generation_correction_factor": 1.10,
        "converter_kw_per_pv_kw": 0.50,
        "cycle_charging_target_load_pu": 0.58,
        "cycle_charging_start_soc_pu": 0.42,
    },
    "economic_defaults": {
        "diesel_price_usd_per_liter": 1.0,
        "electricity_price_usd_per_kwh": 0.35,
        "project_years": 25,
        "nominal_discount_rate_pct": 10.0,
        "inflation_rate_pct": 2.0,
    },
    "pricing": {
        "profit_margin": 0.20,
        "pass_through_items": ["diesel_generator_cost", "installation_cost"],
    },
}


# ─────────────────────────────────────────────────────────────
# ProductCatalog — 统一产品目录接口
# ─────────────────────────────────────────────────────────────

class ProductCatalog:
    """
    产品目录。从 products.yaml 加载，提供按型号查询接口。

    用法：
        from config_loader import get_catalog
        cat = get_catalog()

        # 查询组件型号（使用默认型号）
        panel = cat.panel()
        print(f"每套功率: {panel.kw * cat.bracket().panels_per_set:.1f} kW")

        # 指定型号
        panel_655 = cat.panel("655W")
        panel_600 = cat.panel("600W")

        # 打印完整产品目录
        cat.list_all()
    """

    def __init__(self, data: dict, source: str = "built-in"):
        self._data   = data
        self._source = source

    @property
    def source(self) -> str:
        return self._source

    # ── 组件查询 ──────────────────────────────────────────────

    def panel(self, model: Optional[str] = None) -> PVPanel:
        """
        返回指定型号的光伏组件规格。
        model=None 时使用 default_model（yaml 中配置的默认型号）。
        """
        sec  = self._data["pv_panels"]
        name = model or sec.get("default_model", "655W")
        models = sec["models"]
        if name not in models:
            available = list(models.keys())
            raise KeyError(
                f"找不到光伏组件型号 '{name}'。\n"
                f"可用型号: {available}\n"
                f"请在 products.yaml → pv_panels.models 下添加该型号。"
            )
        d = models[name]
        return PVPanel(
            model            = name,
            display_name     = d.get("display_name", name),
            watts            = float(d["watts"]),
            price_usd_per_wp = float(d["price_usd_per_wp"]),
            efficiency_pct   = float(d.get("efficiency_pct", 20.0)),
            temp_coeff_pct_per_c = float(d.get("temp_coeff_pct_per_c", -0.35)),
            description      = str(d.get("description", "")),
        )

    def list_panels(self) -> None:
        """打印所有可用光伏组件型号。"""
        sec = self._data["pv_panels"]
        default = sec.get("default_model", "")
        print("\n  光伏组件型号目录")
        print("  " + "-" * 62)
        print(f"  {'型号':<12} {'名称':<26} {'Wp':>6} {'$/Wp':>6} {'$/kW':>7} {'效率':>6}")
        print("  " + "-" * 62)
        for name, d in sec["models"].items():
            tag = " ← 默认" if name == default else ""
            wp  = float(d["watts"])
            ppw = float(d["price_usd_per_wp"])
            eff = float(d.get("efficiency_pct", 0))
            print(
                f"  {name:<12} {d.get('display_name',''):<26} "
                f"{wp:>5.0f}  ${ppw:>5.3f}  ${ppw*1000:>5.0f}  {eff:>5.1f}%{tag}"
            )
        print()

    # ── 支架查询 ──────────────────────────────────────────────

    def bracket(self, model: Optional[str] = None) -> BracketSystem:
        """返回指定型号的折叠支架规格。"""
        sec  = self._data["bracket_systems"]
        name = model or sec.get("default_model", "standard_32")
        d    = sec["models"].get(name)
        if d is None:
            raise KeyError(f"找不到折叠支架型号 '{name}'。可用: {list(sec['models'].keys())}")
        return BracketSystem(
            model              = name,
            display_name       = d.get("display_name", name),
            panels_per_set     = int(d["panels_per_set"]),
            area_m2            = float(d["area_m2"]),
            footprint_length_m = float(d.get("footprint_length_m", 28.0)),
            footprint_width_m  = float(d.get("footprint_width_m", 5.6)),
            description        = str(d.get("description", "")),
        )

    # ── 电池查询 ──────────────────────────────────────────────

    def battery_pack(self, model: Optional[str] = None) -> BatteryPack:
        """返回指定型号的电池包规格。"""
        sec  = self._data["battery_packs"]
        name = model or sec.get("default_model", "LFP-10kWh")
        d    = sec["models"].get(name)
        if d is None:
            raise KeyError(f"找不到电池型号 '{name}'。可用: {list(sec['models'].keys())}")
        return BatteryPack(
            model         = name,
            display_name  = d.get("display_name", name),
            capacity_kwh  = float(d["capacity_kwh"]),
            price_usd     = float(d["price_usd"]),
            voltage_v     = float(d.get("voltage_v", 51.2)),
            cycle_life    = int(d.get("cycle_life", 4000)),
            depth_of_discharge_pct = float(d.get("depth_of_discharge_pct", 90.0)),
        )

    def battery_price_per_kwh(self, model: Optional[str] = None) -> float:
        """返回指定电池型号的 $/kWh 单价，找不到时用 fallback。"""
        try:
            return self.battery_pack(model).price_usd_per_kwh
        except KeyError:
            return float(self._data["battery_packs"].get("price_usd_per_kwh_fallback", 310.0))

    # ── 逆变器查询 ────────────────────────────────────────────

    def inverter_for_voltage(self, voltage_level: str) -> Inverter:
        """根据电压等级返回默认逆变器型号。"""
        sec      = self._data["inverters"]
        vmap     = sec.get("voltage_default_map", {})
        name     = vmap.get(voltage_level)
        if name is None:
            # 按 voltage_levels 字段搜索
            for model_name, d in sec["models"].items():
                if voltage_level in d.get("voltage_levels", []):
                    name = model_name
                    break
        if name is None:
            raise KeyError(
                f"找不到适配 '{voltage_level}' 的逆变器型号。\n"
                f"请在 products.yaml → inverters.voltage_default_map 中配置。"
            )
        d = sec["models"][name]
        return Inverter(
            model               = name,
            display_name        = d.get("display_name", name),
            power_kw            = float(d["power_kw"]),
            price_usd           = float(d["price_usd"]),
            voltage_levels      = d.get("voltage_levels", [voltage_level]),
            packs_per_inverter  = int(d.get("packs_per_inverter", 6)),
        )

    def inverter(self, model: str) -> Inverter:
        """按型号名查询逆变器。"""
        sec = self._data["inverters"]
        d   = sec["models"].get(model)
        if d is None:
            raise KeyError(f"找不到逆变器型号 '{model}'。")
        return Inverter(
            model         = model,
            display_name  = d.get("display_name", model),
            power_kw      = float(d["power_kw"]),
            price_usd     = float(d["price_usd"]),
            voltage_levels= d.get("voltage_levels", []),
        )

    # ── 柴油机查询 ────────────────────────────────────────────

    def diesel_generator(
        self,
        power_kw: Optional[float] = None,
        model: Optional[str] = None,
    ) -> DieselGenerator:
        """
        查询柴油发电机。优先按 model 查，其次按 power_kw 匹配最接近的型号。
        找不到时按通用 $/kW 单价估算。
        """
        sec = self._data["diesel_generators"]

        # 1. 按 model 精确查
        if model and model in sec["models"]:
            d = sec["models"][model]
            return DieselGenerator(
                model        = model,
                display_name = d.get("display_name", model),
                power_kw     = float(d["power_kw"]),
                price_usd    = float(d["price_usd"]),
                fuel_efficiency_kwh_per_liter = float(d.get("fuel_efficiency_kwh_per_liter", 3.5)),
                fuel_intercept_coeff = float(d.get("fuel_intercept_coeff", 0.033)),
                fuel_slope_coeff = float(d.get("fuel_slope_coeff", 0.273)),
            )

        # 2. 按 power_kw 匹配最接近
        if power_kw is not None:
            best, best_diff = None, float("inf")
            for m_name, d in sec["models"].items():
                diff = abs(float(d["power_kw"]) - power_kw)
                if diff < best_diff:
                    best_diff = diff
                    best = (m_name, d)
            if best and best_diff <= power_kw * 0.25:   # 误差 ≤ 25%，认为匹配
                m_name, d = best
                return DieselGenerator(
                    model        = m_name,
                    display_name = d.get("display_name", m_name),
                    power_kw     = float(d["power_kw"]),
                    price_usd    = float(d["price_usd"]),
                    fuel_efficiency_kwh_per_liter = float(d.get("fuel_efficiency_kwh_per_liter", 3.5)),
                    fuel_intercept_coeff = float(d.get("fuel_intercept_coeff", 0.033)),
                    fuel_slope_coeff = float(d.get("fuel_slope_coeff", 0.273)),
                )
            # 找不到匹配型号 → 用通用单价估算
            price_per_kw = float(sec.get("price_usd_per_kw", 1125.0))
            return DieselGenerator(
                model        = f"DG-{power_kw:.0f}kW-custom",
                display_name = f"{power_kw:.0f}kW 柴油发电机（按单价估算）",
                power_kw     = power_kw,
                price_usd    = round(power_kw * price_per_kw, 0),
                fuel_efficiency_kwh_per_liter = 3.5,
                fuel_intercept_coeff = 0.033,
                fuel_slope_coeff = 0.273,
            )

        raise ValueError("diesel_generator() 需要提供 model 或 power_kw 参数之一。")

    # ── 附属成本 ──────────────────────────────────────────────

    def accessories(self) -> dict:
        """返回附属成本字典（固定项）。"""
        return dict(self._data.get("accessories", _BUILTIN_DEFAULTS["accessories"]))

    def pricing(self) -> dict:
        """返回定价策略字典（利润率等）。"""
        return dict(self._data.get("pricing", _BUILTIN_DEFAULTS["pricing"]))

    # ── 新增：支架间距 ───────────────────────────────────────

    def bracket_spacing_m(self) -> float:
        """返回相邻支架最小间距（m），从 bracket_systems.spacing_m 读取。"""
        return float(self._data.get("bracket_systems", {}).get(
            "spacing_m", _BUILTIN_DEFAULTS["bracket_systems"]["spacing_m"]))

    # ── 新增：场地布局参数 ────────────────────────────────────

    def site_layout(self) -> dict:
        """返回场地布局参数字典（tray 尺寸、柴发预留面积等）。"""
        return dict(self._data.get("site_layout", _BUILTIN_DEFAULTS["site_layout"]))

    # ── 新增：仿真默认参数 ────────────────────────────────────

    def simulation_defaults(self) -> dict:
        """返回仿真默认参数字典（系统效率等）。"""
        return dict(self._data.get("simulation_defaults", _BUILTIN_DEFAULTS["simulation_defaults"]))

    # ── 便捷计算 ──────────────────────────────────────────────

    def bracket_power_kw(
        self,
        num_sets: int,
        panel_model: Optional[str] = None,
        bracket_model: Optional[str] = None,
    ) -> float:
        """计算 N 套支架搭配指定组件型号的总光伏容量（kW）。"""
        p = self.panel(panel_model)
        b = self.bracket(bracket_model)
        return round(num_sets * b.bracket_power_kw(p), 3)

    def bracket_panel_cost_usd(
        self,
        num_sets: int,
        panel_model: Optional[str] = None,
        bracket_model: Optional[str] = None,
    ) -> float:
        """计算 N 套支架的组件总采购费（$）。"""
        p = self.panel(panel_model)
        b = self.bracket(bracket_model)
        return round(num_sets * b.bracket_cost_usd(p), 2)

    # ── 诊断输出 ──────────────────────────────────────────────

    def list_all(self) -> None:
        """打印完整产品目录。"""
        print(f"\n  产品目录（来源：{self._source}）")
        print("  " + "=" * 62)

        self.list_panels()

        # 支架
        sec = self._data["bracket_systems"]
        default = sec.get("default_model", "")
        print("  折叠支架规格")
        print("  " + "-" * 50)
        for name, d in sec["models"].items():
            tag = " ← 默认" if name == default else ""
            print(f"  {name}  {d.get('display_name','')}  {d['panels_per_set']}pcs/set  {d['area_m2']}m2{tag}")

        print()
        # 电池
        sec = self._data["battery_packs"]
        default = sec.get("default_model", "")
        print("  电池包规格")
        print("  " + "-" * 50)
        for name, d in sec["models"].items():
            tag = " ← 默认" if name == default else ""
            kwh = d['capacity_kwh']
            prc = d['price_usd']
            print(f"  {name:<14}  {d.get('display_name','')}  {kwh}kWh  ${prc:,}  (${prc/kwh:.0f}/kWh){tag}")

        print()
        # 逆变器
        sec = self._data["inverters"]
        print("  逆变器规格")
        print("  " + "-" * 50)
        for name, d in sec["models"].items():
            vlvl = " / ".join(d.get("voltage_levels", []))
            print(f"  {name:<20}  {d['power_kw']}kW  ${d['price_usd']:,}  [{vlvl}]")

        print()
        # 柴油机
        sec = self._data["diesel_generators"]
        print("  柴油发电机规格")
        print("  " + "-" * 50)
        for name, d in sec["models"].items():
            print(f"  {name:<12}  {d['power_kw']}kW  ${d['price_usd']:,}  {d.get('fuel_efficiency_kwh_per_liter','?')}kWh/L")
        print()


# ─────────────────────────────────────────────────────────────
# 加载逻辑
# ─────────────────────────────────────────────────────────────

def _load_yaml(path: str) -> dict:
    """加载 YAML 配置文件，返回字典。"""
    if not _YAML_AVAILABLE:
        raise ImportError(
            "需要安装 pyyaml：pip install pyyaml\n"
            "或直接使用内置默认值（不指定配置文件路径）。"
        )
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_catalog(path: Optional[str] = None) -> ProductCatalog:
    """
    加载产品目录。

    Parameters
    ----------
    path : str | None
        YAML 文件路径。None = 自动查找同目录下的 products.yaml。
        若文件不存在或未安装 pyyaml，自动降级到内置默认值。

    Returns
    -------
    ProductCatalog
    """
    yaml_path = path or _DEFAULT_CONFIG_PATH

    if os.path.exists(yaml_path) and _YAML_AVAILABLE:
        try:
            data   = _load_yaml(yaml_path)
            source = f"products.yaml ({yaml_path})"
            return ProductCatalog(data, source)
        except Exception as e:
            print(f"  [config_loader] 警告：读取 {yaml_path} 失败（{e}），使用内置默认值。")

    if not _YAML_AVAILABLE:
        print("  [config_loader] 提示：未安装 pyyaml，使用内置默认值。（pip install pyyaml 可启用 YAML 配置）")
    elif not os.path.exists(yaml_path):
        pass  # 静默：首次使用时文件不存在很正常

    return ProductCatalog(_BUILTIN_DEFAULTS, "built-in defaults")


# ── 全局单例 ──────────────────────────────────────────────────

_catalog: Optional[ProductCatalog] = None
_catalog_path: Optional[str] = None


def get_catalog(path: Optional[str] = None) -> ProductCatalog:
    """
    获取全局产品目录单例。

    第一次调用时加载，后续调用直接返回缓存。
    如需强制重新加载（例如切换了配置文件），使用 reload_catalog()。
    """
    global _catalog, _catalog_path
    resolved_path = os.path.abspath(path) if path else None
    if _catalog is None or (resolved_path is not None and resolved_path != _catalog_path):
        _catalog = load_catalog(resolved_path)
        _catalog_path = resolved_path
    return _catalog


def reload_catalog(path: Optional[str] = None) -> ProductCatalog:
    """强制重新加载产品目录（运行时切换配置文件时使用）。"""
    global _catalog, _catalog_path
    resolved_path = os.path.abspath(path) if path else None
    _catalog = load_catalog(resolved_path)
    _catalog_path = resolved_path
    return _catalog


# ─────────────────────────────────────────────────────────────
# 命令行：打印产品目录
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    cat = load_catalog(path_arg)
    cat.list_all()

    print("  === 快速计算示例 ===")
    print()

    for panel_model in ["655W", "600W", "400W"]:
        p = cat.panel(panel_model)
        b = cat.bracket()
        kw_per_set = b.bracket_power_kw(p)
        cost_per_set = b.bracket_cost_usd(p)
        print(
            f"  {panel_model} + 标准支架(32块/套):"
            f"  {kw_per_set:.2f} kW/套 | "
            f"  组件费 ${cost_per_set:,.0f}/套 | "
            f"  ${p.price_usd_per_kw:.0f}/kW"
        )
