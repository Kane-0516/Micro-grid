/**
 * resultToTopology.ts ? convert CalculateResponse into MicrogridTopology data
 * Used by the result-page product schematic/tab.
 */
import type { CalculateResponse } from '@/types/index';
import type { TopologyData } from '@/features/topology/components/MicrogridTopology';
import { useProductsStore } from '@/store/useProductsStore';
import { formatAreaDual } from '@/utils/unitFormat';

export function resultToTopologyData(
  apiResult: CalculateResponse | null,
  config?: { panelModel?: string; panelDisplayName?: string; loadType?: string; voltageLevel?: string; dieselPriceUsd?: number; lang?: 'zh' | 'en' }
): Partial<TopologyData> {
  if (!apiResult?.systemConfig) return {};

  const sc = apiResult.systemConfig as Record<string, unknown>;
  const pvKw = typeof sc.pvCapacityKw === 'number' ? sc.pvCapacityKw : 0;
  const bracketSets = typeof sc.bracketSets === 'number' ? sc.bracketSets : 0;
  const areaM2 = typeof sc.occupiedAreaM2 === 'number' ? sc.occupiedAreaM2 : 0;
  const batteryKwh = typeof sc.batteryCapacityKwh === 'number' ? sc.batteryCapacityKwh : 0;
  const batteryPackCount = typeof sc.batteryPackCount === 'number' ? sc.batteryPackCount : 0;
  const batteryModel = sc.batteryModel as string | undefined;
  const dieselKw = typeof sc.dieselCapacityKw === 'number' ? sc.dieselCapacityKw : 0;
  const annualKwh = typeof sc.annualLoadKwh === 'number' ? sc.annualLoadKwh : 0;
  const loadType = (sc.loadType as string) || config?.loadType || 'industrial';
  const lang = config?.lang ?? 'en';
  const tr = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const { defaultPanelModel } = useProductsStore.getState();
  const rawPanelModel = (sc.panelModel as string) || config?.panelModel || defaultPanelModel;
  const panelLabel = lang === 'en' ? rawPanelModel : (config?.panelDisplayName || rawPanelModel);

  return {
    pv: {
      title: tr('光伏', 'PV'),
      capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: pvKw > 0 ? pvKw.toFixed(1) : '?', unit: pvKw > 0 ? 'kW' : '' },
      sets: bracketSets > 0 ? { name: tr('最大支架套数', 'Max Bracket Sets'), value: bracketSets, unit: tr('套', 'sets') } : undefined,
      panelModel: panelLabel,
      customItems: [
        { name: tr('最大光伏容量', 'Max PV Capacity'), value: pvKw > 0 ? pvKw.toFixed(1) : '?', unit: pvKw > 0 ? 'kW' : '' },
        ...(bracketSets > 0 ? [{ name: tr('最大支架套数', 'Max Bracket Sets'), value: bracketSets, unit: tr('套', 'sets') }] : []),
        { name: tr('组件型号', 'Panel Model'), value: panelLabel, unit: '' },
        ...(areaM2 > 0 ? [{ name: tr('最大占地面积', 'Max Area'), value: formatAreaDual(areaM2, lang).combined, unit: '' }] : []),
      ],
    },
    load: {
      title: tr('负载', 'Load'),
      annualKwh: { name: tr('年用电量', 'Annual Load'), value: annualKwh > 0 ? annualKwh.toLocaleString() : '?', unit: annualKwh > 0 ? 'kWh' : '' },
      loadType,
      peakKw: annualKwh > 0 ? Math.round(annualKwh / 365 / 6) : undefined,
    },
    ess: {
      title: 'ESS',
      capacity: { name: tr('储能容量', 'Battery Capacity'), value: batteryKwh > 0 ? Math.round(batteryKwh) : '?', unit: batteryKwh > 0 ? 'kWh' : '' },
      storageDays: { name: tr('储能天数', 'Storage Days'), value: batteryKwh > 0 ? 1 : '?', unit: batteryKwh > 0 ? tr('天', 'day') : '' },
      packModel: batteryModel || '?',
      customItems: [
        { name: tr('储能容量', 'Battery Capacity'), value: batteryKwh > 0 ? Math.round(batteryKwh) : '?', unit: batteryKwh > 0 ? 'kWh' : '' },
        { name: tr('储能天数', 'Storage Days'), value: batteryKwh > 0 ? 1 : '?', unit: batteryKwh > 0 ? tr('天', 'day') : '' },
        { name: tr('电池包型号', 'Pack Model'), value: batteryModel || '?', unit: '' },
        ...(batteryPackCount > 0 ? [{ name: tr('电池包数量', 'Pack Count'), value: batteryPackCount, unit: tr('包', 'pack') }] : []),
      ],
    },
    diesel: dieselKw > 0
      ? {
          title: tr('柴油发电机', 'Diesel'),
          capacity: { name: tr('发电机容量', 'Generator Capacity'), value: dieselKw, unit: 'kW' },
          isNew: (sc.dieselIsNew as boolean) ?? false,
          customItems: [
            { name: tr('发电机容量', 'Generator Capacity'), value: dieselKw, unit: 'kW' },
            { name: tr('状态', 'Status'), value: ((sc.dieselIsNew as boolean) ?? false) ? tr('新购', 'New') : tr('已有', 'Existing'), unit: '' },
          ],
        }
      : {
          title: tr('柴油发电机', 'Diesel'),
          capacity: { name: tr('发电机容量', 'Generator Capacity'), value: '?', unit: '' },
        },
  };
}
