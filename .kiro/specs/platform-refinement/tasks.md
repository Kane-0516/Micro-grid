# Implementation Plan

- [x] 1. Fix core data values and scenario descriptions







  - [x] 1.1 Update Step1Scenario with bilingual descriptions for Known-Load, DIY, and Standard Product


    - Replace hardcoded Chinese-only text with bilingual descriptions using `useLang()` hook
    - Known-Load: explain requires actual kWh/year, system auto-optimizes
    - DIY: explain user specifies components, ±20–30% accuracy
    - Standard Product: explain no load data needed, predefined configurations
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 1.2 Fix Step3Generator default diesel capacity from 40 kW to 20 kW


    - Change `handleMode('existing')` default from 40 to 20
    - Add "(MQ Power)" label to the 20 kW preset button
    - Add code comment referencing MQ Power DCA20SPXU4F
    - _Requirements: 5.2, 5.3_
  - [x] 1.3 Fix StandardProductPage Small product diesel capacity from 40 kW to 20 kW


    - Update `SIZE_TOPOLOGY_DATA.small.diesel.capacity.value` from 40 to 20
    - _Requirements: 5.1_
  - [x] 1.4 Write property test for country code detection








    - **Property 1: Country code detection consistency**
    - **Validates: Requirements 1.3**

- [x] 2. Refactor StepArea with terminology fixes, footprint calculation, and dropdown





  - [x] 2.1 Add bracket spacing constant and estimated minimum footprint calculation

    - Add `BRACKET_SPACING_M = 3.048` constant
    - Calculate `estimatedMinFootprintM2 = maxSets × (BRACKET_LENGTH + SPACING) × BRACKET_WIDTH`
    - Replace old `maxSets * areaPerSet` footprint with new spacing-inclusive calculation
    - _Requirements: 3.2_
  - [x] 2.2 Rename UI labels: "Installable Sets" → "Maximum Installable Sets", "Estimated Footprint" → "Estimated Minimum Footprint"

    - Update both English and Chinese labels
    - Add spacing note under Estimated Minimum Footprint
    - _Requirements: 3.1, 3.2_
  - [x] 2.3 Add Measured Area vs Usable Area explanatory note

    - Show note when grossAreaM2 is present explaining the difference
    - Show "(full polygon boundary)" under Measured Area
    - Show "(user-adjusted)" under Usable Area when different from Measured Area
    - _Requirements: 3.3_
  - [x] 2.4 Replace PV capacity badge list with dropdown selector

    - Replace flat `<span>` badge list with `<select>` dropdown
    - Show selected capacity prominently next to dropdown
    - Add `selectedSetCount` state variable
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 2.5 Show precise area per set value in reference section

    - Display exact `areaPerSet` value (e.g., 156.8 m²) with ft² conversion
    - Reference bracket dimensions (28 m × 5.6 m)
    - _Requirements: 3.4_
  - [x] 2.6 Write property test for estimated minimum footprint calculation



    - **Property 3: Estimated Minimum Footprint calculation**
    - **Validates: Requirements 3.2**


  - [x] 2.7 Write property test for bracket area precision

    - **Property 2: Bracket area precision**
    - **Validates: Requirements 2.3**

- [x] 3. Add bracket definition explanation to Step2Brackets

  - [x] 3.1 Add explanation block before bracket set selector

    - Show panel count, row × column arrangement (2 rows × N/2 columns)
    - Show physical dimensions (28 m × 5.6 m)
    - Show footprint area using precise value from bracket model
    - Show PV capacity per set with standard 655Wp modules
    - Use bilingual text with `useLang()` hook
    - Already implemented in Step2Brackets.tsx lines 52-73
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3A. Implement polygon-based layout optimization for maximum microgrid system count

  - [x] 3A.1 Create backend layout optimizer service (`backend/app/services/layout_optimizer.py`)
    - Implement `optimize_polygon_layout()`: given polygon vertices (local x,y meters), find max bracket sets
    - Algorithm: angle scan (5° steps + edge-aligned) × dual orientation (horizontal/vertical) × offset scan (0, ⅓, ⅔ pitch + vertex-aligned) × forward/mirrored grid directions
    - Implement polygon splitting via centroid bisection (up to 2 levels) and compare split vs single layout
    - Implement `_rect_fits()` using 9-point test (4 corners + 4 edge midpoints + center) for robust containment check
    - Implement `max_systems_for_area()`: spacing-aware area estimate using multi-aspect-ratio × dual-orientation × 1D packing formula `n ≤ (totalLength + spacing) / (itemLength + spacing)`
    - Product constraints: 28 m × 5.6 m bracket, 3.048 m (10 ft) spacing on all sides
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 3A.2 Create backend layout API endpoint (`backend/app/routers/layout.py`)
    - `POST /api/layout/optimize` accepts `{ polygon, availableAreaM2, spacingM, bracketLengthM, bracketWidthM }`
    - Returns `{ success, maxSystems, strategy, spacingM, bracketLengthM, bracketWidthM }`
    - Routes to `optimize_polygon_layout()` when polygon provided, `max_systems_for_area()` when only area provided
    - Register router in `backend/app/main.py`
    - _Requirements: 10.6_

  - [x] 3A.3 Update backend optimizer to use spacing-aware area calculation
    - Replace `int(available_area_m2 / area_per_set)` with `max_systems_for_area()` in `optimizer.py`
    - Import from `layout_optimizer` module
    - _Requirements: 10.7_

  - [x] 3A.4 Add dual-orientation scanning to frontend SiteAreaMap layout algorithm
    - Add `evaluateLayoutAtAngleSwapped()` function that swaps bracket length/width for vertical placement
    - Add `buildAxisAlignedLayoutCustom()` for custom grid dimensions with 90° rotation
    - Update `searchBestLayoutForPolygon()` to try both orientations at each angle and refine top-5 candidates
    - _Requirements: 10.1, 10.2, 10.8_

  - [x] 3A.5 Add spacing-aware area estimation to frontend StepArea
    - Add `computeMaxSetsForArea()` function: multi-aspect-ratio × dual-orientation × 1D packing
    - Add `maxFit1D()` helper: `n ≤ (totalLen + spacing) / (itemLen + spacing)`
    - Replace naive `Math.floor(area / areaPerSet)` with `computeMaxSetsForArea()` when no polygon layout result
    - Show calculation method indicator: "(polygon layout result)" vs "(spacing-aware estimate from area input)"
    - _Requirements: 10.5_

  - [x] 3A.6 Add frontend API client for layout optimization endpoint
    - Add `LayoutOptimizeRequest` and `LayoutOptimizeResponse` interfaces to `frontend/src/api/client.ts`
    - Add `optimizeLayout()` function calling `POST /api/layout/optimize`
    - _Requirements: 10.6_


- [x] 4. Checkpoint - Make sure all tests pass

  - Frontend: 2 test files, 4 tests — all passed (vitest)
  - Backend: 1 test file, 4 tests — all passed (pytest)
  - Total: 8/8 passed

- [x] 5. Improve geocoding and solar parameter reliability

  - [x] 5.1 Enhance backend geocode.py limit parameter for US queries
    - Changed default `limit` from `"1"` to `"5"`
    - Full query text already passed to Pelias without truncation
    - _Requirements: 1.1, 1.3_
  - [x] 5.2 Improve frontend geocode error messages with specific fallback suggestions
    - No results: suggests nearby city, ZIP code, or map selection
    - Distinguishes Pelias-not-running vs network-unreachable errors
    - _Requirements: 1.2, 1.4_
  - [x] 5.3 Improve StepLocation solar parameter error handling and retry
    - Shows specific error messages for backend unavailable vs data retrieval failure
    - Auto-retries when apiAvailable transitions from false to true (useEffect on apiAvailable)
    - Suggests refresh or reselect on persistent failure
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6. Fix bilingual consistency in StepOptimize
  - [x] 6.1 Replace hardcoded Chinese text in DesignLogic component with bilingual text
    - Added `lang` prop, all labels use isEn ternary
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 6.2 Replace hardcoded Chinese text in ConstraintPanel with bilingual text
    - Translated "优化约束条件", "柴发", diesel status, area constraint labels
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 6.3 Replace hardcoded Chinese text in TopCard and OtherRow with bilingual text
    - Translated plan badges, metric labels, button text, summary bar
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 6.4 Write property test for PV capacity calculation consistency
    - Added to stepArea.test.ts: tests calcPvKw across all panel × bracket × set combinations
    - **Property 4: PV capacity calculation consistency**
    - **Validates: Requirements 4.2**

- [x] 7. Create project documentation structure
  - [x] 7.1 Create docs/ numbered documentation files
    - Created 00_glossary.md, 01_idea.md, 04_business_rules.md, 07_decisions.md, 09_assumptions.md
    - _Requirements: 9.1, 9.3, 9.4_
  - [x] 7.2 Create cases/ directory with scenario files
    - Created happy_paths.md, edge_cases.md, scenario_inventory.md
    - _Requirements: 9.2_

- [x] 8. Final Checkpoint - Make sure all tests pass
  - Frontend: 2 test files, 5 tests — all passed (vitest)
  - Backend: 1 test file, 4 tests — all passed (pytest)
  - Total: 9/9 passed

- [x] 9. Revise StepArea: simplify to "Site Area" input with backend-driven assessment





  - [x] 9.1 Rename input label from "Enter usable area" to "Enter site area" (输入场地面积)


    - Change the label text in both English and Chinese
    - Update the helper text to explain this is the total site area (map polygon or manual input)
    - Ensure map polygon measurement writes back to this same field via `onUpdate({ availableAreaM2: ... })`
    - _Requirements: 3.1, 3.2_
  - [x] 9.2 Remove "Measured Area" and "Estimated Minimum Footprint" cards from assessment results


    - Remove the grossAreaM2 "Measured Area" card entirely (redundant with input)
    - Remove the "Estimated Minimum Footprint" card (confusing concept)
    - Keep only: "Usable Area" and "Maximum Installable Sets"
    - _Requirements: 3.3_
  - [x] 9.3 Compute Usable Area from backend layout optimizer result


    - Usable Area = maxSystems × bracket body area (areaPerSet, e.g., 156.8 m² for standard_32)
    - This represents the actual area occupied by brackets (excluding spacing)
    - When maxBracketSetsByLayout is provided (from map polygon), use it directly
    - When only area input is provided, use frontend `computeMaxSetsForArea()` as before (backend call is optional enhancement)
    - _Requirements: 3.4_
  - [x] 9.4 Switch display unit priority to ft² first, m² second


    - Change `AREA_UNITS` order to `['ft2', 'm2']` (ft² first)
    - Default input unit to `'ft2'`
    - In assessment result cards, show ft² value first, m² in parentheses
    - Update `formatAreaDual` usage to show ft² primary
    - _Requirements: 3.5_
  - [x] 9.5 Update area reference section with ft²-first precise values



    - Show "1,687.8 ft² (156.8 m²)" instead of "156.8 m² (1,687.8 ft²)"
    - Show bracket dimensions as "91.9 ft × 18.4 ft (28 m × 5.6 m)"
    - _Requirements: 3.6_


- [x] 10. Checkpoint - Verify StepArea changes




  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Centralize product parameters: add missing fields to products.yaml





  - [x] 11.1 Add bracket layout parameters to products.yaml


    - Add `spacing_m: 3.048` under `bracket_systems` (global default for all models)
    - Add `footprint_length_m: 28.0` and `footprint_width_m: 5.6` to each bracket model
    - _Requirements: 11.1_
  - [x] 11.2 Add site layout parameters to products.yaml


    - Add new `site_layout` section with: `tray_length_m: 6.2`, `tray_width_m: 4.4`, `diesel_reserved_area_m2: 75.0`, `inverters_per_tray: 2`
    - _Requirements: 11.2_

  - [x] 11.3 Add bracket mounting cost to products.yaml


    - Add `pv_mounting_cost_per_set_usd: 19050` under `accessories`
    - _Requirements: 11.3_

  - [x] 11.4 Add simulation defaults to products.yaml

    - Add new `simulation_defaults` section with: `system_efficiency: 0.78`
    - _Requirements: 11.4_

- [x] 12. Backend: read all parameters from product catalog instead of hardcoded constants





  - [x] 12.1 Update config_loader.py to parse new products.yaml fields


    - Parse `bracket_systems.spacing_m` and per-model `footprint_length_m`, `footprint_width_m`
    - Parse `site_layout` section (tray dimensions, diesel area, inverters per tray)
    - Parse `accessories.pv_mounting_cost_per_set_usd`
    - Parse `simulation_defaults.system_efficiency`
    - Expose via catalog accessor methods
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 12.2 Update layout_optimizer.py to read from catalog


    - Replace `BRACKET_LENGTH_M = 28.0`, `BRACKET_WIDTH_M = 5.6`, `BRACKET_SPACING_M = 3.048` with catalog reads
    - Pass dimensions/spacing as parameters from the router which reads from catalog
    - _Requirements: 11.5_
  - [x] 12.3 Update site_rules.py to read from catalog


    - Replace `PV_SET_FOOTPRINT_M2 = 260.0` with dynamic calculation from catalog: `(length + spacing) × (width + spacing)`
    - Replace `TRAY_LENGTH_M = 6.2`, `TRAY_WIDTH_M = 4.4`, `DIESEL_RESERVED_AREA_M2 = 75.0`, `INVERTERS_PER_TRAY = 2` with catalog reads
    - _Requirements: 11.6_
  - [x] 12.4 Update calculator.py to read mounting cost and pallet cost from catalog


    - Replace `mounting_cost_per_set = 76_200 / 4` with `catalog.accessories()["pv_mounting_cost_per_set_usd"]`
    - Replace `pallet_cost = num_packs * 250` with `catalog.accessories()["battery_pallet"]["per_pack_usd"]`
    - _Requirements: 11.7_
  - [x] 12.5 Update optimizer.py to read from catalog instead of hardcoded values


    - Replace `mounting_per_set = 76_200 / 4` with catalog read
    - Replace `pal_cost = num_packs * 250` with catalog read
    - Replace `bracket_length_m=28.0, bracket_width_m=5.6` in `max_systems_for_area()` call with catalog values
    - Replace `system_eff = 0.78` in `_solar_fraction()` with catalog read
    - _Requirements: 11.5, 11.7, 11.4_


- [x] 13. Frontend: read product parameters from store instead of hardcoded constants




  - [x] 13.1 Update useProductsStore to parse and expose new fields


    - Parse `spacing_m` from bracket_systems
    - Parse `footprint_length_m`, `footprint_width_m` per bracket model
    - Parse `site_layout` section
    - Expose via store getters
    - _Requirements: 11.8_
  - [x] 13.2 Update SiteAreaMap.tsx to use product store values


    - Replace `const BRACKET_SPACING_M = 3.048` with value from products store
    - Replace `STANDARD_BRACKET_LENGTH_M` / `STANDARD_BRACKET_WIDTH_M` imports with store values
    - Pass dimensions dynamically to layout functions
    - _Requirements: 11.9_
  - [x] 13.3 Update StepArea.tsx to use product store values


    - Replace `const BRACKET_SPACING_M = 3.048` with value from products store
    - Replace `STANDARD_BRACKET_LENGTH_M` / `STANDARD_BRACKET_WIDTH_M` with store values
    - _Requirements: 11.8_
  - [x] 13.4 Update StepOptimize.tsx to use product store values


    - Replace `const AREA_PER_SET_M2 = 260` with dynamic calculation: `(length + spacing) × (width + spacing)` from store
    - _Requirements: 11.8_
  - [x] 13.5 Update Step2Brackets.tsx and StepDIYPvSetup.tsx to use dynamic values


    - Replace hardcoded `28 m × 5.6 m` strings with values from bracket model
    - Replace hardcoded `10 ft` spacing text with value from products store
    - _Requirements: 11.8_
  - [x] 13.6 Update i18n/translations.ts to remove hardcoded dimension values


    - Replace hardcoded `91.9 ft × 18.4 ft（28 米 × 5.6 米）` and `156.8 m²` and `260 m²/套` in info.area, info.diy.area, info.diy.area.setup translation strings with generic text that doesn't embed specific numbers
    - The specific numbers should be rendered dynamically by the components using product store data
    - _Requirements: 11.8_
  - [x] 13.7 Update data/products.ts static fallback with new fields


    - Add `spacing_m`, `footprintLengthM`, `footprintWidthM` to static bracket data
    - Ensure fallback values match products.yaml defaults
    - _Requirements: 11.8_

- [x] 14. Checkpoint - Verify parameter centralization





  - Ensure all tests pass, ask the user if questions arise.
  - Verify no remaining hardcoded 3.048, 28.0, 5.6, 260, 76200, 250 values in calculation code

- [x] 15. Adjust wizard layout to 70/30 split when map is shown





  - [x] 15.1 Add CSS class for map-centric layout


    - Add `.app-layout.map-active .layout-left { flex: 7; }` and `.app-layout.map-active .layout-right { flex: 3; }` to App.css
    - Keep default `flex: 1` for both panels when `.map-active` is not applied
    - Ensure responsive breakpoint (≤1200px) still stacks vertically
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 15.2 Apply map-active class conditionally in WizardFlowPage


    - Add `map-active` class to `.app-layout` div when `showSiteAreaMap` is true
    - `showSiteAreaMap` is already computed by `shouldShowSiteAreaMap(scenario, stepType)` which returns true for location and diy-area-setup steps
    - _Requirements: 12.1, 12.2_
