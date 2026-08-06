/**
 * Convert ConfigData into MicrogridTopology data for wizard/configuration flows.
 * Supports both known-load and DIY paths and keeps device cards in sync with the current selections.
 */
import type { ConfigData } from '@/types/index';
import type { TopologyData } from '@/features/topology/components/MicrogridTopology';
import { useProductsStore } from '@/store/useProductsStore';
import { formatAreaDual } from '@/utils/unitFormat';
import { getLocalizedProductLabel } from '@/utils/productLabel';

export interface TopologyVisibility {
  pv: boolean;
  load: boolean;
  ess: boolean;
  diesel: boolean;
}

const DASH = '—';

export function configToTopologyData(
  config: ConfigData,
  lang: 'zh' | 'en' = 'en',
): {
  data: Partial<TopologyData>;
  visibility: TopologyVisibility;
  pvFullFields?: boolean;
} {
  const scenario = config.scenario;
  const visibility: TopologyVisibility = {
    pv: false,
    load: false,
    ess: false,
    diesel: false,
  };

  const data: Partial<TopologyData> = {};
  const tr = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const {
    defaultPanelModel,
    defaultBracketModel,
    defaultBatteryModel,
    calcPvKw,
    getBracketByModel,
    getBatteryByModel,
    getPanelByModel,
  } = useProductsStore.getState();

  const bracket = getBracketByModel(config.bracketModel ?? defaultBracketModel);
  const pvCapacityKw = (config as any).pvCapacityKw ?? 0;
  const maxSetsFromArea = config.maxBracketSetsByLayout != null
    ? config.maxBracketSetsByLayout
    : (config.availableAreaM2 ?? 0) > 0
      ? Math.floor(config.availableAreaM2 / bracket.areaM2)
      : 0;
  const hasPv = config.bracketSets > 0 || pvCapacityKw > 0 || maxSetsFromArea > 0;
  const hasPanelModel = !!config.panelModel;
  const isKnownLoad = scenario === 'known-load';
  const isDIY = scenario === 'diy';
  const resolvedPanelModel = config.panelModel ?? defaultPanelModel;
  const resolvedPanelLabel = getLocalizedProductLabel(getPanelByModel(resolvedPanelModel), lang) || resolvedPanelModel;

  visibility.pv = isKnownLoad || isDIY || hasPv || hasPanelModel;

  if (isKnownLoad) {
    const sets = config.bracketSets > 0 ? config.bracketSets : maxSetsFromArea;
    const pvKw = config.bracketSets > 0 || maxSetsFromArea > 0
      ? calcPvKw(Math.max(sets, 1), resolvedPanelModel, config.bracketModel ?? defaultBracketModel)
      : pvCapacityKw;
    const areaM2 = sets > 0 ? sets * bracket.areaM2 : 0;

    data.pv = {
      title: tr('光伏', 'PV'),
      capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: pvKw > 0 ? pvKw.toFixed(1) : DASH, unit: pvKw > 0 ? 'kW' : '' },
      sets: { name: tr('最大支架套数', 'Max Bracket Sets'), value: sets > 0 ? sets : DASH, unit: sets > 0 ? tr('套', 'sets') : '' },
      panelModel: hasPanelModel ? resolvedPanelLabel : DASH,
      areaM2,
    };
  } else if (hasPv || hasPanelModel) {
    const sets = config.bracketSets > 0 ? config.bracketSets : maxSetsFromArea;
    const pvKw = config.bracketSets > 0 || maxSetsFromArea > 0
      ? calcPvKw(Math.max(sets, 1), resolvedPanelModel, config.bracketModel ?? defaultBracketModel)
      : pvCapacityKw;
    const areaM2 = sets > 0 ? sets * bracket.areaM2 : 0;

    data.pv = {
      title: tr('光伏', 'PV'),
      capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: pvKw > 0 ? pvKw.toFixed(1) : DASH, unit: pvKw > 0 ? 'kW' : '' },
      sets: sets > 0 ? { name: tr('最大支架套数', 'Max Bracket Sets'), value: sets, unit: tr('套', 'sets') } : undefined,
      panelModel: resolvedPanelLabel,
      areaM2: areaM2 || undefined,
    };
  } else {
    data.pv = {
      title: tr('光伏', 'PV'),
      capacity: { name: tr('光伏容量', 'PV Capacity'), value: DASH, unit: '' },
    };
  }

  const pvFullFields = isKnownLoad;

  visibility.load = true;
  const annualKwh = config.annualLoadKwh ?? 0;
  const loadTypeKey = config.loadType ?? 'residential';
  const peakKw = (config as any).peakLoadKw
    ?? (config as any).totalInverterKw
    ?? (annualKwh > 0 ? Math.round(annualKwh / 365 / 6) : 0);

  data.load = {
    title: tr('负载', 'Load'),
    annualKwh: {
      name: tr('年用电量', 'Annual Load'),
      value: annualKwh > 0 ? annualKwh.toLocaleString() : DASH,
      unit: annualKwh > 0 ? 'kWh' : '',
    },
    loadType: loadTypeKey,
    peakKw: peakKw > 0 ? peakKw : undefined,
  };

  visibility.ess = true;
  const pack = getBatteryByModel(config.batteryPackModel ?? defaultBatteryModel);
  const packCount = (config as any).batteryPackCount ?? 0;
  const bracketForEss = getBracketByModel(config.bracketModel ?? defaultBracketModel);
  const maxSetsFromAreaForEss = config.maxBracketSetsByLayout != null
    ? config.maxBracketSetsByLayout
    : (config.availableAreaM2 ?? 0) > 0
      ? Math.floor(config.availableAreaM2 / bracketForEss.areaM2)
      : 0;
  const setsForEss = config.bracketSets > 0 ? config.bracketSets : maxSetsFromAreaForEss;
  const pvKwForEss = (config as any).pvCapacityKw
    ?? (setsForEss > 0 ? calcPvKw(setsForEss, resolvedPanelModel, config.bracketModel ?? defaultBracketModel) : 0);
  const capacityKwh = (config as any).batteryCapacityKwh
    ?? (config.storageDays && config.storageDays > 0 && pvKwForEss > 0
      ? Math.ceil((pvKwForEss * 3 * config.storageDays) / pack.capacityKwh) * pack.capacityKwh
      : packCount > 0 ? packCount * pack.capacityKwh : 0);
  const storageDays = config.storageDays ?? (packCount > 0 ? 1 : null);

  data.ess = {
    title: 'ESS',
    capacity: { name: tr('储能容量', 'Battery Capacity'), value: capacityKwh > 0 ? Math.round(capacityKwh) : DASH, unit: capacityKwh > 0 ? 'kWh' : '' },
    storageDays: { name: tr('储能天数', 'Storage Days'), value: storageDays ?? DASH, unit: storageDays ? tr('天', 'day') : '' },
    packModel: config.batteryPackModel || DASH,
  };

  visibility.diesel = config.hasGenerator;
  if (config.hasGenerator) {
    data.diesel = {
      title: tr('柴油发电机', 'Diesel'),
      capacity: { name: tr('发电机容量', 'Generator Capacity'), value: config.dieselCapacityKw ?? 40, unit: 'kW' },
      isNew: config.dieselIsNew ?? false,
    };
  } else {
    data.diesel = {
      title: tr('柴油发电机', 'Diesel'),
      capacity: { name: tr('发电机容量', 'Generator Capacity'), value: DASH, unit: '' },
    };
  }

  if (isDIY) {
    const voltage = config.voltageLevel ?? DASH;
    const currentA = config.requiredCurrent ?? 0;
    const isThreePhase = voltage === '120V/208V' || voltage === '277V/480V';
    const ratedVoltage = voltage === '120V/240V' ? 240 : voltage === '120V/208V' ? 208 : voltage === '277V/480V' ? 480 : 0;
    const estimatedLoadKw = (ratedVoltage > 0 && currentA > 0)
      ? +((((isThreePhase ? Math.sqrt(3) : 1) * ratedVoltage * currentA) / 1000) * 0.9).toFixed(1)
      : 0;

    const trayCount = (config as any).trayCount ?? 0;
    const diyPackCount = (config as any).batteryPackCount ?? 0;
    const batteryCapacity = (config as any).batteryCapacityKwh ?? 0;
    const dieselMaxVoltageV = (config as any).dieselMaxVoltageV ?? 0;
    const dieselMaxCurrentA = (config as any).dieselMaxCurrentA ?? 0;
    const dieselMaxPowerKw = (config as any).dieselMaxPowerKw ?? 0;
    const dieselStatus = config.dieselIsNew ? tr('新购', 'New') : tr('已有', 'Existing');

    const pvEstimatedArea = (config.bracketSets > 0 ? config.bracketSets : 0) * bracket.areaM2;
    data.pv = {
      ...(data.pv ?? { title: tr('光伏', 'PV'), capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: DASH, unit: '' } }),
      customItems: [
        { name: tr('光伏容量', 'PV Capacity'), value: pvCapacityKw > 0 ? pvCapacityKw.toFixed(1) : DASH, unit: pvCapacityKw > 0 ? 'kW' : '' },
        { name: tr('支架套数', 'Bracket Sets'), value: config.bracketSets > 0 ? config.bracketSets : DASH, unit: config.bracketSets > 0 ? tr('套', 'sets') : '' },
        { name: tr('组件型号', 'Panel Model'), value: hasPanelModel ? resolvedPanelLabel : DASH, unit: '' },
        { name: tr('预计占地面积', 'Estimated PV Area'), value: formatAreaDual(pvEstimatedArea, lang).combined, unit: '' },
      ],
    };

    data.load = {
      ...(data.load ?? { title: tr('负载', 'Load'), annualKwh: { name: tr('年用电量', 'Annual Load'), value: DASH, unit: '' } }),
      customItems: [
        { name: tr('电压等级', 'Voltage Level'), value: voltage, unit: '' },
        { name: tr('最大负载电流', 'Max Load Current'), value: currentA > 0 ? currentA : DASH, unit: currentA > 0 ? 'A' : '' },
        { name: tr('估算负载功率', 'Estimated Load'), value: estimatedLoadKw > 0 ? estimatedLoadKw : DASH, unit: estimatedLoadKw > 0 ? 'kW' : '' },
      ],
    };

    data.ess = {
      ...(data.ess ?? { title: 'ESS', capacity: { name: tr('储能容量', 'Battery Capacity'), value: DASH, unit: '' } }),
      customItems: [
        { name: tr('托盘数量', 'Tray Count'), value: trayCount > 0 ? trayCount : DASH, unit: trayCount > 0 ? tr('个', 'tray') : '' },
        { name: tr('电池包型号', 'Pack Model'), value: config.batteryPackModel ?? DASH, unit: '' },
        { name: tr('电池包数量', 'Pack Count'), value: diyPackCount > 0 ? diyPackCount : DASH, unit: diyPackCount > 0 ? tr('包', 'pack') : '' },
        { name: tr('储能容量', 'Battery Capacity'), value: batteryCapacity > 0 ? Math.round(batteryCapacity) : DASH, unit: batteryCapacity > 0 ? 'kWh' : '' },
      ],
    };

    if (config.hasGenerator) {
      data.diesel = {
        ...(data.diesel ?? { title: tr('柴油发电机', 'Diesel'), capacity: { name: tr('发电机容量', 'Generator Capacity'), value: DASH, unit: '' } }),
        customItems: [
          { name: tr('发电机容量', 'Generator Capacity'), value: config.dieselCapacityKw ?? DASH, unit: config.dieselCapacityKw ? 'kW' : '' },
          { name: tr('最大电压', 'Max Voltage'), value: dieselMaxVoltageV > 0 ? dieselMaxVoltageV : DASH, unit: dieselMaxVoltageV > 0 ? 'V' : '' },
          { name: tr('最大电流', 'Max Current'), value: dieselMaxCurrentA > 0 ? dieselMaxCurrentA : DASH, unit: dieselMaxCurrentA > 0 ? 'A' : '' },
          { name: tr('负载功率', 'Load Power'), value: dieselMaxPowerKw > 0 ? dieselMaxPowerKw.toFixed(1) : DASH, unit: dieselMaxPowerKw > 0 ? 'kW' : '' },
          { name: tr('状态', 'Status'), value: dieselStatus, unit: '' },
        ],
      };
    }
  }

  return { data, visibility, pvFullFields };
}
