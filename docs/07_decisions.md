# Design Decisions / 设计决策

## D1: Default diesel capacity changed from 40 kW to 20 kW / 默认柴发容量从 40 kW 改为 20 kW

- EN: MQ Power DCA20SPXU4F is the actual purchased unit. Default existing generator set to 20 kW.
- 中文：MQ Power DCA20SPXU4F 是实际采购的机组。默认已有柴发改为 20 kW。
- Date / 日期: 2026-03

## D2: Layout optimization uses MILP instead of heuristic / 排布优化使用 MILP 替代启发式

- EN: Heuristic missed 2–4 sets on irregular polygons. MILP via HiGHS guarantees optimality per angle, acceptable runtime (< 2 min).
- 中文：启发式算法在不规则多边形上遗漏 2–4 套。通过 HiGHS 的 MILP 保证每个角度下的最优解，运行时间可接受（< 2 分钟）。
- Options considered / 考虑的方案: (a) Heuristic grid scan / 启发式网格扫描 (b) MILP exact solve / MILP 精确求解 (c) Genetic algorithm / 遗传算法
- Date / 日期: 2026-04

## D3: Mixed-orientation MILP / 混合朝向 MILP

- EN: Single-orientation MILP misses cases where part of an L-shape benefits from vertical placement. Both orientations enumerated as candidates in one MILP.
- 中文：单朝向 MILP 会遗漏 L 形场地中部分区域适合竖放的情况。两种朝向的候选位置在同一个 MILP 中统一求解。
- Date / 日期: 2026-04

## D4: Frontend layout removed, backend-only / 前端排布算法移除，统一到后端

- EN: Duplicate layout code in frontend and backend produced inconsistent results. Single backend engine; frontend calls API and renders results.
- 中文：前后端重复的排布代码导致结果不一致。统一为后端单一引擎，前端调 API 并渲染结果。
- Date / 日期: 2026-04

## D5: Footprint calculation includes spacing / 占地面积计算包含间距

- EN: Naive area ÷ footprint overestimates installable sets. Spacing-aware formula with multi-aspect-ratio scanning adopted.
- 中文：简单的面积÷占地会高估可安装套数。采用含间距修正的多长宽比扫描公式。
- Date / 日期: 2026-03
