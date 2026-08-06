import type { ConfigData, CalculateResponse, OptimizeRequest, OptimizeResponse } from '@/types/index';

function resolveApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE?.trim();
  if (envBase) {
    return envBase.replace(/\/+$/, '');
  }
  return '/api';
}

const API_BASE = resolveApiBase();
const ADMIN_REQUEST_TIMEOUT_MS = 30000;

function adminRequestSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined') {
    const timeout = (AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
    if (timeout) return timeout(ADMIN_REQUEST_TIMEOUT_MS);
  }
  return undefined;
}

export interface ProductsData {
  standard_products?: {
    packages: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      panel_model: string;
      bracket_model: string;
      bracket_sets: number;
      annual_load_kwh: number;
      peak_load_kw: number;
      load_type: string;
      diesel_model: string;
      battery_pack_model: string;
      battery_pack_count: number;
    }>;
  };
  home_bg_defaults?: {
    pv_kw: number;
    annual_load_kwh: number;
    diesel_kw: number;
    diesel_price_usd: number;
    battery_kwh: number;
    storage_days: number;
  };
  pv_panels: {
    default_model: string;
    models: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      watts: number;
      price_usd_per_wp: number;
      efficiency_pct: number;
      length_mm?: number;
      width_mm?: number;
    }>;
  };
  bracket_systems: {
    default_model: string;
    spacing_m?: number;
    models: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      panels_per_set: number;
      area_m2: number;
      footprint_length_m?: number;
      footprint_width_m?: number;
    }>;
  };
  site_layout?: {
    tray_length_m: number;
    tray_width_m: number;
    diesel_reserved_area_m2: number;
    inverters_per_tray: number;
    max_layout_area_m2?: number;
  };
  simulation_defaults?: {
    system_efficiency: number;
    default_year?: number;
    default_load_type?: string;
    diesel_dispatch_mode?: string;
  };
  economic_defaults?: {
    diesel_price_usd_per_liter?: number;
    electricity_price_usd_per_kwh?: number;
    project_years?: number;
    nominal_discount_rate_pct?: number;
    inflation_rate_pct?: number;
  };
  battery_packs: {
    default_model: string;
    models: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      capacity_kwh: number;
      price_usd: number;
      cycle_life: number;
    }>;
  };
  inverters: {
    models: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      power_kw: number;
      price_usd: number;
      voltage_levels: string[];
    }>;
    voltage_default_map: Record<string, string>;
  };
  diesel_generators: {
    price_usd_per_kw: number;
    models: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      power_kw: number;
      price_usd: number;
      fuel_efficiency_kwh_per_liter?: number;
    }>;
  };
  integrated_pv_storage: {
    models: Record<string, {
      display_name: string;
      display_name_en?: string;
      display_name_zh?: string;
      pv_kw: number;
      battery_kwh: number;
      battery_kw: number;
    }>;
  };
}

export type ProductAdminCategory =
  | 'pv_panels'
  | 'bracket_systems'
  | 'battery_packs'
  | 'inverters'
  | 'diesel_generators'
  | 'integrated_pv_storage'
  | 'standard_packages';

export type ProductAdminSettingKey =
  | 'pv_panels.default_model'
  | 'bracket_systems.default_model'
  | 'bracket_systems.spacing_m'
  | 'battery_packs.default_model'
  | 'battery_packs.price_usd_per_kwh_fallback'
  | 'inverters.voltage_default_map'
  | 'diesel_generators.price_usd_per_kw'
  | 'economic_defaults'
  | 'home_bg_defaults'
  | 'site_layout'
  | 'simulation_defaults'
  | 'accessories'
  | 'pricing';

export interface ProductAdminItem {
  key: string;
  data: Record<string, unknown>;
}

export interface ProductAdminSetting {
  key: ProductAdminSettingKey;
  scope: 'meta' | 'blob';
  value: unknown;
}

function configToRequest(config: ConfigData): Record<string, unknown> {
  return {
    scenario: config.scenario,
    bracketSets: config.bracketSets,
    panelModel: config.panelModel || undefined,
    bracketModel: config.bracketModel || undefined,
    batteryPackModel: config.batteryPackModel || undefined,
    hasGenerator: config.hasGenerator,
    dieselCapacityKw: config.dieselCapacityKw || 0,
    dieselIsNew: config.dieselIsNew ?? false,
    voltageLevel: config.voltageLevel ?? '120V/240V',
    storageDays: config.storageDays,
    emsControlMethod: config.emsControlMethod,
    emsAddons: config.emsAddons || [],
    annualLoadKwh: config.annualLoadKwh || null,
    loadType: config.loadType || 'residential',
    trayCapacity: config.trayCapacity || null,
    requiredCurrent: config.requiredCurrent || null,
    inverterCount: config.inverterCount || null,
    electricityPriceUsd: config.electricityPriceUsd || 0.35,
    dieselPriceUsd: config.dieselPriceUsd || 1.0,
    dieselDispatchMode: config.dieselDispatchMode || 'cc',
    projectYears: config.projectYears ?? 25,
    nominalDiscountRatePct: config.nominalDiscountRatePct ?? 10,
    inflationRatePct: config.inflationRatePct ?? 2,
    latitude: config.latitude ?? 25.0,
    longitude: config.longitude ?? 0.0,
    year: config.year ?? 2020,
  };
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail || body?.error;
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim();
    }
  } catch {
    // Ignore non-JSON bodies.
  }
  return '';
}

async function readJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw new Error(detail || `${fallbackMessage}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchProducts(): Promise<ProductsData> {
  const res = await fetch(`${API_BASE}/products`);
  return readJson<ProductsData>(res, 'Failed to fetch products');
}

export async function calculateQuick(config: ConfigData): Promise<CalculateResponse> {
  const res = await fetch(`${API_BASE}/calculate?simulate=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configToRequest(config)),
  });
  return readJson<CalculateResponse>(res, 'Calculation request failed');
}

export async function calculateFull(
  config: ConfigData,
  options?: { timeoutMs?: number },
): Promise<CalculateResponse> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 0;
  const timeoutId = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(`${API_BASE}/calculate?simulate=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configToRequest(config)),
      signal: controller.signal,
    });
    return readJson<CalculateResponse>(res, 'Full simulation request failed');
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Full simulation timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

export async function optimizeMicrogrid(req: OptimizeRequest & { allowDiesel?: boolean }): Promise<OptimizeResponse> {
  const body: Record<string, unknown> = { ...req };
  if (body.availableAreaM2 == null) delete body.availableAreaM2;
  if (body.existingDieselKw == null) delete body.existingDieselKw;
  if (body.allowDiesel == null) delete body.allowDiesel;

  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<OptimizeResponse>(res, 'Optimization request failed');
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSolarHours(lat: number, lon: number): Promise<{
  success: boolean;
  peak_sun_hours_per_day: number;
  annual_kwh_per_m2: number;
  annual_eff_hours: number;
  climate_zone: string;
  note: string;
}> {
  const res = await fetch(`${API_BASE}/solar-hours?lat=${lat}&lon=${lon}`);
  return readJson(res, 'Solar data request failed');
}

export async function fetchReverseGeocode(
  lat: number,
  lon: number,
  countryCode = 'cn',
): Promise<{
  display_name?: string;
  formatted_address?: string;
  address?: Record<string, unknown>;
}> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    country_code: countryCode,
  });
  const res = await fetch(`${API_BASE}/reverse-geocode?${params.toString()}`);
  return readJson(res, 'Reverse geocoding request failed');
}

export async function fetchGeocode(
  query: string,
  countryCode = 'cn',
): Promise<Array<{
  lat: string;
  lon: string;
  display_name?: string;
  formatted_address?: string;
  address?: Record<string, unknown>;
}>> {
  const params = new URLSearchParams({
    q: query,
    country_code: countryCode,
  });
  const res = await fetch(`${API_BASE}/geocode?${params.toString()}`);
  return readJson(res, 'Geocoding request failed');
}

export interface LayoutOptimizeRequest {
  polygon?: number[][];
  availableAreaM2?: number;
  spacingM?: number;
  bracketLengthM?: number;
  bracketWidthM?: number;
  timeLimitS?: number;
}

export interface RectPosition {
  centerX: number;
  centerY: number;
  corners: number[][];
}

export interface LayoutOptimizeResponse {
  success: boolean;
  maxSystems: number;
  strategy: string;
  spacingM: number;
  bracketLengthM: number;
  bracketWidthM: number;
  rectangles?: RectPosition[];
  error?: string;
}

export async function optimizeLayout(req: LayoutOptimizeRequest): Promise<LayoutOptimizeResponse> {
  const res = await fetch(`${API_BASE}/layout/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return readJson(res, 'Layout optimization request failed');
}

export async function fetchProductAdminCategories(): Promise<{ categories: ProductAdminCategory[] }> {
  const res = await fetch(`${API_BASE}/admin/products/categories`);
  return readJson<{ categories: ProductAdminCategory[] }>(res, 'Failed to fetch product admin categories');
}

export async function fetchProductAdminItems(category: ProductAdminCategory): Promise<ProductAdminItem[]> {
  const res = await fetch(`${API_BASE}/admin/products/${category}`);
  return readJson<ProductAdminItem[]>(res, 'Failed to fetch product admin items');
}

export async function createProductAdminItem(
  category: ProductAdminCategory,
  item: ProductAdminItem,
): Promise<{ success: true }> {
  const res = await fetch(`${API_BASE}/admin/products/${category}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
    signal: adminRequestSignal(),
  });
  return readJson<{ success: true }>(res, 'Failed to create product item');
}

export async function updateProductAdminItem(
  category: ProductAdminCategory,
  key: string,
  data: Record<string, unknown>,
): Promise<{ success: true }> {
  const res = await fetch(`${API_BASE}/admin/products/${category}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: adminRequestSignal(),
  });
  return readJson<{ success: true }>(res, 'Failed to update product item');
}

export async function deleteProductAdminItem(
  category: ProductAdminCategory,
  key: string,
): Promise<{ success: true }> {
  const res = await fetch(`${API_BASE}/admin/products/${category}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    signal: adminRequestSignal(),
  });
  return readJson<{ success: true }>(res, 'Failed to delete product item');
}

export async function fetchProductAdminSettings(): Promise<ProductAdminSetting[]> {
  const res = await fetch(`${API_BASE}/admin/products/settings`);
  const items = await readJson<Array<{ key: ProductAdminSettingKey; scope: 'meta' | 'blob' }>>(
    res,
    'Failed to fetch catalog settings',
  );

  return Promise.all(
    items.map(async (item) => {
      const valueRes = await fetch(`${API_BASE}/admin/products/settings/${encodeURIComponent(item.key)}`);
      const payload = await readJson<{ key: ProductAdminSettingKey; value: unknown }>(
        valueRes,
        'Failed to fetch catalog setting',
      );
      return { ...item, value: payload.value };
    }),
  );
}

export async function updateProductAdminSetting(
  key: ProductAdminSettingKey,
  value: unknown,
): Promise<{ success: true }> {
  const res = await fetch(`${API_BASE}/admin/products/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
    signal: adminRequestSignal(),
  });
  return readJson<{ success: true }>(res, 'Failed to update catalog setting');
}
