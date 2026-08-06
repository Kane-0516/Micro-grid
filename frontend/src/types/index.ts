export type Scenario = 'known-load' | 'diy' | 'custom' | 'no-load';
export type CustomFlowBranch = 'known-load' | 'diy';
export type VoltageLevel = '120V/240V' | '120V/208V' | '277V/480V';
export type StorageDays = 1 | 2 | 3;
export type LoadType = 'residential' | 'commercial' | 'industrial' | 'office' | 'school' | 'hospital' | 'hotel' | 'restaurant' | 'retail' | 'warehouse' | 'supermarket' | 'apartment';
export type LoadInputMode = 'annual' | 'hourly' | 'import';
export type EMSControlMethod = 'edge' | 'cloud' | 'prediction';
export type EMSAddon = 'cloud' | 'prediction';
export type DieselDispatchMode = 'lf' | 'cc' | 'cd' | 'lp' | 'proxy' | 'uc';

export interface DailyLoadSlot {
  label: string;
  hours: number;
  loadKw: number;
}

export interface ConfigData {
  scenario: Scenario;
  customFlowBranch?: CustomFlowBranch | null;
  bracketSets: number;
  panelModel: string;
  bracketModel: string;
  hasGenerator: boolean;
  dieselCapacityKw: number;
  dieselIsNew: boolean;
  voltageLevel: VoltageLevel | null;
  storageDays: StorageDays | null;
  batteryPackModel: string;
  emsControlMethod: EMSControlMethod;
  emsAddons?: EMSAddon[];
  loadType?: LoadType;
  loadInputMode?: LoadInputMode;
  dailyLoadSlots?: DailyLoadSlot[];
  annualLoadKwh?: number | null;
  peakLoadKw?: number | null;
  electricityPriceUsd: number;
  dieselPriceUsd: number;
  dieselDispatchMode?: DieselDispatchMode;
  projectYears?: number;
  nominalDiscountRatePct?: number;
  inflationRatePct?: number;
  latitude?: number | null;
  longitude?: number | null;
  year?: number;
  locationName?: string;
  peakSunHoursPerDay?: number | null;
  annualEffHours?: number | null;
  annualKwhPerM2?: number | null;
  availableAreaM2?: number | null;
  grossAreaM2?: number | null;
  maxBracketSetsByLayout?: number | null;
  trayCapacity?: string | null;
  requiredCurrent?: number | null;
  inverterKw?: number | null;
  inverterCount?: number | null;
  totalInverterKw?: number | null;
  batteryPackCount?: number | null;
  batteryCapacityKwh?: number | null;
  trayCount?: number | null;
  pvCapacityKw?: number | null;
  componentModel?: string;
  bracketCapacity?: number | null;
  dieselMaxVoltageV?: number | null;
  dieselMaxCurrentA?: number | null;
  dieselMaxPowerKw?: number | null;
}

export interface OptimizeRequest {
  annualLoadKwh: number;
  peakLoadKw?: number;
  peakSunHours?: number;
  storageDays?: number;
  dieselPriceUsdPerLiter?: number;
  dieselIsNew?: boolean;
  panelModel?: string;
  bracketModel?: string;
  batteryPackModel?: string;
  minBracketSets?: number;
  maxBracketSets?: number;
  objective?: 'payback' | 'npv' | 'lcoe';
  availableAreaM2?: number | null;
  existingDieselKw?: number | null;
  dieselCapacityKw?: number | null;
  allowDiesel?: boolean;
  voltageLevel?: VoltageLevel;
  loadType?: LoadType;
  latitude?: number;
  longitude?: number;
  year?: number;
  emsControlMethod?: EMSControlMethod;
  emsAddons?: EMSAddon[];
  dieselDispatchMode?: DieselDispatchMode;
}

export interface OptimizeOption {
  bracketSets: number;
  pvKw: number;
  batteryKwh: number;
  numPacks: number;
  dieselKw: number;
  solarFractionPct: number;
  lossOfLoadPct: number;
  isReliabilityRisk?: boolean;
  reliabilityNote?: string | null;
  curtailmentPct: number;
  annualDieselLiters: number;
  annualDieselOnlyLiters: number;
  capexUsd: number;
  sellingPriceUsd: number;
  annualDieselCostUsd: number;
  annualDieselOnlyCostUsd: number;
  annualOmCostUsd: number;
  annualSavingsUsd: number;
  paybackYears: number;
  npv10yrUsd: number;
  lcoeMicrogridUsd: number;
  lcoeDieselOnlyUsd: number;
  label: string;
  isRecommended: boolean;
  isRunnerUp: boolean;
  isThird: boolean;
  dieselIsNew: boolean;
  inverterKw?: number;
  inverterCount?: number;
  trayCount?: number;
  siteAreaRequiredM2?: number;
}

export interface OptimizeResponse {
  success: boolean;
  dieselKw?: number | null;
  maxSetsAllowed?: number | null;
  options?: OptimizeOption[] | null;
  diagnostics?: Record<string, unknown> | null;
  error?: string | null;
}

export interface SystemConfigResult {
  scenario: Scenario;
  pvCapacityKw: number;
  batteryCapacityKwh: number;
  batteryPackCount: number;
  dieselCapacityKw: number;
  dieselKwComparison: number;
  bracketSets: number;
  panelModel: string;
  panelWatts: number;
  panelPricePerWp: number;
  panelsPerSet: number;
  batteryModel: string;
  batteryPackKwh: number;
  annualLoadKwh: number;
  voltageLevel: string;
  emsMode: string;
  occupiedAreaM2: number;
  loadType: string;
  latitude: number;
  longitude: number;
  dieselModel: string;
  dieselModelDisplay?: string;
  dieselDispatchMode?: DieselDispatchMode;
  projectYears: number;
  nominalDiscountRatePct: number;
  inflationRatePct: number;
  hasGenerator?: boolean;
  inverterKw?: number;
  inverterCount?: number;
  trayCount?: number;
  siteAreaRequiredM2?: number;
}

export interface CapexResult {
  pvModuleCost: number;
  pvMountingCost: number;
  energyStorageCost: number;
  dieselGeneratorCost: number;
  intlTransportCost: number;
  installationCost: number;
  accessoryCost: number;
  otherInitialCost: number;
  equipmentSubtotal: number;
  profitMargin: number;
  profitAmount: number;
  sellingPrice: number;
}

export interface SimulationResult {
  solarFractionPct: number;
  lossOfLoadPct: number;
  curtailmentPct: number;
  mgDieselLiters: number;
  mgDieselHours: number;
  mgDieselStarts?: number;
  dieselOnlyLiters: number;
  dieselRunHoursA: number;
  annualFuelSavingLiters: number;
  annualFuelSavingUsd: number;
  homerDispatchComparison?: {
    note?: string;
    rows?: Array<{
      mode: string;
      label: string;
      diesel_liters: number;
      diesel_kwh: number;
      diesel_hours: number;
      diesel_starts: number;
      load_shed_kwh: number;
      loss_of_load_pct: number;
      curtailment_kwh: number;
      curtailment_pct: number;
      battery_discharge_kwh: number;
    }>;
  } | null;
  solarDieselAnalysis?: {
    annualPvEquivalentHours?: number | null;
    weatherDieselCorrelation?: number | null;
    solarSource?: string | null;
    analysisPeriod?: string | null;
    monthly?: Array<{
      month: number;
      label: string;
      pvEquivalentHours: number;
      pvGenerationKwh: number;
      dieselHours: number;
      dieselGenerationKwh: number;
    }>;
  } | null;
}

export interface SummaryResult {
  projectName: string;
  analysisYears: number;
  annualLoadKwh: number;
  sellingPriceUsd: number;
  totalCostUsd: number;
  profitAmountUsd: number;
  mgAnnualOmUsd: number;
  mgAnnualFuelUsd: number;
  dieselAnnualFuelUsd: number;
  annualOperatingSavingsUsd?: number | null;
  simplePaybackYears?: number | null;
  breakevenYear?: number | null;
  lcoeCrossoverYear?: number | null;
  finalMgLcoe: number;
  finalDieselLcoe: number;
  finalCumulativeRevenue: number;
  microgridNpcUsd?: number | null;
  dieselOnlyNpcUsd?: number | null;
  npcSavingsUsd?: number | null;
  microgridAnnualizedCostUsd?: number | null;
  dieselOnlyAnnualizedCostUsd?: number | null;
  microgridOperatingCostUsd?: number | null;
  dieselOnlyOperatingCostUsd?: number | null;
  microgridFixedOmUsd?: number | null;
  microgridGeneratorMaintenanceUsd?: number | null;
  dieselOnlyGeneratorMaintenanceUsd?: number | null;
  microgridCapitalNpcUsd?: number | null;
  microgridReplacementNpcUsd?: number | null;
  microgridSalvageNpcUsd?: number | null;
  dieselOnlyCapitalNpcUsd?: number | null;
  dieselOnlyReplacementNpcUsd?: number | null;
  dieselOnlySalvageNpcUsd?: number | null;
  realDiscountRatePct?: number | null;
  nominalDiscountRatePct?: number | null;
  inflationRatePct?: number | null;
  microgridGeneratorLifeYears?: number | null;
  dieselOnlyGeneratorLifeYears?: number | null;
  batteryLifeYears?: number | null;
}

export interface ComparisonRow {
  year: number;
  mgAnnualCost: number;
  dieselAnnualCost: number;
  mgCumulative: number;
  dieselCumulative: number;
  mgLcoe: number;
  dieselLcoe: number;
  annualRevenue: number;
  cumulativeRevenue: number;
}

export interface CalculateResponse {
  success: boolean;
  simulated?: boolean;
  error?: string | null;
  traceback?: string | null;
  systemConfig?: SystemConfigResult | null;
  capex?: CapexResult | null;
  simulation?: SimulationResult | null;
  summary?: SummaryResult | null;
  comparisonTable?: ComparisonRow[] | null;
}
