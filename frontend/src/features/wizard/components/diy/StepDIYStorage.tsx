/**
 * StepDIYStorage.tsx — DIY流程 Step 5: 电池包选型 & 储能容量确定
 *
 * 核心约束：
 *   - 每个一体化托盘最多放 16 个电池包
 *   - 最大电池包数 = trayCount × 16
 *
 * 用户操作：
 *   1. 选择电池包型号（影响单包容量）
 *   2. 系统显示当前托盘允许的最大包数
 *   3. 用户通过滑块 + 数字输入选择电池包数量（与光伏「安装套数」步一致）
 *   4. 系统实时计算总储能容量
 */
import { useEffect, useState } from 'react';
import type { ConfigData } from '@/types/index';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import { getLocalizedProductLabel } from '@/utils/productLabel';

interface StepDIYStorageProps {
  trayCount?: number;             // 来自 Step4，决定最大电池包数
  batteryPackModel?: string;      // 当前选中电池包型号
  batteryPackCount?: number;      // 当前选中电池包数量
  totalInverterKw?: number;       // 参考逆变器总功率（用于推荐）
  onUpdate: (data: Partial<ConfigData>) => void;
}

const MAX_PACKS_PER_TRAY = 16;

export default function StepDIYStorage({
  trayCount = 1,
  batteryPackModel,
  batteryPackCount,
  totalInverterKw = 0,
  onUpdate,
}: StepDIYStorageProps) {
  const { lang } = useLang();
  const { batteryPacks, getBatteryByModel, defaultBatteryModel } = useProducts();

  const maxPacks = trayCount * MAX_PACKS_PER_TRAY;
  const currentModel = batteryPackModel ?? defaultBatteryModel;
  const currentPack = getBatteryByModel(currentModel);
  const clampPackCount = (count: number) => Math.max(1, Math.min(count, maxPacks));
  const [selectedCount, setSelectedCount] = useState<number>(
    clampPackCount(batteryPackCount ?? 1)
  );
  const [packsInput, setPacksInput] = useState(
    String(clampPackCount(batteryPackCount ?? 1))
  );
  const [sliderTouched, setSliderTouched] = useState<boolean>(batteryPackCount != null);

  const makeRecommendedCount = (hours: number) => {
    if (!currentPack || currentPack.capacityKwh <= 0 || totalInverterKw <= 0) return 1;
    return clampPackCount(Math.ceil((totalInverterKw * hours) / 0.9 / currentPack.capacityKwh));
  };

  // Recommend packs: 4h target, with a narrow preferred band around it.
  const recommendedPacks = makeRecommendedCount(4);
  const recommendedMinPacks = Math.min(recommendedPacks, makeRecommendedCount(3.5));
  const recommendedMaxPacks = Math.max(recommendedPacks, makeRecommendedCount(4.5));
  const recommendedLabel = recommendedMinPacks === recommendedMaxPacks
    ? `${recommendedPacks}`
    : `${recommendedMinPacks}-${recommendedMaxPacks}`;
  const recommendedStartPct = maxPacks > 1 ? ((recommendedMinPacks - 1) / (maxPacks - 1)) * 100 : 0;
  const recommendedEndPct = maxPacks > 1 ? ((recommendedMaxPacks - 1) / (maxPacks - 1)) * 100 : 100;

  // 未手动调节时，数量跟随推荐，并写回父级（否则全局计算仍用默认 1）
  useEffect(() => {
    if (maxPacks <= 0 || sliderTouched) return;
    const target = clampPackCount(recommendedPacks);
    setSelectedCount(s => (s === target ? s : target));
    setPacksInput(String(target));
    if (batteryPackCount === target) return;
    onUpdate({
      batteryPackCount:   target,
      batteryCapacityKwh: target * currentPack.capacityKwh,
    } as any);
    // onUpdate 是父组件每帧新建的 arrow，不纳入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPacks, sliderTouched, recommendedPacks, currentPack.capacityKwh, batteryPackCount, currentModel]);

  // 已手调时，从父级 config 同步（例如上一步后返回）
  useEffect(() => {
    if (maxPacks <= 0 || !sliderTouched) return;
    if (batteryPackCount == null) return;
    const v = clampPackCount(batteryPackCount);
    setSelectedCount(v);
    setPacksInput(String(v));
  }, [maxPacks, sliderTouched, batteryPackCount]);

  const handleModelChange = (model: string) => {
    const nextPack = getBatteryByModel(model);
    const nextRecommended = nextPack && nextPack.capacityKwh > 0 && totalInverterKw > 0
      ? clampPackCount(Math.ceil((totalInverterKw * 4) / 0.9 / nextPack.capacityKwh))
      : 1;
    const nextCount = sliderTouched ? selectedCount : nextRecommended;
    onUpdate({
      batteryPackModel:   model,
      batteryPackCount:   nextCount,
      batteryCapacityKwh: nextCount * nextPack.capacityKwh,
    } as any);
    if (!sliderTouched) {
      setSelectedCount(nextCount);
      setPacksInput(String(nextCount));
    }
  };

  const handleCountChange = (count: number) => {
    const clamped = Math.max(1, Math.min(count, maxPacks));
    setSliderTouched(true);
    setSelectedCount(clamped);
    setPacksInput(String(clamped));
    onUpdate({
      batteryPackCount:   clamped,
      batteryCapacityKwh: clamped * currentPack.capacityKwh,
    } as any);
  };

  const handlePacksInputChange = (val: string) => {
    setPacksInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= maxPacks) {
      handleCountChange(n);
    }
  };

  const handlePacksInputBlur = () => {
    const n = parseInt(packsInput, 10);
    if (isNaN(n) || n < 1) {
      handleCountChange(1);
    } else if (n > maxPacks) {
      handleCountChange(maxPacks);
    } else {
      handleCountChange(n);
    }
  };

  const totalKwh = selectedCount * currentPack.capacityKwh;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── 托盘约束说明 ── */}
      <div style={{
        padding: '0.85rem 1.1rem',
        background: 'var(--theme-tone-bg)',
        borderLeft: '4px solid var(--theme-tone-accent)',
        borderRadius: '8px',
        fontSize: '0.86rem',
        color: 'var(--theme-tone-text)',
        lineHeight: 1.7,
      }}>
        <strong>{lang === 'en' ? 'Tray constraint: ' : '托盘约束：'}</strong>
        {lang === 'en'
          ? `You have ${trayCount} integrated tray(s). Each tray supports up to ${MAX_PACKS_PER_TRAY} battery packs. Maximum: ${maxPacks} packs total.`
          : `当前共 ${trayCount} 个一体化托盘，每个托盘最多放 ${MAX_PACKS_PER_TRAY} 个电池包，合计最多可选 ${maxPacks} 个。`}
      </div>

      {/* ── 电池包型号选择 ── */}
      <div>
        <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.6rem', fontSize: '0.93rem' }}>
          {lang === 'en' ? '① Select Battery Pack Model' : '① 选择电池包型号'}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: '0.65rem',
        }}>
          {batteryPacks.map(pack => {
            const isSelected = currentModel === pack.model;
            const maxKwh = maxPacks * pack.capacityKwh;
            return (
              <div
                key={pack.model}
                onClick={() => handleModelChange(pack.model)}
                style={{
                  padding: '0.95rem 0.7rem',
                  border: `2px solid ${isSelected ? 'var(--theme-brand-700)' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  background: isSelected ? 'var(--theme-tone-bg)' : 'white',
                  transition: 'all 0.18s',
                  minHeight: '112px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontWeight: 800, color: '#1a365d', fontSize: '1.05rem' }}>
                  {pack.capacityKwh} kWh
                </div>
                <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.15rem', lineHeight: 1.4 }}>
                  {getLocalizedProductLabel(pack, lang)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--theme-brand-700)', fontWeight: 600, marginTop: '0.3rem' }}>
                  {lang === 'en' ? `Max: ${maxKwh} kWh` : `最大：${maxKwh} kWh`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* B – 与 StepDIYPvSetup「实际安装套数」同一行布局：1 — 滑块 — 最大值 — 数字 — packs */}
      <section>
        <div style={{
          fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em',
          color: '#718096', textTransform: 'uppercase', marginBottom: '0.45rem',
        }}>
          {lang === 'en' ? 'B - Number of Packs' : 'B - 电池包数量'}
        </div>
        <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.45rem', fontSize: '0.93rem' }}>
          {lang === 'en'
            ? `② Select number of packs (1–${maxPacks}):`
            : `② 选择电池包数量（1–${maxPacks} 个）`}
        </div>
        <div style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '0.65rem', lineHeight: 1.5 }}>
          {lang === 'en' ? (
            <>
              {`Trays support up to ${maxPacks} pack${maxPacks === 1 ? '' : 's'} total. `}
              {recommendedMinPacks === recommendedMaxPacks
                ? `Single recommended quantity: ${recommendedPacks} packs. `
                : `Recommended range (highlighted on the track): ${recommendedLabel} packs. `}
              {'Drag the slider or enter a number in the field.'}
            </>
          ) : (
            <>
              {`本配置最多可安装 ${maxPacks} 个电池包。`}
              {recommendedMinPacks === recommendedMaxPacks
                ? ` 推荐数量：${recommendedPacks} 个。`
                : ` 推荐范围（在滑条上以绿色高亮表示）：${recommendedLabel} 个。`}
              {' 拖动滑块或右侧输入具体数量。'}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>1</span>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: 0, right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              height: '6px',
              borderRadius: '999px',
              background: 'rgba(226, 232, 240, 0.8)',
              pointerEvents: 'none',
            }} />
            <div
              style={{
                position: 'absolute',
                left: `${recommendedStartPct}%`,
                width: `${Math.max(0.4, recommendedEndPct - recommendedStartPct)}%`,
                top: '50%',
                transform: 'translateY(-50%)',
                height: '6px',
                borderRadius: '999px',
                background: 'rgba(46, 204, 113, 0.4)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            <input
              type="range"
              min={1}
              max={maxPacks}
              step={1}
              value={selectedCount}
              onChange={e => handleCountChange(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: '#1a365d',
                position: 'relative',
                zIndex: 1,
                background: 'transparent',
              }}
            />
          </div>
          <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>{maxPacks}</span>
          <input
            type="number"
            min={1}
            max={maxPacks}
            value={packsInput}
            onChange={e => handlePacksInputChange(e.target.value)}
            onBlur={handlePacksInputBlur}
            style={{
              width: '72px',
              padding: '0.4rem 0.6rem',
              border: '2px solid #1a365d',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 700,
              textAlign: 'center',
              color: '#1a365d',
            }}
          />
          <span style={{ fontSize: '0.85rem', color: '#4a5568', fontWeight: 600 }}>
            {lang === 'en' ? (selectedCount === 1 ? 'pack' : 'packs') : '个电池包'}
          </span>
        </div>
        <div style={{ fontSize: '0.76rem', color: '#4a5568' }}>
          <span
            style={{
              display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: 2, marginRight: 6, verticalAlign: 'middle', background: 'rgba(46, 204, 113, 0.55)', border: '1px solid rgba(32, 160, 80, 0.45)',
            }}
            aria-hidden
          />
          {lang === 'en' ? 'Recommended' : '推荐位置'}
          {': '}
          {recommendedLabel}
        </div>
      </section>

      {/* ── 最终结果汇总 ── */}
      <div style={{
        padding: '1rem 1.25rem',
        background: 'var(--theme-tone-bg)',
        border: '1px solid var(--theme-tone-border)',
        borderLeft: '4px solid var(--theme-tone-accent)',
        borderRadius: '10px',
      }}>
        <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.75rem' }}>
          {lang === 'en' ? 'Storage Configuration' : '储能配置结果'}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '0.65rem',
        }}>
          {[
            {
              label: lang === 'en' ? 'Trays' : '托盘数',
              value: `${trayCount}`,
              unit: lang === 'en' ? 'trays' : '个',
              color: 'var(--theme-steel-700)',
            },
            {
              label: lang === 'en' ? 'Pack Capacity' : '单包容量',
              value: `${currentPack.capacityKwh} kWh`,
              unit: `/${lang === 'en' ? 'pack' : '包'}`,
              color: '#1a365d',
            },
            {
              label: lang === 'en' ? 'Pack Count' : '电池包数量',
              value: `${selectedCount}`,
              unit: lang === 'en' ? 'packs' : '个',
              color: 'var(--theme-tone-text)',
            },
            {
              label: lang === 'en' ? 'Total Storage' : '总储能容量',
              value: `${totalKwh}`,
              unit: 'kWh',
              color: 'var(--theme-tone-text)',
            },
          ].map(m => (
            <div key={m.label} style={{
              textAlign: 'center', background: 'white',
              borderRadius: '8px', padding: '0.6rem',
            }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: m.color }}>
                {m.value}
                <span style={{ fontSize: '0.75rem', fontWeight: 400 }}> {m.unit}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#718096' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Utilization info */}
        <div style={{
          marginTop: '0.85rem', fontSize: '0.81rem', color: '#4a5568',
          padding: '0.5rem 0.75rem', background: '#f7fafc',
          borderRadius: '6px', lineHeight: 1.6,
        }}>
          {lang === 'en'
            ? `Tray utilization: ${selectedCount}/${maxPacks} packs (${((selectedCount / maxPacks) * 100).toFixed(0)}%). ${maxPacks - selectedCount > 0 ? `${maxPacks - selectedCount} slot(s) remaining for future expansion.` : 'Fully utilized.'}`
            : `托盘使用率：${selectedCount}/${maxPacks} 包（${((selectedCount / maxPacks) * 100).toFixed(0)}%）。${maxPacks - selectedCount > 0 ? `剩余 ${maxPacks - selectedCount} 个插槽可用于未来扩容。` : '托盘已满配。'}`}
        </div>
      </div>

    </div>
  );
}
