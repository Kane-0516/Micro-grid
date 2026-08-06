"""
test_layout_boundary_bug.py
============================
Bug 条件探索测试：确认 `_rect_fits` 函数在未修复代码上的 bug 存在。

Bug 描述：
  `_rect_fits` 仅通过 9 个离散采样点（4 角 + 4 边中点 + 1 中心）判断矩形是否在多边形内。
  当多边形边界从两个相邻采样点之间穿过时，矩形被错误地判定为"适合"。

测试策略：
  构造矩形/多边形对，使得所有 9 个采样点都在多边形内，但至少一条矩形边与多边形边相交。
  在未修复代码上，`_rect_fits` 会错误返回 True（测试断言 False，因此测试会 FAIL）。
  测试 FAIL 即确认 bug 存在。

**Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
"""

import math
import sys
from pathlib import Path

import pytest

# 确保 backend 根目录在 sys.path 中
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.layout_optimizer import (
    _rect_fits,
    _rect_corners,
    _rect_test_points,
    _point_in_polygon,
    Point,
)


# ── 辅助函数 ──────────────────────────────────────────────────

def _verify_all_sample_points_inside(corners, polygon):
    """验证所有 9 个采样点都在多边形内（bug 条件的前提）"""
    test_points = _rect_test_points(corners)
    assert len(test_points) == 9, f"预期 9 个采样点，实际 {len(test_points)}"
    for i, pt in enumerate(test_points):
        assert _point_in_polygon(pt, polygon), (
            f"采样点 {i} ({pt.x:.2f}, {pt.y:.2f}) 不在多边形内，"
            f"不满足 bug 条件前提"
        )


def _segments_intersect_check(p1, p2, p3, p4):
    """
    检查线段 (p1,p2) 和 (p3,p4) 是否相交（用于验证测试用例构造正确）。
    使用叉积方向法。
    """
    def cross(o, a, b):
        return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

    def on_segment(p, q, r):
        """检查点 q 是否在线段 pr 上"""
        return (min(p.x, r.x) <= q.x + 1e-9 <= max(p.x, r.x) + 1e-9 and
                min(p.y, r.y) <= q.y + 1e-9 <= max(p.y, r.y) + 1e-9)

    d1 = cross(p3, p4, p1)
    d2 = cross(p3, p4, p2)
    d3 = cross(p1, p2, p3)
    d4 = cross(p1, p2, p4)

    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True

    if abs(d1) < 1e-9 and on_segment(p3, p1, p4):
        return True
    if abs(d2) < 1e-9 and on_segment(p3, p2, p4):
        return True
    if abs(d3) < 1e-9 and on_segment(p1, p3, p2):
        return True
    if abs(d4) < 1e-9 and on_segment(p1, p4, p2):
        return True

    return False


def _any_rect_edge_intersects_polygon(corners, polygon):
    """检查矩形的任何边是否与多边形的任何边相交"""
    n_poly = len(polygon)
    for i in range(4):
        r1 = corners[i]
        r2 = corners[(i + 1) % 4]
        for j in range(n_poly):
            p1 = polygon[j]
            p2 = polygon[(j + 1) % n_poly]
            if _segments_intersect_check(r1, r2, p1, p2):
                return True
    return False


# ── 测试用例 ──────────────────────────────────────────────────


class TestLongEdgeCrossing:
    """
    长边穿越测试：28m × 5.6m 矩形，多边形边界在长边 7m 处穿过。

    矩形放置在原点，长边沿 X 轴：
      角点: (-14, -2.8), (14, -2.8), (14, 2.8), (-14, 2.8)
      边中点: (0, -2.8), (14, 0), (0, 2.8), (-14, 0)
      中心: (0, 0)

    多边形设计：
      在 x = -7 处（角点 -14 和中点 0 之间），多边形底边向上凹入到 y = -2.0。
      这使得矩形底边（y = -2.8）在 x = -7 附近穿出多边形。
      但所有 9 个采样点仍在多边形内，因为最近的采样点在 x = -14 和 x = 0。
    """

    def test_long_edge_crossing_detected(self):
        """长边穿越：多边形边界在角点和中点之间穿过矩形底边"""
        # 矩形：28m × 5.6m，中心在原点，长边沿 X 轴
        corners = _rect_corners(0, 0, 0, 28.0, 5.6)

        # 构造多边形：大部分包含矩形，但在 x=-7 处底边向上凹入
        # 矩形底边在 y=-2.8，我们让多边形在 x=-7 处底边升到 y=-2.0
        # 这样矩形底边在 x∈[-10, -4] 范围内穿出多边形
        #
        # 多边形顶点（逆时针）：
        #   底边分段：从左到右，在 x=-7 处有一个向上的凸起
        polygon = [
            Point(-20, -5),     # 左下远角
            Point(-11, -5),     # 底边左段
            Point(-11, -3.5),   # 开始收窄（低于矩形底边 y=-2.8）
            Point(-7, -2.0),    # 凹入最高点（高于矩形底边 y=-2.8）
            Point(-3, -3.5),    # 恢复到低于矩形底边
            Point(-3, -5),      # 底边右段
            Point(20, -5),      # 右下远角
            Point(20, 5),       # 右上远角
            Point(-20, 5),      # 左上远角
        ]

        # 验证 bug 条件前提：所有 9 个采样点都在多边形内
        _verify_all_sample_points_inside(corners, polygon)

        # 验证确实存在边相交（矩形底边穿过多边形边界）
        assert _any_rect_edge_intersects_polygon(corners, polygon), \
            "测试构造错误：矩形边应与多边形边相交"

        # 期望行为：_rect_fits 应返回 False（矩形部分超出多边形）
        # 在未修复代码上，_rect_fits 会错误返回 True，导致此断言 FAIL
        result = _rect_fits(corners, polygon)
        assert result is False, (
            "Bug 确认：_rect_fits 错误返回 True。"
            "矩形底边在 x∈[-10, -4] 范围内穿出多边形（长边 7m 处穿越），"
            "但 9 个采样点全部在多边形内，未检测到边相交。"
        )


class TestDiagonalBoundaryCrossing:
    """
    对角线边界测试：多边形有一条对角线边穿过矩形长边的两个采样点之间。

    矩形同样放置在原点，长边沿 X 轴。
    多边形有一条对角线边从 (-10, -5) 到 (-4, -2.0)，
    穿过矩形底边（y=-2.8）在两个采样点之间。
    """

    def test_diagonal_boundary_crossing_detected(self):
        """对角线边界：多边形对角线边穿过矩形长边"""
        corners = _rect_corners(0, 0, 0, 28.0, 5.6)

        # 多边形：有一条对角线边从底部穿过矩形
        # 对角线从 (-11, -5) 到 (-3, -1.5)，穿过 y=-2.8 大约在 x=-7 处
        polygon = [
            Point(-20, -5),     # 左下远角
            Point(-11, -5),     # 对角线起点
            Point(-3, -1.5),    # 对角线终点（在矩形内部上方）
            Point(-3, -5),      # 回到底部
            Point(20, -5),      # 右下远角
            Point(20, 5),       # 右上远角
            Point(-20, 5),      # 左上远角
        ]

        # 验证 bug 条件前提
        _verify_all_sample_points_inside(corners, polygon)

        # 验证存在边相交
        assert _any_rect_edge_intersects_polygon(corners, polygon), \
            "测试构造错误：矩形边应与多边形对角线边相交"

        # 期望行为：_rect_fits 应返回 False
        result = _rect_fits(corners, polygon)
        assert result is False, (
            "Bug 确认：_rect_fits 错误返回 True。"
            "多边形对角线边穿过矩形底边（在两个采样点之间），"
            "形成三角形区域超出多边形，但未被检测到。"
        )


class TestConcaveNotchCrossing:
    """
    凹形缺口测试：多边形有一个窄凹形缺口（约 5m 宽）在采样点之间。

    矩形放置在原点，长边沿 X 轴。
    多边形在矩形底边中间有一个向上的窄缺口，
    缺口宽度约 5m，位于两个采样点之间。
    """

    def test_concave_notch_crossing_detected(self):
        """凹形缺口：多边形窄缺口在采样点之间穿入矩形"""
        corners = _rect_corners(0, 0, 0, 28.0, 5.6)

        # 在 x∈[-9, -5] 范围内（角点 -14 和中点 0 之间），
        # 多边形底边有一个向上的缺口，缺口顶部在 y=-2.0
        # 缺口宽度 = 4m，在两个采样点之间
        polygon = [
            Point(-20, -5),     # 左下远角
            Point(-9, -5),      # 缺口左侧底部
            Point(-9, -2.0),    # 缺口左上角
            Point(-5, -2.0),    # 缺口右上角
            Point(-5, -5),      # 缺口右侧底部
            Point(20, -5),      # 右下远角
            Point(20, 5),       # 右上远角
            Point(-20, 5),      # 左上远角
        ]

        # 验证 bug 条件前提
        _verify_all_sample_points_inside(corners, polygon)

        # 验证存在边相交
        assert _any_rect_edge_intersects_polygon(corners, polygon), \
            "测试构造错误：矩形边应与凹形缺口边相交"

        # 期望行为：_rect_fits 应返回 False
        result = _rect_fits(corners, polygon)
        assert result is False, (
            "Bug 确认：_rect_fits 错误返回 True。"
            "多边形在 x∈[-9, -5] 处有一个 4m 宽的凹形缺口（y=-2.0），"
            "矩形底边（y=-2.8）穿过缺口区域，但 9 个采样点全部在多边形内。"
        )


class TestShortEdgeCrossing:
    """
    短边穿越测试：多边形边界在短边 5.6m 的角点和中点之间穿过。

    矩形放置在原点，长边沿 X 轴。短边在 x=14 处（右侧），
    从 (14, -2.8) 到 (14, 2.8)，中点在 (14, 0)。
    多边形在 x=14 右侧有一个向左的凹入，
    在 y=1.4（角点 2.8 和中点 0 之间）处穿过短边。
    """

    def test_short_edge_crossing_detected(self):
        """短边穿越：多边形边界在短边角点和中点之间穿过"""
        corners = _rect_corners(0, 0, 0, 28.0, 5.6)

        # 矩形右侧短边从 (14, -2.8) 到 (14, 2.8)，中点 (14, 0)
        # 在 y∈[0.5, 2.0] 范围内（中点 0 和角点 2.8 之间），
        # 多边形右边界向左凹入到 x=13.5
        polygon = [
            Point(-20, -5),     # 左下远角
            Point(20, -5),      # 右下远角
            Point(20, 0.5),     # 右边界开始凹入
            Point(13.5, 1.25),  # 凹入最深处（在矩形右边 x=14 左侧）
            Point(20, 2.0),     # 右边界恢复
            Point(20, 5),       # 右上远角
            Point(-20, 5),      # 左上远角
        ]

        # 验证 bug 条件前提
        _verify_all_sample_points_inside(corners, polygon)

        # 验证存在边相交
        assert _any_rect_edge_intersects_polygon(corners, polygon), \
            "测试构造错误：矩形短边应与多边形边相交"

        # 期望行为：_rect_fits 应返回 False
        result = _rect_fits(corners, polygon)
        assert result is False, (
            "Bug 确认：_rect_fits 错误返回 True。"
            "多边形右边界在 y∈[0.5, 2.0] 处向左凹入到 x=13.5，"
            "矩形右短边（x=14）穿过凹入区域，但采样点未检测到。"
        )
