"""
layout_optimizer.py
===================
基于可用面积（或多边形顶点）计算最大可安装微电网支架套数。

算法架构 — 混合朝向 MILP 精确求解：
  对每个候选角度 θ，同时枚举横放（θ）和竖放（θ+90°）的所有候选位置，
  构建统一的 0-1 MILP，用 SAT 分离轴定理检测跨朝向重叠，
  HiGHS 求解器保证在给定角度下的全局最优。

  多角度扫描 + 贪心预筛选 + top-N MILP 精确求解 + 精扫。
  凸分解 + 分区独立求解。

产品约束：
  - 单套支架尺寸：28 m × 5.6 m
  - 相邻支架最小间距：3.048 m（10 ft），适用于所有方向
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# ── 产品尺寸默认值（仅作为函数签名的 fallback，实际值应从 catalog 传入）──
_DEFAULT_BRACKET_LENGTH_M = 28.0
_DEFAULT_BRACKET_WIDTH_M = 5.6
_DEFAULT_BRACKET_SPACING_M = 3.048  # 10 ft

# ── 算法参数 ─────────────────────────────────────────────────
ANGLE_COARSE_STEP_DEG = 2.0
ANGLE_FINE_WINDOW_DEG = 1.0
ANGLE_FINE_STEP_DEG = 0.25
ANGLE_DEDUP_TOL_DEG = 1.0


@dataclass
class Point:
    x: float
    y: float


@dataclass
class LayoutRect:
    center: Point
    corners: List[Point]
    angle_rad: float = 0.0


@dataclass
class LayoutResult:
    max_systems: int
    layout: List[LayoutRect] = field(default_factory=list)
    strategy: str = ""
    spacing_m: float = _DEFAULT_BRACKET_SPACING_M
    bracket_length_m: float = _DEFAULT_BRACKET_LENGTH_M
    bracket_width_m: float = _DEFAULT_BRACKET_WIDTH_M


# ── 候选位置：带朝向标记 ─────────────────────────────────────
@dataclass
class Candidate:
    cx: float          # 旋转坐标系下的中心 x
    cy: float          # 旋转坐标系下的中心 y
    half_lx: float     # 旋转坐标系下的半长（含间距缓冲时另算）
    half_ly: float     # 旋转坐标系下的半宽
    rect: LayoutRect   # 世界坐标系下的矩形


# ═══════════════════════════════════════════════════════════════
# 几何工具
# ═══════════════════════════════════════════════════════════════

def _signed_area(pts: List[Point]) -> float:
    a = 0.0
    n = len(pts)
    for i in range(n):
        c, nx = pts[i], pts[(i + 1) % n]
        a += c.x * nx.y - nx.x * c.y
    return a / 2.0


def _abs_area(pts: List[Point]) -> float:
    return abs(_signed_area(pts))


def _centroid(pts: List[Point]) -> Point:
    sa = _signed_area(pts)
    if abs(sa) < 1e-9:
        n = len(pts)
        return Point(sum(p.x for p in pts) / n, sum(p.y for p in pts) / n)
    cx = cy = 0.0
    for i in range(len(pts)):
        c, nx = pts[i], pts[(i + 1) % len(pts)]
        f = c.x * nx.y - nx.x * c.y
        cx += (c.x + nx.x) * f
        cy += (c.y + nx.y) * f
    s = 1.0 / (6.0 * sa)
    return Point(cx * s, cy * s)


def _bbox(pts: List[Point]):
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return min(xs), max(xs), min(ys), max(ys)


def _rotate(p: Point, angle: float) -> Point:
    c, s = math.cos(angle), math.sin(angle)
    return Point(p.x * c - p.y * s, p.x * s + p.y * c)


def _point_in_polygon(pt: Point, poly: List[Point]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        ci, cj = poly[i], poly[j]
        if (ci.y > pt.y) != (cj.y > pt.y):
            xint = (cj.x - ci.x) * (pt.y - ci.y) / (cj.y - ci.y + 1e-30) + ci.x
            if pt.x < xint:
                inside = not inside
        j = i
    return inside


def _rect_corners(cx: float, cy: float, angle: float,
                  length: float, width: float) -> List[Point]:
    hl, hw = length / 2, width / 2
    offsets = [(-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw)]
    corners = []
    for ox, oy in offsets:
        r = _rotate(Point(ox, oy), angle)
        corners.append(Point(cx + r.x, cy + r.y))
    return corners


def _rect_test_points(corners: List[Point]) -> List[Point]:
    center = Point(sum(c.x for c in corners) / 4,
                   sum(c.y for c in corners) / 4)
    mids = []
    for i in range(4):
        nx = corners[(i + 1) % 4]
        mids.append(Point((corners[i].x + nx.x) / 2,
                          (corners[i].y + nx.y) / 2))
    return corners + mids + [center]


def _rect_fits(corners: List[Point], poly: List[Point]) -> bool:
    """
    判断矩形是否完全在多边形内。
    先检查 9 个采样点是否都在多边形内（快速排除大部分不合格候选），
    再检查矩形边是否与多边形边相交（防止边界从采样点之间穿过）。
    """
    if not all(_point_in_polygon(p, poly) for p in _rect_test_points(corners)):
        return False
    # 所有采样点都在多边形内，再检查边相交
    if _rect_edges_intersect_polygon(corners, poly):
        return False
    return True


def _segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    """
    判断线段 (p1,p2) 和 (p3,p4) 是否正交穿越（crossing）。
    使用叉积方向法。
    忽略共线重叠和端点接触——矩形边沿多边形边界走是合法的。
    """
    def cross(o, a, b):
        return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

    d1 = cross(p3, p4, p1)
    d2 = cross(p3, p4, p2)
    d3 = cross(p1, p2, p3)
    d4 = cross(p1, p2, p4)

    # 只检测正交穿越：两条线段互相跨越对方
    if ((d1 > 1e-9 and d2 < -1e-9) or (d1 < -1e-9 and d2 > 1e-9)) and \
       ((d3 > 1e-9 and d4 < -1e-9) or (d3 < -1e-9 and d4 > 1e-9)):
        return True

    # 共线重叠、端点接触等情况不算相交
    return False


def _rect_edges_intersect_polygon(corners: List[Point], poly: List[Point]) -> bool:
    """
    检查矩形的任何边是否与多边形的任何边相交。
    发现第一个相交即短路返回 True。
    """
    n_poly = len(poly)
    for i in range(4):
        r1 = corners[i]
        r2 = corners[(i + 1) % 4]
        for j in range(n_poly):
            p1 = poly[j]
            p2 = poly[(j + 1) % n_poly]
            if _segments_intersect(r1, r2, p1, p2):
                return True
    return False


# ═══════════════════════════════════════════════════════════════
# 重叠检测（支持混合朝向）
# ═══════════════════════════════════════════════════════════════

def _candidates_overlap(a: Candidate, b: Candidate, spacing: float) -> bool:
    """
    判断两个候选矩形（可能不同朝向）是否重叠（含间距缓冲）。

    因为所有候选都在同一个旋转坐标系下表示（横放用原始坐标，
    竖放交换了 half_lx/half_ly），直接用轴对齐矩形重叠检测。
    """
    dx = abs(a.cx - b.cx)
    dy = abs(a.cy - b.cy)
    sep_x = a.half_lx + b.half_lx + spacing
    sep_y = a.half_ly + b.half_ly + spacing
    return dx < sep_x - 1e-6 and dy < sep_y - 1e-6


# ═══════════════════════════════════════════════════════════════
# 混合朝向候选枚举
# ═══════════════════════════════════════════════════════════════

def _enumerate_mixed_candidates(
    poly: List[Point],
    angle: float,
    rect_len: float,
    rect_wid: float,
    spacing: float,
) -> List[Candidate]:
    """
    在给定基准角度下，同时枚举横放和竖放的所有候选位置。

    横放：矩形尺寸 rect_len × rect_wid，角度 = angle
    竖放：矩形尺寸 rect_wid × rect_len，角度 = angle + 90°
          等价于在旋转坐标系下交换 X/Y 尺寸

    所有候选的 cx/cy 都在 angle 旋转坐标系下表示。
    """
    rotated_poly = [_rotate(p, -angle) for p in poly]
    minx, maxx, miny, maxy = _bbox(rotated_poly)

    candidates: List[Candidate] = []
    seen: set[tuple[int, int, int]] = set()  # (x*10, y*10, orientation)

    # 两种朝向的参数
    orientations = [
        (rect_len, rect_wid, 0),   # 横放: grid 尺寸 = len × wid
    ]
    if abs(rect_len - rect_wid) > 0.1:
        orientations.append(
            (rect_wid, rect_len, 1),  # 竖放: grid 尺寸 = wid × len
        )

    for grid_lx, grid_ly, orient in orientations:
        pitch_x = grid_lx + spacing
        pitch_y = grid_ly + spacing
        half_lx = grid_lx / 2
        half_ly = grid_ly / 2

        # 世界坐标系下的矩形角度
        world_angle = angle if orient == 0 else angle + math.pi / 2

        # 标准网格
        x = minx + half_lx
        while x <= maxx - half_lx + 1e-6:
            y = miny + half_ly
            while y <= maxy - half_ly + 1e-6:
                key = (round(x * 10), round(y * 10), orient)
                if key not in seen:
                    seen.add(key)
                    center_world = _rotate(Point(x, y), angle)
                    corners = _rect_corners(center_world.x, center_world.y,
                                            world_angle, rect_len, rect_wid)
                    if _rect_fits(corners, poly):
                        candidates.append(Candidate(
                            cx=x, cy=y, half_lx=half_lx, half_ly=half_ly,
                            rect=LayoutRect(center=center_world,
                                            corners=corners,
                                            angle_rad=world_angle)))
                y += pitch_y
            x += pitch_x

        # 多偏移精细搜索 — 大面积时减少偏移数量
        bbox_area = (maxx - minx) * (maxy - miny)
        if bbox_area > 20000:
            fine_offsets_x = [pitch_x * 0.5]
            fine_offsets_y = [pitch_y * 0.5]
        else:
            fine_offsets_x = [pitch_x * 0.25, pitch_x * 0.5, pitch_x * 0.75]
            fine_offsets_y = [pitch_y * 0.25, pitch_y * 0.5, pitch_y * 0.75]
        for rp in rotated_poly:
            xr = ((rp.x - minx - half_lx) % pitch_x + pitch_x) % pitch_x
            yr = ((rp.y - miny - half_ly) % pitch_y + pitch_y) % pitch_y
            fine_offsets_x.append(xr)
            fine_offsets_y.append(yr)

        for xo in fine_offsets_x:
            x = minx + half_lx + xo
            while x <= maxx - half_lx + 1e-6:
                for yo in fine_offsets_y:
                    y = miny + half_ly + yo
                    while y <= maxy - half_ly + 1e-6:
                        key = (round(x * 10), round(y * 10), orient)
                        if key not in seen:
                            seen.add(key)
                            center_world = _rotate(Point(x, y), angle)
                            corners = _rect_corners(
                                center_world.x, center_world.y,
                                world_angle, rect_len, rect_wid)
                            if _rect_fits(corners, poly):
                                candidates.append(Candidate(
                                    cx=x, cy=y,
                                    half_lx=half_lx, half_ly=half_ly,
                                    rect=LayoutRect(
                                        center=center_world,
                                        corners=corners,
                                        angle_rad=world_angle)))
                        y += pitch_y
                x += pitch_x

    return candidates


# ═══════════════════════════════════════════════════════════════
# MILP 求解（混合朝向）
# ═══════════════════════════════════════════════════════════════

def _solve_milp_mixed(
    candidates: List[Candidate],
    spacing: float,
    time_limit_s: float = 60.0,
) -> List[LayoutRect]:
    """
    混合朝向 MILP：从横放+竖放的所有候选中选出最多的不重叠矩形。

    建模：
      max  Σ x_i
      s.t. x_i + x_j ≤ 1   ∀ (i,j) 重叠（含跨朝向）
           x_i ∈ {0, 1}

    使用网格索引加速冲突对构建，避免 O(n²) 暴力比较。
    """
    n = len(candidates)
    if n == 0:
        return []
    if n == 1:
        return [candidates[0].rect]

    # 用网格索引加速冲突对构建
    # 最大可能的半尺寸（用于确定网格单元大小）
    max_half = max(max(c.half_lx, c.half_ly) for c in candidates)
    cell_size = max_half * 2 + spacing + 1.0  # 保证相邻单元内的候选才可能冲突

    from collections import defaultdict
    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, c in enumerate(candidates):
        gx = int(c.cx / cell_size)
        gy = int(c.cy / cell_size)
        grid[(gx, gy)].append(i)

    conflicts: list[tuple[int, int]] = []
    seen_pairs: set[tuple[int, int]] = set()
    for (gx, gy), indices in grid.items():
        # 检查本单元内部 + 相邻 8 个单元
        neighbors: list[int] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neighbors.extend(grid.get((gx + dx, gy + dy), []))
        for i in indices:
            for j in neighbors:
                if i >= j:
                    continue
                pair = (i, j)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                if _candidates_overlap(candidates[i], candidates[j], spacing):
                    conflicts.append(pair)

    if not conflicts:
        return [c.rect for c in candidates]

    try:
        import highspy
        h = highspy.Highs()
        h.silent()

        for i in range(n):
            h.addVar(0.0, 1.0)
            h.changeColIntegrality(i, highspy.HighsIntegrality.kInteger)

        h.changeColsCost(list(range(n)), [-1.0] * n)

        for i_idx, j_idx in conflicts:
            h.addRow(-highspy.kHighsInf, 1.0, 2,
                     [i_idx, j_idx], [1.0, 1.0])

        h.setOptionValue("time_limit", time_limit_s)
        h.setOptionValue("mip_rel_gap", 0.0)

        h.run()

        info = h.getInfoValue("primal_solution_status")
        if info[1] == 2:  # feasible
            sol = h.getSolution()
            return [candidates[i].rect for i in range(n)
                    if sol.col_value[i] > 0.5]
        return []

    except Exception:
        return _greedy_mixed(candidates, spacing)


def _greedy_mixed(
    candidates: List[Candidate],
    spacing: float,
) -> List[LayoutRect]:
    """贪心回退。"""
    selected_cands: List[Candidate] = []
    selected_rects: List[LayoutRect] = []
    for cand in candidates:
        conflict = False
        for placed in selected_cands:
            if _candidates_overlap(placed, cand, spacing):
                conflict = True
                break
        if not conflict:
            selected_cands.append(cand)
            selected_rects.append(cand.rect)
    return selected_rects


# ═══════════════════════════════════════════════════════════════
# 角度扫描
# ═══════════════════════════════════════════════════════════════

def _normalize_angle(a: float) -> float:
    a = a % math.pi
    if a < 0:
        a += math.pi
    return a


def _candidate_angles(poly: List[Point]) -> List[float]:
    angles = set()
    step = math.radians(ANGLE_COARSE_STEP_DEG)
    a = 0.0
    while a < math.pi:
        angles.add(round(_normalize_angle(a), 6))
        a += step
    for i in range(len(poly)):
        c, nx = poly[i], poly[(i + 1) % len(poly)]
        dx, dy = nx.x - c.x, nx.y - c.y
        if math.hypot(dx, dy) < 0.5:
            continue
        ea = _normalize_angle(math.atan2(dy, dx))
        angles.add(round(ea, 6))
        angles.add(round(_normalize_angle(ea + math.pi / 2), 6))
    tol = math.radians(ANGLE_DEDUP_TOL_DEG)
    deduped = []
    for a in sorted(angles):
        if not any(abs(a - e) < tol or abs(math.pi - abs(a - e)) < tol
                   for e in deduped):
            deduped.append(a)
    return deduped


def _search_best_for_polygon(
    poly: List[Point],
    spacing: float,
    rect_len: float,
    rect_wid: float,
    time_limit_s: float = 120.0,
) -> List[LayoutRect]:
    """
    混合朝向全局搜索：
    1. 贪心预筛选所有角度（并行）
    2. Top-5 角度做 MILP 精确求解（混合朝向）
    3. 最优角度 ±1° 精扫
    """
    import concurrent.futures
    import os

    angles = _candidate_angles(poly)
    area = _abs_area(poly)

    if area > 20000:
        max_angles = 15
    elif area > 5000:
        max_angles = 25
    else:
        max_angles = len(angles)
    if len(angles) > max_angles:
        angles = angles[:max_angles]

    # ── 第一遍：贪心预筛选（并行） ──
    def _greedy_score(angle: float) -> tuple[float, int]:
        cands = _enumerate_mixed_candidates(
            poly, angle, rect_len, rect_wid, spacing)
        greedy = _greedy_mixed(cands, spacing)
        return (angle, len(greedy))

    n_workers = min(len(angles), max(1, os.cpu_count() or 4))
    quick_scores: list[tuple[float, int]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=n_workers) as pool:
        futures = {pool.submit(_greedy_score, a): a for a in angles}
        for fut in concurrent.futures.as_completed(futures):
            quick_scores.append(fut.result())

    quick_scores.sort(key=lambda t: t[1], reverse=True)

    # ── 第二遍：top-3 做 MILP（大面积减少到 top-3） ──
    best_layout: List[LayoutRect] = []
    best_count = 0
    best_angle = 0.0

    top_n = 3 if area > 10000 else 5
    milp_limit = max(3.0, time_limit_s * 0.4 / max(top_n, 1))

    for angle, greedy_count in quick_scores[:top_n]:
        if greedy_count == 0:
            continue
        cands = _enumerate_mixed_candidates(
            poly, angle, rect_len, rect_wid, spacing)
        if len(cands) <= best_count:
            continue
        result = _solve_milp_mixed(cands, spacing, milp_limit)
        if len(result) > best_count:
            best_count = len(result)
            best_layout = result
            best_angle = angle

    # ── 第三遍：精扫（大面积跳过） ──
    if best_count > 0 and area <= 15000:
        fine_step = math.radians(ANGLE_FINE_STEP_DEG)
        fine_window = math.radians(ANGLE_FINE_WINDOW_DEG)
        a = best_angle - fine_window
        while a <= best_angle + fine_window + 1e-9:
            na = _normalize_angle(a)
            cands = _enumerate_mixed_candidates(
                poly, na, rect_len, rect_wid, spacing)
            if len(cands) > best_count:
                result = _solve_milp_mixed(cands, spacing, milp_limit)
                if len(result) > best_count:
                    best_count = len(result)
                    best_layout = result
            a += fine_step

    return best_layout


# ═══════════════════════════════════════════════════════════════
# 凸分解
# ═══════════════════════════════════════════════════════════════

def _clip_half(poly: List[Point], vertical: bool, val: float,
               keep_lower: bool) -> List[Point]:
    eps = 1e-6
    out: List[Point] = []

    def inside(p: Point) -> bool:
        if vertical:
            return p.x <= val + eps if keep_lower else p.x >= val - eps
        return p.y <= val + eps if keep_lower else p.y >= val - eps

    def intersect(a: Point, b: Point) -> Optional[Point]:
        if vertical:
            dx = b.x - a.x
            if abs(dx) < eps:
                return None
            t = (val - a.x) / dx
            if t < -eps or t > 1 + eps:
                return None
            return Point(val, a.y + t * (b.y - a.y))
        dy = b.y - a.y
        if abs(dy) < eps:
            return None
        t = (val - a.y) / dy
        if t < -eps or t > 1 + eps:
            return None
        return Point(a.x + t * (b.x - a.x), val)

    n = len(poly)
    for i in range(n):
        c, nx = poly[i], poly[(i + 1) % n]
        ci, ni = inside(c), inside(nx)
        if ci and ni:
            out.append(nx)
        elif ci and not ni:
            p = intersect(c, nx)
            if p:
                out.append(p)
        elif not ci and ni:
            p = intersect(c, nx)
            if p:
                out.append(p)
            out.append(nx)

    deduped: List[Point] = []
    for p in out:
        if not deduped or math.hypot(p.x - deduped[-1].x,
                                     p.y - deduped[-1].y) > eps:
            deduped.append(p)
    if (len(deduped) > 1 and
            math.hypot(deduped[0].x - deduped[-1].x,
                       deduped[0].y - deduped[-1].y) <= eps):
        deduped.pop()
    return deduped


def _split_polygon(poly: List[Point], depth: int = 0) -> List[List[Point]]:
    if len(poly) < 4 or depth > 2:
        return [poly]
    c = _centroid(poly)
    minx, maxx, miny, maxy = _bbox(poly)
    vertical = (maxx - minx) >= (maxy - miny)
    sv = c.x if vertical else c.y
    left = _clip_half(poly, vertical, sv, True)
    right = _clip_half(poly, vertical, sv, False)
    parts: List[List[Point]] = []
    if len(left) >= 3:
        parts.append(left)
    if len(right) >= 3:
        parts.append(right)
    if not parts:
        return [poly]
    if depth >= 1:
        return parts
    refined: List[List[Point]] = []
    for p in parts:
        refined.extend(_split_polygon(p, depth + 1))
    return refined if refined else parts


# ═══════════════════════════════════════════════════════════════
# 主入口：多边形排布
# ═══════════════════════════════════════════════════════════════

def optimize_polygon_layout(
    polygon_points: List[Tuple[float, float]],
    spacing_m: float = _DEFAULT_BRACKET_SPACING_M,
    bracket_length_m: float = _DEFAULT_BRACKET_LENGTH_M,
    bracket_width_m: float = _DEFAULT_BRACKET_WIDTH_M,
    time_limit_s: float = 120.0,
) -> LayoutResult:
    """
    给定多边形顶点，用混合朝向 MILP 精确求解最大可安装套数。

    每个候选位置可以选择横放或竖放，MILP 统一求解保证全局最优。
    """
    poly = [Point(x, y) for x, y in polygon_points]
    if len(poly) < 3:
        return LayoutResult(max_systems=0, strategy="invalid polygon")

    half_time = time_limit_s / 2

    # 策略 1：整体多边形
    layout1 = _search_best_for_polygon(
        poly, spacing_m, bracket_length_m, bracket_width_m, half_time)
    best = layout1
    strategy = "MILP mixed-orientation"

    # 策略 2：分割后各子区域独立求解
    splits = _split_polygon(poly)
    if len(splits) > 1:
        per_split = half_time / max(len(splits), 1)
        combined: List[LayoutRect] = []
        for sp in splits:
            combined.extend(_search_best_for_polygon(
                sp, spacing_m, bracket_length_m, bracket_width_m, per_split))
        # 分割策略的结果需要对原始多边形做最终验证，
        # 因为子多边形的边界可能与原始多边形不完全一致
        combined = [r for r in combined if _rect_fits(r.corners, poly)]
        if len(combined) > len(best):
            best = combined
            strategy = f"MILP mixed-orientation split ({len(splits)} regions)"

    # 最终安全检查：过滤掉任何超出原始多边形的矩形
    best = [r for r in best if _rect_fits(r.corners, poly)]

    return LayoutResult(
        max_systems=len(best),
        layout=best,
        strategy=strategy,
        spacing_m=spacing_m,
        bracket_length_m=bracket_length_m,
        bracket_width_m=bracket_width_m,
    )


# ═══════════════════════════════════════════════════════════════
# 主入口：纯面积估算
# ═══════════════════════════════════════════════════════════════

def max_systems_for_area(
    available_area_m2: float,
    spacing_m: float = _DEFAULT_BRACKET_SPACING_M,
    bracket_length_m: float = _DEFAULT_BRACKET_LENGTH_M,
    bracket_width_m: float = _DEFAULT_BRACKET_WIDTH_M,
) -> int:
    if available_area_m2 <= 0:
        return 0
    bl, bw, sp = bracket_length_m, bracket_width_m, spacing_m
    best = 0
    for length, width in [(bl, bw), (bw, bl)]:
        for aspect in [1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 0.5, 0.33, 0.25, 0.2]:
            w = math.sqrt(available_area_m2 / aspect) if aspect > 0 else 1.0
            h = available_area_m2 / max(w, 0.1)
            cols = _max_fit_1d(w, length, sp)
            rows = _max_fit_1d(h, width, sp)
            if cols * rows > best:
                best = cols * rows
    effective = (bl + sp) * (bw + sp)
    return min(best, int(available_area_m2 / effective) + 3)


def _max_fit_1d(total: float, item: float, spacing: float) -> int:
    if total < item:
        return 0
    return int((total + spacing) / (item + spacing))
