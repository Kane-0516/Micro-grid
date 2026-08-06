import type { ConfigData, CustomFlowBranch, Scenario } from '@/types/index';

export type StepType =
  | ''
  | 'location'
  | 'area'
  | 'brackets'
  | 'generator'
  | 'voltage'
  | 'load-input'
  | 'optimize'
  | 'tray'
  | 'storage'
  | 'ems'
  | 'economic'
  | 'diy-setup'
  | 'diy-area-setup'
  | 'diy-pv-setup'
  | 'diy-inverter'
  | 'diy-storage'
  | 'diy-generator';

type Translator = (key: string) => string;

const SITE_INFO_ZH = '场地信息';
const PV_MODULE_ZH = '光伏组件';

function getCustomBranchStepType(branch: CustomFlowBranch | null | undefined, step: number): StepType {
  if (step === 1) return 'location';
  if (step === 2) return 'area';

  if (branch === 'known-load') {
    if (step === 3) return 'load-input';
    if (step === 4) return 'generator';
    if (step === 5) return 'voltage';
    if (step === 6) return 'ems';
  }

  if (branch === 'diy') {
    if (step === 3) return 'diy-inverter';
    if (step === 4) return 'diy-storage';
    if (step === 5) return 'diy-generator';
    if (step === 6) return 'ems';
  }

  return '';
}

export function getStepType(
  scenario: Scenario | null,
  step: number,
  customFlowBranch?: CustomFlowBranch | null,
): StepType {
  if (scenario === 'custom') {
    return getCustomBranchStepType(customFlowBranch, step);
  }

  if (scenario === 'known-load') {
    if (step === 1) return 'location';
    if (step === 2) return 'area';
    if (step === 3) return 'load-input';
    if (step === 4) return 'generator';
    if (step === 5) return 'voltage';
    if (step === 6) return 'ems';
  }

  if (scenario === 'diy') {
    if (step === 1) return 'diy-area-setup';
    if (step === 2) return 'diy-pv-setup';
    if (step === 3) return 'diy-inverter';
    if (step === 4) return 'diy-storage';
    if (step === 5) return 'diy-generator';
    if (step === 6) return 'ems';
  }

  return '';
}

export function getTotalWizardSteps(scenario: Scenario | null): number {
  if (scenario === 'custom' || scenario === 'known-load' || scenario === 'diy') return 6;
  return 6;
}

export function canProceedStep(config: ConfigData, stepType: StepType): boolean {
  switch (stepType) {
    case 'location':
      return !!(
        config.latitude != null &&
        config.longitude != null &&
        config.peakSunHoursPerDay &&
        config.availableAreaM2 &&
        config.availableAreaM2 > 0
      );
    case 'load-input':
      return !!(config.annualLoadKwh && config.annualLoadKwh > 0);
    case 'area':
    case 'brackets':
    case 'diy-pv-setup':
      return !!(config.bracketSets && config.bracketSets > 0);
    case 'generator':
    case 'diy-generator':
    case 'ems':
    case 'economic':
      return true;
    case 'voltage':
    case 'diy-setup':
      return !!config.voltageLevel;
    case 'diy-area-setup':
      return !!(
        config.availableAreaM2 &&
        config.availableAreaM2 > 0 &&
        config.latitude != null &&
        config.longitude != null
      );
    case 'diy-inverter':
      return !!(
        config.inverterCount &&
        config.inverterCount > 0 &&
        config.inverterKw &&
        config.inverterKw > 0
      );
    case 'diy-storage':
      return !!(config.batteryPackCount && config.batteryPackCount > 0);
    case 'tray':
      return !!config.trayCapacity;
    case 'storage':
      return !!config.storageDays;
    default:
      return false;
  }
}

export function getStepProceedBlockers(
  config: ConfigData,
  stepType: StepType,
  lang: string,
  apiAvailable?: boolean | null,
): string[] {
  const isEn = lang === 'en';

  switch (stepType) {
    case 'location': {
      const blockers: string[] = [];
      if (config.latitude == null || config.longitude == null) {
        blockers.push(
          isEn
            ? 'select a project location using search, current location, or the map'
            : '选择项目地点，可使用搜索、当前位置或地图点选',
        );
      }
      if (!(config.availableAreaM2 && config.availableAreaM2 > 0)) {
        blockers.push(
          isEn
            ? 'enter the usable area, or draw the site boundary on the map to calculate it automatically'
            : '填写可用面积，或在地图框选场地后自动计算面积',
        );
      }
      if (config.latitude != null && config.longitude != null && !config.peakSunHoursPerDay) {
        blockers.push(
          apiAvailable === false
            ? (isEn ? 'the backend API is unavailable, so solar parameters could not be loaded' : '后端接口不可用，日照参数未能加载')
            : (isEn ? 'wait for solar parameters to finish loading' : '等待日照参数加载完成'),
        );
      }
      return blockers;
    }
    case 'diy-area-setup': {
      const blockers: string[] = [];
      if (config.latitude == null || config.longitude == null) {
        blockers.push(
          isEn
            ? 'select a project location using search, current location, or the map'
            : '选择项目地点，可使用搜索、当前位置或地图点选',
        );
      }
      if (!(config.availableAreaM2 && config.availableAreaM2 > 0)) {
        blockers.push(
          isEn
            ? 'enter the usable area, or draw the site boundary on the map to calculate it automatically'
            : '填写可用面积，或在地图框选场地后自动计算面积',
        );
      }
      return blockers;
    }
    case 'load-input':
      return config.annualLoadKwh && config.annualLoadKwh > 0
        ? []
        : [isEn ? 'enter annual load consumption' : '填写年用电量'];
    case 'area':
    case 'brackets':
    case 'diy-pv-setup':
      return config.bracketSets && config.bracketSets > 0
        ? []
        : [isEn ? 'select the PV set count' : '选择光伏支架套数'];
    case 'voltage':
    case 'diy-setup':
      return config.voltageLevel ? [] : [isEn ? 'select the output voltage' : '选择输出电压'];
    case 'diy-inverter': {
      const blockers: string[] = [];
      if (!(config.inverterCount && config.inverterCount > 0)) {
        blockers.push(isEn ? 'set the inverter quantity' : '填写逆变器数量');
      }
      if (!(config.inverterKw && config.inverterKw > 0)) {
        blockers.push(isEn ? 'set the inverter power' : '填写逆变器功率');
      }
      return blockers;
    }
    case 'diy-storage':
      return config.batteryPackCount && config.batteryPackCount > 0
        ? []
        : [isEn ? 'set the battery pack quantity' : '填写电池包数量'];
    case 'tray':
      return config.trayCapacity ? [] : [isEn ? 'select the battery tray capacity' : '选择电池托盘容量'];
    case 'storage':
      return config.storageDays ? [] : [isEn ? 'select the storage autonomy' : '选择储能天数'];
    default:
      return [];
  }
}

export function getStepTitle(stepType: StepType, lang: string, t: Translator): string {
  const titleMap: Record<StepType, string> = {
    '': t('step.default.title'),
    location: lang === 'en' ? 'Site Information' : SITE_INFO_ZH,
    'load-input': t('step.load.title'),
    area: lang === 'en' ? 'PV Module' : PV_MODULE_ZH,
    brackets: lang === 'en' ? 'PV Module' : PV_MODULE_ZH,
    generator: t('step.generator.title'),
    voltage: t('step.voltage.title'),
    optimize: t('step.default.title'),
    tray: t('step.default.title'),
    storage: t('step.default.title'),
    ems: t('step.ems.title'),
    economic: lang === 'en' ? 'Economic Settings' : '经济参数',
    'diy-setup': t('step.diy.voltage.title'),
    'diy-area-setup': lang === 'en' ? 'Site Information' : SITE_INFO_ZH,
    'diy-pv-setup': lang === 'en' ? 'PV Module' : PV_MODULE_ZH,
    'diy-inverter': t('step.diy.inverter.title'),
    'diy-storage': t('step.diy.storage.title'),
    'diy-generator': t('step.diy.generator.title'),
  };

  return titleMap[stepType] || t('step.default.title');
}

export function getStepDescription(stepType: StepType, lang: string, t: Translator): string {
  const descMap: Record<StepType, string> = {
    '': '',
    location: '',
    'load-input': t('step.load.desc'),
    area: t('step.diy.area.desc'),
    brackets: '',
    generator: t('step.generator.desc'),
    voltage: t('step.voltage.desc'),
    optimize: '',
    tray: '',
    storage: '',
    ems: t('step.ems.desc'),
    economic: lang === 'en'
      ? 'Set the lifecycle horizon and discount assumptions used by the HOMER-style financial model.'
      : '设置 HOMER 风格经济模型使用的项目周期与贴现假设。',
    'diy-setup': t('step.diy.voltage.desc'),
    'diy-area-setup': '',
    'diy-pv-setup': t('step.diy.area.desc'),
    'diy-inverter': t('step.diy.inverter.desc'),
    'diy-storage': t('step.diy.storage.desc'),
    'diy-generator': t('step.diy.generator.desc'),
  };

  return descMap[stepType] || '';
}

export function getStepInfoMessage(stepType: StepType, lang: string, t: Translator): string {
  const infoMap: Record<StepType, string> = {
    '': '',
    location: t('info.location'),
    'load-input': t('info.load'),
    area: t('info.diy.area'),
    brackets: '',
    generator: t('info.generator'),
    voltage: t('info.voltage'),
    optimize: '',
    tray: '',
    storage: '',
    ems: t('info.ems'),
    economic: lang === 'en'
      ? 'These assumptions affect NPC, annualized cost, COE, and payback outputs.'
      : '这些假设会影响 NPC、年化成本、COE 和回本年限结果。',
    'diy-setup': t('info.diy.voltage'),
    'diy-area-setup': t('info.diy.area.setup'),
    'diy-pv-setup': t('info.diy.area'),
    'diy-inverter': t('info.diy.inverter'),
    'diy-storage': t('info.diy.storage'),
    'diy-generator': t('info.diy.generator'),
  };

  return infoMap[stepType] || '';
}

export function shouldShowSiteAreaMap(scenario: Scenario | null, stepType: StepType): boolean {
  return (
    ((scenario === 'known-load' || scenario === 'custom') && stepType === 'location') ||
    (scenario === 'diy' && stepType === 'diy-area-setup')
  );
}
