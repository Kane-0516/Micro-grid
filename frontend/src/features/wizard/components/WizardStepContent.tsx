import { useCallback } from 'react';
import Step2Brackets from './known-load/Step2Brackets';
import Step3Generator from './known-load/Step3Generator';
import Step4Voltage from './known-load/Step4Voltage';
import Step5LoadInput from './known-load/Step5LoadInput';
import Step6Storage from './known-load/Step6Storage';
import Step7Tray from './known-load/Step7Tray';
import Step8EMS from './known-load/Step8EMS';
import StepOptimize from './known-load/StepOptimize';
import StepDIYAreaSetup from './diy/StepDIYAreaSetup';
import StepDIYGenerator from './diy/StepDIYGenerator';
import StepDIYInverter from './diy/StepDIYInverter';
import StepDIYPvSetup from './diy/StepDIYPvSetup';
import StepDIYSetup from './diy/StepDIYSetup';
import StepDIYStorage from './diy/StepDIYStorage';
import StepEconomicSettings from './StepEconomicSettings';
import type { ConfigData } from '@/types/index';
import type { StepType } from '@/utils/wizardFlow';

interface WizardStepContentProps {
  apiAvailable: boolean | null;
  config: ConfigData;
  currentStep: number;
  currentStepType: StepType;
  handlePvSetupUpdate: (data: Partial<ConfigData> & { pvCapacityKw?: number; bracketSets?: number }) => void;
  totalWizardSteps: number;
  updateConfig: (updates: Partial<ConfigData>) => void;
  calcPvKw: (sets: number, panelModel: string, bracketModel: string) => number;
}

export default function WizardStepContent({
  apiAvailable,
  config,
  currentStep,
  currentStepType,
  handlePvSetupUpdate,
  totalWizardSteps,
  updateConfig,
  calcPvKw,
}: WizardStepContentProps) {
  if (currentStep === totalWizardSteps + 1) return null;

  const pvKw = calcPvKw(config.bracketSets, config.panelModel, config.bracketModel);

  // ── stable onUpdate handlers ──────────────────────────────────────────────
  const handleSimpleUpdate = useCallback(
    (data: Partial<ConfigData>) => updateConfig(data),
    [updateConfig],
  );
  const handleBracketsUpdate = useCallback(
    (data: any) => { updateConfig(data); },
    [updateConfig],
  );
  const handleGeneratorUpdate = useCallback(
    (data: any) => { updateConfig(data); },
    [updateConfig],
  );
  const handleVoltageSelect = useCallback(
    (value: string) => { updateConfig({ voltageLevel: value as any }); },
    [updateConfig],
  );
  const handleInverterUpdate = useCallback(
    (data: any) => {
      updateConfig(data);
    },
    [updateConfig],
  );
  const handleTraySelect = useCallback(
    (cap: any) => { updateConfig({ trayCapacity: cap }); },
    [updateConfig],
  );
  const handleStorageUpdate = useCallback(
    (data: any) => { updateConfig(data); },
    [updateConfig],
  );

  switch (currentStepType) {
    case 'location':
      return (
        <StepDIYAreaSetup
          locationName={config.locationName}
          latitude={config.latitude}
          longitude={config.longitude}
          peakSunHoursPerDay={config.peakSunHoursPerDay}
          annualEffHours={config.annualEffHours}
          annualKwhPerM2={config.annualKwhPerM2}
          availableAreaM2={config.availableAreaM2}
          grossAreaM2={config.grossAreaM2}
          maxBracketSetsByLayout={config.maxBracketSetsByLayout}
          panelModel={config.panelModel}
          bracketModel={config.bracketModel}
          apiAvailable={apiAvailable}
          onUpdate={handleSimpleUpdate}
        />
      );
    case 'load-input':
      return (
        <Step5LoadInput
          annualLoadKwh={config.annualLoadKwh}
          loadType={config.loadType}
          loadInputMode={config.loadInputMode}
          dailyLoadSlots={config.dailyLoadSlots}
          peakLoadKw={config.peakLoadKw}
          onUpdate={handleSimpleUpdate}
        />
      );
    case 'area':
      return (
        <StepDIYPvSetup
          availableAreaM2={config.availableAreaM2}
          maxBracketSetsByLayout={config.maxBracketSetsByLayout}
          peakSunHoursPerDay={config.peakSunHoursPerDay}
          annualEffHours={config.annualEffHours}
          annualKwhPerM2={config.annualKwhPerM2}
          panelModel={config.panelModel}
          bracketModel={config.bracketModel}
          bracketSets={config.bracketSets}
          onUpdate={handlePvSetupUpdate}
        />
      );
    case 'brackets':
      return (
        <Step2Brackets
          bracketSets={config.bracketSets}
          panelModel={config.panelModel}
          bracketModel={config.bracketModel}
          onUpdate={handleBracketsUpdate}
        />
      );
    case 'generator':
      return (
        <Step3Generator
          config={config}
          onUpdate={handleGeneratorUpdate}
        />
      );
    case 'voltage':
      return (
        <Step4Voltage
          voltageLevel={config.voltageLevel}
          onSelect={handleVoltageSelect}
        />
      );
    case 'optimize':
      return (
        <StepOptimize
          annualLoadKwh={config.annualLoadKwh ?? 0}
          dieselPriceUsd={config.dieselPriceUsd}
          hasGenerator={config.hasGenerator}
          dieselCapacityKw={config.dieselCapacityKw}
          dieselIsNew={config.dieselIsNew}
          panelModel={config.panelModel}
          batteryPackModel={config.batteryPackModel}
          onSelect={handleSimpleUpdate}
        />
      );
    case 'diy-setup':
      return (
        <StepDIYSetup
          voltageLevel={config.voltageLevel}
          requiredCurrent={config.requiredCurrent}
          inverterKw={config.inverterKw}
          inverterCount={config.inverterCount}
          onUpdate={data => updateConfig(data)}
        />
      );
    case 'diy-area-setup':
      return (
        <StepDIYAreaSetup
          locationName={config.locationName}
          latitude={config.latitude}
          longitude={config.longitude}
          peakSunHoursPerDay={config.peakSunHoursPerDay}
          annualEffHours={config.annualEffHours}
          annualKwhPerM2={config.annualKwhPerM2}
          availableAreaM2={config.availableAreaM2}
          grossAreaM2={config.grossAreaM2}
          maxBracketSetsByLayout={config.maxBracketSetsByLayout}
          panelModel={config.panelModel}
          bracketModel={config.bracketModel}
          apiAvailable={apiAvailable}
          onUpdate={handleSimpleUpdate}
        />
      );
    case 'diy-pv-setup':
      return (
        <StepDIYPvSetup
          availableAreaM2={config.availableAreaM2}
          maxBracketSetsByLayout={config.maxBracketSetsByLayout}
          peakSunHoursPerDay={config.peakSunHoursPerDay}
          annualEffHours={config.annualEffHours}
          annualKwhPerM2={config.annualKwhPerM2}
          panelModel={config.panelModel}
          bracketModel={config.bracketModel}
          bracketSets={config.bracketSets}
          onUpdate={handlePvSetupUpdate}
        />
      );
    case 'diy-inverter':
      return (
        <StepDIYInverter
          inverterKw={config.inverterKw}
          inverterCount={config.inverterCount}
          totalInverterKw={config.totalInverterKw}
          pvCapacityKw={(config as any).pvCapacityKw ?? 0}
          onUpdate={handleInverterUpdate}
        />
      );
    case 'diy-storage':
      return (
        <StepDIYStorage
          trayCount={(config as any).trayCount ?? 1}
          batteryPackModel={config.batteryPackModel}
          batteryPackCount={config.batteryPackCount}
          totalInverterKw={config.totalInverterKw}
          onUpdate={handleSimpleUpdate}
        />
      );
    case 'diy-generator':
      return (
        <StepDIYGenerator
          hasGenerator={config.hasGenerator}
          dieselIsNew={config.dieselIsNew}
          dieselCapacityKw={config.dieselCapacityKw}
          dieselMaxVoltageV={(config as any).dieselMaxVoltageV}
          dieselMaxCurrentA={(config as any).dieselMaxCurrentA}
          dieselMaxPowerKw={(config as any).dieselMaxPowerKw}
          onUpdate={handleGeneratorUpdate}
        />
      );
    case 'tray':
      return (
        <Step7Tray
          trayCapacity={config.trayCapacity || null}
          onSelect={handleTraySelect}
        />
      );
    case 'storage':
      return (
        <Step6Storage
          storageDays={config.storageDays}
          batteryPackModel={config.batteryPackModel}
          dieselCapacityKw={config.dieselCapacityKw}
          pvCapacityKw={pvKw}
          bracketSets={config.bracketSets}
          panelModel={config.panelModel}
          annualLoadKwh={config.annualLoadKwh ?? 0}
          onUpdate={handleStorageUpdate}
        />
      );
    case 'ems':
      return <Step8EMS emsAddons={config.emsAddons ?? []} onUpdate={handleSimpleUpdate} />;
    case 'economic':
      return (
        <StepEconomicSettings
          projectYears={config.projectYears}
          nominalDiscountRatePct={config.nominalDiscountRatePct}
          inflationRatePct={config.inflationRatePct}
          onUpdate={handleSimpleUpdate}
        />
      );
    default:
      return null;
  }
}
