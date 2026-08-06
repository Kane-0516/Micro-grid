import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/context/LangContext';
import {
  createProductAdminItem,
  deleteProductAdminItem,
  fetchProductAdminCategories,
  fetchProductAdminItems,
  fetchProductAdminSettings,
  type ProductAdminCategory,
  type ProductAdminItem,
  type ProductAdminSettingKey,
  updateProductAdminItem,
  updateProductAdminSetting,
} from '@/api/client';
import './ProductConfigPage.css';

type AdminView = 'products' | 'settings';
type FieldType = 'text' | 'number' | 'textarea' | 'json';
type SortMode = 'name' | 'key';

interface FieldDef {
  key: string;
  labelEn: string;
  labelZh: string;
  type: FieldType;
  helpEn?: string;
  helpZh?: string;
}

interface SettingDef {
  key: ProductAdminSettingKey;
  labelEn: string;
  labelZh: string;
  type: Exclude<FieldType, 'textarea'>;
  groupEn: string;
  groupZh: string;
  helpEn?: string;
  helpZh?: string;
  advanced?: boolean;
}

interface StructuredSubField {
  path: string;
  labelEn: string;
  labelZh: string;
  type: 'text' | 'number' | 'string-list';
  advanced?: boolean;
}

interface ProductCatalogExport {
  exportedAt: string;
  version: 1;
  products: Record<ProductAdminCategory, ProductAdminItem[]>;
  settings: Record<string, unknown>;
}

const CATEGORY_ORDER: ProductAdminCategory[] = [
  'pv_panels',
  'bracket_systems',
  'battery_packs',
  'inverters',
  'diesel_generators',
  'integrated_pv_storage',
  'standard_packages',
];

const CATEGORY_LABELS: Record<ProductAdminCategory, { en: string; zh: string }> = {
  pv_panels: { en: 'PV Panels', zh: '光伏组件' },
  bracket_systems: { en: 'Bracket Systems', zh: '支架系统' },
  battery_packs: { en: 'Battery Packs', zh: '电池包' },
  inverters: { en: 'Inverters', zh: '逆变器' },
  diesel_generators: { en: 'Diesel Generators', zh: '柴油发电机' },
  integrated_pv_storage: { en: 'Integrated Specs', zh: '集成规格' },
  standard_packages: { en: 'Standard Packages', zh: '标准套餐' },
};

const FIELD_DEFS: Record<ProductAdminCategory, FieldDef[]> = {
  pv_panels: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'watts', labelEn: 'Watts', labelZh: '功率 (W)', type: 'number' },
    { key: 'price_usd_per_wp', labelEn: 'USD/Wp', labelZh: '单瓦价格 (USD/Wp)', type: 'number' },
    { key: 'efficiency_pct', labelEn: 'Efficiency (%)', labelZh: '效率 (%)', type: 'number' },
    { key: 'temp_coeff_pct_per_c', labelEn: 'Temp Coeff (%/°C)', labelZh: '温度系数 (%/°C)', type: 'number' },
    { key: 'length_mm', labelEn: 'Length (mm)', labelZh: '长度 (mm)', type: 'number' },
    { key: 'width_mm', labelEn: 'Width (mm)', labelZh: '宽度 (mm)', type: 'number' },
    { key: 'description', labelEn: 'Description', labelZh: '说明', type: 'textarea' },
  ],
  bracket_systems: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'panels_per_set', labelEn: 'Panels per Set', labelZh: '每套组件数', type: 'number' },
    { key: 'area_m2', labelEn: 'Area (m²)', labelZh: '面积 (m²)', type: 'number' },
    { key: 'footprint_length_m', labelEn: 'Length (m)', labelZh: '长度 (m)', type: 'number' },
    { key: 'footprint_width_m', labelEn: 'Width (m)', labelZh: '宽度 (m)', type: 'number' },
    { key: 'description', labelEn: 'Description', labelZh: '说明', type: 'textarea' },
  ],
  battery_packs: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'capacity_kwh', labelEn: 'Capacity (kWh)', labelZh: '容量 (kWh)', type: 'number' },
    { key: 'price_usd', labelEn: 'Price (USD)', labelZh: '价格 (USD)', type: 'number' },
    { key: 'voltage_v', labelEn: 'Voltage (V)', labelZh: '电压 (V)', type: 'number' },
    { key: 'cycle_life', labelEn: 'Cycle Life', labelZh: '循环寿命', type: 'number' },
    { key: 'depth_of_discharge_pct', labelEn: 'DoD (%)', labelZh: '放电深度 (%)', type: 'number' },
    { key: 'description', labelEn: 'Description', labelZh: '说明', type: 'textarea' },
  ],
  inverters: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'power_kw', labelEn: 'Power (kW)', labelZh: '功率 (kW)', type: 'number' },
    { key: 'price_usd', labelEn: 'Price (USD)', labelZh: '价格 (USD)', type: 'number' },
    { key: 'voltage_levels', labelEn: 'Voltage Levels', labelZh: '电压等级', type: 'json' },
    { key: 'packs_per_inverter', labelEn: 'Packs per Inverter', labelZh: '每台逆变器支持电池包数', type: 'number' },
    { key: 'description', labelEn: 'Description', labelZh: '说明', type: 'textarea' },
  ],
  diesel_generators: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'power_kw', labelEn: 'Power (kW)', labelZh: '功率 (kW)', type: 'number' },
    { key: 'price_usd', labelEn: 'Price (USD)', labelZh: '价格 (USD)', type: 'number' },
    { key: 'fuel_efficiency_kwh_per_liter', labelEn: 'Fuel Efficiency', labelZh: '燃油效率', type: 'number' },
    { key: 'fuel_intercept_coeff', labelEn: 'Fuel Curve F0', labelZh: '燃油曲线F0', type: 'number' },
    { key: 'fuel_slope_coeff', labelEn: 'Fuel Curve F1', labelZh: '燃油曲线F1', type: 'number' },
    { key: 'description', labelEn: 'Description', labelZh: '说明', type: 'textarea' },
  ],
  integrated_pv_storage: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'pv_kw', labelEn: 'PV (kW)', labelZh: '光伏 (kW)', type: 'number' },
    { key: 'battery_kwh', labelEn: 'Battery (kWh)', labelZh: '电池 (kWh)', type: 'number' },
    { key: 'battery_kw', labelEn: 'Battery Power (kW)', labelZh: '电池功率 (kW)', type: 'number' },
    { key: 'diesel_ratio', labelEn: 'Diesel Ratio', labelZh: '柴油比例', type: 'number' },
  ],
  standard_packages: [
    { key: 'display_name', labelEn: 'Display Name', labelZh: '显示名称', type: 'text' },
    { key: 'display_name_en', labelEn: 'English Name', labelZh: '英文名称', type: 'text' },
    { key: 'display_name_zh', labelEn: 'Chinese Name', labelZh: '中文名称', type: 'text' },
    { key: 'panel_model', labelEn: 'Panel Model', labelZh: '组件型号', type: 'text' },
    { key: 'bracket_model', labelEn: 'Bracket Model', labelZh: '支架型号', type: 'text' },
    { key: 'bracket_sets', labelEn: 'Bracket Sets', labelZh: '支架套数', type: 'number' },
    { key: 'annual_load_kwh', labelEn: 'Annual Load (kWh)', labelZh: '年负荷 (kWh)', type: 'number' },
    { key: 'peak_load_kw', labelEn: 'Peak Load (kW)', labelZh: '峰值负荷 (kW)', type: 'number' },
    { key: 'load_type', labelEn: 'Load Type', labelZh: '负荷类型', type: 'text' },
    { key: 'diesel_model', labelEn: 'Diesel Model', labelZh: '柴油机型号', type: 'text' },
    { key: 'battery_pack_model', labelEn: 'Battery Pack Model', labelZh: '电池包型号', type: 'text' },
    { key: 'battery_pack_count', labelEn: 'Battery Pack Count', labelZh: '电池包数量', type: 'number' },
  ],
};

const SETTING_DEFS: SettingDef[] = [
  { key: 'pv_panels.default_model', labelEn: 'Default PV Panel Model', labelZh: '默认光伏组件型号', type: 'text', groupEn: 'Default Models', groupZh: '默认型号' },
  { key: 'bracket_systems.default_model', labelEn: 'Default Bracket Model', labelZh: '默认支架型号', type: 'text', groupEn: 'Default Models', groupZh: '默认型号' },
  { key: 'battery_packs.default_model', labelEn: 'Default Battery Pack Model', labelZh: '默认电池包型号', type: 'text', groupEn: 'Default Models', groupZh: '默认型号' },
  { key: 'bracket_systems.spacing_m', labelEn: 'Bracket Spacing (m)', labelZh: '支架间距 (m)', type: 'number', groupEn: 'Layout Rules', groupZh: '布局规则' },
  {
    key: 'site_layout',
    labelEn: 'Site Layout',
    labelZh: '场地布局',
    type: 'json',
    groupEn: 'Layout Rules',
    groupZh: '布局规则',
    helpEn: 'Controls tray size, reserved diesel area, and layout limits.',
    helpZh: '用于配置托盘尺寸、柴油预留面积和布局上限。',
  },
  {
    key: 'inverters.voltage_default_map',
    labelEn: 'Voltage Default Map',
    labelZh: '默认电压映射',
    type: 'json',
    groupEn: 'Electrical Defaults',
    groupZh: '电气默认值',
    helpEn: 'Maps system voltage levels to preferred inverter models.',
    helpZh: '将系统电压等级映射到默认逆变器型号。',
  },
  {
    key: 'simulation_defaults',
    labelEn: 'Simulation Defaults',
    labelZh: '仿真默认值',
    type: 'json',
    groupEn: 'Simulation Parameters',
    groupZh: '仿真参数',
    helpEn: 'Core PV correction, converter sizing, and diesel dispatch assumptions used by recommendation and simulation.',
    helpZh: '推荐和仿真会使用的 PV 校正、变流器容量和柴油调度假设。',
  },
  {
    key: 'economic_defaults',
    labelEn: 'Economic Defaults',
    labelZh: '经济性默认值',
    type: 'json',
    groupEn: 'Economic Parameters',
    groupZh: '经济参数',
    helpEn: 'Default fuel price, electricity tariff, project life, discount rate, and inflation.',
    helpZh: '默认柴油价格、电价、项目年限、贴现率和通胀率。',
  },
  { key: 'pricing', labelEn: 'Pricing', labelZh: '价格配置', type: 'json', groupEn: 'Commercial Settings', groupZh: '商业设置' },
  { key: 'accessories', labelEn: 'Accessories', labelZh: '附件配置', type: 'json', groupEn: 'Commercial Settings', groupZh: '商业设置' },
  {
    key: 'battery_packs.price_usd_per_kwh_fallback',
    labelEn: 'Battery Price Fallback (USD/kWh)',
    labelZh: '电池兜底单价 (USD/kWh)',
    type: 'number',
    groupEn: 'Advanced Defaults',
    groupZh: '高级/展示默认值',
    helpEn: 'Only used when a battery product lacks an explicit unit price.',
    helpZh: '仅在电池产品缺少明确单价时作为兜底值。',
    advanced: true,
  },
  {
    key: 'diesel_generators.price_usd_per_kw',
    labelEn: 'Diesel Price Benchmark (USD/kW)',
    labelZh: '柴油机基准单价 (USD/kW)',
    type: 'number',
    groupEn: 'Advanced Defaults',
    groupZh: '高级/展示默认值',
    helpEn: 'Fallback benchmark for diesel generator pricing; product model prices take priority.',
    helpZh: '柴油机价格兜底基准；具体型号价格优先。',
    advanced: true,
  },
  {
    key: 'home_bg_defaults',
    labelEn: 'Homepage Defaults',
    labelZh: '首页默认展示',
    type: 'json',
    groupEn: 'Advanced Defaults',
    groupZh: '高级/展示默认值',
    helpEn: 'Display-only defaults for the welcome/home screen.',
    helpZh: '仅用于欢迎页/首页展示的默认值。',
    advanced: true,
  },
];

const STRUCTURED_SETTING_FIELDS: Partial<Record<ProductAdminSettingKey, StructuredSubField[]>> = {
  home_bg_defaults: [
    { path: 'pv_kw', labelEn: 'PV (kW)', labelZh: '光伏 (kW)', type: 'number' },
    { path: 'annual_load_kwh', labelEn: 'Annual Load (kWh)', labelZh: '年负荷 (kWh)', type: 'number' },
    { path: 'diesel_kw', labelEn: 'Diesel (kW)', labelZh: '柴油机 (kW)', type: 'number' },
    { path: 'diesel_price_usd', labelEn: 'Diesel Price (USD/L)', labelZh: '柴油价格 (USD/L)', type: 'number' },
    { path: 'battery_kwh', labelEn: 'Battery (kWh)', labelZh: '电池 (kWh)', type: 'number' },
    { path: 'storage_days', labelEn: 'Storage Days', labelZh: '储能天数', type: 'number' },
  ],
  site_layout: [
    { path: 'tray_length_m', labelEn: 'Tray Length (m)', labelZh: '托盘长度 (m)', type: 'number' },
    { path: 'tray_width_m', labelEn: 'Tray Width (m)', labelZh: '托盘宽度 (m)', type: 'number' },
    { path: 'diesel_reserved_area_m2', labelEn: 'Diesel Reserved Area (m²)', labelZh: '柴油预留面积 (m²)', type: 'number' },
    { path: 'inverters_per_tray', labelEn: 'Inverters per Tray', labelZh: '每托盘逆变器数', type: 'number' },
    { path: 'max_layout_area_m2', labelEn: 'Max Layout Area (m²)', labelZh: '最大布局面积 (m²)', type: 'number' },
  ],
  simulation_defaults: [
    { path: 'system_efficiency', labelEn: 'System Efficiency', labelZh: '系统效率', type: 'number' },
    { path: 'default_year', labelEn: 'Default Simulation Year', labelZh: '默认仿真年份', type: 'number', advanced: true },
    { path: 'default_load_type', labelEn: 'Default Load Type', labelZh: '默认负载类型', type: 'text', advanced: true },
    { path: 'diesel_dispatch_mode', labelEn: 'Default Diesel Dispatch', labelZh: '默认柴油调度策略', type: 'text' },
    { path: 'pv_generation_correction_factor', labelEn: 'PV Generation Correction', labelZh: 'PV发电校准系数', type: 'number' },
    { path: 'converter_kw_per_pv_kw', labelEn: 'Converter kW / PV kW', labelZh: 'Converter/PV容量比', type: 'number' },
    { path: 'cycle_charging_target_load_pu', labelEn: 'CC Target Load Ratio', labelZh: 'CC目标负载率', type: 'number' },
    { path: 'cycle_charging_start_soc_pu', labelEn: 'CC Start SOC', labelZh: 'CC启动SOC', type: 'number' },
  ],
  economic_defaults: [
    { path: 'diesel_price_usd_per_liter', labelEn: 'Diesel Price (USD/L)', labelZh: '柴油价格 (USD/L)', type: 'number' },
    { path: 'electricity_price_usd_per_kwh', labelEn: 'Electricity Price (USD/kWh)', labelZh: '电价 (USD/kWh)', type: 'number' },
    { path: 'project_years', labelEn: 'Project Years', labelZh: '项目年限', type: 'number' },
    { path: 'nominal_discount_rate_pct', labelEn: 'Nominal Discount Rate (%)', labelZh: '名义贴现率 (%)', type: 'number' },
    { path: 'inflation_rate_pct', labelEn: 'Inflation Rate (%)', labelZh: '通胀率 (%)', type: 'number' },
  ],
  pricing: [
    { path: 'profit_margin', labelEn: 'Profit Margin', labelZh: '利润率', type: 'number' },
    { path: 'pass_through_items', labelEn: 'Pass-through Items', labelZh: '透传成本项', type: 'string-list', advanced: true },
  ],
  accessories: [
    { path: 'pv_mounting_cost_per_set_usd', labelEn: 'PV Mounting / Set (USD)', labelZh: '光伏安装支架 / 套 (USD)', type: 'number' },
    { path: 'intl_transport.base_usd', labelEn: 'Intl Transport Base (USD)', labelZh: '国际运输基础费 (USD)', type: 'number' },
    { path: 'intl_transport.per_bracket_set_usd', labelEn: 'Intl Transport / Set (USD)', labelZh: '国际运输 / 套 (USD)', type: 'number' },
    { path: 'installation.base_usd', labelEn: 'Installation Base (USD)', labelZh: '施工基础费 (USD)', type: 'number' },
    { path: 'installation.per_bracket_set_usd', labelEn: 'Installation / Set (USD)', labelZh: '施工 / 套 (USD)', type: 'number' },
    { path: 'accessory_materials.base_usd', labelEn: 'Accessory Materials Base (USD)', labelZh: '辅材基础费 (USD)', type: 'number' },
    { path: 'accessory_materials.per_bracket_set_usd', labelEn: 'Accessory Materials / Set (USD)', labelZh: '辅材 / 套 (USD)', type: 'number' },
    { path: 'other_initial_usd', labelEn: 'Other Initial Cost (USD)', labelZh: '其他初始费用 (USD)', type: 'number' },
    { path: 'battery_pallet.per_pack_usd', labelEn: 'Battery Pallet / Pack (USD)', labelZh: '电池托盘 / 包 (USD)', type: 'number' },
    { path: 'battery_pallet.reference_pack_kwh', labelEn: 'Reference Pack Capacity (kWh)', labelZh: '参考电池包容量 (kWh)', type: 'number' },
    { path: 'ems_addons.prediction_control_usd', labelEn: 'Predictive Dispatch EMS Fee (USD)', labelZh: '预测调度功能费 (USD)', type: 'number' },
  ],
  'inverters.voltage_default_map': [
    { path: '120V/240V', labelEn: '120V/240V Default Model', labelZh: '120V/240V 默认型号', type: 'text' },
    { path: '120V/208V', labelEn: '120V/208V Default Model', labelZh: '120V/208V 默认型号', type: 'text' },
    { path: '220V/380V', labelEn: '220V/380V Default Model', labelZh: '220V/380V 默认型号', type: 'text' },
    { path: '230V/400V', labelEn: '230V/400V Default Model', labelZh: '230V/400V 默认型号', type: 'text' },
    { path: '277V/480V', labelEn: '277V/480V Default Model', labelZh: '277V/480V 默认型号', type: 'text' },
  ],
};

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function parseFieldValue(type: FieldType, rawValue: string): unknown {
  if (type === 'number') {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) throw new Error('invalid-number');
    return parsed;
  }
  if (type === 'json') return rawValue.trim() ? JSON.parse(rawValue) : {};
  return rawValue;
}

function groupSettingsBySection(lang: 'en' | 'zh') {
  const groups = new Map<string, SettingDef[]>();
  for (const def of SETTING_DEFS) {
    const name = lang === 'en' ? def.groupEn : def.groupZh;
    const list = groups.get(name) ?? [];
    list.push(def);
    groups.set(name, list);
  }
  return Array.from(groups.entries());
}

function getCardTitle(item: ProductAdminItem): string {
  const data = item.data as Record<string, unknown>;
  return String(data.display_name_en || data.display_name || item.key);
}

function validateRawField(lang: 'en' | 'zh', label: string, type: FieldType, rawValue: string) {
  try {
    parseFieldValue(type, rawValue);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(lang === 'en' ? `${label}: invalid JSON format.` : `${label}：JSON 格式不正确。`);
    }
    throw new Error(lang === 'en' ? `${label}: invalid number.` : `${label}：数字格式不正确。`);
  }
}

function requiredMessage(lang: 'en' | 'zh', label: string) {
  return lang === 'en' ? `${label} is required.` : `${label}为必填项。`;
}

function numberRangeMessage(lang: 'en' | 'zh', label: string, minimum: number, maximum?: number) {
  if (lang === 'en') {
    return maximum == null
      ? `${label} must be greater than or equal to ${minimum}.`
      : `${label} must be between ${minimum} and ${maximum}.`;
  }
  return maximum == null
    ? `${label}必须大于或等于 ${minimum}。`
    : `${label}必须在 ${minimum} 到 ${maximum} 之间。`;
}

function fieldHelpText(lang: 'en' | 'zh', field: FieldDef): string | undefined {
  if (lang === 'en') return field.helpEn;
  return field.helpZh;
}

function isProductFieldRequired(field: FieldDef) {
  return field.key !== 'description';
}

function validateProductFieldValue(
  lang: 'en' | 'zh',
  category: ProductAdminCategory,
  field: FieldDef,
  rawValue: string,
): string | null {
  const label = lang === 'en' ? field.labelEn : field.labelZh;
  if (isProductFieldRequired(field) && !rawValue.trim()) {
    return requiredMessage(lang, label);
  }
  if (!rawValue.trim()) return null;
  try {
    validateRawField(lang, label, field.type, rawValue);
    if (field.type === 'number') {
      const numeric = Number(rawValue);
      if (numeric < 0) return numberRangeMessage(lang, label, 0);
      if (category === 'battery_packs' && field.key === 'depth_of_discharge_pct' && numeric > 100) {
        return numberRangeMessage(lang, label, 0, 100);
      }
    }
    if (category === 'inverters' && field.key === 'voltage_levels') {
      const parsed = rawValue.trim() ? JSON.parse(rawValue) : [];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return lang === 'en'
          ? 'Voltage Levels must be a non-empty JSON array.'
          : '电压等级必须是非空 JSON 数组。';
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : (lang === 'en' ? 'Invalid value.' : '输入值无效。');
  }
}

function validateSettingFieldValue(
  lang: 'en' | 'zh',
  def: SettingDef,
  rawValue: string,
): string | null {
  const label = lang === 'en' ? def.labelEn : def.labelZh;
  if (!rawValue.trim()) return requiredMessage(lang, label);
  try {
    validateRawField(lang, label, def.type, rawValue);
    if (def.type === 'number') {
      const numeric = Number(rawValue);
      if (numeric < 0) return numberRangeMessage(lang, label, 0);
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : (lang === 'en' ? 'Invalid value.' : '输入值无效。');
  }
}

function validateStructuredSettingValue(
  lang: 'en' | 'zh',
  subField: StructuredSubField,
  rawValue: string,
): string | null {
  const label = lang === 'en' ? subField.labelEn : subField.labelZh;
  if (!rawValue.trim()) return requiredMessage(lang, label);
  if (subField.type === 'number') {
    const numeric = Number(rawValue);
    if (Number.isNaN(numeric)) {
      return lang === 'en' ? `${label} must be a valid number.` : `${label}必须是有效数字。`;
    }
    if (numeric < 0) return numberRangeMessage(lang, label, 0);
  }
  return null;
}

function getStructuredSettingValue(key: ProductAdminSettingKey, rawValue: string, path: string): string {
  try {
    const parsed = rawValue.trim() ? JSON.parse(rawValue) : {};
    const value = path.split('.').reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[segment];
      }
      return '';
    }, parsed);
    if (Array.isArray(value)) return value.join(', ');
    return value == null ? '' : String(value);
  } catch {
    return '';
  }
}

function setStructuredSettingValue(
  previous: Record<ProductAdminSettingKey, string>,
  key: ProductAdminSettingKey,
  path: string,
  rawValue: string,
  valueType: 'text' | 'number' | 'string-list',
): Record<ProductAdminSettingKey, string> {
  const nextObject = (() => {
    try {
      return previous[key]?.trim() ? JSON.parse(previous[key]) : {};
    } catch {
      return {};
    }
  })() as Record<string, unknown>;

  const segments = path.split('.');
  let cursor: Record<string, unknown> = nextObject;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  const leaf = segments[segments.length - 1];
  cursor[leaf] = valueType === 'number'
    ? (rawValue === '' ? 0 : Number(rawValue))
    : valueType === 'string-list'
      ? rawValue
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : rawValue;

  return { ...previous, [key]: JSON.stringify(nextObject, null, 2) };
}

export function ProductConfigPage() {
  const { lang } = useLang();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<AdminView>('products');
  const [category, setCategory] = useState<ProductAdminCategory>('pv_panels');
  const [items, setItems] = useState<ProductAdminItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsValues, setSettingsValues] = useState<Record<ProductAdminSettingKey, string>>({} as Record<ProductAdminSettingKey, string>);
  const [settingsFieldErrors, setSettingsFieldErrors] = useState<Record<string, string>>({});
  const [porting, setPorting] = useState(false);

  const fields = FIELD_DEFS[category];
  const categoryLabel = CATEGORY_LABELS[category][lang];
  const settingGroups = useMemo(() => groupSettingsBySection(lang), [lang]);

  const filteredItems = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (!normalized) return true;
        const title = getCardTitle(item).toLowerCase();
        const key = item.key.toLowerCase();
        return title.includes(normalized) || key.includes(normalized);
      })
      .sort((a, b) => {
        if (sortMode === 'key') return a.key.localeCompare(b.key);
        return getCardTitle(a).localeCompare(getCardTitle(b));
      });
  }, [items, searchTerm, sortMode]);

  const loadItems = async (nextCategory: ProductAdminCategory, preferredKey?: string | null) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const list = await fetchProductAdminItems(nextCategory);
      setItems(list);
      const nextSelected = preferredKey && list.some((item) => item.key === preferredKey)
        ? preferredKey
        : list[0]?.key ?? null;
      setSelectedKey(nextSelected);
      setIsNew(false);
      setFormErrors({});
      if (nextSelected) {
        const item = list.find((entry) => entry.key === nextSelected)!;
        setFormKey(item.key);
        setFormValues(
          Object.fromEntries(
            FIELD_DEFS[nextCategory].map((field) => [
              field.key,
              stringifyValue((item.data as Record<string, unknown>)[field.key]),
            ]),
          ),
        );
      } else {
        setFormKey('');
        setFormValues(Object.fromEntries(FIELD_DEFS[nextCategory].map((field) => [field.key, ''])));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product items.');
      setItems([]);
      setSelectedKey(null);
      setFormKey('');
      setFormValues(Object.fromEntries(FIELD_DEFS[nextCategory].map((field) => [field.key, ''])));
      setFormErrors({});
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const list = await fetchProductAdminSettings();
      const nextValues = {} as Record<ProductAdminSettingKey, string>;
      for (const item of list) nextValues[item.key] = stringifyValue(item.value);
      for (const def of SETTING_DEFS) if (!(def.key in nextValues)) nextValues[def.key] = '';
      setSettingsValues(nextValues);
      setSettingsFieldErrors({});
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to load catalog settings.');
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'products') void loadItems(category);
  }, [category, view]);

  useEffect(() => {
    if (view === 'settings') void loadSettings();
  }, [view]);

  const openItem = (item: ProductAdminItem) => {
    setSelectedKey(item.key);
    setIsNew(false);
    setNotice(null);
    setFormErrors({});
    setFormKey(item.key);
    setFormValues(
      Object.fromEntries(
        fields.map((field) => [field.key, stringifyValue((item.data as Record<string, unknown>)[field.key])]),
      ),
    );
  };

  const startNew = () => {
    setIsNew(true);
    setSelectedKey(null);
    setNotice(null);
    setFormErrors({});
    setFormKey('');
    setFormValues(Object.fromEntries(fields.map((field) => [field.key, ''])));
  };

  const duplicateCurrent = () => {
    if (!selectedKey) return;
    const source = items.find((item) => item.key === selectedKey);
    if (!source) return;
    setIsNew(true);
    setSelectedKey(null);
    setNotice(null);
    setFormErrors({});
    setFormKey(`${source.key}-copy`);
    setFormValues(
      Object.fromEntries(
        fields.map((field) => [field.key, stringifyValue((source.data as Record<string, unknown>)[field.key])]),
      ),
    );
  };

  const updateFormField = (field: FieldDef, rawValue: string) => {
    setFormValues((prev) => ({ ...prev, [field.key]: rawValue }));
    if (formErrors[field.key]) {
      const nextError = validateProductFieldValue(lang, category, field, rawValue);
      setFormErrors((prev) => {
        const next = { ...prev };
        if (nextError) next[field.key] = nextError;
        else delete next[field.key];
        return next;
      });
    }
  };

  const validateFormFieldOnBlur = (field: FieldDef) => {
    const nextError = validateProductFieldValue(lang, category, field, formValues[field.key] ?? '');
    setFormErrors((prev) => {
      const next = { ...prev };
      if (nextError) next[field.key] = nextError;
      else delete next[field.key];
      return next;
    });
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const rawValue = formValues[field.key] ?? '';
      const fieldError = validateProductFieldValue(lang, category, field, rawValue);
      if (fieldError) {
        nextErrors[field.key] = fieldError;
        continue;
      }
      payload[field.key] = parseFieldValue(field.type, rawValue);
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      throw new Error(lang === 'en' ? 'Please fix the highlighted product fields.' : '请先修正已高亮的产品字段。');
    }
    return payload;
  };

  const handleSave = async () => {
    if (!formKey.trim()) {
      setError(lang === 'en' ? 'Please provide a key/model identifier first.' : '请先填写唯一标识。');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = buildPayload();
      if (isNew) {
        await createProductAdminItem(category, { key: formKey.trim(), data: payload });
      } else {
        await updateProductAdminItem(category, formKey.trim(), payload);
      }
      await loadItems(category, formKey.trim());
      setIsNew(false);
      setNotice(lang === 'en' ? 'Saved successfully.' : '保存成功。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew || !formKey.trim()) return;
    const confirmed = window.confirm(
      lang === 'en' ? `Delete "${formKey}"?` : `确定删除“${formKey}”吗？`,
    );
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteProductAdminItem(category, formKey.trim());
      await loadItems(category);
      setNotice(lang === 'en' ? 'Deleted successfully.' : '删除成功。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setSaving(false);
    }
  };

  const updateSettingRawValue = (key: ProductAdminSettingKey, rawValue: string) => {
    setSettingsValues((prev) => ({ ...prev, [key]: rawValue }));
    if (settingsFieldErrors[key]) {
      const def = SETTING_DEFS.find((entry) => entry.key === key);
      if (!def) return;
      const nextError = validateSettingFieldValue(lang, def, rawValue);
      setSettingsFieldErrors((prev) => {
        const next = { ...prev };
        if (nextError) next[key] = nextError;
        else delete next[key];
        return next;
      });
    }
  };

  const validateSettingOnBlur = (def: SettingDef) => {
    const nextError = validateSettingFieldValue(lang, def, settingsValues[def.key] ?? '');
    setSettingsFieldErrors((prev) => {
      const next = { ...prev };
      if (nextError) next[def.key] = nextError;
      else delete next[def.key];
      return next;
    });
  };

  const updateStructuredField = (key: ProductAdminSettingKey, subField: StructuredSubField, rawValue: string) => {
    setSettingsValues((prev) => setStructuredSettingValue(prev, key, subField.path, rawValue, subField.type));
    const errorKey = `${key}.${subField.path}`;
    if (settingsFieldErrors[errorKey]) {
      const nextError = validateStructuredSettingValue(lang, subField, rawValue);
      setSettingsFieldErrors((prev) => {
        const next = { ...prev };
        if (nextError) next[errorKey] = nextError;
        else delete next[errorKey];
        return next;
      });
    }
  };

  const validateStructuredFieldOnBlur = (key: ProductAdminSettingKey, subField: StructuredSubField) => {
    const rawValue = getStructuredSettingValue(key, settingsValues[key] ?? '', subField.path);
    const errorKey = `${key}.${subField.path}`;
    const nextError = validateStructuredSettingValue(lang, subField, rawValue);
    setSettingsFieldErrors((prev) => {
      const next = { ...prev };
      if (nextError) next[errorKey] = nextError;
      else delete next[errorKey];
      return next;
    });
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const nextErrors: Record<string, string> = {};
      for (const def of SETTING_DEFS) {
        const structuredFields = STRUCTURED_SETTING_FIELDS[def.key];
        if (structuredFields) {
          for (const subField of structuredFields) {
            const rawValue = getStructuredSettingValue(def.key, settingsValues[def.key] ?? '', subField.path);
            const nextError = validateStructuredSettingValue(lang, subField, rawValue);
            if (nextError) nextErrors[`${def.key}.${subField.path}`] = nextError;
          }
        } else {
          const nextError = validateSettingFieldValue(lang, def, settingsValues[def.key] ?? '');
          if (nextError) nextErrors[def.key] = nextError;
        }
      }
      setSettingsFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        throw new Error(lang === 'en' ? 'Please fix the highlighted catalog settings.' : '请先修正已高亮的产品库设置。');
      }
      await Promise.all(
        SETTING_DEFS.map((def) =>
          updateProductAdminSetting(def.key, parseFieldValue(def.type, settingsValues[def.key] ?? '')),
        ),
      );
      await loadSettings();
      setSettingsNotice(lang === 'en' ? 'Catalog settings saved.' : '产品库设置已保存。');
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleExportCatalog = async () => {
    setError(null);
    setNotice(null);
    setSettingsError(null);
    setSettingsNotice(null);
    setPorting(true);
    try {
      const { categories } = await fetchProductAdminCategories();
      const productEntries = await Promise.all(
        categories.map(async (entry) => [entry, await fetchProductAdminItems(entry)] as const),
      );
      const settings = await fetchProductAdminSettings();
      const payload: ProductCatalogExport = {
        exportedAt: new Date().toISOString(),
        version: 1,
        products: Object.fromEntries(productEntries) as Record<ProductAdminCategory, ProductAdminItem[]>,
        settings: Object.fromEntries(settings.map((item) => [item.key, item.value])),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `product-catalog-${payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      const message = lang === 'en' ? 'Catalog exported successfully.' : '产品库导出成功。';
      if (view === 'products') setNotice(message);
      else setSettingsNotice(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export catalog.';
      if (view === 'products') setError(message);
      else setSettingsError(message);
    } finally {
      setPorting(false);
    }
  };

  const handleImportCatalog = async (file: File) => {
    setError(null);
    setNotice(null);
    setSettingsError(null);
    setSettingsNotice(null);
    setPorting(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as ProductCatalogExport;
      if (!parsed || parsed.version !== 1 || !parsed.products || !parsed.settings) {
        throw new Error(lang === 'en' ? 'Invalid catalog file format.' : '产品库文件格式无效。');
      }

      for (const [key, value] of Object.entries(parsed.settings)) {
        await updateProductAdminSetting(key as ProductAdminSettingKey, value);
      }

      for (const category of CATEGORY_ORDER) {
        const records = parsed.products[category] ?? [];
        for (const item of records) {
          await createProductAdminItem(category, item);
        }
      }

      await Promise.all([loadItems(category, selectedKey), loadSettings()]);
      const message = lang === 'en' ? 'Catalog imported successfully.' : '产品库导入成功。';
      if (view === 'products') setNotice(message);
      else setSettingsNotice(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import catalog.';
      if (view === 'products') setError(message);
      else setSettingsError(message);
    } finally {
      setPorting(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  return (
    <section className="product-config-page">
      <div className="product-config-page__header">
        <div>
          <h1 className="product-config-page__title">
            {lang === 'en' ? 'Product Configuration' : '产品配置'}
          </h1>
          <p className="product-config-page__subtitle">
            {lang === 'en'
              ? 'Maintain product records, bilingual names, package definitions, and shared catalog settings in one workspace.'
              : '在同一个页面中维护产品记录、双语名称、标准套餐和共享产品库设置。'}
          </p>
        </div>
        <div className="product-config-page__header-actions">
          <input
            ref={importInputRef}
            className="product-config-page__hidden-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportCatalog(file);
            }}
          />
          <button className="product-config-page__ghost-btn" type="button" onClick={handleExportCatalog} disabled={porting}>
            {porting ? (lang === 'en' ? 'Working...' : '处理中...') : (lang === 'en' ? 'Export Catalog' : '导出产品库')}
          </button>
          <button className="product-config-page__ghost-btn" type="button" onClick={() => importInputRef.current?.click()} disabled={porting}>
            {lang === 'en' ? 'Import Catalog' : '导入产品库'}
          </button>
          <button className={`product-config-page__view-tab${view === 'products' ? ' active' : ''}`} type="button" onClick={() => setView('products')}>
            {lang === 'en' ? 'Product Records' : '产品条目'}
          </button>
          <button className={`product-config-page__view-tab${view === 'settings' ? ' active' : ''}`} type="button" onClick={() => setView('settings')}>
            {lang === 'en' ? 'Catalog Settings' : '产品库设置'}
          </button>
        </div>
      </div>

      {view === 'products' ? (
        <div className="product-config-page__layout">
          <aside className="product-config-page__categories">
            {CATEGORY_ORDER.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`product-config-page__category-btn${entry === category ? ' active' : ''}`}
                onClick={() => setCategory(entry)}
              >
                {CATEGORY_LABELS[entry][lang]}
              </button>
            ))}
          </aside>

          <section className="product-config-page__list">
            <div className="product-config-page__panel-header">
              <h2>{categoryLabel}</h2>
              <span>{loading ? (lang === 'en' ? 'Loading...' : '加载中...') : `${filteredItems.length} ${lang === 'en' ? 'items' : '项'}`}</span>
            </div>
            <div className="product-config-page__toolbar product-config-page__toolbar--stack">
              <div className="product-config-page__filter-row">
                <input
                  className="product-config-page__search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={lang === 'en' ? 'Search by name or key' : '按名称或 key 搜索'}
                />
                <select className="product-config-page__select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="name">{lang === 'en' ? 'Sort by name' : '按名称排序'}</option>
                  <option value="key">{lang === 'en' ? 'Sort by key' : '按 key 排序'}</option>
                </select>
              </div>
              <div className="product-config-page__action-row">
                <button className="product-config-page__ghost-btn" type="button" onClick={() => void loadItems(category, selectedKey)}>
                  {lang === 'en' ? 'Refresh' : '刷新'}
                </button>
                <button className="product-config-page__ghost-btn" type="button" onClick={duplicateCurrent} disabled={!selectedKey}>
                  {lang === 'en' ? 'Duplicate' : '复制新增'}
                </button>
                <button className="product-config-page__primary-btn" type="button" onClick={startNew}>
                  {lang === 'en' ? 'Add New' : '新增'}
                </button>
              </div>
            </div>
            <div className="product-config-page__cards">
              {filteredItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`product-config-page__item-card${selectedKey === item.key && !isNew ? ' active' : ''}`}
                  onClick={() => openItem(item)}
                >
                  <div className="product-config-page__item-title">{getCardTitle(item)}</div>
                  <div className="product-config-page__item-key">{item.key}</div>
                </button>
              ))}
              {!filteredItems.length && !loading && (
                <div className="product-config-page__empty">
                  {searchTerm ? (lang === 'en' ? 'No matching items.' : '没有匹配的条目。') : (lang === 'en' ? 'No items in this category yet.' : '当前分类还没有条目。')}
                </div>
              )}
            </div>
          </section>

          <section className="product-config-page__editor">
            <div className="product-config-page__panel-header">
              <h2>{isNew ? (lang === 'en' ? 'Create Item' : '新增条目') : (lang === 'en' ? 'Edit Item' : '编辑条目')}</h2>
              {!isNew && selectedKey && <span>{selectedKey}</span>}
            </div>

            <label className="product-config-page__field">
              <span>{lang === 'en' ? 'Key / Model ID' : '唯一标识 / 型号 ID'}</span>
              <input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                placeholder={lang === 'en' ? 'e.g. 655W or small' : '例如 655W 或 small'}
                disabled={!isNew}
              />
            </label>

            <div className="product-config-page__form-grid">
              {fields.map((field) => (
                <label key={field.key} className={`product-config-page__field${field.type === 'textarea' || field.type === 'json' ? ' full' : ''}`}>
                  <span>{lang === 'en' ? field.labelEn : field.labelZh}{isProductFieldRequired(field) ? <em className="product-config-page__required">*</em> : null}</span>
                  {field.type === 'number' ? (
                    <small className="product-config-page__field-help">
                      {lang === 'en' ? 'Use a non-negative numeric value.' : '请输入大于或等于 0 的数值。'}
                    </small>
                  ) : field.type === 'json' ? (
                    <small className="product-config-page__field-help">
                      {lang === 'en' ? 'JSON format is required.' : '请输入有效的 JSON 格式。'}
                    </small>
                  ) : null}
                  {field.type === 'textarea' || field.type === 'json' ? (
                    <textarea
                      className={formErrors[field.key] ? 'product-config-page__input-error' : ''}
                      rows={field.type === 'json' ? 5 : 3}
                      value={formValues[field.key] ?? ''}
                      onChange={(e) => updateFormField(field, e.target.value)}
                      onBlur={() => validateFormFieldOnBlur(field)}
                    />
                  ) : (
                    <input
                      className={formErrors[field.key] ? 'product-config-page__input-error' : ''}
                      type={field.type === 'number' ? 'number' : 'text'}
                      step={field.type === 'number' ? 'any' : undefined}
                      value={formValues[field.key] ?? ''}
                      onChange={(e) => updateFormField(field, e.target.value)}
                      onBlur={() => validateFormFieldOnBlur(field)}
                    />
                  )}
                  {formErrors[field.key] ? <small className="product-config-page__field-error">{formErrors[field.key]}</small> : null}
                </label>
              ))}
            </div>

            {error && <div className="product-config-page__alert error">{error}</div>}
            {notice && <div className="product-config-page__alert success">{notice}</div>}

            <div className="product-config-page__editor-actions">
              <button className="product-config-page__ghost-btn" type="button" onClick={() => void loadItems(category, selectedKey)} disabled={saving}>
                {lang === 'en' ? 'Reset' : '重置'}
              </button>
              {!isNew && (
                <button className="product-config-page__danger-btn" type="button" onClick={handleDelete} disabled={saving || !formKey}>
                  {lang === 'en' ? 'Delete' : '删除'}
                </button>
              )}
              <button className="product-config-page__primary-btn" type="button" onClick={handleSave} disabled={saving}>
                {saving ? (lang === 'en' ? 'Saving...' : '保存中...') : (lang === 'en' ? 'Save' : '保存')}
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="product-config-page__settings-view">
          <div className="product-config-page__settings-header">
            <div>
              <h2>{lang === 'en' ? 'Catalog Settings' : '产品库设置'}</h2>
              <p>
                {lang === 'en'
                  ? 'These settings control default selections, layout rules, and shared pricing or simulation parameters.'
                  : '这些设置用于控制默认选项、布局规则，以及共享的价格和仿真参数。'}
              </p>
            </div>
            <div className="product-config-page__header-actions">
              <button className="product-config-page__ghost-btn" type="button" onClick={() => void loadSettings()}>
                {lang === 'en' ? 'Refresh Settings' : '刷新设置'}
              </button>
              <button className="product-config-page__primary-btn" type="button" onClick={handleSaveSettings} disabled={settingsSaving}>
                {settingsSaving ? (lang === 'en' ? 'Saving...' : '保存中...') : (lang === 'en' ? 'Save Settings' : '保存设置')}
              </button>
            </div>
          </div>

          {settingsError && <div className="product-config-page__alert error">{settingsError}</div>}
          {settingsNotice && <div className="product-config-page__alert success">{settingsNotice}</div>}

          <div className="product-config-page__settings-grid">
            {settingGroups.map(([groupName, defs]) => (
              <section key={groupName} className="product-config-page__settings-card">
                <div className="product-config-page__panel-header">
                  <h2>{groupName}</h2>
                  <span>{settingsLoading ? (lang === 'en' ? 'Loading...' : '加载中...') : `${defs.length} ${lang === 'en' ? 'fields' : '项'}`}</span>
                </div>
                <div className="product-config-page__form-grid product-config-page__form-grid--single">
                  {defs.map((def) => {
                    const structuredFields = STRUCTURED_SETTING_FIELDS[def.key];
                    if (structuredFields) {
                      return (
                        <div key={def.key} className="product-config-page__field full">
                          <span>{lang === 'en' ? def.labelEn : def.labelZh}<em className="product-config-page__required">*</em></span>
                          {def.helpEn || def.helpZh ? (
                            <small className="product-config-page__field-help">
                              {lang === 'en' ? def.helpEn : def.helpZh}
                            </small>
                          ) : null}
                          <div className="product-config-page__structured-grid">
                            {structuredFields.map((subField) => (
                              <label key={`${def.key}.${subField.path}`} className="product-config-page__field">
                                <span>
                                  {lang === 'en' ? subField.labelEn : subField.labelZh}
                                  {subField.advanced ? <small> {lang === 'en' ? '(Advanced)' : '（高级）'}</small> : null}
                                  <em className="product-config-page__required">*</em>
                                </span>
                                <input
                                  className={settingsFieldErrors[`${def.key}.${subField.path}`] ? 'product-config-page__input-error' : ''}
                                  type={subField.type === 'number' ? 'number' : 'text'}
                                  step={subField.type === 'number' ? 'any' : undefined}
                                  placeholder={subField.type === 'string-list' ? 'item_a, item_b' : undefined}
                                  value={getStructuredSettingValue(def.key, settingsValues[def.key] ?? '', subField.path)}
                                  onChange={(e) => updateStructuredField(def.key, subField, e.target.value)}
                                  onBlur={() => validateStructuredFieldOnBlur(def.key, subField)}
                                />
                                {settingsFieldErrors[`${def.key}.${subField.path}`] ? <small className="product-config-page__field-error">{settingsFieldErrors[`${def.key}.${subField.path}`]}</small> : null}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <label key={def.key} className={`product-config-page__field${def.type === 'json' ? ' full' : ''}`}>
                        <span>
                          {lang === 'en' ? def.labelEn : def.labelZh}
                          {def.advanced ? <small> {lang === 'en' ? '(Advanced)' : '（高级）'}</small> : null}
                          <em className="product-config-page__required">*</em>
                        </span>
                        {def.helpEn || def.helpZh ? (
                          <small className="product-config-page__field-help">
                            {lang === 'en' ? def.helpEn : def.helpZh}
                          </small>
                        ) : null}
                        {def.type === 'json' ? (
                          <textarea
                            className={settingsFieldErrors[def.key] ? 'product-config-page__input-error' : ''}
                            rows={6}
                            value={settingsValues[def.key] ?? ''}
                            onChange={(e) => updateSettingRawValue(def.key, e.target.value)}
                            onBlur={() => validateSettingOnBlur(def)}
                          />
                        ) : (
                          <input
                            className={settingsFieldErrors[def.key] ? 'product-config-page__input-error' : ''}
                            type={def.type === 'number' ? 'number' : 'text'}
                            step={def.type === 'number' ? 'any' : undefined}
                            value={settingsValues[def.key] ?? ''}
                            onChange={(e) => updateSettingRawValue(def.key, e.target.value)}
                            onBlur={() => validateSettingOnBlur(def)}
                          />
                        )}
                        {settingsFieldErrors[def.key] ? <small className="product-config-page__field-error">{settingsFieldErrors[def.key]}</small> : null}
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
