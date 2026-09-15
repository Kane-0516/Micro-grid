import { useEffect, useState } from 'react';
import type { ConfigData } from '@/types/index';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import {
  type AreaUnit,
  formatAreaDualFtFirst,
  formatAreaSingle,
  sqftToSqm,
  sqmToSqft,
} from '@/utils/unitFormat';

const METERS_TO_FEET = 3.28084;

/**
 * Spacing-aware estimation of max installable bracket sets for a given area.
 * Tries multiple site aspect ratios x two bracket orientations, picks the best.
 */
function computeMaxSetsForArea(areaM2: number, bl: number, bw: number, sp: number): number {
  if (areaM2 <= 0) return 0;

  let best = 0;

  for (const [length, width] of [[bl, bw], [bw, bl]]) {
    for (const aspect of [1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 0.5, 0.33, 0.25, 0.2]) {
      const w = Math.sqrt(areaM2 / aspect);
      const h = areaM2 / Math.max(w, 0.1);
      const cols = maxFit1D(w, length, sp);
      const rows = maxFit1D(h, width, sp);
      const count = cols * rows;
      if (count > best) best = count;
    }
  }

  const effectivePerSet = (bl + sp) * (bw + sp);
  const upperBound = Math.floor(areaM2 / effectivePerSet) + 1;
  return Math.min(best, upperBound + 2);
}

/** 1D packing: how many items of length itemLen fit in totalLen with spacing between them */
function maxFit1D(totalLen: number, itemLen: number, spacing: number): number {
  if (totalLen < itemLen) return 0;
  return Math.floor((totalLen + spacing) / (itemLen + spacing));
}

interface StepAreaProps {
  availableAreaM2?: number;
  grossAreaM2?: number | null;
  maxBracketSetsByLayout?: number | null;
  panelModel?: string;
  bracketModel?: string;
  onUpdate: (data: Partial<ConfigData>) => void;
}

const AREA_UNITS: AreaUnit[] = ['ft2', 'm2'];

function formatInputValue(areaM2?: number, unit: AreaUnit = 'm2'): string {
  if (!areaM2 || areaM2 <= 0) return '';
  const displayValue = unit === 'm2' ? areaM2 : sqmToSqft(areaM2);
  const rounded = Math.round(displayValue * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getUnitLabel(unit: AreaUnit): string {
  return unit === 'm2' ? 'm\u00B2' : 'ft\u00B2';
}

function getInputWidth(value: string, minimumChars = 14): string {
  return `${Math.max(minimumChars, value.trim().length + 2)}ch`;
}

function UnusableAreaNote({
  totalAreaM2, usableAreaM2, effectiveAreaPerSet, maxSets,
  bracketLengthM, bracketWidthM, bracketLengthFt, bracketWidthFt, lang,
}: {
  totalAreaM2: number;
  usableAreaM2: number;
  effectiveAreaPerSet: number;
  maxSets: number;
  bracketLengthM: number;
  bracketWidthM: number;
  bracketLengthFt: string;
  bracketWidthFt: string;
  lang: 'zh' | 'en';
}) {
  if (totalAreaM2 <= usableAreaM2 || usableAreaM2 <= 0) return null;
  const unusableDisplay = formatAreaDualFtFirst(totalAreaM2 - usableAreaM2, lang, 2).combined;
  const effectiveFt2 = sqmToSqft(effectiveAreaPerSet).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const effectiveM2 = effectiveAreaPerSet.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.85rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '0.78rem', color: '#92400e', lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{lang === 'en' ? `Unusable area: ${unusableDisplay}` : `不可用面积：${unusableDisplay}`}</div>
      <div style={{ marginBottom: '0.2rem' }}>
        {lang === 'en' ? 'This remaining area is edge/corner space that cannot fit another bracket set because:' : '该剩余面积为边角空间，无法再安装更多支架，原因如下：'}
      </div>
      <div>(1) {lang === 'en'
        ? `Each bracket set occupies ${effectiveFt2} ft² (${effectiveM2} m²) including the ${bracketLengthFt} ft × ${bracketWidthFt} ft bracket body and surrounding maintenance spacing.`
        : `每套支架有效占地 ${effectiveFt2} ft²（${effectiveM2} m²），包含 ${bracketLengthM} m × ${bracketWidthM} m 支架本体及周围维护间距。`}
      </div>
      <div>(2) {lang === 'en'
        ? `After placing ${maxSets} set${maxSets > 1 ? 's' : ''}, the remaining space is too narrow or irregularly shaped to fit another full bracket.`
        : `在放置 ${maxSets} 套支架后，剩余空间太窄或形状不规则，无法容纳另一套完整支架。`}
      </div>
    </div>
  );
}

function AreaAssessment({
  normalizedAreaM2, usableAreaM2, maxSets, isFromLayout, maxBracketSetsByLayout,
  effectiveAreaPerSet, bracketLengthM, bracketWidthM, bracketLengthFt, bracketWidthFt,
  inputUnit, lang,
}: {
  normalizedAreaM2: number;
  usableAreaM2: number;
  maxSets: number;
  isFromLayout: boolean;
  maxBracketSetsByLayout?: number | null;
  effectiveAreaPerSet: number;
  bracketLengthM: number;
  bracketWidthM: number;
  bracketLengthFt: string;
  bracketWidthFt: string;
  inputUnit: AreaUnit;
  lang: 'zh' | 'en';
}) {
  const valid = maxSets >= 1;
  const sourceNote = maxBracketSetsByLayout == null
    ? (lang === 'en' ? ' (spacing-aware estimate from area input)' : '（基于面积的间距修正估算）')
    : (lang === 'en' ? ' (polygon layout result)' : '（多边形排布结果）');
  return (
    <div style={{ padding: '1rem 1.25rem', background: valid ? 'var(--theme-tone-bg)' : 'var(--theme-tone-danger-bg)', border: `1px solid ${valid ? 'var(--theme-tone-border)' : 'var(--theme-tone-danger-border)'}`, borderRadius: '10px', borderLeft: `4px solid ${valid ? 'var(--theme-tone-accent)' : 'var(--theme-tone-danger-accent)'}` }}>
      <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.5rem', fontSize: '0.95rem' }}>{lang === 'en' ? 'Site Assessment Result' : '场地评估结果'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <div style={{ textAlign: 'center', background: 'white', borderRadius: '8px', padding: '0.65rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1a365d', lineHeight: 1.25 }}>{formatAreaDualFtFirst(usableAreaM2, lang, 2).combined}</div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>
            {isFromLayout ? (lang === 'en' ? 'Usable Area (body + spacing)' : '可用面积（本体 + 间距）') : (lang === 'en' ? 'Site Area' : '场地面积')}
          </div>
        </div>
        <div style={{ textAlign: 'center', background: 'white', borderRadius: '8px', padding: '0.65rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--theme-tone-text)' }}>{maxSets}</div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>{lang === 'en' ? 'Maximum Installable Sets' : '最大可安装套数'}</div>
        </div>
      </div>
      {isFromLayout && (
        <UnusableAreaNote
          totalAreaM2={normalizedAreaM2}
          usableAreaM2={usableAreaM2}
          effectiveAreaPerSet={effectiveAreaPerSet}
          maxSets={maxSets}
          bracketLengthM={bracketLengthM}
          bracketWidthM={bracketWidthM}
          bracketLengthFt={bracketLengthFt}
          bracketWidthFt={bracketWidthFt}
          lang={lang}
        />
      )}
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#718096' }}>
        {lang === 'en'
          ? `Optimization will search within 1 to ${Math.max(maxSets, 0)} installable sets.${sourceNote}`
          : `后续优化会在 1 到 ${Math.max(maxSets, 0)} 套可安装支架范围内搜索。${sourceNote}`}
      </div>
      <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#718096' }}>
        {lang === 'en' ? 'Current input unit: ' : '当前输入口径：'}{formatAreaSingle(normalizedAreaM2, inputUnit, lang)}
      </div>
    </div>
  );
}

export default function StepArea({
  availableAreaM2,
  grossAreaM2: _grossAreaM2,
  maxBracketSetsByLayout,
  panelModel,
  bracketModel,
  onUpdate,
}: StepAreaProps) {
  const { getBracketByModel, getPanelByModel, calcPvKw, bracketSpacingM, defaultPanelModel, defaultBracketModel } = useProducts();
  const { lang } = useLang();
  const [inputUnit, setInputUnit] = useState<AreaUnit>('ft2');
  const [inputVal, setInputVal] = useState(formatInputValue(availableAreaM2, 'ft2'));

  const resolvedPanelModel = panelModel ?? defaultPanelModel;
  const resolvedBracketModel = bracketModel ?? defaultBracketModel;
  const bracket = getBracketByModel(resolvedBracketModel);
  const panel = getPanelByModel(resolvedPanelModel);
  const areaPerSet = bracket.areaM2;
  const bracketLengthM = bracket.footprintLengthM;
  const bracketWidthM = bracket.footprintWidthM;
  const perSetPvKw = calcPvKw(1, resolvedPanelModel, resolvedBracketModel).toFixed(2);
  const bracketLengthFt = (bracketLengthM * METERS_TO_FEET).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const bracketWidthFt = (bracketWidthM * METERS_TO_FEET).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const exactAreaFt2 = sqmToSqft(areaPerSet).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const exactAreaM2 = areaPerSet.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const normalizedAreaM2 = availableAreaM2 && availableAreaM2 > 0 ? availableAreaM2 : 0;
  const maxSets = maxBracketSetsByLayout != null
    ? maxBracketSetsByLayout
    : normalizedAreaM2 > 0
      ? computeMaxSetsForArea(normalizedAreaM2, bracketLengthM, bracketWidthM, bracketSpacingM)
      : 0;

  // Usable Area = 支架本体面积 + 支架间距面积
  // 框选排布时：精确计算 = 套数 × 有效占地/套
  // 手动输入时：无法精确区分，可用面积 = 输入面积
  const effectiveAreaPerSet = (bracketLengthM + bracketSpacingM) * (bracketWidthM + bracketSpacingM);
  const isFromLayout = maxBracketSetsByLayout != null;
  const usableAreaM2 = maxSets > 0
    ? (isFromLayout ? maxSets * effectiveAreaPerSet : normalizedAreaM2)
    : 0;

  useEffect(() => {
    setInputVal(formatInputValue(availableAreaM2, inputUnit));
  }, [availableAreaM2, inputUnit]);

  const handleInput = (value: string) => {
    setInputVal(value);
    const numeric = parseFloat(value);
    if (!Number.isNaN(numeric) && numeric > 0) {
      onUpdate({
        availableAreaM2: inputUnit === 'm2' ? numeric : sqftToSqm(numeric),
        grossAreaM2: null,
        maxBracketSetsByLayout: null,
      });
    }
  };

  const handleUnitChange = (unit: AreaUnit) => {
    if (unit === inputUnit) return;
    setInputUnit(unit);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Bracket footprint reference (Req 3.6: ft2-first) */}
      <div
        style={{
          padding: '0.85rem 1.1rem',
          background: 'var(--theme-tone-bg)',
          borderLeft: '4px solid var(--theme-tone-accent)',
          borderRadius: '8px',
          fontSize: '0.88rem',
          color: 'var(--theme-tone-text)',
          lineHeight: 1.7,
        }}
      >
        {lang === 'en' ? (
          <>
            <strong>Bracket footprint reference: </strong>
            One PV bracket set is based on <strong>{bracketLengthFt} ft &times; {bracketWidthFt} ft ({bracketLengthM} m &times; {bracketWidthM} m)</strong>,
            with an exact rack-body footprint of <strong>{exactAreaFt2} ft&sup2; ({exactAreaM2} m&sup2;)</strong>. The selected bracket model
            uses <strong>{exactAreaFt2} ft&sup2; ({exactAreaM2} m&sup2;)</strong> per set for sizing,
            with <strong>{perSetPvKw} kW/set</strong> using the selected {panel.model} modules.
          </>
        ) : (
          <>
            <strong>{'\u652F\u67B6\u5360\u5730\u53C2\u8003\uFF1A'}</strong>
            {'\u5355\u5957\u5149\u4F0F\u652F\u67B6\u6309 '}<strong>{bracketLengthFt} ft &times; {bracketWidthFt} ft{'\uFF08'}{bracketLengthM} {'\u7C73'} &times; {bracketWidthM} {'\u7C73\uFF09'}</strong>{' \u8BA1\u7B97\uFF0C'}
            {'\u652F\u67B6\u672C\u4F53\u7CBE\u786E\u5360\u5730\u4E3A '}<strong>{exactAreaFt2} ft&sup2;{'\uFF08'}{exactAreaM2} m&sup2;{'\uFF09'}</strong>{'\u3002\u5F53\u524D\u652F\u67B6\u578B\u53F7\u5728\u5BB9\u91CF\u4F30\u7B97\u4E2D\u6309\u6BCF\u5957'}
            <strong>{exactAreaFt2} ft&sup2;{'\uFF08'}{exactAreaM2} m&sup2;{'\uFF09'}</strong>
            {'\u8BA1\u5165\uFF0C\u642D\u914D\u5F53\u524D '}{panel.model}{' \u7EC4\u4EF6\u65F6\u4E3A '}<strong>{perSetPvKw} kW/{'\u5957'}</strong>{'\u3002'}
          </>
        )}
      </div>

      {/* Site area input (Req 3.1, 3.2) */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: '#2d3748', fontSize: '0.95rem' }}>
              {lang === 'en' ? 'Site area' : '场地面积'}
            </span>{' '}
            <span style={{ fontSize: '0.78rem', color: '#2b6cb0' }}>
              💡 {lang === 'en'
                ? 'Recommend using map polygon; manual input also supported.'
                : '建议通过地图框选来得到场地面积，当然也支持手动输入。'}
            </span>
          </div>
          <div
            style={{
              display: 'inline-flex',
              background: '#edf2f7',
              borderRadius: '999px',
              padding: '0.15rem',
              gap: '0.15rem',
            }}
          >
            {AREA_UNITS.map(unit => {
              const active = inputUnit === unit;
              return (
                <button
                  key={unit}
                  type="button"
                  onClick={() => handleUnitChange(unit)}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    padding: '0.3rem 0.8rem',
                    background: active ? '#1a365d' : 'transparent',
                    color: active ? 'white' : '#4a5568',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  {getUnitLabel(unit)}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="number"
            value={inputVal}
            onChange={event => handleInput(event.target.value)}
            placeholder={lang === 'en' ? (inputUnit === 'm2' ? 'e.g. 1100' : 'e.g. 11840') : (inputUnit === 'm2' ? '\u4F8B\u5982 1100' : '\u4F8B\u5982 11840')}
            min={100}
            step={inputUnit === 'm2' ? 50 : 500}
            style={{
              padding: '0.6rem 1rem',
              border: '1px solid #cbd5e0',
              borderRadius: '8px',
              fontSize: '1rem',
              width: getInputWidth(inputVal, 14),
              minWidth: '240px',
            }}
          />
          <span style={{ color: '#718096', fontSize: '0.9rem' }}>{getUnitLabel(inputUnit)}</span>
        </div>
      </div>

      {/* Site Assessment Result (Req 3.3: only Usable Area + Maximum Installable Sets) */}
      {normalizedAreaM2 > 0 && (
        <AreaAssessment
          normalizedAreaM2={normalizedAreaM2}
          usableAreaM2={usableAreaM2}
          maxSets={maxSets}
          isFromLayout={isFromLayout}
          maxBracketSetsByLayout={maxBracketSetsByLayout}
          effectiveAreaPerSet={effectiveAreaPerSet}
          bracketLengthM={bracketLengthM}
          bracketWidthM={bracketWidthM}
          bracketLengthFt={bracketLengthFt}
          bracketWidthFt={bracketWidthFt}
          inputUnit={inputUnit}
          lang={lang}
        />
      )}
    </div>
  );
}
