# base_full Alignment Table

This table is the working comparison sheet for the `base_full` HOMER benchmark.
Use it to compare HOMER Tables output against MicroGrid-homerpro results after
each dispatch or economics change.

## Reference case

- HOMER case: `base_full`
- Location: `Ningbo Railway Station`
- Latitude: `29.86463`
- Longitude: `121.536405`
- Load: `360 kWh/day`
- PV: `83.84 kW`
- Fuel price sensitivity: `100`
- Battery options: `0;40`
- Interest rate sensitivity: `10`

## HOMER reference values

| Field | HOMER reference |
|---|---:|
| Dispatch | `HOMER Load Following` / `HOMER Cycle Charging` candidates |
| Hours of Operation | `2,746 h/yr` |
| Number of Starts | `1,041 starts/yr` |
| Electrical Production | `77,538 kWh/yr` |
| Mean Electrical Output | `28.2 kW` |
| Minimum Electrical Output | `15.0 kW` |
| Maximum Electrical Output | `60.0 kW` |
| Fuel Consumption | `26,605 L/yr` |
| Specific Fuel Consumption | `0.343 L/kWh` |
| Mean Electrical Efficiency | `29.6 %` |
| Fixed Generation Cost | `705 /h` |
| Marginal Generation Cost | `27.3 /kWh` |
| Total NPC | `96,324,310` |
| Levelized COE | `67.75` |
| Operating Cost | `11,361,860` |

## MicroGrid-homerpro fields to compare

| HOMER field | MicroGrid-homerpro field | Source file |
|---|---|---|
| Hours of Operation | `mgDieselHours` / `annual_diesel_hours` | [backend/app/services/simulator.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/simulator.py) |
| Number of Starts | `mgDieselStarts` / `annual_diesel_start_count` | [backend/app/services/simulator.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/simulator.py) |
| Fuel Consumption | `mgDieselLiters` / `annual_diesel_liters` | [backend/app/services/simulator.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/simulator.py) |
| Electrical Production | `annual_diesel_kwh` | [backend/app/services/microgrid_simulator.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/microgrid_simulator.py) |
| Minimum Electrical Output | `DieselSpec.min_load_kw` | [backend/app/services/solution_pipeline.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/solution_pipeline.py) |
| NPC | `microgridNpcUsd` / `dieselOnlyNpcUsd` | [backend/app/services/homer_economic_model.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/homer_economic_model.py) |
| COE / LCOE | `finalMgLcoe` / `finalDieselLcoe` | [backend/app/services/homer_economic_model.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/homer_economic_model.py) |
| Operating Cost | `microgridOperatingCostUsd` / `dieselOnlyOperatingCostUsd` | [backend/app/services/homer_economic_model.py](C:/Panskai-work/PyPSA/MicroGrid-homerpro/backend/app/services/homer_economic_model.py) |

## Current interpretation

The remaining mismatch is mostly dispatch behavior, not economics.

Priority order for calibration:

1. `Hours of Operation`
2. `Number of Starts`
3. `Fuel Consumption`
4. `Operating Cost`
5. `NPC`
6. `LCOE`

If a candidate matches the first three well, the economics usually follows much more closely.

## Dispatch modes to test

Test the same case under these modes:

- `lf`
- `cc`
- `lp`
- `proxy`

Keep the same:

- load
- PV size
- battery size
- diesel size
- latitude/longitude
- project lifetime
- discount and inflation

## Notes

- The current project already uses HOMER-style linear fuel economics.
- The largest remaining gap is the hour-by-hour dispatch policy.
- Use the Tables CSV output as the comparison source of truth, not the Calculation Report.
