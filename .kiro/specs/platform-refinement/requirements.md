# Requirements Document

## Introduction

VoltageEnergy MicroGrid Configuration System 是一个离网微电网选型配置平台，面向美国和中国市场的工商业客户。当前系统已具备基本功能（选址、负荷输入、PV/储能/柴发选型、经济分析），但美国团队在实际使用中反馈了大量 UX 不一致、术语模糊、数据矛盾和功能缺失问题。本次改进旨在系统性地修复这些问题，使平台从 Demo 状态向可落地使用的产品级质量演进。

## Glossary

- **Bracket Set**: 一套标准折叠光伏支架，默认容纳 32 块面板（2 行 × 16 列），物理尺寸 28 m × 5.6 m，本体占地 156.8 m²
- **Bracket Spacing**: 相邻支架之间的最小间距，从产品库 `products.yaml` 的 `bracket_systems.spacing_m` 字段读取（默认 3.048 m / 10 ft），可配置
- **Usable Area**: 场地面积中实际被支架本体占用的面积（= 最大可安装套数 × 单套支架本体面积），不含间距
- **Usable Area**: 实际可用于安装的净面积，默认等于 Measured Area，用户可手动调整
- **Maximum Installable Sets**: 在给定可用面积内，经排布算法计算后可安装的最大支架套数
- **Layout Optimizer**: 多边形排布优化引擎，通过角度扫描 × 双朝向 × 偏移扫描 × 多边形分割，在满足间距约束下最大化支架套数
- **Spacing-Aware Area Estimate**: 基于间距修正的面积估算方法，替代简单的 area ÷ footprint 除法，考虑行列间距和场地长宽比
- **Known-Load Solution**: 已知年用电量（kWh/年）的配置路径，系统自动优化 PV/储能/柴发容量
- **DIY Solution**: 用户直接指定设备参数（电压、电流、逆变器、支架、电池包）的配置路径
- **Standard Product**: 预定义的光储柴一体化产品规格（小型/中型/大型）
- **Solar Parameters**: 基于 NASA POWER 数据的站点日照评估参数（峰值日照时数、年等效小时数、年辐照量）
- **Pelias**: 本地部署的开源地理编码服务，提供正向/反向地址解析
- **MQ Power DCA20SPXU4F**: 公司已采购的 20kW 柴油发电机组型号
- **ConfigData**: 前端核心业务数据容器，贯穿整个配置流程
- **PV Capacity**: 光伏装机容量（kWp），等于支架套数 × 每套面板数 × 单块功率

## Requirements

### Requirement 1: Address Search Enhancement

**User Story:** As a US-based project developer, I want to search for specific street addresses (e.g., "6400 Durham Rd, Timberlake, NC"), so that I can precisely locate project sites without manually navigating the map.

#### Acceptance Criteria

1. WHEN a user enters a full US street address and clicks Search, THE System SHALL return geocoding results that include street-level matches from the Pelias geocoder.
2. WHEN the Pelias geocoder returns no results for a US address query, THE System SHALL display a clear message suggesting the user try a nearby city name, ZIP code, or use the map to select the site manually.
3. WHEN the geocoder query contains non-Chinese characters, THE System SHALL set the `country_code` parameter to `us` and pass the full query text to Pelias without truncation.
4. WHEN the Pelias geocoder is unavailable, THE System SHALL display a specific error message distinguishing between "Pelias not running" and "network unreachable" conditions, and offer alternative input methods (current location, map click).

### Requirement 2: PV Bracket Set Definition Clarity

**User Story:** As a first-time user, I want to clearly understand what "1 PV bracket set" means in physical terms, so that I can make informed decisions about system sizing.

#### Acceptance Criteria

1. WHEN the bracket selection step is displayed, THE System SHALL show an explanation block stating the physical layout: number of panels, row × column arrangement, physical dimensions (28 m × 5.6 m), and footprint area (156.8 m²).
2. WHEN a user selects a different bracket model (e.g., compact_16, large_48), THE System SHALL update the explanation block to reflect the selected model's panel count, arrangement, and area.
3. WHEN displaying bracket area values, THE System SHALL use the precise calculated value (e.g., 156.8 m² for standard_32) rather than rounded approximations.

### Requirement 3: Site Area Assessment Accuracy (Revised)

**User Story:** As a project engineer, I want the site area input to be simple ("Site Area") and the assessment to show only meaningful derived values (Usable Area and Maximum Installable Sets), so that I can quickly understand what fits on my site without redundant or confusing metrics.

#### Acceptance Criteria

1. WHEN the area input field is displayed, THE System SHALL label it as "Site Area" (场地面积) instead of "Usable Area" or "Enter usable area".
2. WHEN a user draws a polygon on the map, THE System SHALL write the measured polygon area back into the "Site Area" input field.
3. WHEN displaying site assessment results, THE System SHALL show only two derived metrics: "Usable Area" (可用面积) and "Maximum Installable Sets" (最大可安装套数), without displaying "Measured Area" or "Estimated Minimum Footprint".
4. THE "Usable Area" metric SHALL be computed by the backend layout optimizer, representing the effective area after accounting for the 10 ft (3.048 m) spacing between bracket sets.
5. WHEN displaying area values, THE System SHALL show ft² as the primary unit and m² as the secondary unit (e.g., "11,840 ft² (1,100 m²)").
6. WHEN displaying area per set in the reference section, THE System SHALL show the precise value (1,687.8 ft² / 156.8 m² for standard_32) with ft² first.

### Requirement 4: PV Capacity Display Optimization

**User Story:** As a user reviewing site assessment results, I want to quickly look up PV capacity for a specific set count without visual clutter, so that I can evaluate options efficiently.

#### Acceptance Criteria

1. WHEN the site assessment shows PV capacity by set count, THE System SHALL present it as a dropdown selector instead of a flat list of badges.
2. WHEN a user selects a set count from the dropdown, THE System SHALL display the corresponding PV capacity (kW) prominently next to the dropdown.
3. WHEN the maximum installable sets exceeds 10, THE System SHALL use the dropdown format to avoid excessive horizontal scrolling.

### Requirement 5: Standard Product Diesel Generator Correction

**User Story:** As a sales engineer, I want the Small PV-Storage-Diesel standard product to reflect the actual MQ Power DCA20SPXU4F generator (≈20 kW) that the company has purchased, so that product specifications match real inventory.

#### Acceptance Criteria

1. THE Standard Product page for "Small PV-Storage-Diesel" SHALL display a diesel generator capacity of 20 kW.
2. WHEN the existing generator option is selected in the diesel generator step, THE System SHALL default to 20 kW (matching MQ Power DCA20SPXU4F) instead of 40 kW.
3. WHEN displaying preset generator capacity buttons, THE System SHALL include a label "(MQ Power)" next to the 20 kW option to indicate the reference equipment.

### Requirement 6: Known-Load vs DIY Scenario Differentiation

**User Story:** As a new user, I want to clearly understand the difference between Known-Load Solution and DIY Solution before choosing, so that I can select the appropriate configuration path.

#### Acceptance Criteria

1. WHEN the scenario selection step is displayed, THE System SHALL show bilingual (EN/ZH) descriptions for each option that explain the input requirements, system behavior, and accuracy implications.
2. THE Known-Load Solution description SHALL state that it requires actual electricity consumption data (kWh/year) and that the system automatically optimizes PV, storage, and diesel sizing.
3. THE DIY Solution description SHALL state that the user specifies components directly and that economic analysis accuracy is ±20–30% since actual annual load is not provided.
4. THE Standard Product description SHALL state that no load data is needed and the system uses predefined integrated PV-storage tray configurations.

### Requirement 7: Solar Parameters Loading Reliability

**User Story:** As a user who has selected a project location, I want solar parameters to load reliably or show clear status feedback, so that I am not left waiting indefinitely.

#### Acceptance Criteria

1. WHEN solar parameters are being loaded, THE System SHALL display a visible loading indicator with descriptive text.
2. WHEN solar parameter loading fails, THE System SHALL display a specific error message indicating whether the failure is due to backend unavailability or a data retrieval issue.
3. WHEN the backend API becomes available after a previous failure, THE System SHALL automatically retry loading solar parameters for the current coordinates.
4. IF solar parameters fail to load after the retry, THEN THE System SHALL suggest the user refresh the page or reselect the site location.

### Requirement 8: Bilingual UI Consistency

**User Story:** As a bilingual user switching between English and Chinese, I want all UI text to be properly translated and contextually appropriate, so that the interface is professional in both languages.

#### Acceptance Criteria

1. WHEN the language is set to English, THE System SHALL display all step titles, descriptions, info messages, button labels, and result labels in English.
2. WHEN the language is set to Chinese, THE System SHALL display all corresponding text in Chinese.
3. WHEN a component contains hardcoded Chinese text (e.g., StepOptimize constraint panel), THE System SHALL replace it with bilingual text using the translation system.
4. WHEN displaying numeric values with units, THE System SHALL use locale-appropriate formatting (e.g., comma separators for English, no separator or wan for Chinese large numbers).

### Requirement 9: Project Documentation Structure

**User Story:** As a developer joining the project, I want a structured documentation directory that defines business boundaries, user journeys, assumptions, and decision records, so that I can understand the system context without reading all source code.

#### Acceptance Criteria

1. THE project SHALL contain a `docs/` directory with numbered documentation files covering: glossary, project scope, user personas, user journeys, business rules, state models, error matrix, design decisions, release checklist, assumptions, non-functional requirements, open questions, change log, scope versions, and deprecations.
2. THE project SHALL contain a `cases/` directory with happy path scenarios, edge cases, and a scenario inventory.
3. WHEN a business rule or calculation formula changes, THE System documentation SHALL be updated in the corresponding `docs/04_business_rules.md` file.
4. WHEN a design decision is made, THE decision SHALL be recorded in `docs/07_decisions.md` with context, options considered, and rationale.

### Requirement 10: Polygon-Based Layout Optimization for Maximum Microgrid System Count

**User Story:** As a US-based project developer, I want the system to calculate the maximum number of microgrid bracket sets that can physically fit within my site boundary (polygon or area input), respecting product spacing constraints, so that I get an accurate and optimized system count rather than a naive area-divided estimate.

#### Acceptance Criteria

1. WHEN a user draws a polygon on the site map, THE System SHALL run a layout optimization algorithm that places 28 m × 5.6 m bracket rectangles inside the polygon boundary, maintaining a minimum 10 ft (3.048 m) spacing between all neighboring sets, and return the maximum installable set count.
2. THE layout optimization algorithm SHALL try both bracket orientations (horizontal: long edge along scan direction; vertical: short edge along scan direction) at each candidate angle, and select the orientation that yields more sets for the given polygon shape.
3. THE layout optimization algorithm SHALL scan candidate angles including: uniform 5° steps across 0°–180°, polygon edge-aligned angles, and edge-perpendicular angles; then refine the top-3 scoring angles with ±2.5° fine-tuning at 2° steps.
4. THE layout optimization algorithm SHALL attempt automatic polygon splitting (bisecting along the longer axis through the centroid, up to 2 levels deep) and compare the split-region combined layout against the single-polygon layout, selecting whichever yields more sets.
5. WHEN a user enters a numeric area value (without drawing a polygon), THE System SHALL use a spacing-aware estimation formula that tries multiple hypothetical site aspect ratios (1:1 through 5:1) × two bracket orientations, applying the 1D packing formula `n ≤ (totalLength + spacing) / (itemLength + spacing)` per axis, and return the best achievable count — rather than the naive `area ÷ footprint` division.
6. THE backend SHALL expose a `POST /api/layout/optimize` endpoint that accepts either polygon vertices (local coordinates in meters) or a scalar `availableAreaM2`, and returns `{ maxSystems, strategy }`.
7. THE backend optimizer (`optimizer.py`) SHALL use the spacing-aware `max_systems_for_area()` function (instead of naive `area / area_per_set`) when capping `effective_max_sets` from `available_area_m2`.
8. WHEN the layout result is displayed on the map, THE System SHALL render each placed bracket as a numbered rectangle overlay inside the polygon, with a summary badge showing the total installable count.

### Requirement 11: Product Parameter Centralization

**User Story:** As a developer maintaining the system, I want all product-related parameters (bracket dimensions, spacing, tray sizes, installation costs, system efficiency, etc.) to be defined in a single source of truth (`products.yaml`), so that parameter changes only require editing one file instead of hunting through dozens of scattered hardcoded values across frontend and backend.

#### Acceptance Criteria

1. THE product catalog (`products.yaml`) SHALL contain the following parameters under `bracket_systems`: `spacing_m` (adjacent bracket minimum spacing), and per-model `footprint_length_m` and `footprint_width_m`.
2. THE product catalog SHALL contain the following parameters under a new `site_layout` section: `tray_length_m`, `tray_width_m`, `diesel_reserved_area_m2`, `inverters_per_tray`.
3. THE product catalog SHALL contain `pv_mounting_cost_per_set_usd` under `accessories` for bracket installation cost.
4. THE product catalog SHALL contain `system_efficiency` under a new `simulation_defaults` section for the PV system efficiency factor used in quick-estimate calculations.
5. WHEN the backend `layout_optimizer.py` performs layout calculations, THE System SHALL read `spacing_m`, `footprint_length_m`, and `footprint_width_m` from the product catalog instead of using hardcoded constants.
6. WHEN the backend `site_rules.py` calculates site area, THE System SHALL read tray dimensions, diesel reserved area, and inverters-per-tray from the product catalog instead of using hardcoded constants.
7. WHEN the backend `calculator.py` and `optimizer.py` compute costs, THE System SHALL read bracket mounting cost and battery pallet cost from the product catalog instead of using hardcoded values.
8. WHEN the frontend displays bracket dimensions, spacing, or area values in UI text (StepArea, Step2Brackets, StepDIYPvSetup, SiteAreaMap, StepOptimize, i18n translations), THE System SHALL derive these values from the product catalog data (fetched via `/api/products`) instead of using hardcoded string literals.
9. WHEN the frontend `SiteAreaMap.tsx` performs local polygon layout calculations, THE System SHALL use bracket dimensions and spacing from the products store instead of hardcoded constants.

### Requirement 12: Map-Centric Layout for Site Selection Steps

**User Story:** As a user selecting a project site on the map, I want the map to occupy the majority of the screen (70%) with the form panel taking only 30%, so that I have enough map area to accurately draw polygons and select locations.

#### Acceptance Criteria

1. WHEN the wizard is on a step that displays the site map (location step for Known-Load, area-setup step for DIY), THE System SHALL allocate approximately 70% of the horizontal layout width to the map panel (left) and 30% to the form panel (right).
2. WHEN the wizard is on any other step (load input, generator, voltage, EMS, etc.), THE System SHALL use the default 50/50 split between the left panel and the form panel.
3. WHEN the viewport width is below 1200px, THE System SHALL stack the panels vertically regardless of the map/form ratio.
