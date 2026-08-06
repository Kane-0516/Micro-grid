/**
 * Shared product types and geometry constants.
 * Product records themselves are loaded from the backend catalog.
 */

export interface PVPanel {
  model: string;
  displayName: string;
  displayNameEn?: string;
  displayNameZh?: string;
  watts: number;
  pricePerWp: number;
  efficiencyPct: number;
  lengthMm?: number;
  widthMm?: number;
  kwPerSet: (panelsPerSet?: number) => number;
}

export interface BracketSystem {
  model: string;
  displayName: string;
  displayNameEn?: string;
  displayNameZh?: string;
  panelsPerSet: number;
  areaM2: number;
  footprintLengthM: number;
  footprintWidthM: number;
}

export interface BatteryPack {
  model: string;
  displayName: string;
  displayNameEn?: string;
  displayNameZh?: string;
  capacityKwh: number;
  priceUsd: number;
  cycleLife: number;
}

export interface IntegratedSpec {
  size: string;
  displayName: string;
  displayNameEn?: string;
  displayNameZh?: string;
  pvKw: number;
  batteryKwh: number;
}

export interface SiteLayout {
  trayLengthM: number;
  trayWidthM: number;
  dieselReservedAreaM2: number;
  invertersPerTray: number;
  maxLayoutAreaM2: number;
}

export const STANDARD_BRACKET_LENGTH_M = 28;
export const STANDARD_BRACKET_WIDTH_M = 5.6;
export const STANDARD_BRACKET_AREA_M2 = +(STANDARD_BRACKET_LENGTH_M * STANDARD_BRACKET_WIDTH_M).toFixed(1);
export const DEFAULT_BRACKET_SPACING_M = 3.048;

export const DEFAULT_SITE_LAYOUT: SiteLayout = {
  trayLengthM: 6.2,
  trayWidthM: 4.4,
  dieselReservedAreaM2: 75.0,
  invertersPerTray: 2,
  maxLayoutAreaM2: 40000,
};

export const PV_PANELS: PVPanel[] = [];
export const BRACKET_SYSTEMS: BracketSystem[] = [];
export const BATTERY_PACKS: BatteryPack[] = [];
export const INTEGRATED_SPECS: IntegratedSpec[] = [];
export const DIESEL_GENERATORS: Array<{ model: string; displayName: string; powerKw: number; priceUsd: number }> = [];

export const DEFAULT_PANEL_MODEL = '';
export const DEFAULT_BRACKET_MODEL = '';
export const DEFAULT_BATTERY_MODEL = '';
