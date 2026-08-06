# Business Rules / 业务规则

## PV Capacity / 光伏容量
`pvKw = bracketSets × panelsPerSet × panelWatts / 1000`

- EN: PV capacity in kWp equals the number of bracket sets multiplied by panels per set and panel wattage, divided by 1000.
- 中文：光伏容量（kWp）= 支架套数 × 每套面板数 × 单块功率 ÷ 1000。

## Estimated Minimum Footprint / 预计最小占地面积
`footprint = sets × (bracketLength + spacing) × bracketWidth`

- bracketLength = 28 m, bracketWidth = 5.6 m, spacing = 3.048 m (10 ft)
- EN: Includes the required 10 ft gap between neighboring bracket sets.
- 中文：已计入相邻支架之间所需的 10 英尺（3.048 m）间距。

## Layout Optimization (MILP) / 排布优化（MILP）

- EN: Mixed-orientation — each candidate position can be placed horizontally or vertically. Spacing constraint ≥ 3.048 m in all directions. Solver: HiGHS with mip_rel_gap = 0.0. Angle scan: 2° coarse + 0.25° fine.
- 中文：混合朝向——每个候选位置可横放或竖放。间距约束：所有方向 ≥ 3.048 m。求解器：HiGHS，mip_rel_gap = 0.0。角度扫描：2° 粗扫 + 0.25° 精扫。

## Diesel Generator Sizing / 柴油发电机定容

- EN: Peak load × 1.2 → nearest standard capacity. MQ Power DCA20SPXU4F = 20 kW (default existing generator).
- 中文：峰值负荷 × 1.2 → 就近标准容量。MQ Power DCA20SPXU4F = 20 kW（默认已有柴发）。

## Battery Sizing / 储能定容
`targetKwh = pvKw × 3h × storageDays`
`numPacks = ceil(targetKwh / packCapacity)`

- EN: Target battery capacity is PV capacity times 3 hours times storage days. Number of packs is rounded up.
- 中文：目标电池容量 = PV 容量 × 3 小时 × 储能天数。电池包数量向上取整。

## Spacing-Aware Area Estimate / 间距修正面积估算
`n_per_axis = floor((totalLength + spacing) / (itemLength + spacing))`

- EN: Tries multiple site aspect ratios (1:1 through 5:1) × two bracket orientations, selects the best achievable count.
- 中文：尝试多种场地长宽比（1:1 到 5:1）× 两种支架朝向，取最优值。
