import type { CalculateResponse, ConfigData } from '@/types/index';
import { formatAreaDual } from '@/utils/unitFormat';

export type Lang = 'en' | 'zh';
export type ResultTab = 'showcase' | 'overview' | 'capex' | 'simulation' | 'system' | 'schematic';

export const fmtUsd = (v?: number | null, d = 0) =>
  v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const fmtPct = (v?: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);
export const fmtNum = (v?: number | null, d = 1) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function localized(lang: Lang, en: string, zh: string): string {
  return { en, zh }[lang];
}

export type ExtendedSummary = NonNullable<CalculateResponse['summary']> & {
  microgridNpcUsd?: number | null;
  dieselOnlyNpcUsd?: number | null;
  npcSavingsUsd?: number | null;
  microgridAnnualizedCostUsd?: number | null;
  dieselOnlyAnnualizedCostUsd?: number | null;
  microgridOperatingCostUsd?: number | null;
  dieselOnlyOperatingCostUsd?: number | null;
  annualOperatingSavingsUsd?: number | null;
  simplePaybackYears?: number | null;
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
};

export type ExtendedSimulation = NonNullable<CalculateResponse['simulation']> & {
  mgDieselStarts?: number | null;
};

export function formatOptionalLifeYears(lang: Lang, years: number | null | undefined): string {
  if (years == null) return '—';
  const suffix = lang === 'en' ? 'years' : '年';
  return `${fmtNum(years, 1)} ${suffix}`;
}

export function buildScenarioNames(lang: Lang): Record<string, string> {
  return {
    'known-load': localized(lang, 'Known-Load', '已知负载情况'),
    diy: localized(lang, 'User DIY', '用户自定义 (DIY)'),
    'no-load': localized(lang, 'No-Load', '无负载情况'),
  };
}

export function buildEmsNames(lang: Lang): Record<string, string> {
  return {
    edge: localized(lang, 'Edge Control', '边端控制'),
    cloud: localized(lang, 'Cloud Platform', '云端控制'),
    prediction: localized(lang, 'Predictive Control', '基于预测'),
  };
}

export interface LayoutNoteContext {
  hasLayoutLimit: boolean;
  siteLayoutNote: string;
  measuredAreaDisplay: string;
  usableAreaDisplay: string;
  maxBracketSetsByLayout?: number | null;
}

export function buildLayoutContext(config: ConfigData, lang: Lang): LayoutNoteContext {
  const hasLayoutLimit = typeof config.maxBracketSetsByLayout === 'number' && config.maxBracketSetsByLayout >= 0;
  return {
    hasLayoutLimit,
    siteLayoutNote: localized(
      lang,
      'PV bracket sets are laid out fully inside the selected site polygon, with a 10 ft (3048 mm) gap kept between neighboring sets.',
      '光伏支架按完整落在场地多边形内进行排布，并在相邻支架之间保留 10 英尺（3048 mm）间距。',
    ),
    measuredAreaDisplay: config.grossAreaM2 && config.grossAreaM2 > 0
      ? formatAreaDual(config.grossAreaM2, lang).combined
      : '',
    usableAreaDisplay: config.availableAreaM2 && config.availableAreaM2 > 0
      ? formatAreaDual(config.availableAreaM2, lang).combined
      : '',
    maxBracketSetsByLayout: config.maxBracketSetsByLayout,
  };
}
