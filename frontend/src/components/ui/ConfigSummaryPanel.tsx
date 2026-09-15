import { useLang } from '@/context/LangContext';
import type { ConfigData, EMSAddon } from '@/types/index';
import { formatAreaDual, formatIrradianceDualFtFirst } from '@/utils/unitFormat';
import './ConfigSummaryPanel.css';

interface ConfigSummaryPanelProps {
  config: ConfigData;
  scenario: 'known-load' | 'diy' | 'custom';
}

type Lang = ReturnType<typeof useLang>['lang'];

interface SummaryItem {
  label: string;
  value: string;
  subItems?: SummaryItem[];
}

function localized(lang: Lang, english: string, chinese: string): string {
  return lang === 'en' ? english : chinese;
}

function valueWithUnit(value: number | null | undefined, unit: string): string {
  return value != null ? `${value} ${unit}` : '—';
}

function buildKnownLoadItems(config: ConfigData, lang: Lang): SummaryItem[] {
  const psh = config.peakSunHoursPerDay;
  const eff = config.annualEffHours;
  const irrad = (config as any).annualKwhPerM2;
  const hasSolar = psh != null || eff != null || irrad != null;

  return [
    {
      label: localized(lang, 'Installation Region', '安装地区'),
      value: config.locationName || '—',
    },
    {
      label: localized(lang, 'Solar Assessment', '日照评估结果'),
      value: hasSolar ? '' : '—',
      subItems: hasSolar
        ? [
            { label: localized(lang, 'Peak sun hours', '峰值日照'), value: valueWithUnit(psh, 'h/d') },
            { label: localized(lang, 'Annual eff. hours', '年有效小时'), value: valueWithUnit(eff, 'h/a') },
            { label: localized(lang, 'Annual irradiance', '年辐照量'), value: formatIrradianceDualFtFirst(irrad, lang).combined },
          ]
        : undefined,
    },
  ];
}

function buildDiyItems(config: ConfigData, lang: Lang): SummaryItem[] {
  const inverterKw = (config as any).inverterKw ?? 0;
  const inverterCount = (config as any).inverterCount ?? 0;
  const totalInverterKw = (config as any).totalInverterKw ?? 0;
  const inverterSummary = inverterKw > 0 && inverterCount > 0 ? `${inverterKw} kW × ${inverterCount}` : '—';

  return [
    {
      label: localized(lang, 'Site Area', '场地面积'),
      value: formatAreaDual(config.availableAreaM2 ?? 0, lang).combined,
    },
    {
      label: localized(lang, 'Inverter Setup', '逆变器情况'),
      value: inverterSummary,
      subItems: [
        { label: localized(lang, 'Unit Power', '单台功率'), value: inverterKw > 0 ? `${inverterKw} kW` : '—' },
        { label: localized(lang, 'Quantity', '台数'), value: inverterCount > 0 ? `${inverterCount}` : '—' },
        { label: localized(lang, 'Total Power', '总功率'), value: totalInverterKw > 0 ? `${Number(totalInverterKw).toFixed(1)} kW` : '—' },
      ],
    },
  ];
}

function buildEmsItem(config: ConfigData, lang: Lang): SummaryItem {
  const emsBase = config.emsControlMethod === 'edge'
    ? localized(lang, 'Edge Control', '边缘控制')
    : config.emsControlMethod || '—';
  const addons = (config.emsAddons ?? []) as EMSAddon[];
  const addonLabels: Record<EMSAddon, string> = {
    cloud: localized(lang, 'Cloud', '云端'),
    prediction: localized(lang, 'Prediction', '预测'),
  };
  return {
    label: localized(lang, 'EMS Control', 'EMS控制方式'),
    value: addons.length > 0 ? `${emsBase} + ${addons.map(a => addonLabels[a]).join(', ')}` : emsBase,
  };
}

function SummaryItemView({ item }: { item: SummaryItem }) {
  return (
    <div className="config-summary-panel__item">
      <div className="config-summary-panel__row">
        <span className="config-summary-panel__label">{item.label}</span>
        {item.value && <span className="config-summary-panel__value">{item.value}</span>}
      </div>
      {item.subItems && (
        <div className="config-summary-panel__sub">
          {item.subItems.map(subItem => (
            <div key={subItem.label} className="config-summary-panel__sub-row">
              <span className="config-summary-panel__sub-label">{subItem.label}</span>
              <span className="config-summary-panel__sub-value">{subItem.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSummaryItems(config: ConfigData, scenario: ConfigSummaryPanelProps['scenario'], lang: Lang): SummaryItem[] {
  const effectiveScenario = scenario === 'custom' ? (config.customFlowBranch ?? 'known-load') : scenario;
  const items = effectiveScenario === 'known-load' ? buildKnownLoadItems(config, lang) : [];
  items.push(...(effectiveScenario === 'diy'
    ? buildDiyItems(config, lang)
    : [{ label: localized(lang, 'Voltage Level', '电压等级'), value: config.voltageLevel || '—' }]));
  items.push(buildEmsItem(config, lang));
  return items;
}

export default function ConfigSummaryPanel({ config, scenario }: ConfigSummaryPanelProps) {
  const { lang } = useLang();
  const items = buildSummaryItems(config, scenario, lang);

  return (
    <div className="config-summary-panel">
      <div className="config-summary-panel__title">
        {localized(lang, 'Configuration Summary', '配置摘要')}
      </div>
      <div className="config-summary-panel__items">
        {items.map(item => <SummaryItemView key={item.label} item={item} />)}
      </div>
    </div>
  );
}
