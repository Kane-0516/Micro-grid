"""保持性属性测试：验证 optimizer.py 的 API 结构、模拟管道和约束执行不变.

这些测试在 **修复前** 编写并运行，确认当前行为的基线属性。
修复后重新运行，确认这些属性仍然成立（无回归）。

测试内容：
1. optimize_with_diagnostics() 返回 (List[OptimizeOption], dict) 元组
2. 每个 OptimizeOption 具有所有必需字段，且类型正确
3. allow_diesel=False 时，所有候选 diesel_kw == 0
4. available_area_m2 很小时，候选不超过面积限制
5. 所有 diesel 尺寸在 _STANDARD_DIESEL_KW 目录中或为 0
6. 提供 lat/lon/year 时，diagnostics 中 usePypsa=True
7. capex_usd > 0, selling_price_usd > capex_usd, lcoe_microgrid_usd_per_kwh > 0
8. payback_years > 0, npv_10yr_usd 是数字 (not None)

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
"""

import sys
from pathlib import Path

import pytest

# 确保 backend 根目录在 sys.path 中
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.optimizer import (  # noqa: E402
    _STANDARD_DIESEL_KW,
    OptimizeInput,
    OptimizeOption,
    optimize_with_diagnostics,
)

# ── 测试输入工厂 ──────────────────────────────────────────────────


def _make_input_146k() -> OptimizeInput:
    """146k kWh/yr 标准测试输入 (中等负载)."""
    return OptimizeInput(
        annual_load_kwh=146_000,
        peak_load_kw=0.0,
        peak_sun_hours=4.5,
        storage_days=1,
        diesel_price_usd_per_liter=0.95,
        fuel_efficiency_kwh_per_l=3.5,
        discount_rate=0.08,
        project_years=25,
        diesel_is_new=False,
        panel_model="655W",
        bracket_model="standard_32",
        battery_pack_model="LFP-16kWh",
        min_bracket_sets=1,
        max_bracket_sets=8,
        available_area_m2=None,
        existing_diesel_kw=None,
        diesel_capacity_kw=None,
        objective="payback",
        allow_diesel=None,
        voltage_level=None,
        load_type="commercial",
        latitude=38.392107,
        longitude=-83.301341,
        year=2024,
        ems_control_method="edge",
        ems_addons=[],
    )


def _make_input_73k() -> OptimizeInput:
    """73k kWh/yr 小负载测试输入."""
    return OptimizeInput(
        annual_load_kwh=73_000,
        peak_load_kw=0.0,
        peak_sun_hours=4.5,
        storage_days=1,
        diesel_price_usd_per_liter=0.95,
        fuel_efficiency_kwh_per_l=3.5,
        discount_rate=0.08,
        project_years=25,
        diesel_is_new=False,
        panel_model="655W",
        bracket_model="standard_32",
        battery_pack_model="LFP-16kWh",
        min_bracket_sets=1,
        max_bracket_sets=8,
        available_area_m2=None,
        existing_diesel_kw=None,
        diesel_capacity_kw=None,
        objective="payback",
        allow_diesel=None,
        voltage_level=None,
        load_type="commercial",
        latitude=38.392107,
        longitude=-83.301341,
        year=2024,
        ems_control_method="edge",
        ems_addons=[],
    )


def _make_input_300k() -> OptimizeInput:
    """300k kWh/yr 大负载测试输入."""
    return OptimizeInput(
        annual_load_kwh=300_000,
        peak_load_kw=0.0,
        peak_sun_hours=4.5,
        storage_days=1,
        diesel_price_usd_per_liter=0.95,
        fuel_efficiency_kwh_per_l=3.5,
        discount_rate=0.08,
        project_years=25,
        diesel_is_new=False,
        panel_model="655W",
        bracket_model="standard_32",
        battery_pack_model="LFP-16kWh",
        min_bracket_sets=1,
        max_bracket_sets=8,
        available_area_m2=None,
        existing_diesel_kw=None,
        diesel_capacity_kw=None,
        objective="payback",
        allow_diesel=None,
        voltage_level=None,
        load_type="commercial",
        latitude=38.392107,
        longitude=-83.301341,
        year=2024,
        ems_control_method="edge",
        ems_addons=[],
    )


def _make_input_no_diesel() -> OptimizeInput:
    """allow_diesel=False 的测试输入."""
    return OptimizeInput(
        annual_load_kwh=146_000,
        peak_load_kw=0.0,
        peak_sun_hours=4.5,
        storage_days=1,
        diesel_price_usd_per_liter=0.95,
        fuel_efficiency_kwh_per_l=3.5,
        discount_rate=0.08,
        project_years=25,
        diesel_is_new=False,
        panel_model="655W",
        bracket_model="standard_32",
        battery_pack_model="LFP-16kWh",
        min_bracket_sets=1,
        max_bracket_sets=8,
        available_area_m2=None,
        existing_diesel_kw=None,
        diesel_capacity_kw=None,
        objective="payback",
        allow_diesel=False,
        voltage_level=None,
        load_type="commercial",
        latitude=38.392107,
        longitude=-83.301341,
        year=2024,
        ems_control_method="edge",
        ems_addons=[],
    )


def _make_input_small_area() -> OptimizeInput:
    """available_area_m2=200 小面积约束测试输入."""
    return OptimizeInput(
        annual_load_kwh=146_000,
        peak_load_kw=0.0,
        peak_sun_hours=4.5,
        storage_days=1,
        diesel_price_usd_per_liter=0.95,
        fuel_efficiency_kwh_per_l=3.5,
        discount_rate=0.08,
        project_years=25,
        diesel_is_new=False,
        panel_model="655W",
        bracket_model="standard_32",
        battery_pack_model="LFP-16kWh",
        min_bracket_sets=1,
        max_bracket_sets=8,
        available_area_m2=200.0,
        existing_diesel_kw=None,
        diesel_capacity_kw=None,
        objective="payback",
        allow_diesel=None,
        voltage_level=None,
        load_type="commercial",
        latitude=38.392107,
        longitude=-83.301341,
        year=2024,
        ems_control_method="edge",
        ems_addons=[],
    )


# ── 测试：返回类型结构 ──────────────────────────────────────────


class TestReturnTypeStructure:
    """验证 optimize_with_diagnostics() 返回正确的元组结构."""

    @pytest.mark.parametrize(
        "make_input",
        [
            _make_input_146k,
            _make_input_73k,
            _make_input_300k,
        ],
        ids=["146k_kwh", "73k_kwh", "300k_kwh"],
    )
    def test_returns_tuple_of_list_and_dict(self, make_input):
        """返回值应为 (List[OptimizeOption], dict) 元组."""
        req = make_input()
        result = optimize_with_diagnostics(req)

        assert isinstance(result, tuple), "返回值应为元组"
        assert len(result) == 2, "元组应有 2 个元素"

        options, diagnostics = result
        assert isinstance(options, list), "第一个元素应为 list"
        assert isinstance(diagnostics, dict), "第二个元素应为 dict"
        assert len(options) > 0, "结果列表不应为空"

        for opt in options:
            assert isinstance(opt, OptimizeOption), (
                f"列表元素应为 OptimizeOption 实例，实际为 {type(opt)}"
            )


# ── 测试：字段类型和值 ──────────────────────────────────────────


class TestFieldTypesAndValues:
    """验证每个 OptimizeOption 的所有必需字段具有正确类型和合理值."""

    @pytest.mark.parametrize(
        "make_input",
        [
            _make_input_146k,
            _make_input_73k,
            _make_input_300k,
        ],
        ids=["146k_kwh", "73k_kwh", "300k_kwh"],
    )
    def test_all_fields_populated_with_correct_types(self, make_input):
        """所有 OptimizeOption 字段应被正确填充."""
        req = make_input()
        results, _ = optimize_with_diagnostics(req)

        for opt in results:
            # int 字段
            assert isinstance(opt.bracket_sets, int) and opt.bracket_sets >= 1
            assert isinstance(opt.num_packs, int) and opt.num_packs >= 1

            # float 字段 (正数)
            assert isinstance(opt.pv_kw, float) and opt.pv_kw > 0
            assert isinstance(opt.battery_kwh, float) and opt.battery_kwh > 0
            assert (
                isinstance(opt.diesel_kw, (int, float)) and opt.diesel_kw >= 0
            )
            assert isinstance(opt.solar_fraction_pct, (int, float))
            assert isinstance(opt.annual_diesel_kwh, (int, float))
            assert isinstance(opt.annual_diesel_liters, (int, float))
            assert isinstance(opt.annual_diesel_only_liters, (int, float))
            assert isinstance(opt.capex_usd, (int, float))
            assert isinstance(opt.selling_price_usd, (int, float))
            assert isinstance(opt.annual_diesel_cost_usd, (int, float))
            assert isinstance(opt.annual_diesel_only_cost_usd, (int, float))
            assert isinstance(opt.annual_om_cost_usd, (int, float))
            assert isinstance(opt.annual_savings_usd, (int, float))
            assert isinstance(opt.payback_years, (int, float))
            assert isinstance(opt.npv_10yr_usd, (int, float))
            assert isinstance(opt.lcoe_microgrid_usd_per_kwh, (int, float))
            assert isinstance(opt.lcoe_diesel_only_usd_per_kwh, (int, float))

            # str 字段
            assert isinstance(opt.label, str)
            assert isinstance(opt.reliability_note, str)

            # bool 字段
            assert isinstance(opt.is_recommended, bool)
            assert isinstance(opt.is_runner_up, bool)
            assert isinstance(opt.is_third, bool)
            assert isinstance(opt.diesel_is_new, bool)
            assert isinstance(opt.is_reliability_risk, bool)

            # float score
            assert isinstance(opt.score, (int, float))

    @pytest.mark.parametrize(
        "make_input",
        [
            _make_input_146k,
            _make_input_73k,
            _make_input_300k,
        ],
        ids=["146k_kwh", "73k_kwh", "300k_kwh"],
    )
    def test_economic_fields_positive(self, make_input):
        """Capex > 0, selling_price > capex, lcoe > 0, payback > 0.

        npv 是数字.
        """
        req = make_input()
        results, _ = optimize_with_diagnostics(req)

        for opt in results:
            assert opt.capex_usd > 0, (
                f"capex_usd 应 > 0, 实际 = {opt.capex_usd} "
                f"(bracket_sets={opt.bracket_sets})"
            )
            assert opt.selling_price_usd > opt.capex_usd, (
                f"selling_price_usd ({opt.selling_price_usd}) 应 > "
                f"capex_usd ({opt.capex_usd}) "
                f"(bracket_sets={opt.bracket_sets})"
            )
            assert opt.lcoe_microgrid_usd_per_kwh > 0, (
                f"lcoe_microgrid_usd_per_kwh 应 > 0, 实际 = "
                f"{opt.lcoe_microgrid_usd_per_kwh} "
                f"(bracket_sets={opt.bracket_sets})"
            )
            assert opt.payback_years > 0, (
                f"payback_years 应 > 0, 实际 = {opt.payback_years} "
                f"(bracket_sets={opt.bracket_sets})"
            )
            assert opt.npv_10yr_usd is not None, (
                f"npv_10yr_usd 不应为 None (bracket_sets={opt.bracket_sets})"
            )
            assert isinstance(opt.npv_10yr_usd, (int, float)), (
                f"npv_10yr_usd 应为数字, 实际类型 = {type(opt.npv_10yr_usd)} "
                f"(bracket_sets={opt.bracket_sets})"
            )


# ── 测试：allow_diesel 约束 ──────────────────────────────────────


class TestAllowDieselConstraint:
    """验证 allow_diesel=False 时所有候选方案排除柴油."""

    def test_no_diesel_when_disallowed(self):
        """allow_diesel=False 时所有候选 diesel_kw == 0."""
        req = _make_input_no_diesel()
        results, _ = optimize_with_diagnostics(req)

        assert len(results) > 0, "结果不应为空"
        for opt in results:
            assert opt.diesel_kw == 0, (
                f"allow_diesel=False 但候选 bracket_sets={opt.bracket_sets} "
                f"有 diesel_kw={opt.diesel_kw}"
            )
            assert opt.annual_diesel_liters == 0, (
                f"allow_diesel=False 但候选 bracket_sets={opt.bracket_sets} "
                f"有 annual_diesel_liters={opt.annual_diesel_liters}"
            )


# ── 测试：面积约束 ──────────────────────────────────────────────


class TestAreaConstraint:
    """验证 available_area_m2 较小时，候选不超过面积限制."""

    def test_small_area_limits_candidates(self):
        """available_area_m2=200 应限制最大 bracket_sets."""
        req = _make_input_small_area()
        results, _ = optimize_with_diagnostics(req)

        assert len(results) > 0, "结果不应为空"

        # 面积 200m² 应限制 bracket_sets 数量（不会产生 8 套的候选）
        max_sets_in_results = max(opt.bracket_sets for opt in results)
        assert max_sets_in_results < 8, (
            f"available_area_m2=200 应限制 bracket_sets < 8, "
            f"但实际最大为 {max_sets_in_results}"
        )

        # 验证所有候选的 site_area_required_m2 不超过 available_area_m2
        for opt in results:
            if opt.site_area_required_m2 is not None:
                assert opt.site_area_required_m2 <= req.available_area_m2, (
                    f"候选 bracket_sets={opt.bracket_sets} 的 "
                    f"site_area_required_m2={opt.site_area_required_m2} "
                    f"超过 available_area_m2={req.available_area_m2}"
                )


# ── 测试：柴油尺寸目录约束 ──────────────────────────────────────


class TestDieselCatalogConstraint:
    """验证所有结果中的 diesel_kw 值来自标准目录或为 0."""

    @pytest.mark.parametrize(
        "make_input",
        [
            _make_input_146k,
            _make_input_73k,
            _make_input_300k,
        ],
        ids=["146k_kwh", "73k_kwh", "300k_kwh"],
    )
    def test_diesel_sizes_from_catalog(self, make_input):
        """所有 diesel_kw 应在 _STANDARD_DIESEL_KW 中或为 0."""
        req = make_input()
        results, _ = optimize_with_diagnostics(req)

        valid_sizes = set(_STANDARD_DIESEL_KW) | {0, 0.0}
        for opt in results:
            assert opt.diesel_kw in valid_sizes or opt.diesel_kw == 0, (
                f"候选 bracket_sets={opt.bracket_sets} 的 "
                f"diesel_kw={opt.diesel_kw} 不在标准目录 "
                f"{_STANDARD_DIESEL_KW} 中且不为 0"
            )


# ── 测试：PyPSA 模拟使用 ──────────────────────────────────────


class TestPyPSAUsage:
    """验证提供 lat/lon/year 时使用 PyPSA 模拟."""

    @pytest.mark.parametrize(
        "make_input",
        [
            _make_input_146k,
            _make_input_73k,
            _make_input_300k,
        ],
        ids=["146k_kwh", "73k_kwh", "300k_kwh"],
    )
    def test_pypsa_used_when_location_provided(self, make_input):
        """提供 lat/lon/year 时 diagnostics['usePypsa'] 应为 True."""
        req = make_input()
        _, diagnostics = optimize_with_diagnostics(req)

        assert "usePypsa" in diagnostics, "diagnostics 应包含 'usePypsa' 键"
        assert diagnostics["usePypsa"] is True, (
            f"提供 lat={req.latitude}, lon={req.longitude}, year={req.year} "
            f"时 usePypsa 应为 True, 实际为 {diagnostics['usePypsa']}"
        )
