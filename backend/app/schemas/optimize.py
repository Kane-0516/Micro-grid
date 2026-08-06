"""
schemas/optimize.py 鈥?/api/optimize 璇锋眰 & 鍝嶅簲妯″瀷
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class OptimizeRequest(BaseModel):
    annualLoadKwh:           float
    peakLoadKw:              float = 0.0
    peakSunHours:            float = 4.5
    storageDays:             int   = 1
    dieselPriceUsdPerLiter:  float = 1.0
    dieselIsNew:             bool  = False
    panelModel:              str   = "655W"
    bracketModel:            str   = "standard_32"
    batteryPackModel:        str   = "LFP-16kWh"
    minBracketSets:          int   = 1
    maxBracketSets:          int   = 20
    objective:               str   = "payback"
    availableAreaM2:         Optional[float] = None
    existingDieselKw:        Optional[float] = None
    dieselCapacityKw:        Optional[float] = None
    allowDiesel:             bool = True
    voltageLevel:            str = "120V/240V"
    loadType:                str = "residential"
    latitude:                float = 25.0
    longitude:               float = 0.0
    year:                    int = 2020
    emsControlMethod:        str = "edge"
    emsAddons:               list[str] = Field(default_factory=list)


class OptimizeOption(BaseModel):
    bracketSets:              int
    pvKw:                     float
    batteryKwh:               float
    numPacks:                 int
    dieselKw:                 float
    solarFractionPct:         float
    lossOfLoadPct:            float
    isReliabilityRisk:       bool = False
    reliabilityNote:         Optional[str] = None
    curtailmentPct:           float
    annualDieselLiters:       int
    annualDieselOnlyLiters:   int
    capexUsd:                 float
    sellingPriceUsd:          float
    annualDieselCostUsd:      float
    annualDieselOnlyCostUsd:  float
    annualOmCostUsd:          float
    annualSavingsUsd:         float
    paybackYears:             float
    npv10yrUsd:               float
    lcoeMicrogridUsd:         float
    lcoeDieselOnlyUsd:        float
    label:                    str
    isRecommended:            bool
    isRunnerUp:               bool
    isThird:                  bool
    dieselIsNew:              bool
    inverterKw:               Optional[float] = None
    inverterCount:            Optional[int] = None
    trayCount:                Optional[int] = None
    siteAreaRequiredM2:       Optional[float] = None


class OptimizeResponse(BaseModel):
    success:         bool
    dieselKw:        Optional[float] = None
    maxSetsAllowed:  Optional[int]   = None
    options:         Optional[list[OptimizeOption]] = None
    diagnostics:     Optional[dict]  = None
    error:           Optional[str]   = None
    traceback:       Optional[str]   = None
