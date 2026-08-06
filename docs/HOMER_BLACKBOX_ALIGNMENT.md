# HOMER Black-Box Alignment Baseline

This document turns the reverse-engineering notes under `C:\Panskai-work\HomerPro`
into a practical comparison baseline for MicroGrid-homerpro.

## Why this exists

The goal is not to reproduce HOMER internals exactly.
The goal is to keep a stable, repeatable comparison set so that every dispatch or
economics change can be checked against the same HOMER-visible outputs.

## What we can already trust from the reverse notes

From the reverse summaries and Tables exports, the following HOMER concepts are
high-confidence:

- `NPC -> annualized cost -> COE`
- real discount rate derived from nominal rate and inflation
- linear generator fuel curve
- minimum generator load ratio
- `Gen A/Hours`, `Gen B/Hours` as annual machine-hours
- `Gen A/Fuel`, `Gen B/Fuel`, `System/Total Fuel`
- `Hours of Operation` as annual runtime hours

## Current project coverage

### Already aligned or close

- lifecycle economics chain in `backend/app/services/homer_economic_model.py`
- linear diesel fuel model in `backend/app/services/solution_pipeline.py`
- location-aware PV and load profiles in `backend/app/services/microgrid_simulator.py`
- direct `Tables`-style reporting fields in `backend/app/routers/calculate.py`

### Still divergent

- HOMER `Load Following` vs `Cycle Charging`
- battery reserve SOC behavior
- generator charging behavior
- exact start-count semantics
- exact runtime-hour semantics for some dispatch modes

## Benchmark cases to use as the source of truth

The strongest reference cases are stored under:

- `C:\Panskai-work\HomerPro\benchmark-cases\dispatch-benchmark-manifest.csv`
- `C:\Panskai-work\HomerPro\benchmark-cases\dispatch-benchmark-manifest-batch2.csv`
- `C:\Panskai-work\HomerPro\benchmark-cases\dispatch-benchmark-manifest-batch3.csv`

The base Ningbo case to compare against is:

- `base_full`
- `LocationName = Ningbo Railway Station`
- `Latitude = 29.86463`
- `Longitude = 121.536405`
- `LoadKwhPerDay = 360`
- `PvKw = 83.84`

## Fields to compare first

When re-running a case in MicroGrid-homerpro, compare these fields first:

1. `Hours` or `Gen A/Hours`
2. `Starts`
3. `Fuel` or `System/Total Fuel`
4. `Production`
5. `NPC`
6. `LCOE`
7. `Operating cost`

If these are close, then move on to the finer cost splits.

## Practical mapping to project files

- Dispatch and runtime extraction:
  - `backend/app/services/simulator.py`
  - `backend/app/services/microgrid_simulator.py`
- Fuel curve and runtime economics:
  - `backend/app/services/solution_pipeline.py`
  - `backend/app/services/homer_economic_model.py`
- Request/response shape:
  - `backend/app/schemas/calculate.py`
  - `backend/app/routers/calculate.py`

## Current calibration plan

1. Keep the HOMER black-box tables as the comparison baseline.
2. Use the same `8760` load series and the same solar resource inputs.
3. Keep the same project lifetime, discount rate, and fuel price.
4. Change only one dispatch rule at a time.
5. Re-run the same benchmark case after every code change.

## Notes

- `base_full` in the reverse notes is currently the most useful runtime benchmark.
- The remaining major gap is dispatch behavior, not economics.
- The project should be calibrated against HOMER-visible outputs, not against a guessed internal model.
