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
type Lang = 'zh' | 'en';
type BatteryPack = ReturnType<typeof useProducts>['batteryPacks'][number];

function clampCount(count: number, maxPacks: number) {
  return Math.max(1, Math.min(count, maxPacks));
}

function getRecommendedCount(pack: BatteryPack, totalInverterKw: number, hours: number, maxPacks: number) {
  if (pack.capacityKwh <= 0 || totalInverterKw <= 0) return 1;
  return clampCount(Math.ceil((totalInverterKw * hours) / 0.9 / pack.capacityKwh), maxPacks);
}

function BatteryModelGrid({
  packs, currentModel, maxPacks, lang, onSelect,
}: {
  packs: BatteryPack[];
  currentModel: string;
  maxPacks: number;
  lang: Lang;
  onSelect: (model: string) => void;
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.6rem', fontSize: '0.93rem' }}>
        {lang === 'en' ? '① Select Battery Pack Model' : '① 选择电池包型号'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '0.65rem' }}>
        {packs.map(pack => {
          const selected = currentModel === pack.model;
          return (
            <div
              key={pack.model}
              onClick={() => onSelect(pack.model)}
              style={{
                padding: '0.95rem 0.7rem',
                border: `2px solid ${selected ? 'var(--theme-brand-700)' : '#e2e8f0'}`,
                borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                background: selected ? 'var(--theme-tone-bg)' : 'white',
                transition: 'all 0.18s', minHeight: '112px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}
            >
              <div style={{ fontWeight: 800, color: '#1a365d', fontSize: '1.05rem' }}>{pack.capacityKwh} kWh</div>
              <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.15rem', lineHeight: 1.4 }}>{getLocalizedProductLabel(pack, lang)}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--theme-brand-700)', fontWeight: 600, marginTop: '0.3rem' }}>
                {lang === 'en' ? `Max: ${maxPacks * pack.capacityKwh} kWh` : `最大：${maxPacks * pack.capacityKwh} kWh`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackCountSelector({
  maxPacks, selectedCount, input, recommendedMin, recommendedMax, lang,
  onChange, onInputChange, onInputBlur,
}: {
  maxPacks: number;
  selectedCount: number;
  input: string;
  recommendedMin: number;
  recommendedMax: number;
  lang: Lang;
  onChange: (count: number) => void;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
}) {
  const label = recommendedMin === recommendedMax ? `${recommendedMin}` : `${recommendedMin}-${recommendedMax}`;
  const startPct = maxPacks > 1 ? ((recommendedMin - 1) / (maxPacks - 1)) * 100 : 0;
  const endPct = maxPacks > 1 ? ((recommendedMax - 1) / (maxPacks - 1)) * 100 : 100;
  const recommendation = recommendedMin === recommendedMax
    ? (lang === 'en' ? `Single recommended quantity: ${recommendedMin} packs. ` : ` 推荐数量：${recommendedMin} 个。`)
    : (lang === 'en' ? `Recommended range (highlighted on the track): ${label} packs. ` : ` 推荐范围（在滑条上以绿色高亮表示）：${label} 个。`);
  return (
    <section>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em', color: '#718096', textTransform: 'uppercase', marginBottom: '0.45rem' }}>{lang === 'en' ? 'B - Number of Packs' : 'B - 电池包数量'}</div>
      <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.45rem', fontSize: '0.93rem' }}>
        {lang === 'en' ? `② Select number of packs (1–${maxPacks}):` : `② 选择电池包数量（1–${maxPacks} 个）`}
      </div>
      <div style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '0.65rem', lineHeight: 1.5 }}>
        {lang === 'en' ? `Trays support up to ${maxPacks} pack${maxPacks === 1 ? '' : 's'} total. ` : `本配置最多可安装 ${maxPacks} 个电池包。`}
        {recommendation}
        {lang === 'en' ? 'Drag the slider or enter a number in the field.' : ' 拖动滑块或右侧输入具体数量。'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>1</span>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: '6px', borderRadius: '999px', background: 'rgba(226, 232, 240, 0.8)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: `${startPct}%`, width: `${Math.max(0.4, endPct - startPct)}%`, top: '50%', transform: 'translateY(-50%)', height: '6px', borderRadius: '999px', background: 'rgba(46, 204, 113, 0.4)', pointerEvents: 'none', zIndex: 0 }} />
          <input type="range" min={1} max={maxPacks} step={1} value={selectedCount} onChange={event => onChange(parseInt(event.target.value, 10))} style={{ width: '100%', cursor: 'pointer', accentColor: '#1a365d', position: 'relative', zIndex: 1, background: 'transparent' }} />
        </div>
        <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>{maxPacks}</span>
        <input type="number" min={1} max={maxPacks} value={input} onChange={event => onInputChange(event.target.value)} onBlur={onInputBlur} style={{ width: '72px', padding: '0.4rem 0.6rem', border: '2px solid #1a365d', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, textAlign: 'center', color: '#1a365d' }} />
        <span style={{ fontSize: '0.85rem', color: '#4a5568', fontWeight: 600 }}>{lang === 'en' ? (selectedCount === 1 ? 'pack' : 'packs') : '个电池包'}</span>
      </div>
      <div style={{ fontSize: '0.76rem', color: '#4a5568' }}>
        <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: 2, marginRight: 6, verticalAlign: 'middle', background: 'rgba(46, 204, 113, 0.55)', border: '1px solid rgba(32, 160, 80, 0.45)' }} aria-hidden />
        {lang === 'en' ? 'Recommended' : '推荐位置'}: {label}
      </div>
    </section>
  );
}

function StorageSummary({
  trayCount, pack, selectedCount, maxPacks, lang,
}: {
  trayCount: number;
  pack: BatteryPack;
  selectedCount: number;
  maxPacks: number;
  lang: Lang;
}) {
  const remaining = maxPacks - selectedCount;
  const metrics = [
    { label: lang === 'en' ? 'Trays' : '托盘数', value: `${trayCount}`, unit: lang === 'en' ? 'trays' : '个', color: 'var(--theme-steel-700)' },
    { label: lang === 'en' ? 'Pack Capacity' : '单包容量', value: `${pack.capacityKwh} kWh`, unit: `/${lang === 'en' ? 'pack' : '包'}`, color: '#1a365d' },
    { label: lang === 'en' ? 'Pack Count' : '电池包数量', value: `${selectedCount}`, unit: lang === 'en' ? 'packs' : '个', color: 'var(--theme-tone-text)' },
    { label: lang === 'en' ? 'Total Storage' : '总储能容量', value: `${selectedCount * pack.capacityKwh}`, unit: 'kWh', color: 'var(--theme-tone-text)' },
  ];
  return (
    <div style={{ padding: '1rem 1.25rem', background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)', borderLeft: '4px solid var(--theme-tone-accent)', borderRadius: '10px' }}>
      <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.75rem' }}>{lang === 'en' ? 'Storage Configuration' : '储能配置结果'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.65rem' }}>
        {metrics.map(metric => (
          <div key={metric.label} style={{ textAlign: 'center', background: 'white', borderRadius: '8px', padding: '0.6rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: metric.color }}>{metric.value}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}> {metric.unit}</span></div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>{metric.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.85rem', fontSize: '0.81rem', color: '#4a5568', padding: '0.5rem 0.75rem', background: '#f7fafc', borderRadius: '6px', lineHeight: 1.6 }}>
        {lang === 'en'
          ? `Tray utilization: ${selectedCount}/${maxPacks} packs (${((selectedCount / maxPacks) * 100).toFixed(0)}%). ${remaining > 0 ? `${remaining} slot(s) remaining for future expansion.` : 'Fully utilized.'}`
          : `托盘使用率：${selectedCount}/${maxPacks} 包（${((selectedCount / maxPacks) * 100).toFixed(0)}%）。${remaining > 0 ? `剩余 ${remaining} 个插槽可用于未来扩容。` : '托盘已满配。'}`}
      </div>
    </div>
  );
}

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
  const [selectedCount, setSelectedCount] = useState<number>(
    clampCount(batteryPackCount ?? 1, maxPacks)
  );
  const [packsInput, setPacksInput] = useState(
    String(clampCount(batteryPackCount ?? 1, maxPacks))
  );
  const [sliderTouched, setSliderTouched] = useState<boolean>(batteryPackCount != null);

  // Recommend packs: 4h target, with a narrow preferred band around it.
  const recommendedPacks = getRecommendedCount(currentPack, totalInverterKw, 4, maxPacks);
  const recommendedMinPacks = Math.min(recommendedPacks, getRecommendedCount(currentPack, totalInverterKw, 3.5, maxPacks));
  const recommendedMaxPacks = Math.max(recommendedPacks, getRecommendedCount(currentPack, totalInverterKw, 4.5, maxPacks));

  // 未手动调节时，数量跟随推荐，并写回父级（否则全局计算仍用默认 1）
  useEffect(() => {
    if (maxPacks <= 0 || sliderTouched) return;
    const target = clampCount(recommendedPacks, maxPacks);
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
    const v = clampCount(batteryPackCount, maxPacks);
    setSelectedCount(v);
    setPacksInput(String(v));
  }, [maxPacks, sliderTouched, batteryPackCount]);

  const handleModelChange = (model: string) => {
    const nextPack = getBatteryByModel(model);
    const nextRecommended = getRecommendedCount(nextPack, totalInverterKw, 4, maxPacks);
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
      <BatteryModelGrid
        packs={batteryPacks}
        currentModel={currentModel}
        maxPacks={maxPacks}
        lang={lang}
        onSelect={handleModelChange}
      />

      {/* B – 与 StepDIYPvSetup「实际安装套数」同一行布局：1 — 滑块 — 最大值 — 数字 — packs */}
      <PackCountSelector
        maxPacks={maxPacks}
        selectedCount={selectedCount}
        input={packsInput}
        recommendedMin={recommendedMinPacks}
        recommendedMax={recommendedMaxPacks}
        lang={lang}
        onChange={handleCountChange}
        onInputChange={handlePacksInputChange}
        onInputBlur={handlePacksInputBlur}
      />

      {/* ── 最终结果汇总 ── */}
      <StorageSummary trayCount={trayCount} pack={currentPack} selectedCount={selectedCount} maxPacks={maxPacks} lang={lang} />
    </div>
  );
}
