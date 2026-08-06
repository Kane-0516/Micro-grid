/**
 * StepDIYGenerator.tsx — DIY流程 Step 6（新）: 柴油发电机配置
 *
 * 流程（参照用户提供的流程图）：
 *   1. 询问客户是否需要购置/配置柴油发电机
 *   2. 如需要：
 *      a. 客户输入需要的最大电压 (V) 和最大电流 (A)
 *      b. 系统推算最大功率 = V × I × PF  (单相) 或 √3 × V × I × PF (三相)
 *      c. 系统展示适配的柴油发电机型号（功率 ≥ 最大功率）
 *   3. 客户选择柴发型号（新购 or 已有）
 */
import { useState } from 'react';
import type { ConfigData } from '@/types/index';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import { getLocalizedProductLabel } from '@/utils/productLabel';

const POWER_FACTOR = 0.9;

interface StepDIYGeneratorProps {
  hasGenerator?: boolean;
  dieselIsNew?: boolean;
  dieselCapacityKw?: number;
  dieselMaxVoltageV?: number;
  dieselMaxCurrentA?: number;
  dieselMaxPowerKw?: number;
  onUpdate: (data: Partial<ConfigData>) => void;
}

// Voltage options for diesel generator sizing
const VOLTAGE_OPTIONS = [
  { v: 240,  labelZh: '单相 240V',   labelEn: 'Single-phase 240V',  isThree: false },
  { v: 208,  labelZh: '三相 208V',   labelEn: 'Three-phase 208V',   isThree: true  },
  { v: 380,  labelZh: '三相 380V',   labelEn: 'Three-phase 380V',   isThree: true  },
  { v: 480,  labelZh: '三相 480V',   labelEn: 'Three-phase 480V',   isThree: true  },
];

function calcMaxPowerKw(voltageV: number, currentA: number, isThree: boolean): number {
  const kva = isThree
    ? (Math.sqrt(3) * voltageV * currentA) / 1000
    : (voltageV * currentA) / 1000;
  return +(kva * POWER_FACTOR).toFixed(2);
}

export default function StepDIYGenerator({
  hasGenerator,
  dieselIsNew = true,
  dieselCapacityKw,
  dieselMaxVoltageV,
  dieselMaxCurrentA,
  dieselMaxPowerKw,
  onUpdate,
}: StepDIYGeneratorProps) {
  const { lang } = useLang();
  const { dieselGenerators } = useProducts();

  const [selectedVoltIdx, setSelectedVoltIdx] = useState<number>(() => {
    if (!dieselMaxVoltageV) return 0;
    const idx = VOLTAGE_OPTIONS.findIndex(o => o.v === dieselMaxVoltageV);
    return idx >= 0 ? idx : 0;
  });
  const [currentInput, setCurrentInput] = useState(
    dieselMaxCurrentA ? String(dieselMaxCurrentA) : ''
  );

  const voltOpt     = VOLTAGE_OPTIONS[selectedVoltIdx];
  const currentA    = parseFloat(currentInput);
  const hasValidInput = !isNaN(currentA) && currentA > 0;
  const computedPowerKw = hasValidInput
    ? calcMaxPowerKw(voltOpt.v, currentA, voltOpt.isThree)
    : (dieselMaxPowerKw ?? 0);

  // generator options that meet or exceed required power (with 20% safety margin)
  const requiredKw = computedPowerKw * 1.2;
  const fittingGenerators = dieselGenerators.filter(g => g.powerKw >= requiredKw);
  const allGenerators     = dieselGenerators;

  const handleVoltChange = (idx: number) => {
    setSelectedVoltIdx(idx);
    if (hasValidInput) {
      const opt = VOLTAGE_OPTIONS[idx];
      const pw = calcMaxPowerKw(opt.v, currentA, opt.isThree);
      onUpdate({
        dieselMaxVoltageV: opt.v,
        dieselMaxCurrentA: currentA,
        dieselMaxPowerKw: pw,
      } as any);
    } else {
      onUpdate({ dieselMaxVoltageV: VOLTAGE_OPTIONS[idx].v } as any);
    }
  };

  const handleCurrentChange = (val: string) => {
    setCurrentInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const pw = calcMaxPowerKw(voltOpt.v, num, voltOpt.isThree);
      onUpdate({
        dieselMaxVoltageV: voltOpt.v,
        dieselMaxCurrentA: num,
        dieselMaxPowerKw: pw,
      } as any);
    }
  };

  const handleSelectGenerator = (powerKw: number) => {
    onUpdate({
      hasGenerator:     true,
      dieselCapacityKw: powerKw,
      dieselIsNew,
    });
  };

  const handleOwnership = (isNew: boolean) => {
    onUpdate({
      dieselIsNew: isNew,
      hasGenerator: true,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Yes/No */}
      <div>
        <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.6rem', fontSize: '0.95rem' }}>
          {lang === 'en' ? 'Do you need a diesel generator?' : '是否需要配置柴油发电机？'}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {[
            { val: true,  labelZh: '是，需要配置',   labelEn: 'Yes, include generator' },
            { val: false, labelZh: '否，不需要',       labelEn: 'No, PV + storage only' },
          ].map(opt => {
            const active = hasGenerator === opt.val;
            return (
              <div
                key={String(opt.val)}
                onClick={() => onUpdate({ hasGenerator: opt.val, dieselCapacityKw: opt.val ? (dieselCapacityKw ?? 0) : 0 })}
                style={{
                  flex: 1, padding: '1rem 1.25rem', textAlign: 'center',
                  border: `2px solid ${active ? '#1a365d' : '#e2e8f0'}`,
                  borderRadius: '12px', cursor: 'pointer',
                  background: active ? '#ebf4ff' : 'white',
                  transition: 'all 0.18s',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#2d3748' }}>
                  {lang === 'en' ? opt.labelEn : opt.labelZh}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 如果选了需要柴发 */}
      {hasGenerator === true && (
        <>
          {/* 电压选择 */}
          <div>
            <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.5rem', fontSize: '0.93rem' }}>
              {lang === 'en' ? 'Maximum Load Voltage' : '最大负载电压'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {VOLTAGE_OPTIONS.map((opt, idx) => {
                const active = selectedVoltIdx === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleVoltChange(idx)}
                    style={{
                      padding: '0.45rem 1rem',
                      fontSize: '0.88rem',
                      border: `2px solid ${active ? '#1a365d' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: active ? '#1a365d' : 'white',
                      color: active ? 'white' : '#4a5568',
                      fontWeight: active ? 700 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {lang === 'en' ? opt.labelEn : opt.labelZh}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 电流输入 */}
          <div>
            <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.5rem', fontSize: '0.93rem' }}>
              {lang === 'en' ? 'Maximum Load Current (A)' : '最大负载电流 (A)'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="number"
                value={currentInput}
                onChange={e => handleCurrentChange(e.target.value)}
                placeholder={lang === 'en' ? 'e.g. 100' : '如：100'}
                min={1}
                step={1}
                style={{
                  padding: '0.6rem 1rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  width: '140px',
                }}
              />
              <span style={{ color: '#718096', fontSize: '0.9rem' }}>A</span>
            </div>
          </div>

          {/* 功率推算结果 */}
          {computedPowerKw > 0 && (
            <div style={{
              padding: '0.85rem 1.1rem',
              background: 'var(--theme-tone-bg)',
              border: '1px solid var(--theme-tone-border)',
              borderLeft: '4px solid var(--theme-tone-accent)',
              borderRadius: '8px',
              fontSize: '0.87rem',
              color: 'var(--theme-tone-text)',
            }}>
              <strong>{lang === 'en' ? 'Max Load Power: ' : '最大负载功率：'}</strong>
              {voltOpt.isThree
                ? `√3 × ${voltOpt.v}V × ${currentA || '?'}A × PF(${POWER_FACTOR})`
                : `${voltOpt.v}V × ${currentA || '?'}A × PF(${POWER_FACTOR})`}
              {' = '}
              <strong>{computedPowerKw.toFixed(1)} kW</strong>
              &nbsp;
              {lang === 'en'
                ? `→ Required generator ≥ ${requiredKw.toFixed(1)} kW (×1.2 safety margin)`
                : `→ 需要柴发 ≥ ${requiredKw.toFixed(1)} kW（×1.2 安全系数）`}
            </div>
          )}

          {/* 适配柴发型号 */}
          {computedPowerKw > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.6rem', fontSize: '0.93rem' }}>
                {lang === 'en' ? 'Matching Diesel Generators' : '适配柴油发电机'}
                {fittingGenerators.length === 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--theme-tone-warm-text)', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                    ({lang === 'en' ? 'All shown as reference' : '无完全匹配，供参考'})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {(fittingGenerators.length > 0 ? fittingGenerators : allGenerators).map(gen => {
                  const active = dieselCapacityKw === gen.powerKw && hasGenerator;
                  const fits   = gen.powerKw >= requiredKw;
                  return (
                    <div
                      key={gen.model}
                      onClick={() => handleSelectGenerator(gen.powerKw)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '1rem',
                        padding: '0.85rem 1.1rem',
                        border: `2px solid ${active ? '#1a365d' : fits ? 'var(--theme-tone-border)' : '#e2e8f0'}`,
                        borderRadius: '10px', cursor: 'pointer',
                        background: active ? '#ebf4ff' : fits ? 'var(--theme-tone-bg)' : 'white',
                        transition: 'all 0.18s',
                      }}
                    >
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${active ? '#1a365d' : '#cbd5e0'}`,
                        background: active ? '#1a365d' : 'transparent',
                      }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: '#2d3748', fontSize: '1rem' }}>
                          {gen.powerKw} kW
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#718096', marginLeft: '0.5rem' }}>
                          {getLocalizedProductLabel(gen, lang)}
                        </span>
                        {fits && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, marginLeft: '0.5rem',
                            padding: '0.1rem 0.4rem', borderRadius: '8px',
                            background: 'var(--theme-brand-100)', color: 'var(--theme-tone-text)',
                          }}>
                            {lang === 'en' ? '✓ Suitable' : '✓ 适配'}
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, fontSize: '0.85rem', color: '#718096' }}>
                        ${gen.priceUsd.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 新购 / 已有 */}
          {dieselCapacityKw && dieselCapacityKw > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.5rem', fontSize: '0.93rem' }}>
                {lang === 'en' ? 'Generator Ownership' : '柴发来源'}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {[
                  { isNew: true,  labelZh: '需购置（计入成本）', labelEn: 'Purchase new (include in CAPEX)' },
                  { isNew: false, labelZh: '已有（不计成本）',   labelEn: 'Already owned (exclude CAPEX)'  },
                ].map(opt => {
                  const active = dieselIsNew === opt.isNew;
                  return (
                    <div
                      key={String(opt.isNew)}
                      onClick={() => handleOwnership(opt.isNew)}
                      style={{
                        flex: 1, padding: '0.75rem 1rem', textAlign: 'center',
                        border: `2px solid ${active ? '#1a365d' : '#e2e8f0'}`,
                        borderRadius: '10px', cursor: 'pointer',
                        background: active ? '#ebf4ff' : 'white',
                        fontSize: '0.88rem', transition: 'all 0.18s',
                      }}
                    >
                      <div style={{ fontWeight: active ? 700 : 400, color: '#2d3748' }}>
                        {lang === 'en' ? opt.labelEn : opt.labelZh}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* 不需要柴发 */}
      {hasGenerator === false && (
        <div style={{
          padding: '0.85rem 1.1rem',
          background: 'var(--theme-tone-bg)',
          borderLeft: '4px solid var(--theme-tone-accent)',
          borderRadius: '8px',
          fontSize: '0.87rem',
          color: 'var(--theme-tone-text)',
        }}>
          {lang === 'en'
            ? 'System will operate on PV + battery storage only. Ensure adequate solar resource and battery capacity for your load requirements.'
            : '系统将仅依赖光伏+储能运行。请确保太阳能资源充足，且储能容量满足负载需求。'}
        </div>
      )}

      {/* 说明 */}
      <div style={{
        padding: '0.7rem 1rem',
        background: 'var(--theme-tone-warm-bg)',
        borderLeft: '3px solid var(--theme-tone-warm-accent)',
        borderRadius: '6px',
        fontSize: '0.81rem',
        color: 'var(--theme-tone-warm-text)',
        lineHeight: 1.6,
      }}>
        {lang === 'en'
          ? 'In off-grid microgrids, diesel generators supplement PV and storage during prolonged cloudy periods or high-load events. Generator sizing should include a 20% safety margin above calculated peak load.'
          : '在离网微电网中，柴油发电机在连续阴天或高负载时作为光伏和储能的补充。发电机定容须在计算峰值功率基础上留20%安全余量。'}
      </div>

    </div>
  );
}
