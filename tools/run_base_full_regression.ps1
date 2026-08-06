$ErrorActionPreference = 'Stop'

$baseUri = 'http://127.0.0.1:6001'
$outDir = Join-Path $PSScriptRoot '..\docs\base_full_regression_output'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$common = @{
  scenario = 'known-load'
  bracketSets = 4
  panelModel = '655W'
  bracketModel = 'standard_32'
  batteryPackModel = 'LFP-10kWh'
  hasGenerator = $true
  dieselCapacityKw = 60
  dieselIsNew = $false
  voltageLevel = '120V/240V'
  storageDays = 1
  emsControlMethod = 'cloud'
  annualLoadKwh = 131400
  loadType = 'commercial'
  dieselPriceUsd = 100
  electricityPriceUsd = 0.35
  projectYears = 25
  nominalDiscountRatePct = 10
  inflationRatePct = 2
  latitude = 29.86463
  longitude = 121.536405
  year = 2020
}

$modes = @('lf', 'cc')

foreach ($mode in $modes) {
  $payload = @{}
  foreach ($k in $common.Keys) { $payload[$k] = $common[$k] }
  $payload['dieselDispatchMode'] = $mode

  $json = $payload | ConvertTo-Json -Depth 6
  $resp = Invoke-RestMethod -Method Post -Uri "$baseUri/api/calculate?simulate=true" -ContentType 'application/json' -Body $json

  $summary = [ordered]@{
    mode = $mode
    dieselDispatchMode = $resp.systemConfig.dieselDispatchMode
    mgDieselHours = $resp.simulation.mgDieselHours
    mgDieselStarts = $resp.simulation.mgDieselStarts
    mgDieselLiters = $resp.simulation.mgDieselLiters
    annualLoadKwh = $resp.summary.annualLoadKwh
    finalMgLcoe = $resp.summary.finalMgLcoe
    finalDieselLcoe = $resp.summary.finalDieselLcoe
    microgridNpcUsd = $resp.summary.microgridNpcUsd
    dieselOnlyNpcUsd = $resp.summary.dieselOnlyNpcUsd
    breakevenYear = $resp.summary.breakevenYear
    lcoeCrossoverYear = $resp.summary.lcoeCrossoverYear
  }

  $summary | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $outDir "$mode-summary.json")
  $resp | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $outDir "$mode-full.json")
}

Write-Host "Saved regression outputs to $outDir"
