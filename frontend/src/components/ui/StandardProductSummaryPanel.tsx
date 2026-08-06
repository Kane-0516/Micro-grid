/**
 * StandardProductSummaryPanel.tsx — 标准化产品页右上角配置摘要
 * 标准化产品右上角配置摘要
 */
import { useLang } from '@/context/LangContext';
import './ConfigSummaryPanel.css';

const SIZE_CONFIG: Record<'small' | 'medium' | 'large', {
  voltageLevel: string;
  emsControlMethod: string;
}> = {
  small: {
    voltageLevel: '277V/480V',
    emsControlMethod: 'edge',
  },
  medium: {
    voltageLevel: '277V/480V',
    emsControlMethod: 'edge',
  },
  large: {
    voltageLevel: '277V/480V',
    emsControlMethod: 'edge',
  },
};

interface StandardProductSummaryPanelProps {
  size: 'small' | 'medium' | 'large';
}

export default function StandardProductSummaryPanel({ size }: StandardProductSummaryPanelProps) {
  const { lang } = useLang();
  const c = SIZE_CONFIG[size];

  /* 标准化产品不显示安装面积、场地预估结果 */
  const items: { label: string; value: string; subItems?: { label: string; value: string }[] }[] = [
    {
      label: lang === 'en' ? 'Voltage Level' : '电压等级',
      value: c.voltageLevel,
    },
    {
      label: lang === 'en' ? 'EMS Control' : 'EMS控制方式',
      value: lang === 'en' ? 'Edge Control' : '边缘控制',
    },
  ];

  return (
    <div className="config-summary-panel config-summary-panel--standard">
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
