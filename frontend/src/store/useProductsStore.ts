/**
 * store/useProductsStore.ts — 产品目录状态（替代 ProductsContext）
 *
 * 用法：
 *   const { pvPanels, calcPvKw, isFromAPI } = useProductsStore();
 *
 * 不再需要 <ProductsProvider> 包裹，Zustand 自动初始化。
 */
import { create } from 'zustand';
import {
  PV_PANELS, BRACKET_SYSTEMS, BATTERY_PACKS, DIESEL_GENERATORS, INTEGRATED_SPECS,
  DEFAULT_PANEL_MODEL, DEFAULT_BRACKET_MODEL, DEFAULT_BATTERY_MODEL,
  DEFAULT_BRACKET_SPACING_M, DEFAULT_SITE_LAYOUT,
  type PVPanel, type BracketSystem, type BatteryPack, type IntegratedSpec, type SiteLayout,
} from '@/data/products';
import { fetchProducts } from '@/api/client';
import type { ProductsData } from '@/api/client';
import type { DieselDispatchMode, LoadType } from '@/types/index';

// ── 兼容旧 ProductsContext 的 DieselGenerator 类型 ────────────
export interface DieselGenerator {
  model:       string;
  displayName: string;
  displayNameEn?: string;
  displayNameZh?: string;
  powerKw:     number;
  priceUsd:    number;
}

export interface StandardProductPackage {
  size: 'small' | 'medium' | 'large';
  displayName: string;
  displayNameEn?: string;
  displayNameZh?: string;
  panelModel: string;
  bracketModel: string;
  bracketSets: number;
  annualLoadKwh: number;
  peakLoadKw: number;
  loadType: string;
  dieselModel: string;
  batteryPackModel: string;
  batteryPackCount: number;
}

export interface HomeBgDefaults {
  pvKw: number;
  annualLoadKwh: number;
  dieselKw: number;
  dieselPriceUsd: number;
  batteryKwh: number;
  storageDays: number;
}

export interface SimulationDefaults {
  systemEfficiency: number;
  defaultYear: number;
  defaultLoadType: LoadType;
  dieselDispatchMode: DieselDispatchMode;
}

export interface EconomicDefaults {
  dieselPriceUsdPerLiter: number;
  electricityPriceUsdPerKwh: number;
  projectYears: number;
  nominalDiscountRatePct: number;
  inflationRatePct: number;
}

// ── 计算辅助函数类型 ──────────────────────────────────────────
export interface ProductsCatalog {
  pvPanels:          PVPanel[];
  bracketSystems:    BracketSystem[];
  batteryPacks:      BatteryPack[];
  dieselGenerators:  DieselGenerator[];
  integratedSpecs:   IntegratedSpec[];
  standardProducts:  StandardProductPackage[];
  homeBgDefaults:    HomeBgDefaults;
  simulationDefaults: SimulationDefaults;
  economicDefaults: EconomicDefaults;
  defaultPanelModel:   string;
  defaultBracketModel: string;
  defaultBatteryModel: string;
  bracketSpacingM:     number;
  siteLayout:          SiteLayout;
  isFromAPI: boolean;
  isLoading: boolean;
  loadError: string | null;

  getPanelByModel:          (model: string) => PVPanel;
  getBracketByModel:        (model: string) => BracketSystem;
  getBatteryByModel:        (model: string) => BatteryPack;
  calcPvKw:                 (sets: number, panelModel: string, bracketModel: string) => number;
  calcBatteryPacks:         (diesel: number, pv: number, days: number, packModel: string) => number;
  calcBatteryKwh:           (diesel: number, pv: number, days: number, packModel: string) => number;
  calcBatteryPacksFromLoad: (annualKwh: number, days: number, packModel: string, mode?: 'hybrid' | 'autonomous') => number;
  /** 触发数据初始化（在 App 挂载时调用一次） */
  init: () => void;
  retry: () => void;
}

// ── 私有辅助：从产品列表构建纯函数工具集 ─────────────────────
function buildHelpers(panels: PVPanel[], brackets: BracketSystem[], batteries: BatteryPack[]) {
  const fallbackPanel: PVPanel = {
    model: '',
    displayName: '',
    watts: 0,
    pricePerWp: 0,
    efficiencyPct: 0,
    kwPerSet: () => 0,
  };
  const fallbackBracket: BracketSystem = {
    model: '',
    displayName: '',
    panelsPerSet: 0,
    areaM2: 0,
    footprintLengthM: 0,
    footprintWidthM: 0,
  };
  const fallbackBattery: BatteryPack = {
    model: '',
    displayName: '',
    capacityKwh: 0,
    priceUsd: 0,
    cycleLife: 0,
  };

  const getPanelByModel = (m: string) => panels.find(p => p.model === m) ?? panels[0] ?? fallbackPanel;
  const getBracketByModel = (m: string) => brackets.find(b => b.model === m) ?? brackets[0] ?? fallbackBracket;
  const getBatteryByModel = (m: string) => batteries.find(b => b.model === m) ?? batteries[0] ?? fallbackBattery;

  const calcPvKw = (sets: number, pm: string, bm: string) => {
    const p = getPanelByModel(pm);
    const b = getBracketByModel(bm);
    return +(sets * b.panelsPerSet * p.watts / 1000).toFixed(2);
  };

  const calcBatteryPacks = (diesel: number, pv: number, days: number, packModel: string) => {
    const pack   = getBatteryByModel(packModel);
    if (pack.capacityKwh <= 0) return 0;
    const target = pv > 0 ? pv * 3 * days : diesel * 4 * days;
    return Math.max(1, Math.ceil(target / pack.capacityKwh));
  };

  const calcBatteryKwh = (diesel: number, pv: number, days: number, packModel: string) => {
    const pack  = getBatteryByModel(packModel);
    return calcBatteryPacks(diesel, pv, days, packModel) * pack.capacityKwh;
  };

  const calcBatteryPacksFromLoad = (
    annualKwh: number, days: number, packModel: string, mode: 'hybrid' | 'autonomous' = 'hybrid',
  ) => {
    const pack   = getBatteryByModel(packModel);
    if (pack.capacityKwh <= 0) return 0;
    const daily  = annualKwh / 365;
    const factor = mode === 'autonomous' ? 1.0 : 0.5;
    const target = daily * factor * days / 0.9;
    return Math.max(1, Math.ceil(target / pack.capacityKwh));
  };

  return { getPanelByModel, getBracketByModel, getBatteryByModel,
           calcPvKw, calcBatteryPacks, calcBatteryKwh, calcBatteryPacksFromLoad };
}

// ── 私有辅助：解析后端 API JSON ───────────────────────────────
function parseAPIData(data: ProductsData) {
  const pvPanels: PVPanel[] = Object.entries(data.pv_panels.models).map(
    ([model, spec]) => ({
      model,
      displayName:   spec.display_name,
      displayNameEn: spec.display_name_en,
      displayNameZh: spec.display_name_zh,
      watts:         spec.watts,
      pricePerWp:    spec.price_usd_per_wp,
      efficiencyPct: spec.efficiency_pct,
      lengthMm:      spec.length_mm,
      widthMm:       spec.width_mm,
      kwPerSet:      (n = 32) => +(n * spec.watts / 1000).toFixed(2),
    })
  );
  const bracketSpacingM = data.bracket_systems.spacing_m ?? DEFAULT_BRACKET_SPACING_M;
  const bracketSystems: BracketSystem[] = Object.entries(data.bracket_systems.models).map(
    ([model, spec]) => ({
      model,
      displayName: spec.display_name,
      displayNameEn: spec.display_name_en,
      displayNameZh: spec.display_name_zh,
      panelsPerSet: spec.panels_per_set,
      areaM2: spec.area_m2,
      footprintLengthM: spec.footprint_length_m ?? 28,
      footprintWidthM: spec.footprint_width_m ?? 5.6,
    })
  );
  const batteryPacks: BatteryPack[] = Object.entries(data.battery_packs.models).map(
    ([model, spec]) => ({
      model,
      displayName: spec.display_name,
      displayNameEn: spec.display_name_en,
      displayNameZh: spec.display_name_zh,
      capacityKwh: spec.capacity_kwh,
      priceUsd: spec.price_usd,
      cycleLife: spec.cycle_life,
    })
  );
  const dieselGenerators: DieselGenerator[] = Object.entries(data.diesel_generators.models).map(
    ([model, spec]) => ({
      model,
      displayName: spec.display_name,
      displayNameEn: spec.display_name_en,
      displayNameZh: spec.display_name_zh,
      powerKw: spec.power_kw,
      priceUsd: spec.price_usd,
    })
  );
  const integratedSpecs: IntegratedSpec[] = Object.entries(data.integrated_pv_storage.models).map(
    ([size, spec]) => ({
      size,
      displayName: spec.display_name,
      displayNameEn: spec.display_name_en,
      displayNameZh: spec.display_name_zh,
      pvKw: spec.pv_kw,
      batteryKwh: spec.battery_kwh,
    })
  );
  const standardProducts: StandardProductPackage[] = Object.entries(data.standard_products?.packages ?? {}).map(
    ([size, spec]) => ({
      size: size as StandardProductPackage['size'],
      displayName: spec.display_name,
      displayNameEn: spec.display_name_en,
      displayNameZh: spec.display_name_zh,
      panelModel: spec.panel_model,
      bracketModel: spec.bracket_model,
      bracketSets: spec.bracket_sets,
      annualLoadKwh: spec.annual_load_kwh,
      peakLoadKw: spec.peak_load_kw,
      loadType: spec.load_type,
      dieselModel: spec.diesel_model,
      batteryPackModel: spec.battery_pack_model,
      batteryPackCount: spec.battery_pack_count,
    })
  );
  const primaryPackage = standardProducts.find((item) => item.size === 'small') ?? standardProducts[0];
  const primaryBatteryPack = primaryPackage
    ? batteryPacks.find((item) => item.model === primaryPackage.batteryPackModel)
    : undefined;
  const primaryDiesel = primaryPackage
    ? dieselGenerators.find((item) => item.model === primaryPackage.dieselModel)
    : undefined;
  const homeBgDefaults: HomeBgDefaults = {
    pvKw: data.home_bg_defaults?.pv_kw ?? (primaryPackage ? primaryPackage.bracketSets * (pvPanels.find((p) => p.model === primaryPackage.panelModel)?.watts ?? 0) * (bracketSystems.find((b) => b.model === primaryPackage.bracketModel)?.panelsPerSet ?? 0) / 1000 : 0),
    annualLoadKwh: data.home_bg_defaults?.annual_load_kwh ?? (primaryPackage?.annualLoadKwh ?? 0),
    dieselKw: data.home_bg_defaults?.diesel_kw ?? (primaryDiesel?.powerKw ?? 0),
    dieselPriceUsd: data.home_bg_defaults?.diesel_price_usd ?? 0,
    batteryKwh: data.home_bg_defaults?.battery_kwh ?? (primaryPackage && primaryBatteryPack ? primaryPackage.batteryPackCount * primaryBatteryPack.capacityKwh : 0),
    storageDays: data.home_bg_defaults?.storage_days ?? 1,
  };
  const simulationDefaults: SimulationDefaults = {
    systemEfficiency: data.simulation_defaults?.system_efficiency ?? 0.78,
    defaultYear: data.simulation_defaults?.default_year ?? 2020,
    defaultLoadType: (data.simulation_defaults?.default_load_type as LoadType | undefined) ?? 'residential',
    dieselDispatchMode: (data.simulation_defaults?.diesel_dispatch_mode as DieselDispatchMode | undefined) ?? 'cc',
  };
  const economicDefaults: EconomicDefaults = {
    dieselPriceUsdPerLiter: data.economic_defaults?.diesel_price_usd_per_liter ?? data.home_bg_defaults?.diesel_price_usd ?? 0.95,
    electricityPriceUsdPerKwh: data.economic_defaults?.electricity_price_usd_per_kwh ?? 0.35,
    projectYears: data.economic_defaults?.project_years ?? 25,
    nominalDiscountRatePct: data.economic_defaults?.nominal_discount_rate_pct ?? 10,
    inflationRatePct: data.economic_defaults?.inflation_rate_pct ?? 2,
  };
  const siteLayout: SiteLayout = data.site_layout
    ? {
        trayLengthM: data.site_layout.tray_length_m,
        trayWidthM: data.site_layout.tray_width_m,
        dieselReservedAreaM2: data.site_layout.diesel_reserved_area_m2,
        invertersPerTray: data.site_layout.inverters_per_tray,
        maxLayoutAreaM2: data.site_layout.max_layout_area_m2 ?? 40000,
      }
    : DEFAULT_SITE_LAYOUT;
  return {
    pvPanels, bracketSystems, batteryPacks, dieselGenerators, integratedSpecs,
    standardProducts, homeBgDefaults, simulationDefaults, economicDefaults,
    bracketSpacingM,
    siteLayout,
    defaultPanelModel:   data.pv_panels.default_model,
    defaultBracketModel: data.bracket_systems.default_model,
    defaultBatteryModel: data.battery_packs.default_model,
  };
}

const staticHelpers = buildHelpers(PV_PANELS, BRACKET_SYSTEMS, BATTERY_PACKS);

export const useProductsStore = create<ProductsCatalog>((set) => {
  const requestProducts = async () => {
    set({ isLoading: true, loadError: null });
    try {
      const data: ProductsData = await fetchProducts();
      const parsed  = parseAPIData(data);
      if (
        parsed.pvPanels.length === 0 ||
        parsed.bracketSystems.length === 0 ||
        parsed.batteryPacks.length === 0
      ) {
        throw new Error('Product catalog is incomplete.');
      }
      const helpers = buildHelpers(parsed.pvPanels, parsed.bracketSystems, parsed.batteryPacks);
      set({ ...parsed, isFromAPI: true, isLoading: false, loadError: null, ...helpers });
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Failed to load product catalog.';
      set({ isFromAPI: false, isLoading: false, loadError: message });
    }
  };

  return ({
  pvPanels:           PV_PANELS,
  bracketSystems:     BRACKET_SYSTEMS,
  batteryPacks:       BATTERY_PACKS,
  dieselGenerators:   DIESEL_GENERATORS,
  integratedSpecs:    INTEGRATED_SPECS,
  standardProducts: [],
  homeBgDefaults: {
    pvKw: 0,
    annualLoadKwh: 0,
    dieselKw: 0,
    dieselPriceUsd: 0,
    batteryKwh: 0,
    storageDays: 1,
  },
  simulationDefaults: {
    systemEfficiency: 0.78,
    defaultYear: 2020,
    defaultLoadType: 'residential',
    dieselDispatchMode: 'cc',
  },
  economicDefaults: {
    dieselPriceUsdPerLiter: 0.95,
    electricityPriceUsdPerKwh: 0.35,
    projectYears: 25,
    nominalDiscountRatePct: 10,
    inflationRatePct: 2,
  },
  defaultPanelModel:  DEFAULT_PANEL_MODEL,
  defaultBracketModel: DEFAULT_BRACKET_MODEL,
  defaultBatteryModel: DEFAULT_BATTERY_MODEL,
  bracketSpacingM:    DEFAULT_BRACKET_SPACING_M,
  siteLayout:         DEFAULT_SITE_LAYOUT,
  isFromAPI: false,
  isLoading: false,
  loadError: null,
  ...staticHelpers,

  init: () => {
    const state = useProductsStore.getState();
    if (state.isLoading) return;
    if (state.isFromAPI && !state.loadError) return;
    void requestProducts();
  },
  retry: () => {
    void requestProducts();
  },
})});

/** 向后兼容 hook（原 useProducts() 无需改动） */
export const useProducts = () => useProductsStore();
