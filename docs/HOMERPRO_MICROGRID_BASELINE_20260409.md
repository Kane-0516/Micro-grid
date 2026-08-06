# HOMER Pro baseline landed in MicroGrid on 2026-04-09

This document records the first set of HOMER-aligned assumptions that are now active in the MicroGrid backend. It is intended to separate what is already enforced in code from what is still approximate.

## Landed defaults

The following assumptions are now applied in the backend calculation path:

- Diesel minimum load ratio: `25%`
- Diesel fuel curve intercept coefficient `F0`: `0.033` L/h/kW-rated
- Diesel fuel curve slope coefficient `F1`: `0.273` L/h/kW-output
- Project lifetime: `25 years`
- Nominal discount rate: `10%`
- Inflation rate: `2%`
- Real discount rate formula: `((1 + nominal) / (1 + inflation)) - 1`

## Backend landing points

These assumptions are currently enforced in the following files:

- `backend/app/services/simulator.py`
- `backend/app/services/microgrid_simulator.py`
- `backend/app/services/solution_pipeline.py`
- `backend/app/services/homer_economic_model.py`
- `backend/app/services/economic_analysis.py`
- `backend/app/services/optimizer.py`
- `backend/app/routers/calculate.py`
- `backend/app/services/reporting/generator.py`

## Outputs now exposed by /api/calculate

The request layer now accepts the key economic controls directly:

- `projectYears`
- `nominalDiscountRatePct`
- `inflationRatePct`


The calculation response now carries HOMER-style economic outputs in the summary block:

- `microgridNpcUsd`
- `dieselOnlyNpcUsd`
- `npcSavingsUsd`
- `microgridAnnualizedCostUsd`
- `dieselOnlyAnnualizedCostUsd`
- `microgridOperatingCostUsd`
- `dieselOnlyOperatingCostUsd`
- `realDiscountRatePct`

The response and result page now distinguish:

- `Operating Cost`: annual recurring fuel + maintenance/O&M burden
- `NPC composition`: discounted capital + replacement - salvage-credit contributors
- `COE`: total annualized cost divided by served load

The simulation block also carries generator-use indicators aligned with the current PyPSA-to-HOMER approximation:

- `mgDieselHours`
- `mgDieselStarts`
- `mgDieselLiters`
- `dieselRunHoursA`
- `dieselOnlyLiters`

The report export path now also writes these economic assumptions and derived asset-life notes into the workbook basic-information sheet via `tax_basis_notes` and `project_notes`.

## What is high-confidence now

- HOMER-style diesel fuel accounting is active for both the microgrid case and the diesel-only benchmark.
- The main economic chain `NPC -> annualized cost -> COE/LCOE-style outputs` is now driven by the HOMER-oriented economic model.
- The main API path uses `25` years explicitly instead of relying on an older `10`-year default.

## What is still approximate

The following points are still not strict HOMER reproductions:

- Generator start count is an approximation based on simulated status transitions.
- Dispatch behavior is still `LP / Proxy / UC` in the current codebase, not a full reproduction of HOMER's proprietary dispatch logic.
- Some operating-cost subcomponents are still aggregated from template and simulation outputs rather than fully reconstructed from every HOMER table field.

## Next recommended landing steps

- Expose project lifetime, nominal discount rate, and inflation rate as configurable request inputs once the product wants user-side control.
- Continue splitting operating cost into more explicit fuel, generator O&M, battery replacement, and residual-value contributors.
- Add regression tests for the summary fields and the 25-year reporting path.
