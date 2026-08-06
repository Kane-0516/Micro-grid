import type { ConfigData, Scenario } from '@/types/index';
import { useProductsStore } from '@/store/useProductsStore';

const getDefaults = () => {
  const state = useProductsStore.getState();
  return {
    panelModel: state.defaultPanelModel,
    bracketModel: state.defaultBracketModel,
    batteryPackModel: state.defaultBatteryModel,
    loadType: state.simulationDefaults.defaultLoadType,
    dieselPriceUsd: state.economicDefaults.dieselPriceUsdPerLiter,
    electricityPriceUsd: state.economicDefaults.electricityPriceUsdPerKwh,
    dieselDispatchMode: state.simulationDefaults.dieselDispatchMode,
    year: state.simulationDefaults.defaultYear,
    projectYears: state.economicDefaults.projectYears,
    nominalDiscountRatePct: state.economicDefaults.nominalDiscountRatePct,
    inflationRatePct: state.economicDefaults.inflationRatePct,
  };
};

const BASE_CONFIG: ConfigData = {
  scenario: 'known-load',
  customFlowBranch: null,
  bracketSets: 0,
  panelModel: getDefaults().panelModel,
  bracketModel: getDefaults().bracketModel,
  hasGenerator: false,
  dieselCapacityKw: 0,
  dieselIsNew: false,
  voltageLevel: null as any,
  storageDays: null as any,
  batteryPackModel: getDefaults().batteryPackModel,
  emsControlMethod: 'edge',
  emsAddons: [],
  loadType: getDefaults().loadType,
  electricityPriceUsd: getDefaults().electricityPriceUsd,
  dieselPriceUsd: getDefaults().dieselPriceUsd,
  dieselDispatchMode: getDefaults().dieselDispatchMode,
  projectYears: getDefaults().projectYears,
  nominalDiscountRatePct: getDefaults().nominalDiscountRatePct,
  inflationRatePct: getDefaults().inflationRatePct,
  latitude: null,
  longitude: null,
  year: getDefaults().year,
  grossAreaM2: null,
  maxBracketSetsByLayout: null,
};

export const DEFAULT_CONFIG: ConfigData = { ...BASE_CONFIG };

export function createDefaultConfig(scenario: Scenario = 'known-load'): ConfigData {
  const defaults = getDefaults();
  return {
    ...BASE_CONFIG,
    panelModel: defaults.panelModel,
    bracketModel: defaults.bracketModel,
    batteryPackModel: defaults.batteryPackModel,
    loadType: defaults.loadType,
    electricityPriceUsd: defaults.electricityPriceUsd,
    dieselPriceUsd: defaults.dieselPriceUsd,
    dieselDispatchMode: defaults.dieselDispatchMode,
    year: defaults.year,
    projectYears: defaults.projectYears,
    nominalDiscountRatePct: defaults.nominalDiscountRatePct,
    inflationRatePct: defaults.inflationRatePct,
    scenario,
    customFlowBranch: scenario === 'custom' || scenario === 'no-load' ? null : scenario,
  };
}
