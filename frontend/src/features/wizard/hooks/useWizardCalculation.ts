import { useState } from 'react';
import { calculateFull, optimizeMicrogrid } from '@/api/client';
import { useProductsStore } from '@/store/useProductsStore';
import type { CalculateResponse, ConfigData, OptimizeOption, Scenario } from '@/types/index';

interface UseWizardCalculationParams {
  apiAvailable: boolean | null;
  config: ConfigData;
  scenario: Scenario | null;
  totalWizardSteps: number;
  t: (key: string) => string;
  getBracketAreaM2: (model: string) => number;
  setConfig: React.Dispatch<React.SetStateAction<ConfigData>>;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
}

function isNetworkLikeError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    normalized.includes('econnrefused') ||
    normalized.includes('api service not started')
  );
}

function resolveApiErrorMessage(message: string, t: (key: string) => string): string {
  return isNetworkLikeError(message) ? t('app.api_unavailable') : message;
}

function computeMaxBracketSets(
  config: ConfigData,
  getBracketAreaM2: (model: string) => number,
  defaultBracketModel: string,
): number {
  if (config.maxBracketSetsByLayout != null) {
    return config.maxBracketSetsByLayout;
  }
  if (config.availableAreaM2) {
    const bracket = config.bracketModel || defaultBracketModel;
    return Math.floor(config.availableAreaM2 / getBracketAreaM2(bracket));
  }
  return 8;
}

function computeStorageDays(backupHours: number): 1 | 2 | 3 {
  if (backupHours <= 12) return 1;
  if (backupHours <= 30) return 2;
  return 3;
}

function buildOptimizeRequest(
  activeConfig: ConfigData,
  maxSets: number,
  defaultBracketModel: string,
) {
  const bracket = activeConfig.bracketModel || defaultBracketModel;
  return {
    annualLoadKwh: activeConfig.annualLoadKwh!,
    peakSunHours: activeConfig.peakSunHoursPerDay ?? 4.5,
    dieselPriceUsdPerLiter: activeConfig.dieselPriceUsd,
    dieselIsNew: activeConfig.dieselIsNew,
    panelModel: activeConfig.panelModel,
    bracketModel: bracket,
    batteryPackModel: activeConfig.batteryPackModel,
    availableAreaM2: activeConfig.availableAreaM2 ?? null,
    existingDieselKw: activeConfig.hasGenerator ? (activeConfig.dieselCapacityKw || null) : null,
    maxBracketSets: maxSets,
    objective: 'payback' as const,
    allowDiesel: activeConfig.hasGenerator,
    voltageLevel: activeConfig.voltageLevel ?? '120V/240V',
    loadType: activeConfig.loadType || 'residential',
    latitude: activeConfig.latitude ?? 25.0,
    longitude: activeConfig.longitude ?? 0.0,
    year: activeConfig.year ?? 2020,
    emsControlMethod: activeConfig.emsControlMethod,
    emsAddons: activeConfig.emsAddons || [],
    dieselDispatchMode: activeConfig.dieselDispatchMode || 'cc',
  };
}

function buildDiyConfig(activeConfig: ConfigData, defaultBatteryModel: string): ConfigData {
  const packModel = activeConfig.batteryPackModel ?? defaultBatteryModel;
  const { getBatteryByModel } = useProductsStore.getState();
  const packKwh = getBatteryByModel(packModel).capacityKwh;
  const batteryKwh = (activeConfig.batteryPackCount ?? 1) * packKwh;
  const invKw = activeConfig.totalInverterKw ?? (activeConfig.inverterKw ?? 10) * (activeConfig.inverterCount ?? 1);
  const backupHCalc = invKw > 0 ? batteryKwh / invKw : 8;

  return {
    ...activeConfig,
    storageDays: computeStorageDays(backupHCalc),
    voltageLevel: activeConfig.voltageLevel ?? '120V/240V',
  };
}

function shouldRunKnownLoadOptimization(scenario: Scenario | null, config: ConfigData): boolean {
  return scenario === 'known-load' && !!config.annualLoadKwh && config.annualLoadKwh > 0;
}

export function useWizardCalculation({
  apiAvailable,
  config,
  scenario,
  totalWizardSteps,
  t,
  getBracketAreaM2,
  setConfig,
  setCurrentStep,
}: UseWizardCalculationParams) {
  const [apiResult, setApiResult] = useState<CalculateResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiErrorDiagnostics, setApiErrorDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [planOptions, setPlanOptions] = useState<OptimizeOption[]>([]);
  const [planDieselKw, setPlanDieselKw] = useState(0);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);

  const resetCalculationState = () => {
    setApiResult(null);
    setApiError(null);
    setApiErrorDiagnostics(null);
    setShowPlanSelection(false);
    setPlanOptions([]);
    setPlanDieselKw(0);
    setIsCalculating(false);
    setIsLoadingDetail(false);
    setIsSimulationRunning(false);
  };

  const returnFromResult = (hasPlanSelection: boolean) => {
    setApiError(null);
    setApiErrorDiagnostics(null);
    setApiResult(null);
    setIsSimulationRunning(false);
    setIsCalculating(false);
    setIsLoadingDetail(false);
    if (hasPlanSelection) {
      setShowPlanSelection(true);
      return;
    }
    setCurrentStep(totalWizardSteps);
  };

  const runKnownLoadOptimization = async (activeConfig: ConfigData) => {
    const { defaultBracketModel } = useProductsStore.getState();
    const maxSets = computeMaxBracketSets(activeConfig, getBracketAreaM2, defaultBracketModel);
    const optRes = await optimizeMicrogrid(buildOptimizeRequest(activeConfig, maxSets, defaultBracketModel));

    if (!optRes.success || !optRes.options?.length) {
      setApiErrorDiagnostics((optRes.diagnostics as Record<string, unknown> | null) ?? null);
      throw new Error(optRes.error || t('app.opt_failed'));
    }

    setPlanOptions(optRes.options);
    setPlanDieselKw(optRes.dieselKw ?? 0);
    setShowPlanSelection(true);
  };

  const runDiyCalculation = async (activeConfig: ConfigData) => {
    const { defaultBatteryModel } = useProductsStore.getState();
    const diyConfig = buildDiyConfig(activeConfig, defaultBatteryModel);

    setCurrentStep(totalWizardSteps + 1);
    setIsSimulationRunning(true);
    const result = await calculateFull(diyConfig);
    if (!result.success) {
      throw new Error(result.error || t('app.pypsa_failed'));
    }
    setApiResult(result);
    setIsSimulationRunning(false);
  };

  const runCalculation = async (overrideConfig?: ConfigData) => {
    const activeConfig = overrideConfig ?? config;

    setIsCalculating(true);
    setApiError(null);
    setApiErrorDiagnostics(null);
    setApiResult(null);
    setShowPlanSelection(false);

    try {
      if (apiAvailable === false) {
        throw new Error(t('app.api_unavailable'));
      }

      if (shouldRunKnownLoadOptimization(scenario, activeConfig)) {
        await runKnownLoadOptimization(activeConfig);
        return;
      }

      await runDiyCalculation(activeConfig);
    } catch (error: any) {
      const message = error.message || String(error);
      setApiError(resolveApiErrorMessage(message, t));
      setCurrentStep(totalWizardSteps + 1);
      setIsSimulationRunning(false);
    } finally {
      setIsCalculating(false);
    }
  };

  const handlePlanSelect = async (opt: OptimizeOption) => {
    setIsLoadingDetail(true);
    setApiError(null);
    setApiErrorDiagnostics(null);
    setApiResult(null);
    setIsSimulationRunning(false);
    setIsCalculating(true);

    const updatedConfig: ConfigData = {
      ...config,
      bracketSets: opt.bracketSets,
      dieselCapacityKw: opt.dieselKw,
      hasGenerator: opt.dieselKw > 0,
      dieselIsNew: opt.dieselIsNew,
      storageDays: 1,
    };

    setConfig(updatedConfig);
    setShowPlanSelection(false);
    setCurrentStep(totalWizardSteps + 1);
    setIsSimulationRunning(true);

    try {
      const fullResult = await calculateFull(updatedConfig);
      if (!fullResult.success) {
        throw new Error(fullResult.error || t('app.pypsa_detail_failed'));
      }
      setApiResult(fullResult);
    } catch (error: any) {
      const message = error.message || String(error);
      setApiError(resolveApiErrorMessage(message, t));
    } finally {
      setIsSimulationRunning(false);
      setIsLoadingDetail(false);
      setIsCalculating(false);
    }
  };

  return {
    apiError,
    apiErrorDiagnostics,
    apiResult,
    handlePlanSelect,
    isCalculating,
    isLoadingDetail,
    isSimulationRunning,
    planDieselKw,
    planOptions,
    returnFromResult,
    resetCalculationState,
    runCalculation,
    showPlanSelection,
  };
}
