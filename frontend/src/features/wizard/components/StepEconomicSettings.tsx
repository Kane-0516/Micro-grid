import { useLang } from '@/context/LangContext';
import type { ConfigData } from '@/types/index';

interface StepEconomicSettingsProps {
  projectYears?: number;
  nominalDiscountRatePct?: number;
  inflationRatePct?: number;
  onUpdate: (data: Partial<ConfigData>) => void;
}

interface NumericFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

function NumericField({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: NumericFieldProps) {
  return (
    <div
      style={{
        padding: '1rem 1.1rem',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        background: 'white',
      }}
    >
      <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontSize: '0.82rem', color: '#718096', lineHeight: 1.6, marginBottom: '0.9rem' }}>{hint}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{
            width: '140px',
            padding: '0.62rem 0.8rem',
            border: '1px solid #cbd5e0',
            borderRadius: '8px',
            fontSize: '1rem',
            color: '#2d3748',
          }}
        />
        <span style={{ fontSize: '0.86rem', color: '#4a5568' }}>{suffix}</span>
      </div>
    </div>
  );
}

export default function StepEconomicSettings({
  projectYears = 25,
  nominalDiscountRatePct = 10,
  inflationRatePct = 2,
  onUpdate,
}: StepEconomicSettingsProps) {
  const { lang } = useLang();
  const realDiscountRatePct = (((1 + nominalDiscountRatePct / 100) / (1 + inflationRatePct / 100)) - 1) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          padding: '0.8rem 1rem',
          background: 'var(--theme-tone-bg)',
          border: '1px solid var(--theme-tone-border)',
          borderRadius: '8px',
          fontSize: '0.84rem',
          color: 'var(--theme-tone-text)',
          lineHeight: 1.7,
        }}
      >
        {lang === 'en'
          ? 'These settings control the HOMER-style economic horizon and discounting assumptions used for NPC, annualized cost, and COE.'
          : '这些参数用于控制 HOMER 风格经济分析中的项目周期与贴现假设，并直接影响 NPC、年化成本和 COE。'}
      </div>

      <NumericField
        label={lang === 'en' ? 'Project Life' : '项目周期'}
        hint={lang === 'en' ? 'Economic analysis horizon for lifecycle cash flows.' : '用于全寿命现金流分析的经济周期。'}
        value={projectYears}
        min={1}
        max={50}
        step={1}
        suffix={lang === 'en' ? 'years' : '年'}
        onChange={(value) => onUpdate({ projectYears: Math.max(1, Math.min(50, Math.round(value || 0))) })}
      />

      <NumericField
        label={lang === 'en' ? 'Nominal Discount Rate' : '名义贴现率'}
        hint={lang === 'en' ? 'Pre-inflation financing or hurdle-rate assumption.' : '通胀调整前的融资或目标收益率假设。'}
        value={nominalDiscountRatePct}
        min={-99}
        max={200}
        step={0.1}
        suffix="%"
        onChange={(value) => onUpdate({ nominalDiscountRatePct: Math.max(-99, Math.min(200, value || 0)) })}
      />

      <NumericField
        label={lang === 'en' ? 'Inflation Rate' : '通胀率'}
        hint={lang === 'en' ? 'Used with the nominal rate to derive the real discount rate.' : '与名义贴现率共同用于推导真实贴现率。'}
        value={inflationRatePct}
        min={-99}
        max={200}
        step={0.1}
        suffix="%"
        onChange={(value) => onUpdate({ inflationRatePct: Math.max(-99, Math.min(200, value || 0)) })}
      />

      <div
        style={{
          padding: '0.9rem 1rem',
          background: 'var(--theme-tone-warm-bg)',
          border: '1px solid var(--theme-tone-warm-border)',
          borderRadius: '8px',
          color: 'var(--theme-tone-warm-text)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
          {lang === 'en' ? 'Derived Real Discount Rate' : '推导后的真实贴现率'}
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
          {realDiscountRatePct.toFixed(2)}%
        </div>
        <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', lineHeight: 1.6 }}>
          {lang === 'en'
            ? 'Computed as ((1 + nominal) / (1 + inflation)) - 1.'
            : '按 ((1 + 名义贴现率) / (1 + 通胀率)) - 1 计算。'}
        </div>
      </div>
    </div>
  );
}
