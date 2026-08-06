export type UILang = 'zh' | 'en';
export type AreaUnit = 'm2' | 'ft2';

export interface DualUnitDisplay {
  primary: string;
  secondary: string;
  combined: string;
}

const SQFT_PER_SQM = 10.7639;
const FEET_PER_METER = 3.28084;
const GALLONS_PER_LITER = 0.264172;

function getLocale(lang: UILang): string {
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}

function formatNumber(value: number, lang: UILang, digits = 0): string {
  return value.toLocaleString(getLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function emptyDisplay(): DualUnitDisplay {
  return { primary: '--', secondary: '', combined: '--' };
}

function buildDisplay(primary: string, secondary: string): DualUnitDisplay {
  return {
    primary,
    secondary,
    combined: secondary ? `${primary} (${secondary})` : primary,
  };
}

export function sqmToSqft(value: number): number {
  return value * SQFT_PER_SQM;
}

export function sqftToSqm(value: number): number {
  return value / SQFT_PER_SQM;
}

export function formatAreaSingle(
  value?: number | null,
  unit: AreaUnit = 'm2',
  lang: UILang = 'en',
  digits = 0,
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  const converted = unit === 'm2' ? value : sqmToSqft(value);
  const suffix = unit === 'm2' ? 'm²' : 'ft²';
  return `${formatNumber(converted, lang, digits)} ${suffix}`;
}

export function formatAreaDual(value?: number | null, lang: UILang = 'en', digits = 0): DualUnitDisplay {
  if (value == null || !Number.isFinite(value) || value <= 0) return emptyDisplay();
  const primary = `${formatNumber(value, lang, digits)} m²`;
  const secondary = `${formatNumber(sqmToSqft(value), lang, digits)} ft²`;
  return buildDisplay(primary, secondary);
}

export function formatAreaDualFtFirst(value?: number | null, lang: UILang = 'en', digits = 0): DualUnitDisplay {
  if (value == null || !Number.isFinite(value) || value <= 0) return emptyDisplay();
  const primary = `${formatNumber(sqmToSqft(value), lang, digits)} ft²`;
  const secondary = `${formatNumber(value, lang, digits)} m²`;
  return buildDisplay(primary, secondary);
}

export function formatLengthDual(value?: number | null, lang: UILang = 'en', digits = 1): DualUnitDisplay {
  if (value == null || !Number.isFinite(value) || value <= 0) return emptyDisplay();
  const primary = `${formatNumber(value, lang, digits)} m`;
  const secondary = `${formatNumber(value * FEET_PER_METER, lang, digits)} ft`;
  return buildDisplay(primary, secondary);
}

export function formatVolumeDual(value?: number | null, lang: UILang = 'en', digits = 0): DualUnitDisplay {
  if (value == null || !Number.isFinite(value) || value < 0) return emptyDisplay();
  const primary = `${formatNumber(value, lang, digits)} L`;
  const secondary = `${formatNumber(value * GALLONS_PER_LITER, lang, digits)} gal`;
  return buildDisplay(primary, secondary);
}

export function formatFuelPriceDual(value?: number | null, lang: UILang = 'en', digits = 2): DualUnitDisplay {
  if (value == null || !Number.isFinite(value) || value < 0) return emptyDisplay();
  const primary = `$${formatNumber(value, lang, digits)}/L`;
  const secondary = `$${formatNumber(value / GALLONS_PER_LITER, lang, digits)}/gal`;
  return buildDisplay(primary, secondary);
}

export function formatIrradianceDual(value?: number | null, lang: UILang = 'en', digits = 0): DualUnitDisplay {
  if (value == null || !Number.isFinite(value) || value <= 0) return emptyDisplay();
  const primary = `${formatNumber(value / SQFT_PER_SQM, lang, 2)} kWh/ft²`;
  const secondary = `${formatNumber(value, lang, digits)} kWh/m²`;
  return buildDisplay(primary, secondary);
}

export function formatIrradianceDualFtFirst(value?: number | null, lang: UILang = 'en', digits = 0): DualUnitDisplay {
  return formatIrradianceDual(value, lang, digits);
}
