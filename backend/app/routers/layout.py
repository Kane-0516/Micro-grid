"""路由：POST /api/layout/optimize.

基于多边形顶点或纯面积，用 MILP 精确求解最大可安装微电网支架套数.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.catalog import get_catalog
from app.services.layout_optimizer import (
    max_systems_for_area,
    optimize_polygon_layout,
)

router = APIRouter(prefix="/api", tags=["layout"])


def _catalog_bracket_defaults() -> tuple[float, float, float]:
    """Read bracket spacing/length/width from product catalog."""
    cat = get_catalog()
    bracket = cat.bracket()
    spacing = cat.bracket_spacing_m()
    return spacing, bracket.footprint_length_m, bracket.footprint_width_m


class LayoutOptimizeRequest(BaseModel):
    """Input parameters for POST /api/layout/optimize."""

    polygon: Optional[List[List[float]]] = Field(
        None,
        description="多边形顶点列表 [[x1,y1],[x2,y2],...] 本地坐标（米）",
    )
    availableAreaM2: Optional[float] = Field(
        None,
        description="可用面积（m²），当无多边形时使用",
    )
    spacingM: Optional[float] = Field(
        None, description="相邻支架间距（m），默认从产品目录读取"
    )
    bracketLengthM: Optional[float] = Field(
        None, description="支架长度（m），默认从产品目录读取"
    )
    bracketWidthM: Optional[float] = Field(
        None, description="支架宽度（m），默认从产品目录读取"
    )
    timeLimitS: float = Field(120.0, description="求解时间限制（秒）")


class RectPosition(BaseModel):
    """One placed bracket rectangle in the layout result."""

    centerX: float
    centerY: float
    corners: List[List[float]]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]


class LayoutOptimizeResponse(BaseModel):
    """Response envelope for POST /api/layout/optimize."""

    success: bool
    maxSystems: int
    strategy: str = ""
    spacingM: float = 0.0
    bracketLengthM: float = 0.0
    bracketWidthM: float = 0.0
    rectangles: Optional[List[RectPosition]] = None
    error: Optional[str] = None


@router.post("/layout/optimize", response_model=LayoutOptimizeResponse)
def layout_optimize(req: LayoutOptimizeRequest):
    """计算给定区域内最大可安装支架套数（MILP 精确求解）."""
    try:
        # Read defaults from product catalog, allow request overrides
        cat_spacing, cat_length, cat_width = _catalog_bracket_defaults()
        spacing = req.spacingM if req.spacingM is not None else cat_spacing
        length = (
            req.bracketLengthM if req.bracketLengthM is not None else cat_length
        )
        width = (
            req.bracketWidthM if req.bracketWidthM is not None else cat_width
        )

        # 面积上限校验
        cat = get_catalog()
        max_area = cat.site_layout().get("max_layout_area_m2", 40000)

        if req.polygon and len(req.polygon) >= 3:
            points = [(p[0], p[1]) for p in req.polygon]
            # 计算多边形面积（鞋带公式）
            poly_area = abs(
                sum(
                    points[i][0] * points[(i + 1) % len(points)][1]
                    - points[(i + 1) % len(points)][0] * points[i][1]
                    for i in range(len(points))
                )
                / 2.0
            )
            if poly_area > max_area:
                return LayoutOptimizeResponse(
                    success=False,
                    maxSystems=0,
                    error=f"area_too_large:{poly_area:.0f}:{max_area:.0f}",
                )

            result = optimize_polygon_layout(
                polygon_points=points,
                spacing_m=spacing,
                bracket_length_m=length,
                bracket_width_m=width,
                time_limit_s=req.timeLimitS,
            )
            rects = [
                RectPosition(
                    centerX=r.center.x,
                    centerY=r.center.y,
                    corners=[[c.x, c.y] for c in r.corners],
                )
                for r in result.layout
            ]
            return LayoutOptimizeResponse(
                success=True,
                maxSystems=result.max_systems,
                strategy=result.strategy,
                spacingM=result.spacing_m,
                bracketLengthM=result.bracket_length_m,
                bracketWidthM=result.bracket_width_m,
                rectangles=rects,
            )
        elif req.availableAreaM2 and req.availableAreaM2 > 0:
            count = max_systems_for_area(
                available_area_m2=req.availableAreaM2,
                spacing_m=spacing,
                bracket_length_m=length,
                bracket_width_m=width,
            )
            return LayoutOptimizeResponse(
                success=True,
                maxSystems=count,
                strategy="area-based estimate",
                spacingM=spacing,
                bracketLengthM=length,
                bracketWidthM=width,
            )
        else:
            return LayoutOptimizeResponse(
                success=False,
                maxSystems=0,
                error="Must provide either polygon or availableAreaM2",
            )
    except Exception as exc:
        import traceback

        return LayoutOptimizeResponse(
            success=False,
            maxSystems=0,
            error=f"{exc}\n{traceback.format_exc()}",
        )
