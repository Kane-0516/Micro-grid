import { useLang } from '@/context/LangContext';
import type { ConfigData, EMSAddon } from '@/types/index';
import { formatAreaDual, formatIrradianceDualFtFirst } from '@/utils/unitFormat';
import './ConfigSummaryPanel.css';

interface ConfigSummaryPanelProps {
  config: ConfigData;
  scenario: 'known-load' | 'diy' | 'custom';
}

export default function ConfigSummaryPanel({ config, scenario }: ConfigSummaryPanelProps) {
  const { lang } = useLang();
  const areaM2 = config.availableAreaM2 ?? 0;
  const effectiveScenario = scenario === 'custom' ? (config.customFlowBranch ?? 'known-load') : scenario;

  const items: { label: string; value: string; subItems?: { label: string; value: string }[] }[] = [];

  if (effectiveScenario === 'known-load') {
    items.push({
      label: lang === 'en' ? 'Installation Region' : '安装地区',
      value: config.locationName || '—',
    });

    const psh = config.peakSunHoursPerDay;
    const eff = config.annualEffHours;
    const irrad = (config as any).annualKwhPerM2;
    const hasSolar = psh != null || eff != null || irrad != null;

    items.push({
      label: lang === 'en' ? 'Solar Assessment' : '日照评估结果',
      value: hasSolar ? '' : '—',
      subItems: hasSolar
        ? [
            { label: lang === 'en' ? 'Peak sun hours' : '峰值日照', value: psh != null ? `${psh} h/d` : '—' },
            { label: lang === 'en' ? 'Annual eff. hours' : '年有效小时', value: eff != null ? `${eff} h/a` : '—' },
            { label: lang === 'en' ? 'Annual irradiance' : '年辐照量', value: formatIrradianceDualFtFirst(irrad, lang).combined },
          ]
        : undefined,
    });
  }

  if (effectiveScenario === 'diy') {
    items.push({
      label: lang === 'en' ? 'Site Area' : '场地面积',
      value: formatAreaDual(areaM2, lang).combined,
    });

    const inverterKw = (config as any).inverterKw ?? 0;
    const inverterCount = (config as any).inverterCount ?? 0;
    const totalInverterKw = (config as any).totalInverterKw ?? 0;
    const inverterSummary = inverterKw > 0 && inverterCount > 0 ? `${inverterKw} kW × ${inverterCount}` : '—';

    items.push({
      label: lang === 'en' ? 'Inverter Setup' : '逆变器情况',
      value: inverterSummary,
      subItems: [
        {
          label: lang === 'en' ? 'Unit Power' : '单台功率',
          value: inverterKw > 0 ? `${inverterKw} kW` : '—',
        },
        {
          label: lang === 'en' ? 'Quantity' : '台数',
          value: inverterCount > 0 ? `${inverterCount}` : '—',
        },
        {
          label: lang === 'en' ? 'Total Power' : '总功率',
          value: totalInverterKw > 0 ? `${Number(totalInverterKw).toFixed(1)} kW` : '—',
        },
      ],
    });
  } else {
    items.push({
      label: lang === 'en' ? 'Voltage Level' : '电压等级',
      value: config.voltageLevel || '—',
    });
  }

  const emsBase = config.emsControlMethod === 'edge'
    ? (lang === 'en' ? 'Edge Control' : '边缘控制')
    : config.emsControlMethod || '—';
  const addons = (config.emsAddons ?? []) as EMSAddon[];
  const addonLabels: Record<EMSAddon, string> = {
    cloud: lang === 'en' ? 'Cloud' : '云端',
    prediction: lang === 'en' ? 'Prediction' : '预测',
  };
  const emsVal = addons.length > 0
    ? `${emsBase} + ${addons.map(a => addonLabels[a]).join(', ')}`
    : emsBase;

  items.push({
    label: lang === 'en' ? 'EMS Control' : 'EMS控制方式',
    value: emsVal,
  });

  return (
    <div className="config-summary-panel">
      <div className="config-summary-panel__title">
        {lang === 'en' ? 'Configuration Summary' : '配置摘要'}
      </div>
      <div className="config-summary-panel__items">
        {items.map((item, i) => (
          <div key={i} className="config-summary-panel__item">
            <div className="config-summary-panel__row">
              <span className="config-summary-panel__label">{item.label}</span>
              {item.value && <span className="config-summary-panel__value">{item.value}</span>}
            </div>
            {item.subItems && (
              <div className="config-summary-panel__sub">
                {item.subItems.map((s, j) => (
                  <div key={j} className="config-summary-panel__sub-row">
                    <span className="config-summary-panel__sub-label">{s.label}</span>
                    <span className="config-summary-panel__sub-value">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
