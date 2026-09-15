import { useEffect, useState } from 'react';
import type { ConfigData } from '@/types/index';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import { formatIrradianceDualFtFirst } from '@/utils/unitFormat';

interface StepDIYPvSetupProps {
  availableAreaM2?: number | null;
  maxBracketSetsByLayout?: number | null;
  peakSunHoursPerDay?: number | null;
  annualEffHours?: number | null;
  annualKwhPerM2?: number | null;
  panelModel?: string;
  bracketModel?: string;
  bracketSets?: number;
  onUpdate: (data: Partial<ConfigData> & { pvCapacityKw?: number; bracketSets?: number }) => void;
}

type Lang = 'zh' | 'en';
type Translator = (key: string) => string;
type PvPanel = ReturnType<typeof useProducts>['pvPanels'][number];

function SolarSummary({
  peakSunHoursPerDay, annualEffHours, annualKwhPerM2, lang, t,
}: {
  peakSunHoursPerDay?: number | null;
  annualEffHours?: number | null;
  annualKwhPerM2?: number | null;
  lang: Lang;
  t: Translator;
}) {
  const metrics = [
    { value: peakSunHoursPerDay ?? '-', label: t('loc.peak_sun'), unit: t('loc.peak_sun_unit'), color: 'var(--theme-tone-text)', size: '1.5rem' },
    { value: annualEffHours != null ? annualEffHours.toLocaleString() : '-', label: t('loc.annual_hrs'), unit: t('loc.annual_hrs_unit'), color: 'var(--theme-brand-700)', size: '1.5rem' },
    { value: formatIrradianceDualFtFirst(annualKwhPerM2 ?? undefined, lang).combined, label: t('loc.irradiance'), unit: t('loc.irradiance_unit'), color: 'var(--theme-tone-warm-text)', size: '1rem' },
  ];
  return (
    <section>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em', color: '#718096', textTransform: 'uppercase', marginBottom: '0.6rem' }}>{t('loc.solar_result')}</div>
      <div style={{ padding: '1rem 1.25rem', background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)', borderRadius: '10px', borderLeft: '4px solid var(--theme-tone-accent)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
          {metrics.map(metric => (
            <div key={metric.label} style={{ background: 'white', borderRadius: '8px', padding: '0.7rem' }}>
              <div style={{ fontSize: metric.size, fontWeight: 800, color: metric.color, lineHeight: 1.25 }}>{metric.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-brand-600)', fontWeight: 600 }}>{metric.label}</div>
              <div style={{ fontSize: '0.7rem', color: '#718096' }}>{metric.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PanelSelector({
  panels, selectedModel, bracketModel, isEn, calcPvKw, onSelect,
}: {
  panels: PvPanel[];
  selectedModel: string;
  bracketModel: string;
  isEn: boolean;
  calcPvKw: ReturnType<typeof useProducts>['calcPvKw'];
  onSelect: (model: string) => void;
}) {
  return (
    <section>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em', color: '#718096', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        {isEn ? 'A - PV Module Selection' : 'A - 光伏组件型号'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '0.65rem' }}>
        {panels.map(panel => {
          const selected = selectedModel === panel.model;
          return (
            <div
              key={panel.model}
              onClick={() => onSelect(panel.model)}
              style={{
                padding: '0.95rem 0.7rem',
                border: `2px solid ${selected ? '#1a365d' : '#e2e8f0'}`,
                borderRadius: '10px', cursor: 'pointer',
                background: selected ? '#ebf4ff' : 'white',
                transition: 'all 0.15s', textAlign: 'center', minHeight: '84px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a365d' }}>{panel.model}</div>
              <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.15rem' }}>
                {calcPvKw(1, panel.model, bracketModel).toFixed(2)} kW/{isEn ? 'set' : '套'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatAnnualGeneration(annualKwh: number) {
  return annualKwh >= 1000
    ? { value: (annualKwh / 1000).toFixed(1), unit: 'MWh' }
    : { value: Math.round(annualKwh).toLocaleString(), unit: 'kWh' };
}

function SetSelector({
  maxSets, effectiveSets, setsInput, pvKw, panelsPerSet, annualGenKwh, isEn,
  onChoose, onInputChange, onInputBlur,
}: {
  maxSets: number;
  effectiveSets: number;
  setsInput: string;
  pvKw: number;
  panelsPerSet: number;
  annualGenKwh: number | null;
  isEn: boolean;
  onChoose: (sets: number) => void;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
}) {
  const annualGeneration = annualGenKwh == null ? null : formatAnnualGeneration(annualGenKwh);
  const metrics = [
    { value: effectiveSets, unit: '', label: isEn ? 'Bracket Sets' : '支架套数', color: '#1a365d' },
    { value: pvKw.toFixed(1), unit: ' kW', label: isEn ? 'PV Capacity' : '光伏容量', color: 'var(--theme-brand-700)' },
    { value: effectiveSets * panelsPerSet, unit: '', label: isEn ? 'Total Panels' : '组件总数', color: '#38a169' },
  ];
  return (
    <section>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.07em', color: '#718096', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        {isEn ? 'B - Actual Sets to Install' : 'B - 实际安装套数'}
      </div>
      <div style={{ fontSize: '0.82rem', color: '#718096', marginBottom: '0.7rem' }}>
        {isEn ? `Site supports up to ${maxSets} set${maxSets > 1 ? 's' : ''}. Drag the slider or enter a number.` : `场地最多可安装 ${maxSets} 套，拖动滑块或直接输入数量。`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.8rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>1</span>
        <input type="range" min={1} max={maxSets} value={effectiveSets} onChange={event => onChoose(parseInt(event.target.value, 10))} style={{ flex: 1, cursor: 'pointer', accentColor: '#1a365d' }} />
        <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>{maxSets}</span>
        <input
          type="number"
          min={1}
          max={maxSets}
          value={setsInput}
          onChange={event => onInputChange(event.target.value)}
          onBlur={onInputBlur}
          style={{ width: '72px', padding: '0.4rem 0.6rem', border: '2px solid #1a365d', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, textAlign: 'center', color: '#1a365d' }}
        />
        <span style={{ fontSize: '0.85rem', color: '#4a5568', fontWeight: 600 }}>{isEn ? (effectiveSets === 1 ? 'set' : 'sets') : '套'}</span>
      </div>
      <div style={{ padding: '0.9rem 1rem', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.45rem' }}>{isEn ? 'Selected PV Capacity' : '已选光伏容量'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: annualGeneration ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
          {metrics.map(metric => (
            <div key={metric.label}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: metric.color }}>{metric.value}{metric.unit}</div>
              <div style={{ fontSize: '0.74rem', color: '#718096' }}>{metric.label}</div>
            </div>
          ))}
          {annualGeneration && (
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#d69e2e' }}>
                {annualGeneration.value}<span style={{ fontSize: '0.75rem', fontWeight: 600 }}> {annualGeneration.unit}</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#718096' }}>{isEn ? 'Est. Annual Gen.' : '预估年发电量'}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function StepDIYPvSetup({
  availableAreaM2,
  maxBracketSetsByLayout,
  peakSunHoursPerDay,
  annualEffHours,
  annualKwhPerM2,
  panelModel,
  bracketModel,
  bracketSets = 0,
  onUpdate,
}: StepDIYPvSetupProps) {
  const { t, lang } = useLang();
  const { pvPanels, getBracketByModel, calcPvKw, bracketSpacingM, defaultPanelModel, defaultBracketModel } = useProducts();
  const [chosenSets, setChosenSets] = useState<number | null>(null);
  const [setsInput, setSetsInput] = useState('');
  const hasSolarResult = peakSunHoursPerDay != null || annualEffHours != null || annualKwhPerM2 != null;
  const resolvedPanelModel = panelModel ?? defaultPanelModel;
  const resolvedBracketModel = bracketModel ?? defaultBracketModel;

  const bracket = getBracketByModel(resolvedBracketModel);
  const bracketLenM = bracket.footprintLengthM;
  const bracketWidM = bracket.footprintWidthM;
  const spacingFt = Math.round(bracketSpacingM * 3.28084);
  const areaPerSet = bracket.areaM2;
  const areaM2Value = availableAreaM2 && availableAreaM2 > 0 ? availableAreaM2 : 0;
  const hasArea = areaM2Value > 0;
  const maxSetsFromArea = hasArea ? Math.floor(areaM2Value / areaPerSet) : 0;
  const maxSets = maxBracketSetsByLayout != null ? maxBracketSetsByLayout : maxSetsFromArea;
  const effectiveSets = chosenSets !== null
    ? Math.min(chosenSets, maxSets)
    : bracketSets > 0
      ? Math.min(bracketSets, maxSets || bracketSets)
      : maxSets;
  const pvKw = effectiveSets > 0 ? calcPvKw(effectiveSets, resolvedPanelModel, resolvedBracketModel) : 0;

  // 预估年发电量
  const annualGenKwh = pvKw > 0 && annualEffHours != null && annualEffHours > 0
    ? pvKw * annualEffHours
    : null;

  useEffect(() => {
    if (!hasArea || maxSets <= 0) return;
    const defaultSets = bracketSets > 0 ? Math.min(bracketSets, maxSets) : maxSets;
    if (chosenSets === null) {
      setChosenSets(defaultSets);
      setSetsInput(String(defaultSets));
    }
    if (bracketSets !== defaultSets && chosenSets === null) {
      onUpdate({
        bracketSets: defaultSets,
        pvCapacityKw: calcPvKw(defaultSets, resolvedPanelModel, resolvedBracketModel),
      } as any);
    }
  }, [hasArea, maxSets, bracketSets, chosenSets, resolvedPanelModel, resolvedBracketModel]);

  // 同步 setsInput
  useEffect(() => {
    if (chosenSets !== null) {
      setSetsInput(String(chosenSets));
    }
  }, [chosenSets]);

  const handlePanel = (model: string) => {
    const nextSets = effectiveSets > 0 ? effectiveSets : maxSets;
    onUpdate({
      panelModel: model,
      bracketSets: nextSets,
      pvCapacityKw: nextSets > 0 ? calcPvKw(nextSets, model, resolvedBracketModel) : 0,
    } as any);
  };

  const handleChooseSets = (sets: number) => {
    const clamped = Math.max(1, Math.min(sets, maxSets));
    setChosenSets(clamped);
    onUpdate({
      bracketSets: clamped,
      pvCapacityKw: calcPvKw(clamped, resolvedPanelModel, resolvedBracketModel),
    } as any);
  };

  const handleSetsInputChange = (val: string) => {
    setSetsInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= maxSets) {
      handleChooseSets(n);
    }
  };

  const handleSetsInputBlur = () => {
    const n = parseInt(setsInput, 10);
    if (isNaN(n) || n < 1) {
      handleChooseSets(1);
    } else if (n > maxSets) {
      handleChooseSets(maxSets);
    }
  };

  const isEn = lang === 'en';
  const panelObj = pvPanels.find(p => p.model === resolvedPanelModel);
  const panelsPerSet = bracket.panelsPerSet;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      {/* 太阳能参数 */}
      {hasSolarResult && (
        <SolarSummary
          peakSunHoursPerDay={peakSunHoursPerDay}
          annualEffHours={annualEffHours}
          annualKwhPerM2={annualKwhPerM2}
          lang={lang}
          t={t}
        />
      )}

      {/* A - 光伏组件型号 */}
      <PanelSelector
        panels={pvPanels}
        selectedModel={resolvedPanelModel}
        bracketModel={resolvedBracketModel}
        isEn={isEn}
        calcPvKw={calcPvKw}
        onSelect={handlePanel}
      />

      {/* B - 实际安装套数（滑块 + 数字输入） */}
      {hasArea && maxSets > 0 && (
        <SetSelector
          maxSets={maxSets}
          effectiveSets={effectiveSets}
          setsInput={setsInput}
          pvKw={pvKw}
          panelsPerSet={panelsPerSet}
          annualGenKwh={annualGenKwh}
          isEn={isEn}
          onChoose={handleChooseSets}
          onInputChange={handleSetsInputChange}
          onInputBlur={handleSetsInputBlur}
        />
      )}

      {hasArea && maxSets <= 0 && (
        <div style={{
          padding: '0.9rem 1rem', borderRadius: '10px',
          background: 'var(--theme-tone-danger-bg)',
          border: '1px solid var(--theme-tone-danger-border)',
          color: 'var(--theme-tone-danger-text)', fontSize: '0.85rem',
        }}>
          {isEn
            ? `The current site area and layout do not allow one full ${bracketLenM} m × ${bracketWidM} m bracket set while keeping ${spacingFt} ft spacing between neighboring sets.`
            : `按当前场地面积与排布条件，并保留相邻支架之间 ${spacingFt} 英尺间距后，仍不足以放置一整套 ${bracketLenM} m × ${bracketWidM} m 的光伏支架。`}
        </div>
      )}
    </div>
  );
}
