"""
test_optimizer_bug_condition.py
================================
Bug 条件探索测试：确认 optimizer.py 对齐 Homer Pro 推荐逻辑。

验证属性：
  1. 多个不同 diesel_kw 值出现在结果中（多柴油尺寸搜索）
  2. 存在相同 bracket_sets 但不同 battery_kwh 的候选（电池独立于 PV）
  3. 推荐方案按 NPC 排名（与 Homer Pro 一致）

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**
"""

import sys
from pathlib import Path

import pytest

# 确保 backend 根目录在 sys.path 中
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.optimizer import OptimizeInput, optimize_with_diagnostics


# ── 测试输入 ──────────────────────────────────────────────────

def _make_test_input() -> OptimizeInput:
    """构造 146k kWh/yr 负载的标准测试输入"""
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


# ── 测试类 ──────────────────────────────────────────────────


class TestDieselDiversity:
    """多柴油尺寸搜索：结果中应包含多个不同的 diesel_kw 值。"""

    def test_multiple_diesel_sizes_in_results(self):
        """多柴油尺寸：结果中应包含至少 2 个不同的 diesel_kw 值"""
        req = _make_test_input()
        results, diagnostics = optimize_with_diagnostics(req)

        assert len(results) > 0, "优化器应返回至少一个结果"

        diesel_sizes = set(opt.diesel_kw for opt in results)
        assert len(diesel_sizes) >= 2, (
            f"所有 {len(results)} 个候选方案共享相同 diesel_kw = "
            f"{diesel_sizes}。应评估多个柴油尺寸候选。"
        )


class TestBatteryIndependence:
    """电池独立性：应存在相同 PV 但不同电池容量的候选。"""

    def test_battery_independent_of_pv(self):
        """电池独立：应存在相同 bracket_sets 但不同 battery_kwh 的候选"""
        req = _make_test_input()
        results, diagnostics = optimize_with_diagnostics(req)

        assert len(results) > 0, "优化器应返回至少一个结果"

        from collections import defaultdict
        battery_by_pv = defaultdict(set)
        for opt in results:
            battery_by_pv[opt.bracket_sets].add(opt.battery_kwh)

        has_independent_battery = any(
            len(batteries) >= 2 for batteries in battery_by_pv.values()
        )

        assert has_independent_battery, (
            f"每个 bracket_sets 值对应唯一的 battery_kwh："
            f" {dict((k, sorted(v)) for k, v in battery_by_pv.items())}。"
            f"应存在独立的电池搜索轴。"
        )


class TestNPCBasedRanking:
    """NPC 排名：推荐方案应按 NPC 排序（与 Homer Pro 一致）。"""

    def test_ranking_is_npc_based(self):
        """NPC 排名：结果排序应按 NPC 升序"""
        req = _make_test_input()
        results, diagnostics = optimize_with_diagnostics(req)

        assert len(results) > 0, "优化器应返回至少一个结果"

        # score = -NPC，所以 score 降序 = NPC 升序
        scores = [opt.score for opt in results]
        is_sorted_by_score_desc = all(
            scores[i] >= scores[i + 1] - 1e-6
            for i in range(len(scores) - 1)
        )

        assert is_sorted_by_score_desc, (
            f"结果未按 NPC 升序排列。"
            f"实际: {[(f'sets={o.bracket_sets}, npc={-o.score:.0f}') for o in results]}"
        )
