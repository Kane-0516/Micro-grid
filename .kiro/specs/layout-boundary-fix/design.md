# Layout Boundary Fix — Bugfix Design

## Overview

`_rect_fits` 函数使用 9 个离散采样点（4 角 + 4 边中点 + 1 中心）判断矩形是否在多边形内。对于 28m × 5.6m 的支架，长边上相邻采样点间距高达 14m，多边形边界可从两点之间穿过而不被检测到，导致支架部分超出场地。

修复方案：在现有点包含检测的基础上，增加线段-线段相交检测——检查矩形的每条边是否与多边形的任何边相交。若存在交叉则判定矩形不适合。这是一个纯几何补充，不改变现有的点采样逻辑，仅在所有采样点都通过后再做边相交检查。

## Glossary

- **Bug_Condition (C)**: 矩形的某条边与多边形的某条边相交，但所有 9 个采样点均在多边形内部，导致 `_rect_fits` 错误返回 `True`
- **Property (P)**: 当矩形任何边与多边形任何边相交时，`_rect_fits` 应返回 `False`
- **Preservation**: 对于所有采样点均在多边形内且矩形边不与多边形边相交的情况（即矩形完全在多边形内），`_rect_fits` 应继续返回 `True`；对于任何采样点在多边形外的情况，应继续返回 `False`
- **`_rect_fits`**: `backend/app/services/layout_optimizer.py` 中的函数，判断由四个角点定义的矩形是否完全在多边形内
- **`_rect_test_points`**: 从矩形四角生成 9 个测试点（4 角 + 4 边中点 + 1 中心）的函数
- **`_point_in_polygon`**: 射线法点包含测试函数
- **Segment intersection**: 两条线段在各自端点范围内是否有交点

## Bug Details

### Bug Condition

当支架矩形的边靠近多边形边界时，如果多边形边界恰好从两个相邻采样点之间穿过，`_rect_fits` 无法检测到矩形已部分超出多边形。这在长边（28m）上尤为严重，因为相邻采样点间距可达 14m。

**Formal Specification:**
```
FUNCTION isBugCondition(rect_corners, polygon)
  INPUT: rect_corners of type List[Point], polygon of type List[Point]
  OUTPUT: boolean

  // All 9 sample points pass the point-in-polygon test
  test_points := generateTestPoints(rect_corners)  // 4 corners + 4 midpoints + 1 center
  all_points_inside := ALL p IN test_points: pointInPolygon(p, polygon)

  // But at least one rectangle edge intersects a polygon edge
  has_edge_intersection := EXISTS rect_edge IN edges(rect_corners):
    EXISTS poly_edge IN edges(polygon):
      segmentsIntersect(rect_edge, poly_edge)

  RETURN all_points_inside AND has_edge_intersection
END FUNCTION
```

### Examples

- **Long edge crossing**: A 28m × 5.6m rectangle placed so its 28m edge is near a polygon boundary. The boundary crosses the long edge at the 7m mark (between corner at 0m and midpoint at 14m). All 9 sample points are inside, but the rectangle extends ~7m outside the polygon. Current: `_rect_fits` returns `True`. Expected: `_rect_fits` returns `False`.
- **Diagonal boundary**: A polygon with a diagonal edge that crosses the rectangle's long edge between two sample points. The crossing creates a triangular region of the rectangle outside the polygon. Current: `_rect_fits` returns `True`. Expected: `_rect_fits` returns `False`.
- **Concave notch**: A polygon with a narrow concave notch (e.g., 5m wide) that intrudes into the rectangle area between sample points. All 9 points miss the notch. Current: `_rect_fits` returns `True`. Expected: `_rect_fits` returns `False`.
- **Short edge crossing** (less common): A 5.6m edge near a boundary that crosses between corner and midpoint (2.8m gap). Current: may return `True`. Expected: `_rect_fits` returns `False`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Rectangles fully contained within the polygon (all edges well inside) must continue to be accepted
- Rectangles with any corner outside the polygon must continue to be rejected
- Rectangles with any edge midpoint outside the polygon must continue to be rejected
- The MILP solver, greedy fallback, angle scanning, and candidate enumeration logic must remain unchanged
- Spacing enforcement between adjacent brackets must remain unchanged
- Performance must remain acceptable — `_rect_fits` is called thousands of times during candidate enumeration

**Scope:**
All inputs where no rectangle edge intersects any polygon edge should be completely unaffected by this fix. This includes:
- Rectangles fully inside the polygon (no edge crossings)
- Rectangles with corners or midpoints outside the polygon (already rejected by point sampling)
- All other optimizer logic (MILP solving, overlap detection, angle scanning)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is:

1. **Insufficient sampling resolution**: `_rect_test_points` generates only 9 points — 4 corners, 4 edge midpoints, and 1 center. For a 28m × 5.6m rectangle, the maximum gap between adjacent sample points on the long edge is 14m (corner to midpoint). Any polygon boundary that crosses within this 14m gap goes undetected.

2. **Missing edge intersection check**: The `_rect_fits` function relies entirely on point-in-polygon tests. It never checks whether the rectangle's edges cross the polygon's edges. A proper containment test requires both: (a) all rectangle vertices inside the polygon, AND (b) no rectangle edge intersects any polygon edge.

3. **Geometric completeness gap**: For a rectangle to be fully contained in a polygon, two conditions must hold:
   - All points of the rectangle are inside the polygon (approximated by the 9-point sample)
   - No edge of the rectangle crosses any edge of the polygon (currently not checked at all)
   
   The current code only checks condition (a) with a sparse approximation, and completely omits condition (b).

## Correctness Properties

Property 1: Bug Condition — Edge Intersection Detection

_For any_ rectangle and polygon where all 9 sample points (corners, midpoints, center) are inside the polygon BUT at least one rectangle edge intersects a polygon edge, the fixed `_rect_fits` function SHALL return `False`, correctly rejecting the placement.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Fully Contained Rectangles

_For any_ rectangle and polygon where the rectangle is fully contained within the polygon (all points inside AND no edge intersections), the fixed `_rect_fits` function SHALL return `True`, producing the same result as the original function.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `backend/app/services/layout_optimizer.py`

**Function**: `_rect_fits` (and new helper `_segments_intersect`)

**Specific Changes**:

1. **Add `_segments_intersect` helper function**: Implement a segment-segment intersection test using the cross-product orientation method. This is an O(1) operation per pair of segments.
   - Given segments (p1, p2) and (p3, p4), compute orientations of the four relevant triplets
   - Return `True` if the segments properly intersect (crossing, not just touching at endpoints)
   - Handle collinear/degenerate cases

2. **Add `_rect_edges_intersect_polygon` helper function**: Check whether any of the 4 rectangle edges intersects any of the N polygon edges.
   - Iterate over 4 rectangle edges × N polygon edges = 4N segment intersection tests
   - Short-circuit on first intersection found (return `True` immediately)
   - For typical polygons (N < 100), this is at most 400 comparisons — negligible cost

3. **Modify `_rect_fits`**: After the existing point-in-polygon check passes for all 9 sample points, add the edge intersection check.
   - If any rectangle edge intersects any polygon edge, return `False`
   - This is a pure addition — the existing point sampling logic is unchanged

4. **Performance consideration**: The edge intersection check runs only when all 9 sample points pass. Most rejected candidates are already caught by the point sampling (corners outside), so the edge check is only invoked for candidates near the boundary — a small fraction of total calls.

5. **No changes to other functions**: `_enumerate_mixed_candidates`, `_solve_milp_mixed`, `_candidates_overlap`, `_search_best_for_polygon`, and `optimize_polygon_layout` remain unchanged.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Construct specific rectangle/polygon pairs where the rectangle edge crosses the polygon boundary between sample points. Run `_rect_fits` on the UNFIXED code and observe that it incorrectly returns `True`.

**Test Cases**:
1. **Long edge crossing test**: Create a polygon boundary that crosses the 28m edge at the 7m mark (between corner at 0m and midpoint at 14m). Verify `_rect_fits` returns `True` on unfixed code (will fail — demonstrates the bug).
2. **Diagonal boundary test**: Create a polygon with a diagonal edge crossing the rectangle's long edge between sample points. Verify `_rect_fits` returns `True` on unfixed code (will fail — demonstrates the bug).
3. **Concave notch test**: Create a polygon with a narrow concave notch between sample points. Verify `_rect_fits` returns `True` on unfixed code (will fail — demonstrates the bug).
4. **Short edge crossing test**: Create a polygon boundary crossing the 5.6m edge between corner and midpoint. Verify behavior on unfixed code (may fail — demonstrates the bug).

**Expected Counterexamples**:
- `_rect_fits` returns `True` for rectangles that visibly extend outside the polygon
- Root cause confirmed: no edge intersection check exists in the current code

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL (rect_corners, polygon) WHERE isBugCondition(rect_corners, polygon) DO
  result := _rect_fits_fixed(rect_corners, polygon)
  ASSERT result == False
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL (rect_corners, polygon) WHERE NOT isBugCondition(rect_corners, polygon) DO
  ASSERT _rect_fits_original(rect_corners, polygon) == _rect_fits_fixed(rect_corners, polygon)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random rectangle/polygon combinations across the input domain
- It catches edge cases (near-boundary placements, degenerate polygons, various aspect ratios)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Capture behavior of `_rect_fits` on UNFIXED code for various non-buggy inputs (fully inside, clearly outside), then write property-based tests verifying the fixed function matches.

**Test Cases**:
1. **Fully contained preservation**: Generate random rectangles well inside random convex polygons. Verify both original and fixed return `True`.
2. **Corner-outside preservation**: Generate random rectangles with at least one corner outside the polygon. Verify both original and fixed return `False`.
3. **Midpoint-outside preservation**: Generate random rectangles with all corners inside but at least one midpoint outside. Verify both original and fixed return `False`.
4. **Large convex polygon preservation**: Verify that for large convex polygons, the optimizer finds the same or better layout count with the fix.

### Unit Tests

- Test `_segments_intersect` with known intersecting and non-intersecting segment pairs
- Test `_segments_intersect` with collinear, parallel, and degenerate segments
- Test `_rect_edges_intersect_polygon` with rectangles that cross polygon boundaries
- Test `_rect_fits` with the specific bug-triggering examples from Bug Details
- Test `_rect_fits` with fully contained rectangles (should still return `True`)

### Property-Based Tests

- Generate random rectangles and polygons; verify that when `_rect_fits` returns `True`, no rectangle edge actually intersects any polygon edge (fix correctness)
- Generate random fully-contained rectangles inside convex polygons; verify `_rect_fits` returns `True` (preservation)
- Generate random rectangles with corners outside polygons; verify `_rect_fits` returns `False` (preservation)

### Integration Tests

- Run `optimize_polygon_layout` on a polygon known to trigger the bug; verify no bracket extends outside the boundary
- Run `optimize_polygon_layout` on a large convex polygon; verify bracket count is equal to or better than before the fix
- Run `optimize_polygon_layout` on a concave polygon with narrow notches; verify no bracket overlaps the notch
