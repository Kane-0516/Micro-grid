/**
 * Step8EMS.tsx — EMS 能源管理系统控制方式
 */
import { useLang } from '@/context/LangContext';
import type { ConfigData, EMSAddon } from '@/types/index';

interface Step8EMSProps {
  emsAddons?: EMSAddon[];
  onUpdate: (data: Partial<ConfigData>) => void;
}

export default function Step8EMS({ emsAddons = [], onUpdate }: Step8EMSProps) {
  const { t, lang } = useLang();

  const ADDONS: { key: EMSAddon; label: string; desc: string; detail: string }[] = [
    {
      key: 'cloud',
      label: t('ems.cloud'),
      desc:  t('ems.cloud.desc'),
      detail: lang === 'en'
        ? 'Monitor system status in real-time via cloud, historical data analysis, alerts, and remote parameter adjustment. Ideal for distributed multi-site unified management.'
        : '通过云端平台实时监控系统运行状态、历史数据分析、报警推送及远程参数调整，适合分布式多站点统一管理。',
    },
    {
      key: 'prediction',
      label: t('ems.predict'),
      desc:  t('ems.predict.desc'),
      detail: lang === 'en'
        ? 'Integrate weather forecast data to predict generation and load curves, pre-optimize charge/discharge strategy, and further reduce diesel consumption. Ideal for price-sensitive or high emission-reduction projects.'
        : '接入气象预报数据，预测发电量与负荷曲线，提前优化充放电策略，进一步降低柴油消耗，适合电价敏感或减排要求高的项目。',
    },
  ];

  const toggleAddon = (addon: EMSAddon) => {
    const next = emsAddons.includes(addon)
      ? emsAddons.filter(a => a !== addon)
      : [...emsAddons, addon];
    onUpdate({ emsControlMethod: 'edge', emsAddons: next });
  };

  const EDGE_FEATURES = lang === 'en'
    ? ['Real-time power balance', 'Battery charge/discharge management', 'Diesel start/stop control', 'Overload / undervoltage protection', 'Local fault diagnosis', 'Off-grid island detection']
    : ['实时功率平衡控制', '电池充放电管理', '柴发启停控制', '过载 / 欠压保护', '本地故障诊断', '离网孤岛检测'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── 边端控制：标准版 ── */}
      <div style={{
        padding: '1rem 1.25rem',
        border: '2px solid var(--theme-tone-border)',
        borderRadius: '10px',
        background: 'var(--theme-tone-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
            background: 'var(--theme-brand-700)', border: '2px solid var(--theme-brand-700)',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, color: '#2d3748', fontSize: '0.98rem' }}>
                {t('ems.edge')}
              </span>
              <span style={{
                fontSize: '0.7rem', fontWeight: 700,
                padding: '0.1rem 0.5rem', borderRadius: '10px',
                background: 'var(--theme-brand-700)', color: 'white',
              }}>
                {lang === 'en' ? 'Standard · Included' : '标准版 · 已包含'}
              </span>
            </div>
            <div style={{ fontSize: '0.83rem', color: 'var(--theme-tone-text)', marginTop: '0.2rem' }}>
              {t('ems.edge.desc')}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '0.75rem', paddingTop: '0.75rem',
          borderTop: '1px solid var(--theme-tone-border)',
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.3rem',
        }}>
          {EDGE_FEATURES.map(f => (
            <div key={f} style={{ fontSize: '0.8rem', color: 'var(--theme-tone-text)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--theme-brand-700)', flexShrink: 0, display: 'inline-block' }} />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* ── 额外功能说明 ── */}
      <div style={{ fontSize: '0.84rem', color: '#4a5568', padding: '0 0.25rem' }}>
        {lang === 'en'
          ? 'The following are optional add-on features that can be selected based on project needs (do not affect basic operation):'
          : '以下为可选附加功能，可根据项目需求选配（不影响基础运行）：'}
      </div>

      {/* ── 额外功能选项 ── */}
      {ADDONS.map(addon => {
        const selected = emsAddons.includes(addon.key);
        return (
          <div
            key={addon.key}
            onClick={() => toggleAddon(addon.key)}
            style={{
              padding: '1rem 1.25rem',
              border: `2px solid ${selected ? 'var(--theme-brand-700)' : '#e2e8f0'}`,
              borderRadius: '10px',
              background: selected ? 'var(--theme-tone-bg)' : 'white',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0, marginTop: '2px',
                border: `2px solid ${selected ? 'var(--theme-brand-700)' : '#cbd5e0'}`,
                background: selected ? 'var(--theme-brand-700)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected && (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#2d3748', fontSize: '0.95rem' }}>{addon.label}</div>
                <div style={{ fontSize: '0.82rem', color: '#718096', marginTop: '0.15rem' }}>{addon.desc}</div>
                <div style={{ fontSize: '0.8rem', color: '#4a5568', marginTop: '0.4rem', lineHeight: 1.6 }}>{addon.detail}</div>
              </div>
            </div>
          </div>
        );
      })}

      {/* ── 当前选择汇总 ── */}
      <div style={{
        padding: '0.75rem 1rem', background: '#f8f9fa',
        border: '1px solid #e2e8f0', borderRadius: '8px',
        fontSize: '0.85rem', color: '#4a5568',
      }}>
        <span style={{ fontWeight: 600 }}>
          {lang === 'en' ? 'Selected config: ' : '已选配置：'}
        </span>
        {lang === 'en' ? 'Edge Control (Standard)' : '边端控制（标准）'}
        {emsAddons.includes('cloud')      && (lang === 'en' ? ' + Cloud Platform' : ' + 云平台管理')}
        {emsAddons.includes('prediction') && (lang === 'en' ? ' + Predictive Control' : ' + 智能预测控制')}
      </div>

    </div>
  );
}
