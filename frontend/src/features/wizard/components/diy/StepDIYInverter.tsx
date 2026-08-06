/**
 * StepDIYInverter.tsx — DIY流程 Step 3: 逆变器选型 & 台数
 *
 * 驱动逻辑：PV总容量（Step 1）约束逆变器规格与台数
 *   - 容配比 = PV容量 / (单台逆变器kW × 台数)，推荐范围 0.9–1.5
 *   - 用户先选逆变器规格（kW/台），再选台数
 *   - 托盘数 = ceil(台数 / 2)
 *
 * 注：单相/三相由第2步电压等级决定，此处不重复选择。
 */
import { useState, useEffect } from 'react';
import type { ConfigData } from '@/types/index';
import { useLang } from '@/context/LangContext';

interface StepDIYInverterProps {
  inverterKw?: number;       // 当前选定单台规格
  inverterCount?: number;    // 当前选定台数
  totalInverterKw?: number;
  pvCapacityKw?: number;     // 来自 Step 1
  onUpdate: (data: Partial<ConfigData>) => void;
}

// 所有可选逆变器规格（kW/台）
const INVERTER_SIZES = [3, 5, 8, 10, 12, 15, 20, 30, 50, 75, 100];

const RATIO_MIN = 0.9;
const RATIO_MAX = 1.5;
const INVERTERS_PER_TRAY = 2;
const MAX_COUNT = 12;

type RatioStatus = 'good' | 'low' | 'high' | 'none';

function getRatioStatus(pvKw: number, invKw: number, count: number): RatioStatus {
  if (pvKw <= 0 || invKw <= 0 || count <= 0) return 'none';
  const r = pvKw / (invKw * count);
  if (r >= RATIO_MIN && r <= RATIO_MAX) return 'good';
  return r < RATIO_MIN ? 'low' : 'high';
}

const statusColor: Record<RatioStatus, string> = {
  good: 'var(--theme-brand-700)', low: 'var(--theme-tone-warm-text)', high: 'var(--theme-steel-700)', none: '#718096',
};

/** 给定 pvKw 和 invKw，返回容配比合理的台数范围 */
function goodCountRange(pvKw: number, invKw: number): [number, number] {
  if (pvKw <= 0 || invKw <= 0) return [1, MAX_COUNT];
  const lo = Math.max(1, Math.ceil(pvKw / (invKw * RATIO_MAX)));
  const hi = Math.max(lo, Math.floor(pvKw / (invKw * RATIO_MIN)));
  return [lo, Math.min(hi, MAX_COUNT)];
}

export default function StepDIYInverter({
  inverterKw,
  inverterCount,
  totalInverterKw: _twk,
  pvCapacityKw = 0,
  onUpdate,
}: StepDIYInverterProps) {
  const { lang } = useLang();

  // ── 当前选定规格 & 台数（本地 state，同步到 config） ──────────
  const [selKw,    setSelKw]    = useState<number>(inverterKw    ?? 0);
  const [selCount, setSelCount] = useState<number>(inverterCount ?? 0);

  // 当 pvCapacityKw 变化时，仅在尚未选择的情况下不做任何事
  // （不强制重置——用户可以保留"超范围"选择，配置汇总会明确告知影响）
  useEffect(() => {
    // intentionally no-op: let user keep their choice even if PV changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvCapacityKw]);

  const handlePickKw = (kw: number) => {
    setSelKw(kw);
    // 自动选择合理台数（取范围中间值）
    const [lo, hi] = goodCountRange(pvCapacityKw, kw);
    const auto = Math.round((lo + hi) / 2);
    const c = Math.max(lo, Math.min(hi, auto));
    setSelCount(c);
    const trays = Math.ceil(c / INVERTERS_PER_TRAY);
    onUpdate({
      inverterKw: kw,
      inverterCount: c,
      totalInverterKw: +(kw * c).toFixed(2),
      trayCount: trays,
    } as any);
  };

  const handlePickCount = (count: number) => {
    setSelCount(count);
    const trays = Math.ceil(count / INVERTERS_PER_TRAY);
    onUpdate({
      inverterCount: count,
      totalInverterKw: +(selKw * count).toFixed(2),
      trayCount: trays,
    } as any);
  };

  // ── 过滤可用规格（至少有1个合理台数） ─────────────────────────
  const availableSizes = INVERTER_SIZES.filter(kw => {
    const [lo, hi] = goodCountRange(pvCapacityKw, kw);
    return lo <= hi;
  });

  // ── 台数列表（受 PV 约束） ─────────────────────────────────────
  const [countLo, countHi] = selKw > 0
    ? goodCountRange(pvCapacityKw, selKw)
    : [1, MAX_COUNT];

  // Show counts: good range + 2 on each side for context
  const countOptions: number[] = [];
  for (let c = Math.max(1, countLo - 2); c <= Math.min(MAX_COUNT, countHi + 3); c++) {
    countOptions.push(c);
  }

  const ratioStatus = getRatioStatus(pvCapacityKw, selKw, selCount);
  const actualRatio = selKw > 0 && selCount > 0
    ? (pvCapacityKw / (selKw * selCount)).toFixed(2)
    : '—';
  const trayCount = selCount > 0 ? Math.ceil(selCount / INVERTERS_PER_TRAY) : 0;

  const statusLabel: Record<RatioStatus, { zh: string; en: string }> = {
    good: { zh: '✓ 容配比合理',  en: '✓ Ratio OK' },
    low:  { zh: '↑ 光伏偏少',     en: '↑ PV under-sized' },
    high: { zh: '↓ 光伏偏多',     en: '↓ PV over-sized' },
    none: { zh: '—',              en: '—' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

      {/* ── PV 总容量参考 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.75rem 1.1rem',
        background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)',
        borderRadius: '10px',
      }}>
        <div style={{ textAlign: 'center', minWidth: '100px' }}>
          <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--theme-tone-text)' }}>
            {pvCapacityKw > 0 ? `${pvCapacityKw.toFixed(1)} kW` : '—'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>
            {lang === 'en' ? 'PV Capacity (Step 1)' : '光伏总容量（Step 1）'}
          </div>
        </div>
        <div style={{ flex: 1, fontSize: '0.83rem', color: 'var(--theme-tone-text)', lineHeight: 1.6 }}>
          {lang === 'en'
            ? `Inverter sizing ratio (PV ÷ inverter total) should be ${RATIO_MIN}×–${RATIO_MAX}×. Select inverter spec first, then quantity — the system highlights valid options.`
            : `容配比（光伏÷逆变器总功率）建议在 ${RATIO_MIN}×–${RATIO_MAX}× 之间。先选逆变器规格，再选台数，系统将高亮合理选项。`}
        </div>
      </div>

      {/* ── Section A: 逆变器规格选择 ── */}
      <section>
        <div style={{
          fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em',
          color: '#718096', textTransform: 'uppercase', marginBottom: '0.6rem',
        }}>
          {lang === 'en' ? 'A — Inverter Size (kW/unit)' : 'A — 逆变器单台规格（kW/台）'}
        </div>

        {pvCapacityKw <= 0 && (
          <div style={{ fontSize: '0.85rem', color: '#a0aec0', padding: '0.5rem 0' }}>
            {lang === 'en' ? '← Complete Step 1 (site area) first' : '← 请先完成 Step 1（场地面积）'}
          </div>
        )}

        {pvCapacityKw > 0 && (
          <>
            <div style={{ fontSize: '0.78rem', color: '#718096', marginBottom: '0.55rem' }}>
              {lang === 'en'
                ? '🟢 Recommended range · All sizes are selectable; out-of-range options will show a warning.'
                : '🟢 绿色 = 推荐范围  ·  所有规格均可选，超出范围会显示提醒，不影响方案生成。'}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: '0.65rem',
              }}
            >
              {INVERTER_SIZES.map(kw => {
                const [lo, hi] = goodCountRange(pvCapacityKw, kw);
                const hasGoodRange = lo <= hi;
                const isSelected   = selKw === kw;
                return (
                  <div
                    key={kw}
                    onClick={() => handlePickKw(kw)}
                    style={{
                      padding: '0.95rem 0.7rem',
                      textAlign: 'center',
                      border: `2px solid ${isSelected ? '#1a365d' : hasGoodRange ? 'var(--theme-tone-border)' : '#e2e8f0'}`,
                      borderRadius: '10px', cursor: 'pointer',
                      background: isSelected ? '#ebf4ff' : hasGoodRange ? 'var(--theme-tone-bg)' : 'white',
                      transition: 'all 0.15s',
                      minHeight: '86px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      // 非推荐规格：轻微降低，但仍完全可点
                      opacity: hasGoodRange ? 1 : 0.65,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: isSelected ? '#1a365d' : hasGoodRange ? '#1a365d' : '#718096' }}>
                      {kw} kW
                    </div>
                    {hasGoodRange
                      ? (
                        <div style={{ fontSize: '0.65rem', color: '#718096', marginTop: '0.1rem' }}>
                          {lo === hi
                            ? `${lo} ${lang === 'en' ? 'unit' : '台'}`
                            : `${lo}–${hi} ${lang === 'en' ? 'units' : '台'}`}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.6rem', color: 'var(--theme-tone-warm-text)', marginTop: '0.1rem' }}>
                          {lang === 'en' ? '⚠ off-range' : '⚠ 超范围'}
                        </div>
                      )
                    }
                  </div>
                );
              })}
            </div>
          </>
        )}

        {pvCapacityKw > 0 && availableSizes.length === 0 && (
          <div style={{ fontSize: '0.85rem', color: 'var(--theme-tone-danger-text)', padding: '0.5rem 0' }}>
            {lang === 'en'
              ? 'No standard inverter size fits your PV capacity. Please check Step 1.'
              : '当前PV容量无法匹配标准逆变器规格，请检查Step 1。'}
          </div>
        )}
      </section>

      {/* ── Section B: 台数选择 ── */}
      {selKw > 0 && (
        <section>
          <div style={{
            fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em',
            color: '#718096', textTransform: 'uppercase', marginBottom: '0.6rem',
          }}>
            {lang === 'en'
              ? `B — Quantity of ${selKw} kW inverters`
              : `B — ${selKw} kW 逆变器台数`}
          </div>

          <div style={{ fontSize: '0.78rem', color: '#718096', marginBottom: '0.55rem' }}>
            {lang === 'en'
              ? '🟢 Recommended · You may also select counts outside the range.'
              : '🟢 绿色 = 推荐台数  ·  也可自由选择范围外的台数，系统会说明影响。'}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gap: '0.7rem',
            }}
          >
            {countOptions.map(count => {
              const status = getRatioStatus(pvCapacityKw, selKw, count);
              const isGood = status === 'good';
              const isSel  = selCount === count;
              const ratio  = (pvCapacityKw / (selKw * count)).toFixed(2);
              return (
                <div
                  key={count}
                  onClick={() => handlePickCount(count)}
                  style={{
                    padding: '0.9rem 0.75rem',
                    textAlign: 'center',
                    border: `2px solid ${isSel ? '#1a365d' : isGood ? 'var(--theme-tone-border)' : '#e2e8f0'}`,
                    borderRadius: '10px', cursor: 'pointer',
                    background: isSel ? '#ebf4ff' : isGood ? 'var(--theme-tone-bg)' : 'white',
                    transition: 'all 0.15s',
                    position: 'relative',
                    minHeight: '92px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  {isGood && !isSel && (
                    <div style={{
                      position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
                      fontSize: '0.58rem', fontWeight: 700, padding: '0.08rem 0.4rem',
                      background: 'var(--theme-brand-700)', color: 'white', borderRadius: '8px', whiteSpace: 'nowrap',
                    }}>
                      {lang === 'en' ? 'Good' : '合理'}
                    </div>
                  )}
                  {!isGood && !isSel && (
                    <div style={{
                      position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
                      fontSize: '0.58rem', fontWeight: 700, padding: '0.08rem 0.4rem',
                      background: '#e2e8f0', color: '#718096', borderRadius: '8px', whiteSpace: 'nowrap',
                    }}>
                      {lang === 'en' ? 'Off-range' : '超范围'}
                    </div>
                  )}
                  <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#1a365d' }}>{count}</div>
                  <div style={{ fontSize: '0.7rem', color: '#718096' }}>{lang === 'en' ? 'units' : '台'}</div>
                  <div style={{
                    fontSize: '0.68rem', fontWeight: 600, marginTop: '0.2rem',
                    color: statusColor[status],
                  }}>
                    {ratio}×{status === 'good' ? ' ✓' : status === 'low' ? ' ↑' : ' ↓'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 配置汇总 ── */}
      {selKw > 0 && selCount > 0 && (
        <div style={{
          padding: '1rem 1.25rem',
          background: ratioStatus === 'good' ? 'var(--theme-tone-bg)' : 'var(--theme-tone-warm-bg)',
          border: `1px solid ${ratioStatus === 'good' ? 'var(--theme-tone-border)' : 'var(--theme-tone-warm-border)'}`,
          borderLeft: `4px solid ${ratioStatus === 'good' ? 'var(--theme-tone-accent)' : 'var(--theme-tone-warm-accent)'}`,
          borderRadius: '10px',
        }}>
          <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.75rem' }}>
            {lang === 'en' ? 'Configuration Summary' : '配置汇总'}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.6rem',
          }}>
            {[
              { label: lang === 'en' ? 'Inverter Spec'       : '单台规格',         value: `${selKw} kW`,                                          color: '#1a365d' },
              { label: lang === 'en' ? 'Quantity'            : '台数',             value: `${selCount} ${lang === 'en' ? 'units' : '台'}`,         color: '#1a365d' },
              { label: lang === 'en' ? 'Total Inverter Power': '逆变器总功率',     value: `${(selKw * selCount).toFixed(1)} kW`,                   color: 'var(--theme-brand-700)' },
              { label: lang === 'en' ? 'PV/Inv Ratio'        : '容配比',           value: `${actualRatio}×`,                                      color: statusColor[ratioStatus] },
              { label: lang === 'en' ? 'Integrated Trays'    : '一体化托盘数',     value: `${trayCount} ${lang === 'en' ? 'trays' : '个'}`,        color: 'var(--theme-steel-700)' },
            ].map(m => (
              <div key={m.label} style={{
                textAlign: 'center', background: 'white',
                borderRadius: '8px', padding: '0.6rem',
              }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: '0.7rem', color: '#718096' }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: '0.75rem', fontSize: '0.82rem',
            color: statusColor[ratioStatus], fontWeight: 600,
          }}>
            {lang === 'en'
              ? `PV/Inverter ratio: ${actualRatio}× — ${statusLabel[ratioStatus].en}`
              : `容配比：${actualRatio}× — ${statusLabel[ratioStatus].zh}`}
          </div>
          <div style={{
            marginTop: '0.5rem', fontSize: '0.8rem', color: '#4a5568',
            padding: '0.55rem 0.8rem', background: '#f7fafc', borderRadius: '6px', lineHeight: 1.6,
          }}>
            {lang === 'en'
              ? `Each integrated tray holds up to ${INVERTERS_PER_TRAY} inverters → ${selCount} inverter(s) require ${trayCount} tray(s). Each tray supports up to 16 battery packs.`
              : `每个一体化托盘最多容纳 ${INVERTERS_PER_TRAY} 台逆变器 → ${selCount} 台逆变器需要 ${trayCount} 个托盘，每个托盘最多配 16 个电池包。`}
          </div>
        </div>
      )}

    </div>
  );
}
