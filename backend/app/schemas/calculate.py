"""
schemas/calculate.py - request/response models for /api/calculate
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class CalculateRequest(BaseModel):
    # Core system configuration
    scenario:          str   = Field("known-load", description="known-load | diy")
    bracketSets:       int   = Field(4, ge=0)
    panelModel:        str   = "655W"
    bracketModel:      str   = "standard_32"
    batteryPackModel:  str   = "LFP-10kWh"

    # Diesel generator inputs
    hasGenerator:      bool  = True
    dieselCapacityKw:  float = Field(40.0, ge=0)
    dieselIsNew:       bool  = False

    # Voltage level
    voltageLevel:      str   = "120V/240V"

    # Storage inputs
    storageDays:       int   = Field(1, ge=1, le=3)

    # EMS mode
    emsControlMethod:  str   = "cloud"
    emsAddons:         list[str] = Field(default_factory=list)

    # Known-load path
    annualLoadKwh:     Optional[float] = None
    loadType:          str   = "residential"

    # Tray-selection path
    trayCapacity:      Optional[str]   = None

    # DIY sizing path
    requiredCurrent:   Optional[float] = None
    inverterCount:     Optional[int]   = None

    # Economic and simulation controls
    electricityPriceUsd:    float = 0.35
    dieselPriceUsd:         float = 1.0
    dieselDispatchMode:     str   = Field("cc", description="lf | cc | cd | lp | proxy | uc")
    projectYears:           int   = Field(25, ge=1, le=50)
    nominalDiscountRatePct: float = Field(10.0, ge=-99.0, le=200.0)
    inflationRatePct:       float = Field(2.0, ge=-99.0, le=200.0)
    latitude:               float = 25.0
    longitude:              float = 0.0
    year:                   int   = 2020


class SystemConfigResult(BaseModel):
    scenario:           str
    pvCapacityKw:       float
    batteryCapacityKwh: float
    batteryPackCount:   int
    dieselCapacityKw:   float
    dieselKwComparison: float
    bracketSets:        int
    panelModel:         str
    panelWatts:         int
    panelPricePerWp:    float
    panelsPerSet:       int
    batteryModel:       str
    batteryPackKwh:     float
    annualLoadKwh:      float
    voltageLevel:       str
    emsMode:            str
    occupiedAreaM2:     float
    loadType:           str
    latitude:           float
    longitude:          float
    dieselModel:        str
    dieselModelDisplay: str
    dieselDispatchMode: Optional[str] = None
    projectYears:       int
    nominalDiscountRatePct: float
    inflationRatePct:   float
    dieselIsNew:        bool = False
    hasGenerator:       bool = True
    inverterKw:         Optional[float] = None
    inverterCount:      Optional[int] = None
    totalInverterKw:    Optional[float] = None
    trayCount:          Optional[int] = None
    siteAreaRequiredM2: Optional[float] = None


class CapexResult(BaseModel):
    pvModuleCost:        float
    pvMountingCost:      float
    energyStorageCost:   float
    dieselGeneratorCost: float
    intlTransportCost:   float
    installationCost:    float
    accessoryCost:       float
    otherInitialCost:    float
    equipmentSubtotal:   float
    profitMargin:        float
    profitAmount:        float
    sellingPrice:        float


class SimulationResult(BaseModel):
    solarFractionPct:       float
    lossOfLoadPct:          float
    curtailmentPct:         float
    mgDieselLiters:         int
    mgDieselHours:          int
    mgDieselStarts:         Optional[int] = None
    dieselOnlyLiters:       int
    dieselRunHoursA:        int
    annualFuelSavingLiters: int
    annualFuelSavingUsd:    float
    solarDieselAnalysis:    Optional[dict] = None
    homerDispatchComparison: Optional[dict] = None


class SummaryResult(BaseModel):
    projectName:           str
    analysisYears:         int
    annualLoadKwh:         float
    sellingPriceUsd:       float
    totalCostUsd:          float
    profitAmountUsd:       float
    mgAnnualOmUsd:         float
    mgAnnualFuelUsd:       float
    dieselAnnualFuelUsd:   float
    annualOperatingSavingsUsd: Optional[float] = None
    simplePaybackYears:    Optional[float] = None
    breakevenYear:         Optional[int]
    lcoeCrossoverYear:     Optional[int]
    finalMgLcoe:           float
    finalDieselLcoe:       float
    finalCumulativeRevenue: float
    microgridNpcUsd:       Optional[float] = None
    dieselOnlyNpcUsd:      Optional[float] = None
    npcSavingsUsd:         Optional[float] = None
    microgridAnnualizedCostUsd: Optional[float] = None
    dieselOnlyAnnualizedCostUsd: Optional[float] = None
    microgridOperatingCostUsd: Optional[float] = None
    dieselOnlyOperatingCostUsd: Optional[float] = None
    microgridFixedOmUsd:    Optional[float] = None
    microgridGeneratorMaintenanceUsd: Optional[float] = None
    dieselOnlyGeneratorMaintenanceUsd: Optional[float] = None
    microgridCapitalNpcUsd: Optional[float] = None
    microgridReplacementNpcUsd: Optional[float] = None
    microgridSalvageNpcUsd: Optional[float] = None
    dieselOnlyCapitalNpcUsd: Optional[float] = None
    dieselOnlyReplacementNpcUsd: Optional[float] = None
    dieselOnlySalvageNpcUsd: Optional[float] = None
    realDiscountRatePct:   Optional[float] = None
    nominalDiscountRatePct: Optional[float] = None
    inflationRatePct:   Optional[float] = None
    microgridGeneratorLifeYears: Optional[float] = None
    dieselOnlyGeneratorLifeYears: Optional[float] = None
    batteryLifeYears:   Optional[float] = None


class ComparisonRow(BaseModel):
    year:              int
    mgAnnualCost:      float
    dieselAnnualCost:  float
    mgCumulative:      float
    dieselCumulative:  float
    mgLcoe:            float
    dieselLcoe:        float
    annualRevenue:     float
    cumulativeRevenue: float


class CalculateResponse(BaseModel):
    success:         bool
    simulated:       bool = False
    error:           Optional[str] = None
    traceback:       Optional[str] = None
    systemConfig:    Optional[SystemConfigResult] = None
    capex:           Optional[CapexResult] = None
    simulation:      Optional[SimulationResult] = None
    summary:         Optional[SummaryResult] = None
    comparisonTable: Optional[list[ComparisonRow]] = None
