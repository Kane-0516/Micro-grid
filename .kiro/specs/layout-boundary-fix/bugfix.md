# Bugfix Requirements Document

## Introduction

在使用 MILP 混合朝向优化进行支架布局时，部分支架矩形超出了用户框选的场地多边形边界。根本原因是 `_rect_fits` 函数仅通过 9 个离散采样点（4 个角点 + 4 个边中点 + 1 个中心点）来判断矩形是否在多边形内。对于 28m × 5.6m 的支架尺寸，长边上相邻采样点之间的间距高达 14m，当多边形边界从两个采样点之间穿过时，矩形会被错误地判定为"适合"，导致支架部分区域超出场地边界。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a bracket rectangle's long edge (28m) is near a polygon boundary AND the polygon boundary crosses between two adjacent sample points (up to 14m apart) THEN the system incorrectly determines the rectangle fits within the polygon, resulting in a bracket that partially extends outside the boundary

1.2 WHEN a bracket rectangle's short edge (5.6m) is near a polygon boundary AND the polygon boundary crosses between a corner and the midpoint (up to 2.8m apart) THEN the system may incorrectly determine the rectangle fits within the polygon, resulting in a bracket that partially extends outside the boundary

1.3 WHEN the polygon has a concave indentation that is narrower than the gap between sample points THEN the system fails to detect the intrusion and places a bracket that overlaps the concave region outside the polygon

### Expected Behavior (Correct)

2.1 WHEN a bracket rectangle's long edge is near a polygon boundary THEN the system SHALL detect any intersection between the rectangle edges and the polygon edges, and reject the placement if any part of the rectangle extends outside the polygon

2.2 WHEN a bracket rectangle's short edge is near a polygon boundary THEN the system SHALL detect any intersection between the rectangle edges and the polygon edges, and reject the placement if any part of the rectangle extends outside the polygon

2.3 WHEN the polygon has a concave indentation THEN the system SHALL detect any intersection between the rectangle edges and the polygon boundary at the concavity, and reject the placement if any part of the rectangle extends outside the polygon

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a bracket rectangle is fully contained within the polygon with all edges well inside the boundary THEN the system SHALL CONTINUE TO accept the placement as valid

3.2 WHEN a bracket rectangle has any corner outside the polygon THEN the system SHALL CONTINUE TO reject the placement as invalid

3.3 WHEN a bracket rectangle has any edge midpoint outside the polygon THEN the system SHALL CONTINUE TO reject the placement as invalid

3.4 WHEN the polygon is convex and large enough to contain multiple brackets THEN the system SHALL CONTINUE TO find the optimal layout with the maximum number of non-overlapping brackets

3.5 WHEN spacing constraints between adjacent brackets are specified THEN the system SHALL CONTINUE TO enforce the minimum spacing requirement between all placed brackets
