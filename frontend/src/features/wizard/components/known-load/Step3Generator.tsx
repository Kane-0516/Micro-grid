import { useState } from 'react';
import type { ConfigData } from '@/types/index';
import { useLang } from '@/context/LangContext';

interface Step3GeneratorProps {
  config: ConfigData;
  onUpdate: (data: Partial<ConfigData>) => void;
}

// 单选卡片组件
function SelectCard({
  label, description, badge, selected, onClick,
}: {
  label: string;
  description: string;
  badge?: 'existing' | 'new';
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useLang();
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '1rem',
        padding: '1rem 1.25rem',
        border: `2px solid ${selected ? '#1a365d' : '#e2e8f0'}`,
        borderRadius: '10px', cursor: 'pointer',
        background: selected ? '#ebf4ff' : 'white',
        transition: 'all 0.2s', marginBottom: '0.75rem',
      }}
    >
      <div style={{
        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
        border: `2px solid ${selected ? '#1a365d' : '#cbd5e0'}`,
        background: selected ? '#1a365d' : 'transparent',
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: '#2d3748', fontSize: '0.98rem' }}>
          {label}
          {badge && (
            <span style={{
              marginLeft: '0.6rem', fontSize: '0.72rem', fontWeight: 600,
              padding: '0.1rem 0.5rem', borderRadius: '10px',
              background: badge === 'new' ? 'var(--theme-tone-warm-bg)' : 'var(--theme-tone-bg)',
              color: badge === 'new' ? 'var(--theme-tone-warm-text)' : 'var(--theme-tone-text)',
            }}>
              {badge === 'new' ? t('gen.badge.new') : t('gen.badge.existing')}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.83rem', color: '#718096', marginTop: '0.25rem' }}>
          {description}
        </div>
      </div>
    </div>
  );
}

// 容量快捷按钮（仅显示 kW，不显示价格）
// 默认包含 20kW（MQ Power DCA20SPXU4F 约 20kW）
const PRESET_KW = [20, 30, 40, 60, 80, 100];
type GeneratorMode = 'existing' | 'new' | 'none';

function getGeneratorMode(config: ConfigData): GeneratorMode {
  if (!config.hasGenerator) return 'none';
  return config.dieselIsNew ? 'new' : 'existing';
}

function ExistingGeneratorPanel({
  config,
  customKw,
  lang,
  onPreset,
  onCustom,
}: {
  config: ConfigData;
  customKw: string;
  lang: 'zh' | 'en';
  onPreset: (kw: number) => void;
  onCustom: (value: string) => void;
}) {
  return (
    <div style={{
      marginTop: '1.5rem', padding: '1.25rem',
      background: '#f8f9fa', borderRadius: '10px',
      borderLeft: '4px solid var(--theme-tone-accent)',
    }}>
      <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
        {lang === 'en'
          ? 'Enter existing generator rated capacity (for simulation, does not affect purchase cost)'
          : '请填写现有发电机额定容量（用于仿真计算，不影响采购费用）'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        {PRESET_KW.map(kw => {
          const selected = config.dieselCapacityKw === kw && !customKw;
          return (
            <button
              key={kw}
              type="button"
              onClick={() => onPreset(kw)}
              style={{
                padding: '0.55rem 1.1rem',
                border: `2px solid ${selected ? '#1a365d' : '#e2e8f0'}`,
                borderRadius: '8px', cursor: 'pointer',
                background: selected ? '#ebf4ff' : 'white',
                fontWeight: 700, fontSize: '1rem', color: '#1a365d',
                transition: 'all 0.15s',
              }}
            >
              {kw} kW
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label style={{ fontSize: '0.9rem', color: '#4a5568', whiteSpace: 'nowrap' }}>
          {lang === 'en' ? 'Other capacity (kW):' : '其他容量（kW）：'}
        </label>
        <input
          type="number"
          value={customKw}
          onChange={event => onCustom(event.target.value)}
          placeholder={lang === 'en' ? 'e.g. 25' : '如: 25'}
          min={5}
          step={5}
          style={{
            padding: '0.5rem 0.75rem', border: '1px solid #cbd5e0',
            borderRadius: '6px', fontSize: '0.95rem', width: '100px',
          }}
        />
      </div>
      {config.dieselCapacityKw > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.65rem 1rem', background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--theme-tone-text)' }}>
          {lang === 'en'
            ? <>Existing generator capacity entered: <strong>{config.dieselCapacityKw} kW</strong> (not included in purchase cost)</>
            : <>已填写现有柴油发电机容量：<strong>{config.dieselCapacityKw} kW</strong>（不计入采购费用）</>}
        </div>
      )}
    </div>
  );
}

function NewGeneratorNotice({ lang }: { lang: 'zh' | 'en' }) {
  return (
    <div style={{
      marginTop: '1.5rem', padding: '1.25rem',
      background: 'var(--theme-tone-warm-bg)', borderRadius: '10px',
      borderLeft: '4px solid var(--theme-tone-warm-accent)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--theme-tone-warm-text)', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
        {lang === 'en' ? 'Generator capacity will be automatically recommended by the system' : '发电机容量将由系统自动推荐'}
      </div>
      <div style={{ fontSize: '0.88rem', color: 'var(--theme-tone-warm-text)', lineHeight: 1.6 }}>
        {lang === 'en'
          ? 'In the next step, the system will simulate optimal diesel generator capacity based on your annual load, PV configuration and storage capacity, ensuring stable supply during cloudy days or peak loads while maximizing economic returns.'
          : '系统将在下一步根据您的年用电量、光伏配置和储能容量，通过仿真计算出最合适的柴油发电机容量，确保在阴天或高峰负载时仍能稳定供电，同时最大化经济效益。'}
      </div>
    </div>
  );
}

export default function Step3Generator({ config, onUpdate }: Step3GeneratorProps) {
  const { t, lang } = useLang();
  const [customKw, setCustomKw] = useState('');

  // 三种状态：existing / new / none
  const mode = getGeneratorMode(config);

  const handleMode = (m: GeneratorMode) => {
    setCustomKw('');
    const updates: Record<GeneratorMode, Partial<ConfigData>> = {
      none: { hasGenerator: false, dieselCapacityKw: 0, dieselIsNew: false },
      existing: { hasGenerator: true, dieselIsNew: false, dieselCapacityKw: config.dieselCapacityKw || 20 },
      new: { hasGenerator: true, dieselIsNew: true, dieselCapacityKw: 0 },
    };
    onUpdate(updates[m]);
  };

  const handlePresetKw = (kw: number) => {
    setCustomKw('');
    onUpdate({ dieselCapacityKw: kw });
  };

  const handleCustomKw = (val: string) => {
    setCustomKw(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) onUpdate({ dieselCapacityKw: num });
  };

  return (
    <div>
      {/* ── 主选项 ──────────────────────────────── */}
      {([
        {
          mode: 'existing',
          label: t('gen.has.yes'),
          description: lang === 'en'
            ? 'On-site equipment, no purchase needed; used only for co-simulation (not in CAPEX)'
            : '现场已有设备，无需采购，仅用于系统协同仿真（不计入 CAPEX）',
          badge: 'existing',
        },
        {
          mode: 'new',
          label: t('gen.has.no'),
          description: lang === 'en'
            ? 'No generator on site; system will automatically recommend optimal capacity via simulation'
            : '现场无柴发，系统将根据负荷仿真自动推荐最适合的发电机容量',
          badge: 'new',
        },
        {
          mode: 'none',
          label: lang === 'en' ? 'No diesel generator' : '不配置柴油发电机',
          description: lang === 'en'
            ? 'Pure PV + storage solution, ideal for sites with ample solar resources or high emission-reduction goals'
            : '纯光伏 + 储能方案，适合太阳能资源充足或对减排要求高的场景',
        },
      ] as const).map(option => (
        <SelectCard
          key={option.mode}
          label={option.label}
          description={option.description}
          badge={option.badge}
          selected={mode === option.mode}
          onClick={() => handleMode(option.mode)}
        />
      ))}

      {/* ── 已有柴发：填写实际容量（仿真用）── */}
      {mode === 'existing' && (
        <ExistingGeneratorPanel
          config={config}
          customKw={customKw}
          lang={lang}
          onPreset={handlePresetKw}
          onCustom={handleCustomKw}
        />
      )}

      {/* ── 新购柴发：系统自动定容提示 ── */}
      {mode === 'new' && <NewGeneratorNotice lang={lang} />}
    </div>
  );
}
