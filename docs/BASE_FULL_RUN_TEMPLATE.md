# base_full Run Template

Use this template to compare MicroGrid-homerpro against the HOMER `base_full`
benchmark with the same input assumptions.

## Reference case

- Location: `Ningbo Railway Station`
- Latitude: `29.86463`
- Longitude: `121.536405`
- Load: `360 kWh/day`
- PV: `83.84 kW`
- Fuel price sensitivity: `100`
- Battery options: `0;40`
- Interest rate sensitivity: `10`

## Fields to compare

- `Hours of Operation`
- `Number of Starts`
- `Fuel Consumption`
- `Electrical Production`
- `Operating Cost`
- `NPC`
- `LCOE`

## Suggested MicroGrid-homerpro calls

### Load Following

```json
{
  "scenario": "known-load",
  "bracketSets": 4,
  "panelModel": "655W",
  "bracketModel": "standard_32",
  "batteryPackModel": "LFP-10kWh",
  "hasGenerator": true,
  "dieselCapacityKw": 60,
  "dieselIsNew": false,
  "voltageLevel": "120V/240V",
  "storageDays": 1,
  "emsControlMethod": "cloud",
  "annualLoadKwh": 131400,
  "loadType": "commercial",
  "dieselPriceUsd": 100,
  "electricityPriceUsd": 0.35,
  "dieselDispatchMode": "lf",
  "projectYears": 25,
  "nominalDiscountRatePct": 10,
  "inflationRatePct": 2,
  "latitude": 29.86463,
  "longitude": 121.536405,
  "year": 2020
}
```

### Cycle Charging

```json
{
  "scenario": "known-load",
  "bracketSets": 4,
  "panelModel": "655W",
  "bracketModel": "standard_32",
  "batteryPackModel": "LFP-10kWh",
  "hasGenerator": true,
  "dieselCapacityKw": 60,
  "dieselIsNew": false,
  "voltageLevel": "120V/240V",
  "storageDays": 1,
  "emsControlMethod": "cloud",
  "annualLoadKwh": 131400,
  "loadType": "commercial",
  "dieselPriceUsd": 100,
  "electricityPriceUsd": 0.35,
  "dieselDispatchMode": "cc",
  "projectYears": 25,
  "nominalDiscountRatePct": 10,
  "inflationRatePct": 2,
  "latitude": 29.86463,
  "longitude": 121.536405,
  "year": 2020
}
```

## How to use

1. Restart the backend after code changes.
2. POST the JSON above to `http://127.0.0.1:6001/api/calculate?simulate=true`.
3. Compare the returned `simulation` and `summary` blocks with the HOMER tables.
4. Keep only one dispatch rule changed at a time.

## Notes

- The `annualLoadKwh` here is the annual equivalent of `360 kWh/day`.
- The point of the template is not to force a perfect match on the first run.
- The point is to make the comparison repeatable after every code change.
