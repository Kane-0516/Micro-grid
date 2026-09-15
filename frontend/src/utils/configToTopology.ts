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
type Lang = 'zh' | 'en';
type Tr = (zh: string, en: string) => string;

interface ConfigExtras {
  pvCapacityKw?: number;
  peakLoadKw?: number;
  totalInverterKw?: number;
  batteryPackCount?: number;
  batteryCapacityKwh?: number;
  trayCount?: number;
  dieselMaxVoltageV?: number;
  dieselMaxCurrentA?: number;
  dieselMaxPowerKw?: number;
}

function getConfigExtras(config: ConfigData): ConfigExtras {
  return config as ConfigData & ConfigExtras;
}

function computeMaxSetsFromArea(
  config: ConfigData,
  bracketAreaM2: number,
): number {
  if (config.maxBracketSetsByLayout != null) {
    return config.maxBracketSetsByLayout;
  }
  if ((config.availableAreaM2 ?? 0) > 0) {
    return Math.floor(config.availableAreaM2 / bracketAreaM2);
  }
  return 0;
}

function resolvePvKw(
  sets: number,
  pvCapacityKw: number,
  resolvedPanelModel: string,
  bracketModel: string | undefined,
  defaultBracketModel: string,
  calcPvKw: (sets: number, panelModel: string, bracketModel: string) => number,
): number {
  if (sets > 0) {
    return calcPvKw(Math.max(sets, 1), resolvedPanelModel, bracketModel ?? defaultBracketModel);
  }
  return pvCapacityKw;
}

function buildKnownLoadPv(
  config: ConfigData,
  tr: Tr,
  sets: number,
  pvKw: number,
  bracketAreaM2: number,
  hasPanelModel: boolean,
  resolvedPanelLabel: string,
): TopologyData['pv'] {
  const areaM2 = sets > 0 ? sets * bracketAreaM2 : 0;
  return {
    title: tr('光伏', 'PV'),
    capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: pvKw > 0 ? pvKw.toFixed(1) : DASH, unit: pvKw > 0 ? 'kW' : '' },
    sets: { name: tr('最大支架套数', 'Max Bracket Sets'), value: sets > 0 ? sets : DASH, unit: sets > 0 ? tr('套', 'sets') : '' },
    panelModel: hasPanelModel ? resolvedPanelLabel : DASH,
    areaM2,
  };
}

function buildConfiguredPv(
  tr: Tr,
  sets: number,
  pvKw: number,
  bracketAreaM2: number,
  resolvedPanelLabel: string,
): TopologyData['pv'] {
  const areaM2 = sets > 0 ? sets * bracketAreaM2 : 0;
  return {
    title: tr('光伏', 'PV'),
    capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: pvKw > 0 ? pvKw.toFixed(1) : DASH, unit: pvKw > 0 ? 'kW' : '' },
    sets: sets > 0 ? { name: tr('最大支架套数', 'Max Bracket Sets'), value: sets, unit: tr('套', 'sets') } : undefined,
    panelModel: resolvedPanelLabel,
    areaM2: areaM2 || undefined,
  };
}

function buildPlaceholderPv(tr: Tr): TopologyData['pv'] {
  return {
    title: tr('光伏', 'PV'),
    capacity: { name: tr('光伏容量', 'PV Capacity'), value: DASH, unit: '' },
  };
}

function buildLoadSection(
  config: ConfigData,
  tr: Tr,
  extras: ConfigExtras,
): TopologyData['load'] {
  const annualKwh = config.annualLoadKwh ?? 0;
  const loadTypeKey = config.loadType ?? 'residential';
  const peakKw = extras.peakLoadKw
    ?? extras.totalInverterKw
    ?? (annualKwh > 0 ? Math.round(annualKwh / 365 / 6) : 0);

  return {
    title: tr('负载', 'Load'),
    annualKwh: {
      name: tr('年用电量', 'Annual Load'),
      value: annualKwh > 0 ? annualKwh.toLocaleString() : DASH,
      unit: annualKwh > 0 ? 'kWh' : '',
    },
    loadType: loadTypeKey,
    peakKw: peakKw > 0 ? peakKw : undefined,
  };
}

function computeEssCapacityKwh(
  config: ConfigData,
  extras: ConfigExtras,
  packCount: number,
  packCapacityKwh: number,
  pvKwForEss: number,
): number {
  if (extras.batteryCapacityKwh != null) {
    return extras.batteryCapacityKwh;
  }
  if (config.storageDays && config.storageDays > 0 && pvKwForEss > 0) {
    return Math.ceil((pvKwForEss * 3 * config.storageDays) / packCapacityKwh) * packCapacityKwh;
  }
  if (packCount > 0) {
    return packCount * packCapacityKwh;
  }
  return 0;
}

function buildEssSection(
  config: ConfigData,
  tr: Tr,
  extras: ConfigExtras,
  capacityKwh: number,
): TopologyData['ess'] {
  const packCount = extras.batteryPackCount ?? 0;
  const storageDays = config.storageDays ?? (packCount > 0 ? 1 : null);

  return {
    title: 'ESS',
    capacity: { name: tr('储能容量', 'Battery Capacity'), value: capacityKwh > 0 ? Math.round(capacityKwh) : DASH, unit: capacityKwh > 0 ? 'kWh' : '' },
    storageDays: { name: tr('储能天数', 'Storage Days'), value: storageDays ?? DASH, unit: storageDays ? tr('天', 'day') : '' },
    packModel: config.batteryPackModel || DASH,
  };
}

function buildDieselSection(config: ConfigData, tr: Tr): TopologyData['diesel'] {
  if (config.hasGenerator) {
    return {
      title: tr('柴油发电机', 'Diesel'),
      capacity: { name: tr('发电机容量', 'Generator Capacity'), value: config.dieselCapacityKw ?? 40, unit: 'kW' },
      isNew: config.dieselIsNew ?? false,
    };
  }
  return {
    title: tr('柴油发电机', 'Diesel'),
    capacity: { name: tr('发电机容量', 'Generator Capacity'), value: DASH, unit: '' },
  };
}

const VOLTAGE_RATED_MAP: Record<string, number> = {
  '120V/240V': 240,
  '120V/208V': 208,
  '277V/480V': 480,
};

function isThreePhaseVoltage(voltage: string): boolean {
  return voltage === '120V/208V' || voltage === '277V/480V';
}

function estimateDiyLoadKw(voltage: string, currentA: number): number {
  const ratedVoltage = VOLTAGE_RATED_MAP[voltage] ?? 0;
  if (ratedVoltage <= 0 || currentA <= 0) return 0;
  const phaseFactor = isThreePhaseVoltage(voltage) ? Math.sqrt(3) : 1;
  return +(((phaseFactor * ratedVoltage * currentA) / 1000) * 0.9).toFixed(1);
}

interface DiyTopologyContext {
  config: ConfigData;
  tr: Tr;
  lang: Lang;
  extras: ConfigExtras;
  bracketAreaM2: number;
  hasPanelModel: boolean;
  resolvedPanelLabel: string;
}

function formatPositiveValue(value: number, unit: string): { value: number | string; unit: string } {
  return value > 0 ? { value, unit } : { value: DASH, unit: '' };
}

function buildDiyPvCustomItems(ctx: DiyTopologyContext) {
  const { config, tr, lang, extras, bracketAreaM2, hasPanelModel, resolvedPanelLabel } = ctx;
  const pvCapacityKw = extras.pvCapacityKw ?? 0;
  const pvEstimatedArea = Math.max(0, config.bracketSets) * bracketAreaM2;
  const pvCapacity = formatPositiveValue(pvCapacityKw, 'kW');
  const bracketSets = formatPositiveValue(config.bracketSets, tr('套', 'sets'));

  return [
    { name: tr('光伏容量', 'PV Capacity'), value: pvCapacityKw > 0 ? pvCapacityKw.toFixed(1) : DASH, unit: pvCapacity.unit },
    { name: tr('支架套数', 'Bracket Sets'), value: bracketSets.value, unit: bracketSets.unit },
    { name: tr('组件型号', 'Panel Model'), value: hasPanelModel ? resolvedPanelLabel : DASH, unit: '' },
    { name: tr('预计占地面积', 'Estimated PV Area'), value: formatAreaDual(pvEstimatedArea, lang).combined, unit: '' },
  ];
}

function buildDiyLoadCustomItems(ctx: DiyTopologyContext) {
  const { config, tr } = ctx;
  const voltage = config.voltageLevel ?? DASH;
  const currentA = config.requiredCurrent ?? 0;
  const estimatedLoadKw = estimateDiyLoadKw(voltage, currentA);
  const current = formatPositiveValue(currentA, 'A');
  const loadPower = formatPositiveValue(estimatedLoadKw, 'kW');

  return [
    { name: tr('电压等级', 'Voltage Level'), value: voltage, unit: '' },
    { name: tr('最大负载电流', 'Max Load Current'), value: current.value, unit: current.unit },
    { name: tr('估算负载功率', 'Estimated Load'), value: loadPower.value, unit: loadPower.unit },
  ];
}

function buildDiyEssCustomItems(ctx: DiyTopologyContext) {
  const { config, tr, extras } = ctx;
  const trayCount = extras.trayCount ?? 0;
  const diyPackCount = extras.batteryPackCount ?? 0;
  const batteryCapacity = extras.batteryCapacityKwh ?? 0;
  const trays = formatPositiveValue(trayCount, tr('个', 'tray'));
  const packs = formatPositiveValue(diyPackCount, tr('包', 'pack'));
  const capacity = formatPositiveValue(Math.round(batteryCapacity), 'kWh');

  return [
    { name: tr('托盘数量', 'Tray Count'), value: trays.value, unit: trays.unit },
    { name: tr('电池包型号', 'Pack Model'), value: config.batteryPackModel ?? DASH, unit: '' },
    { name: tr('电池包数量', 'Pack Count'), value: packs.value, unit: packs.unit },
    { name: tr('储能容量', 'Battery Capacity'), value: capacity.value, unit: capacity.unit },
  ];
}

function buildDiyDieselCustomItems(ctx: DiyTopologyContext) {
  const { config, tr, extras } = ctx;
  const dieselMaxVoltageV = extras.dieselMaxVoltageV ?? 0;
  const dieselMaxCurrentA = extras.dieselMaxCurrentA ?? 0;
  const dieselMaxPowerKw = extras.dieselMaxPowerKw ?? 0;
  const dieselStatus = config.dieselIsNew ? tr('新购', 'New') : tr('已有', 'Existing');
  const maxVoltage = formatPositiveValue(dieselMaxVoltageV, 'V');
  const maxCurrent = formatPositiveValue(dieselMaxCurrentA, 'A');
  const loadPower = formatPositiveValue(Number(dieselMaxPowerKw.toFixed(1)), 'kW');

  return [
    { name: tr('发电机容量', 'Generator Capacity'), value: config.dieselCapacityKw ?? DASH, unit: config.dieselCapacityKw ? 'kW' : '' },
    { name: tr('最大电压', 'Max Voltage'), value: maxVoltage.value, unit: maxVoltage.unit },
    { name: tr('最大电流', 'Max Current'), value: maxCurrent.value, unit: maxCurrent.unit },
    { name: tr('负载功率', 'Load Power'), value: dieselMaxPowerKw > 0 ? dieselMaxPowerKw.toFixed(1) : DASH, unit: loadPower.unit },
    { name: tr('状态', 'Status'), value: dieselStatus, unit: '' },
  ];
}

function applyDiyTopologyOverrides(data: Partial<TopologyData>, ctx: DiyTopologyContext): void {
  const { config, tr } = ctx;

  data.pv = {
    ...(data.pv ?? { title: tr('光伏', 'PV'), capacity: { name: tr('最大光伏容量', 'Max PV Capacity'), value: DASH, unit: '' } }),
    customItems: buildDiyPvCustomItems(ctx),
  };

  data.load = {
    ...(data.load ?? { title: tr('负载', 'Load'), annualKwh: { name: tr('年用电量', 'Annual Load'), value: DASH, unit: '' } }),
    customItems: buildDiyLoadCustomItems(ctx),
  };

  data.ess = {
    ...(data.ess ?? { title: 'ESS', capacity: { name: tr('储能容量', 'Battery Capacity'), value: DASH, unit: '' } }),
    customItems: buildDiyEssCustomItems(ctx),
  };

  if (!config.hasGenerator) return;

  data.diesel = {
    ...(data.diesel ?? { title: tr('柴油发电机', 'Diesel'), capacity: { name: tr('发电机容量', 'Generator Capacity'), value: DASH, unit: '' } }),
    customItems: buildDiyDieselCustomItems(ctx),
  };
}

export function configToTopologyData(
  config: ConfigData,
  lang: Lang = 'en',
): {
  data: Partial<TopologyData>;
  visibility: TopologyVisibility;
  pvFullFields?: boolean;
} {
  const scenario = config.scenario;
  const extras = getConfigExtras(config);
  const tr: Tr = (zh, en) => (lang === 'zh' ? zh : en);
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
  const pvCapacityKw = extras.pvCapacityKw ?? 0;
  const maxSetsFromArea = computeMaxSetsFromArea(config, bracket.areaM2);
  const hasPv = config.bracketSets > 0 || pvCapacityKw > 0 || maxSetsFromArea > 0;
  const hasPanelModel = !!config.panelModel;
  const isKnownLoad = scenario === 'known-load';
  const isDIY = scenario === 'diy';
  const resolvedPanelModel = config.panelModel ?? defaultPanelModel;
  const resolvedPanelLabel = getLocalizedProductLabel(getPanelByModel(resolvedPanelModel), lang) || resolvedPanelModel;
  const sets = config.bracketSets > 0 ? config.bracketSets : maxSetsFromArea;
  const pvKw = resolvePvKw(
    config.bracketSets > 0 || maxSetsFromArea > 0 ? sets : 0,
    pvCapacityKw,
    resolvedPanelModel,
    config.bracketModel,
    defaultBracketModel,
    calcPvKw,
  );

  const visibility: TopologyVisibility = {
    pv: isKnownLoad || isDIY || hasPv || hasPanelModel,
    load: true,
    ess: true,
    diesel: config.hasGenerator,
  };

  const data: Partial<TopologyData> = {};

  if (isKnownLoad) {
    data.pv = buildKnownLoadPv(config, tr, sets, pvKw, bracket.areaM2, hasPanelModel, resolvedPanelLabel);
  } else if (hasPv || hasPanelModel) {
    data.pv = buildConfiguredPv(tr, sets, pvKw, bracket.areaM2, resolvedPanelLabel);
  } else {
    data.pv = buildPlaceholderPv(tr);
  }

  data.load = buildLoadSection(config, tr, extras);

  const pack = getBatteryByModel(config.batteryPackModel ?? defaultBatteryModel);
  const packCount = extras.batteryPackCount ?? 0;
  const bracketForEss = getBracketByModel(config.bracketModel ?? defaultBracketModel);
  const maxSetsFromAreaForEss = computeMaxSetsFromArea(config, bracketForEss.areaM2);
  const setsForEss = config.bracketSets > 0 ? config.bracketSets : maxSetsFromAreaForEss;
  const pvKwForEss = extras.pvCapacityKw
    ?? (setsForEss > 0 ? calcPvKw(setsForEss, resolvedPanelModel, config.bracketModel ?? defaultBracketModel) : 0);
  const capacityKwh = computeEssCapacityKwh(config, extras, packCount, pack.capacityKwh, pvKwForEss);

  data.ess = buildEssSection(config, tr, extras, capacityKwh);
  data.diesel = buildDieselSection(config, tr);

  if (isDIY) {
    applyDiyTopologyOverrides(data, {
      config,
      tr,
      lang,
      extras,
      bracketAreaM2: bracket.areaM2,
      hasPanelModel,
      resolvedPanelLabel,
    });
  }

  return { data, visibility, pvFullFields: isKnownLoad };
}
