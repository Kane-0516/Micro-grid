"""保持性属性测试：验证 `_rect_fits` 函数在非 bug 输入上的基线行为.

这些测试必须在未修复代码上 PASS，用于确认修复后不会引入回归。

测试策略：
  1. 完全包含保持：生成完全在凸多边形内的矩形，验证 _rect_fits 返回 True
  2. 角点在外保持：生成至少一个角点在多边形外的矩形，
     验证 _rect_fits 返回 False
  3. 中点在外保持：生成所有角点在内但至少一个中点在外的矩形，
     验证 _rect_fits 返回 False

**Validates: Requirements 3.1, 3.2, 3.3**
"""

import math
import sys
from pathlib import Path

from hypothesis import assume, given, settings
from hypothesis import strategies as st

# 确保 backend 根目录在 sys.path 中
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.layout_optimizer import (  # noqa: E402
    Point,
    _point_in_polygon,
    _rect_corners,
    _rect_fits,
    _rect_test_points,
)

# ── 辅助函数 ──────────────────────────────────────────────────


def _make_large_regular_polygon(
    cx: float, cy: float, radius: float, n_sides: int
) -> list[Point]:
    """生成以 (cx, cy) 为中心、半径为 radius 的正 n 边形（凸多边形）.

    顶点按逆时针排列.
    """
    pts = []
    for i in range(n_sides):
        angle = 2 * math.pi * i / n_sides
        pts.append(
            Point(cx + radius * math.cos(angle), cy + radius * math.sin(angle))
        )
    return pts


def _inscribed_radius(radius: float, n_sides: int) -> float:
    """正 n 边形的内切圆半径（从中心到边的最短距离）."""
    return radius * math.cos(math.pi / n_sides)


# ── Hypothesis 策略 ──────────────────────────────────────────

# 生成凸多边形参数的策略
polygon_params = st.fixed_dictionaries(
    {
        "cx": st.floats(
            min_value=-50, max_value=50, allow_nan=False, allow_infinity=False
        ),
        "cy": st.floats(
            min_value=-50, max_value=50, allow_nan=False, allow_infinity=False
        ),
        "radius": st.floats(
            min_value=40, max_value=200, allow_nan=False, allow_infinity=False
        ),
        "n_sides": st.integers(min_value=4, max_value=12),
    }
)

# 矩形尺寸策略（模拟实际支架尺寸范围）
rect_dims = st.fixed_dictionaries(
    {
        "length": st.floats(
            min_value=5.0, max_value=30.0, allow_nan=False, allow_infinity=False
        ),
        "width": st.floats(
            min_value=2.0, max_value=10.0, allow_nan=False, allow_infinity=False
        ),
    }
)

# 矩形旋转角度
rect_angle = st.floats(
    min_value=0, max_value=2 * math.pi, allow_nan=False, allow_infinity=False
)


# ── 测试类 ────────────────────────────────────────────────────


class TestFullyContainedPreservation:
    """完全包含保持：生成完全在凸多边形内的矩形，验证 _rect_fits 返回 True.

    策略：生成一个足够大的正多边形，然后在其内切圆内放置一个小矩形，
    确保矩形的所有点（包括角点、中点、中心）都在多边形内。

    **Validates: Requirements 3.1**
    """

    @given(
        poly_params=polygon_params,
        dims=rect_dims,
        angle=rect_angle,
    )
    @settings(max_examples=200, deadline=None)
    def test_fully_contained_rect_returns_true(self, poly_params, dims, angle):
        """完全在凸多边形内的矩形，_rect_fits 应返回 True."""
        cx, cy = poly_params["cx"], poly_params["cy"]
        radius = poly_params["radius"]
        n_sides = poly_params["n_sides"]

        length = dims["length"]
        width = dims["width"]

        # 生成凸多边形
        polygon = _make_large_regular_polygon(cx, cy, radius, n_sides)

        # 计算内切圆半径
        inradius = _inscribed_radius(radius, n_sides)

        # 矩形对角线半长（从中心到角点的最大距离）
        half_diag = math.sqrt((length / 2) ** 2 + (width / 2) ** 2)

        # 确保矩形完全在多边形内：矩形中心在多边形中心，
        # 且内切圆半径远大于矩形对角线半长
        assume(inradius > half_diag + 1.0)  # 留 1m 余量

        # 将矩形放在多边形中心
        corners = _rect_corners(cx, cy, angle, length, width)

        # 验证前提：所有测试点确实在多边形内
        test_points = _rect_test_points(corners)
        all_inside = all(_point_in_polygon(p, polygon) for p in test_points)
        assume(all_inside)

        # 核心断言：_rect_fits 应返回 True
        result = _rect_fits(corners, polygon)
        assert result is True, (
            f"完全包含的矩形应返回 True。"
            f"多边形: {n_sides}边形, 半径={radius:.1f}, 内切圆={inradius:.1f}; "
            f"矩形: {length:.1f}×{width:.1f}, 对角线半长={half_diag:.1f}"
        )


class TestCornerOutsidePreservation:
    """角点在外保持：生成至少一个角点在多边形外的矩形.

    验证 _rect_fits 返回 False.

    策略：生成一个凸多边形，然后将矩形中心放在多边形外部或边界附近，
    确保至少一个角点明确在多边形外部。通过将矩形中心放在
    距多边形中心 (inradius + half_diag * overshoot) 的位置来保证。

    **Validates: Requirements 3.2**
    """

    @given(
        poly_params=polygon_params,
        dims=rect_dims,
        angle=rect_angle,
        overshoot=st.floats(
            min_value=0.1, max_value=1.0, allow_nan=False, allow_infinity=False
        ),
        direction_angle=st.floats(
            min_value=0,
            max_value=2 * math.pi,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200, deadline=None)
    def test_corner_outside_rect_returns_false(
        self, poly_params, dims, angle, overshoot, direction_angle
    ):
        """至少一个角点在多边形外的矩形，_rect_fits 应返回 False."""
        cx, cy = poly_params["cx"], poly_params["cy"]
        radius = poly_params["radius"]
        n_sides = poly_params["n_sides"]

        length = dims["length"]
        width = dims["width"]

        # 生成凸多边形
        polygon = _make_large_regular_polygon(cx, cy, radius, n_sides)

        # 计算内切圆半径
        inradius = _inscribed_radius(radius, n_sides)

        # 矩形对角线半长
        half_diag = math.sqrt((length / 2) ** 2 + (width / 2) ** 2)

        # 将矩形中心放在距多边形中心足够远的位置，
        # 使得至少一个角点一定超出多边形。
        # dist = inradius - half_diag + half_diag * (1 + overshoot)
        #      = inradius + half_diag * overshoot
        # 这样矩形中心到多边形边界的距离约为 half_diag * overshoot，
        # 而矩形角点到中心的距离为 half_diag，所以角点一定超出。
        dist = inradius + half_diag * overshoot

        rect_cx = cx + dist * math.cos(direction_angle)
        rect_cy = cy + dist * math.sin(direction_angle)

        corners = _rect_corners(rect_cx, rect_cy, angle, length, width)

        # 验证前提：至少一个角点在多边形外
        corners_outside = [not _point_in_polygon(c, polygon) for c in corners]
        assume(any(corners_outside))

        # 核心断言：_rect_fits 应返回 False
        result = _rect_fits(corners, polygon)
        assert result is False, (
            f"至少一个角点在多边形外的矩形应返回 False。"
            f"外部角点数: {sum(corners_outside)}"
        )


class TestMidpointOutsidePreservation:
    """中点在外保持：生成所有角点在内但至少一个中点在外的矩形.

    验证 _rect_fits 返回 False。

    策略：使用一个带有浅凹陷的多边形，矩形放置在凹陷附近，
    使得角点在多边形内但边中点落入凹陷区域外。

    这种情况在实际中较难随机生成，因此使用精心构造的多边形。

    **Validates: Requirements 3.3**
    """

    @given(
        rect_width=st.floats(
            min_value=4.0, max_value=8.0, allow_nan=False, allow_infinity=False
        ),
        notch_depth=st.floats(
            min_value=0.3, max_value=1.5, allow_nan=False, allow_infinity=False
        ),
        notch_half_width=st.floats(
            min_value=3.0, max_value=6.0, allow_nan=False, allow_infinity=False
        ),
    )
    @settings(max_examples=200, deadline=None)
    def test_midpoint_outside_rect_returns_false(
        self, rect_width, notch_depth, notch_half_width
    ):
        """所有角点在内但至少一个中点在外的矩形，_rect_fits 应返回 False."""
        # 构造一个带有顶部浅凹陷的多边形
        # 矩形放置在凹陷正下方，使得顶边中点落入凹陷区域
        #
        # 多边形形状：
        #   大矩形区域，但顶边中间有一个向下的凹陷
        #   凹陷宽度 = 2 * notch_half_width
        #   凹陷深度 = notch_depth
        #
        # 矩形放置：
        #   矩形中心在 (0, 0)，长边沿 X 轴
        #   矩形顶边在 y = rect_width/2
        #   多边形顶边在 y = rect_width/2 + 0.1（刚好在矩形顶边上方）
        #   但凹陷区域顶边降到 y = rect_width/2 - notch_depth

        half_w = rect_width / 2
        rect_length = 20.0  # 固定长边长度

        # 多边形顶边高度（刚好在矩形顶边上方）
        top_y = half_w + 0.1
        # 凹陷底部高度（低于矩形顶边）
        notch_y = half_w - notch_depth

        # 确保凹陷确实低于矩形顶边
        assume(notch_y < half_w - 0.05)

        # 确保凹陷宽度小于矩形长度的一半（这样角点不会落入凹陷）
        assume(notch_half_width < rect_length / 2 - 1.0)

        # 构造多边形（逆时针）
        polygon = [
            Point(-15, -half_w - 5),  # 左下
            Point(15, -half_w - 5),  # 右下
            Point(15, top_y),  # 右上
            Point(notch_half_width, top_y),  # 凹陷右侧上方
            Point(notch_half_width, notch_y),  # 凹陷右下角
            Point(-notch_half_width, notch_y),  # 凹陷左下角
            Point(-notch_half_width, top_y),  # 凹陷左侧上方
            Point(-15, top_y),  # 左上
        ]

        # 矩形放在 (0, 0)，长边沿 X 轴，无旋转
        corners = _rect_corners(0, 0, 0, rect_length, rect_width)

        # 验证前提：所有 4 个角点在多边形内
        all_corners_inside = all(_point_in_polygon(c, polygon) for c in corners)
        assume(all_corners_inside)

        # 验证前提：至少一个中点在多边形外
        # 顶边中点在 (0, half_w)，应该在凹陷区域内（多边形外）
        test_points = _rect_test_points(corners)
        # test_points: [4 corners] + [4 midpoints] + [center]
        midpoints = test_points[4:8]
        any_midpoint_outside = any(
            not _point_in_polygon(m, polygon) for m in midpoints
        )
        assume(any_midpoint_outside)

        # 核心断言：_rect_fits 应返回 False
        result = _rect_fits(corners, polygon)
        assert result is False, (
            f"所有角点在内但中点在外的矩形应返回 False。"
            f"矩形: {rect_length}×{rect_width}, 凹陷深度={notch_depth:.2f}"
        )
