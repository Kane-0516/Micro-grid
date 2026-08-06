/**
 * StepDIYSetup.tsx — DIY流程 Step 5
 *
 * 目的：
 *   1. 选择系统电压等级（单相/三相）
 *      → 结合前面选定的逆变器容量，确定完整逆变器型号
 *   2. 输入最大负载电流（可选）
 *      → 估算实际负载功率，用于匹配柴发型号
 *
 * 注：逆变器容量已在 Step 2 确定；电压选定后方案生成时自动锁定单相/三相型号。
 */
import { useState } from 'react';
import type { ConfigData, VoltageLevel } from '@/types/index';
import { useLang } from '@/context/LangContext';

interface StepDIYSetupProps {
  voltageLevel: VoltageLevel | null;
  requiredCurrent?: number;
  inverterKw?: number;      // 来自 Step 2（只读展示）
  inverterCount?: number;   // 来自 Step 2（只读展示）
  onUpdate: (data: Partial<ConfigData>) => void;
}

const VOLTAGE_PARAMS: Record<VoltageLevel, {
  labelEn: string;
  badgeZh: string; badgeEn: string;
  ratedVoltage: number; isThreePhase: boolean;
  phaseDescZh: string; phaseDescEn: string;
  useCaseZh: string; useCaseEn: string;
}> = {
  '120V/240V': {
    labelEn: '120V / 240V',
    badgeZh: '住宅/小商业',   badgeEn: 'Residential / Small Commercial',
    ratedVoltage: 240, isThreePhase: false,
    phaseDescZh: '单相分裂式',  phaseDescEn: 'Single-phase split-phase',
    useCaseZh: '住宅、小型商店、轻商业（单相负载为主）',
    useCaseEn: 'Residential, small shops, light commercial (mainly single-phase loads)',
  },
  '120V/208V': {
    labelEn: '120V / 208V',
    badgeZh: '中型商业',      badgeEn: 'Medium Commercial',
    ratedVoltage: 208, isThreePhase: true,
    phaseDescZh: '三相四线',    phaseDescEn: '3-phase 4-wire',
    useCaseZh: '商业楼宇、办公室、多户住宅（含三相设备）',
    useCaseEn: 'Commercial buildings, offices, multi-unit housing with 3-phase equipment',
  },
  '277V/480V': {
    labelEn: '277V / 480V',
    badgeZh: '工业',          badgeEn: 'Industrial',
    ratedVoltage: 480, isThreePhase: true,
    phaseDescZh: '工业三相',    phaseDescEn: 'Industrial 3-phase',
    useCaseZh: '工厂、仓库、工业园区（大功率三相电机）',
    useCaseEn: 'Factories, warehouses, industrial parks (high-power 3-phase motors)',
  },
};

const VOLTAGE_LEVELS: VoltageLevel[] = ['120V/240V', '120V/208V', '277V/480V'];

const QUICK_CURRENTS: Record<VoltageLevel, number[]> = {
  '120V/240V': [20, 30, 50, 80, 100],
  '120V/208V': [30, 60, 100, 150, 200],
  '277V/480V': [30, 60, 100, 150, 200],
};

function estimateLoadKw(vl: VoltageLevel, a: number): number {
  const p = VOLTAGE_PARAMS[vl];
  const kva = (p.ratedVoltage * a * (p.isThreePhase ? Math.sqrt(3) : 1)) / 1000;
  return +(kva * 0.9).toFixed(1);
}

export default function StepDIYSetup({
  voltageLevel,
  requiredCurrent,
  inverterKw,
  inverterCount,
  onUpdate,
}: StepDIYSetupProps) {
  const { lang } = useLang();
  const [currentInput, setCurrentInput] = useState(requiredCurrent ? String(requiredCurrent) : '');

  const vl = voltageLevel;
  const currentA = parseFloat(currentInput);
  const hasA = !isNaN(currentA) && currentA > 0;
  const estLoadKw = vl && hasA ? estimateLoadKw(vl, currentA) : null;

  // Derived inverter phase label for display
  const phaseLabel = vl
    ? (lang === 'en' ? VOLTAGE_PARAMS[vl].phaseDescEn : VOLTAGE_PARAMS[vl].phaseDescZh)
    : null;

  const handleVoltage = (v: VoltageLevel) => {
    onUpdate({ voltageLevel: v });
  };

  const handleCurrent = (a: number) => {
    onUpdate({ requiredCurrent: a });
  };

  const handleQuickCurrent = (a: number) => {
    setCurrentInput(String(a));
    handleCurrent(a);
  };

  const handleCurrentChange = (val: string) => {
    setCurrentInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) handleCurrent(num);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>

      {/* ── Context: inverter already chosen in Step 2 ── */}
      {inverterKw && inverterCount && inverterKw > 0 && inverterCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '0.75rem 1.1rem',
          background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)',
          borderRadius: '10px',
        }}>
          <div style={{ textAlign: 'center', minWidth: '110px' }}>
            <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#1a365d' }}>
              {inverterKw} kW × {inverterCount}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              {lang === 'en' ? 'Inverter (from Step 2)' : '逆变器规格（Step 2）'}
            </div>
          </div>
          <div style={{ flex: 1, fontSize: '0.83rem', color: 'var(--theme-tone-text)', lineHeight: 1.6 }}>
            {lang === 'en'
              ? 'Select the voltage level below to finalize the inverter model (single-phase or 3-phase). The current input helps match the diesel generator capacity.'
              : '选择电压等级后，将结合逆变器容量最终确定逆变器型号（单相或三相）。电流输入用于匹配柴发容量。'}
            {vl && (
              <span style={{
                display: 'inline-block', marginLeft: '0.5rem',
                fontWeight: 700, color: '#1a365d',
                background: 'var(--theme-brand-100)', borderRadius: '6px',
                padding: '0.1rem 0.5rem', fontSize: '0.78rem',
              }}>
                → {phaseLabel} {inverterKw} kW × {inverterCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ══ Section A: 电压等级 ══════════════════════════════ */}
      <section>
        <div style={{
          fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em',
          color: '#718096', textTransform: 'uppercase', marginBottom: '0.6rem',
        }}>
          {lang === 'en' ? 'A — System Voltage Level' : 'A — 系统电压等级'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {VOLTAGE_LEVELS.map(v => {
            const p = VOLTAGE_PARAMS[v];
            const active = vl === v;
            return (
              <div
                key={v}
                onClick={() => handleVoltage(v)}
                style={{
                  padding: '0.9rem 1.1rem',
                  border: `2px solid ${active ? '#1a365d' : '#e2e8f0'}`,
                  borderRadius: '10px', cursor: 'pointer',
                  background: active ? 'var(--theme-tone-bg)' : 'white',
                  transition: 'all 0.18s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${active ? '#1a365d' : '#cbd5e0'}`,
                    background: active ? '#1a365d' : 'transparent',
                  }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1a365d', marginRight: '0.5rem' }}>
                      {p.labelEn}
                    </span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.45rem',
                      borderRadius: '8px', marginRight: '0.3rem',
                      background: active ? '#1a365d' : '#e2e8f0',
                      color: active ? 'white' : '#4a5568',
                    }}>
                      {lang === 'en' ? p.badgeEn : p.badgeZh}
                    </span>
                    <span style={{
                      fontSize: '0.68rem', padding: '0.1rem 0.45rem',
                      borderRadius: '8px',
                      background: active ? 'var(--theme-brand-100)' : '#f7fafc',
                      color: active ? '#1a365d' : '#718096',
                      fontWeight: active ? 600 : 400,
                    }}>
                      {lang === 'en' ? p.phaseDescEn : p.phaseDescZh}
                    </span>
                  </div>
                </div>
                {active && (
                  <div style={{
                    marginTop: '0.55rem', paddingTop: '0.55rem',
                    borderTop: '1px solid var(--theme-tone-border)',
                    fontSize: '0.81rem', color: '#4a5568', lineHeight: 1.5,
                  }}>
                    {lang === 'en' ? p.useCaseEn : p.useCaseZh}
                    {inverterKw && inverterCount && (
                      <span style={{
                        display: 'inline-block', marginLeft: '0.75rem',
                        fontWeight: 700, color: '#1a365d',
                        background: 'var(--theme-tone-bg)', borderRadius: '6px',
                        padding: '0.1rem 0.55rem', fontSize: '0.78rem',
                      }}>
                        {lang === 'en' ? 'Inverter model: ' : '逆变器型号：'}
                        {lang === 'en' ? p.phaseDescEn : p.phaseDescZh} {inverterKw} kW × {inverterCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ Section B: 最大电流（可选） ══════════════════════════════ */}
      <section>
        <div style={{
          fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em',
          color: '#718096', textTransform: 'uppercase', marginBottom: '0.4rem',
        }}>
          {lang === 'en' ? 'B — Maximum Load Current (optional)' : 'B — 最大负载电流（可选）'}
        </div>
        <div style={{
          fontSize: '0.81rem', color: 'var(--theme-tone-warm-text)',
          padding: '0.55rem 0.85rem', marginBottom: '0.65rem',
          background: 'var(--theme-tone-warm-bg)', borderLeft: '3px solid var(--theme-tone-warm-accent)',
          borderRadius: '6px', lineHeight: 1.6,
        }}>
          {lang === 'en'
            ? 'Used to estimate total load power and match the diesel generator model. If skipped, the diesel capacity will be estimated from inverter total power.'
            : '用于估算实际负载功率，辅助匹配柴发型号。若跳过，柴发容量将根据逆变器总功率进行估算。'}
        </div>

        {!vl ? (
          <div style={{ fontSize: '0.85rem', color: '#a0aec0' }}>
            {lang === 'en' ? '← Select voltage level first' : '← 请先选择电压等级'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.65rem' }}>
              {(QUICK_CURRENTS[vl] ?? []).map(a => {
                const active = Math.abs((parseFloat(currentInput) || 0) - a) < 0.5;
                return (
                  <button
                    key={a}
                    onClick={() => handleQuickCurrent(a)}
                    style={{
                      padding: '0.38rem 0.85rem', fontSize: '0.88rem',
                      border: `2px solid ${active ? '#1a365d' : '#e2e8f0'}`,
                      borderRadius: '18px', cursor: 'pointer',
                      background: active ? '#1a365d' : 'white',
                      color: active ? 'white' : '#4a5568',
                      fontWeight: active ? 700 : 400, transition: 'all 0.15s',
                    }}
                  >
                    {a} A
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="number" value={currentInput}
                onChange={e => handleCurrentChange(e.target.value)}
                placeholder={lang === 'en' ? 'e.g. 100' : '如：100'}
                min={1} step={1}
                style={{
                  padding: '0.55rem 1rem', border: '1px solid #cbd5e0',
                  borderRadius: '8px', fontSize: '1rem', width: '120px',
                }}
              />
              <span style={{ color: '#718096', fontSize: '0.9rem' }}>
                A ({lang === 'en' ? 'Amperes' : '安培'})
              </span>
            </div>

            {hasA && estLoadKw !== null && (
              <div style={{
                marginTop: '0.65rem', display: 'inline-flex', alignItems: 'center',
                gap: '0.5rem', padding: '0.45rem 0.9rem',
                background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
              }}>
                <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                  {lang === 'en' ? 'Est. load power:' : '估算负载功率：'}
                </span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--theme-brand-700)' }}>
                  {estLoadKw} kW
                </span>
                <span style={{ fontSize: '0.72rem', color: '#a0aec0' }}>
                  ({lang === 'en' ? 'used for diesel matching' : '用于柴发匹配'})
                </span>
              </div>
            )}
          </>
        )}
      </section>

    </div>
  );
}
