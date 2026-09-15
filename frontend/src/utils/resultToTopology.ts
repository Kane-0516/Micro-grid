/**
 * resultToTopology.ts — convert CalculateResponse into MicrogridTopology data
 * Used by the result-page product schematic/tab.
 */
import type { CalculateResponse } from '@/types/index';
import type { TopologyData } from '@/features/topology/components/MicrogridTopology';
import { useProductsStore } from '@/store/useProductsStore';
import { formatAreaDual } from '@/utils/unitFormat';

type Lang = 'zh' | 'en';
type Tr = (zh: string, en: string) => string;

interface ResultTopologyConfig {
  panelModel?: string;
  panelDisplayName?: string;
  loadType?: string;
  voltageLevel?: string;
  dieselPriceUsd?: number;
  lang?: Lang;
}

interface ParsedSystemConfig {
  pvKw: number;
  bracketSets: number;
  areaM2: number;
  batteryKwh: number;
  batteryPackCount: number;
  batteryModel?: string;
  dieselKw: number;
  annualKwh: number;
  loadType: string;
  dieselIsNew: boolean;
  rawPanelModel: string;
}

function parseSystemConfig(
  sc: Record<string, unknown>,
  config?: ResultTopologyConfig,
): ParsedSystemConfig {
  const { defaultPanelModel } = useProductsStore.getState();
  return {
    pvKw: typeof sc.pvCapacityKw === 'number' ? sc.pvCapacityKw : 0,
    bracketSets: typeof sc.bracketSets === 'number' ? sc.bracketSets : 0,
    areaM2: typeof sc.occupiedAreaM2 === 'number' ? sc.occupiedAreaM2 : 0,
    batteryKwh: typeof sc.batteryCapacityKwh === 'number' ? sc.batteryCapacityKwh : 0,
    batteryPackCount: typeof sc.batteryPackCount === 'number' ? sc.batteryPackCount : 0,
    batteryModel: sc.batteryModel as string | undefined,
    dieselKw: typeof sc.dieselCapacityKw === 'number' ? sc.dieselCapacityKw : 0,
    annualKwh: typeof sc.annualLoadKwh === 'number' ? sc.annualLoadKwh : 0,
    loadType: (sc.loadType as string) || config?.loadType || 'industrial',
    dieselIsNew: (sc.dieselIsNew as boolean) ?? false,
    rawPanelModel: (sc.panelModel as string) || config?.panelModel || defaultPanelModel,
  };
}

function buildResultPvSection(
  parsed: ParsedSystemConfig,
  panelLabel: string,
  tr: Tr,
  lang: Lang,
): TopologyData['pv'] {
  return {
    title: tr('光伏', 'PV'),
    capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: parsed.pvKw > 0 ? parsed.pvKw.toFixed(1) : '?', unit: parsed.pvKw > 0 ? 'kW' : '' },
    sets: parsed.bracketSets > 0 ? { name: tr('最大支架套数', 'Max Bracket Sets'), value: parsed.bracketSets, unit: tr('套', 'sets') } : undefined,
    panelModel: panelLabel,
    customItems: [
      { name: tr('最大光伏容量', 'Max PV Capacity'), value: parsed.pvKw > 0 ? parsed.pvKw.toFixed(1) : '?', unit: parsed.pvKw > 0 ? 'kW' : '' },
      ...(parsed.bracketSets > 0 ? [{ name: tr('最大支架套数', 'Max Bracket Sets'), value: parsed.bracketSets, unit: tr('套', 'sets') }] : []),
      { name: tr('组件型号', 'Panel Model'), value: panelLabel, unit: '' },
      ...(parsed.areaM2 > 0 ? [{ name: tr('最大占地面积', 'Max Area'), value: formatAreaDual(parsed.areaM2, lang).combined, unit: '' }] : []),
    ],
  };
}

function buildResultLoadSection(parsed: ParsedSystemConfig, tr: Tr): TopologyData['load'] {
  return {
    title: tr('负载', 'Load'),
    annualKwh: { name: tr('年用电量', 'Annual Load'), value: parsed.annualKwh > 0 ? parsed.annualKwh.toLocaleString() : '?', unit: parsed.annualKwh > 0 ? 'kWh' : '' },
    loadType: parsed.loadType,
    peakKw: parsed.annualKwh > 0 ? Math.round(parsed.annualKwh / 365 / 6) : undefined,
  };
}

function buildResultEssSection(parsed: ParsedSystemConfig, tr: Tr): TopologyData['ess'] {
  return {
    title: 'ESS',
    capacity: { name: tr('储能容量', 'Battery Capacity'), value: parsed.batteryKwh > 0 ? Math.round(parsed.batteryKwh) : '?', unit: parsed.batteryKwh > 0 ? 'kWh' : '' },
    storageDays: { name: tr('储能天数', 'Storage Days'), value: parsed.batteryKwh > 0 ? 1 : '?', unit: parsed.batteryKwh > 0 ? tr('天', 'day') : '' },
    packModel: parsed.batteryModel || '?',
    customItems: [
      { name: tr('储能容量', 'Battery Capacity'), value: parsed.batteryKwh > 0 ? Math.round(parsed.batteryKwh) : '?', unit: parsed.batteryKwh > 0 ? 'kWh' : '' },
      { name: tr('储能天数', 'Storage Days'), value: parsed.batteryKwh > 0 ? 1 : '?', unit: parsed.batteryKwh > 0 ? tr('天', 'day') : '' },
      { name: tr('电池包型号', 'Pack Model'), value: parsed.batteryModel || '?', unit: '' },
      ...(parsed.batteryPackCount > 0 ? [{ name: tr('电池包数量', 'Pack Count'), value: parsed.batteryPackCount, unit: tr('包', 'pack') }] : []),
    ],
  };
}

function buildResultDieselSection(parsed: ParsedSystemConfig, tr: Tr): TopologyData['diesel'] {
  if (parsed.dieselKw <= 0) {
    return {
      title: tr('柴油发电机', 'Diesel'),
      capacity: { name: tr('发电机容量', 'Generator Capacity'), value: '?', unit: '' },
    };
  }

  const dieselStatus = parsed.dieselIsNew ? tr('新购', 'New') : tr('已有', 'Existing');
  return {
    title: tr('柴油发电机', 'Diesel'),
    capacity: { name: tr('发电机容量', 'Generator Capacity'), value: parsed.dieselKw, unit: 'kW' },
    isNew: parsed.dieselIsNew,
    customItems: [
      { name: tr('发电机容量', 'Generator Capacity'), value: parsed.dieselKw, unit: 'kW' },
      { name: tr('状态', 'Status'), value: dieselStatus, unit: '' },
    ],
  };
}

export function resultToTopologyData(
  apiResult: CalculateResponse | null,
  config?: ResultTopologyConfig,
): Partial<TopologyData> {
  if (!apiResult?.systemConfig) return {};

  const lang = config?.lang ?? 'en';
  const tr: Tr = (zh, en) => (lang === 'zh' ? zh : en);
  const parsed = parseSystemConfig(apiResult.systemConfig as Record<string, unknown>, config);
  const panelLabel = lang === 'en' ? parsed.rawPanelModel : (config?.panelDisplayName || parsed.rawPanelModel);

  return {
    pv: buildResultPvSection(parsed, panelLabel, tr, lang),
    load: buildResultLoadSection(parsed, tr),
    ess: buildResultEssSection(parsed, tr),
    diesel: buildResultDieselSection(parsed, tr),
  };
}
