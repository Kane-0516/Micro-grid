import { useState } from 'react';
import OptionButton from '@/components/ui/OptionButton';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import { formatAreaDual } from '@/utils/unitFormat';
import { getLocalizedProductLabel } from '@/utils/productLabel';
import './Step2Brackets.css';

interface Step2BracketsProps {
  bracketSets: number;
  panelModel: string;
  bracketModel: string;
  onUpdate: (data: {
    bracketSets?: number;
    panelModel?: string;
    bracketModel?: string;
    componentModel?: string;
    bracketCapacity?: number;
  }) => void;
}

export default function Step2Brackets({
  bracketSets,
  panelModel,
  bracketModel,
  onUpdate,
}: Step2BracketsProps) {
  const { t, lang } = useLang();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { pvPanels, bracketSystems, calcPvKw, getPanelByModel, getBracketByModel, bracketSpacingM } = useProducts();

  const selectedPanel   = getPanelByModel(panelModel);
  const selectedBracket = getBracketByModel(bracketModel);
  const selectedPanelLabel = getLocalizedProductLabel(selectedPanel, lang);
  const selectedBracketLabel = getLocalizedProductLabel(selectedBracket, lang);
  const bracketLenM = selectedBracket.footprintLengthM;
  const bracketWidM = selectedBracket.footprintWidthM;
  const spacingFt = Math.round(bracketSpacingM * 3.28084);

  const handleSetsChange = (sets: number) => {
    onUpdate({ bracketSets: sets, bracketCapacity: sets * selectedBracket.panelsPerSet });
  };
  const handlePanelChange = (model: string) => {
    onUpdate({ panelModel: model, componentModel: model });
  };
  const handleBracketChange = (model: string) => {
    const b = getBracketByModel(model);
    onUpdate({ bracketModel: model, bracketCapacity: bracketSets * b.panelsPerSet });
  };

  const pvKw   = bracketSets > 0 ? calcPvKw(bracketSets, panelModel, bracketModel) : 0;
  const areaM2 = bracketSets * selectedBracket.areaM2;

  return (
    <div>
      {/* ── 支架定义说明 */}
      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--theme-tone-bg)',
        borderLeft: '4px solid var(--theme-tone-accent)',
        borderRadius: '8px',
        fontSize: '0.85rem',
        color: 'var(--theme-tone-text)',
        lineHeight: 1.7,
        marginBottom: '1rem',
      }}>
        {lang === 'en' ? (
          <>
            <strong>What is 1 PV bracket set?</strong> The standard folding bracket set holds{' '}
            <strong>{selectedBracket.panelsPerSet} panels</strong> arranged in{' '}
            <strong>2 rows × {selectedBracket.panelsPerSet / 2} columns</strong>, measuring{' '}
            <strong>{bracketLenM} m × {bracketWidM} m</strong> ({formatAreaDual(selectedBracket.areaM2, lang).combined} footprint).
            With the selected {selectedPanelLabel || selectedPanel.model} modules, 1 set = <strong>{calcPvKw(1, selectedPanel.model, bracketModel)} kW</strong>.
            Adjacent sets require {spacingFt} ft spacing.
          </>
        ) : (
          <>
            <strong>1 套光伏支架是什么？</strong> 标准折叠支架每套容纳{' '}
            <strong>{selectedBracket.panelsPerSet} 块</strong>组件，排列为{' '}
            <strong>2 行 × {selectedBracket.panelsPerSet / 2} 列</strong>，尺寸为{' '}
            <strong>{bracketLenM} m × {bracketWidM} m</strong>（占地 {formatAreaDual(selectedBracket.areaM2, lang).combined}）。
            搭配当前 {selectedPanelLabel || selectedPanel.model} 组件时，1 套 = <strong>{calcPvKw(1, selectedPanel.model, bracketModel)} kW</strong>。
            相邻支架间距 {spacingFt} 英尺。
          </>
        )}
      </div>

      {/* ── 支架套数 */}
      <div className="bracket-sets-selector">
        {[1, 2, 3, 4, 5].map((sets) => {
          const kw = calcPvKw(sets, panelModel, bracketModel);
          return (
            <OptionButton
              key={sets}
              label={`${sets} ${t('bracket.sets_unit')}`}
              description={
                lang === 'en'
                  ? `${sets * selectedBracket.panelsPerSet} panels · ${kw} kW · ${t('bracket.area_unit')}${formatAreaDual(sets * selectedBracket.areaM2, lang).combined}`
                  : `${sets * selectedBracket.panelsPerSet} ${t('bracket.panels_unit')} · ${kw} kW · ${t('bracket.area_unit')} ${formatAreaDual(sets * selectedBracket.areaM2, lang).combined}`
              }
              selected={bracketSets === sets}
              onClick={() => handleSetsChange(sets)}
            />
          );
        })}
      </div>

      {/* ── 高级选项 */}
      {bracketSets > 0 && (
        <div className="bracket-details">
          <button
            className="toggle-details-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? t('bracket.toggle_hide') : t('bracket.toggle_show')} {t('bracket.section_panel')}
          </button>

          {showAdvanced && (
            <div className="details-form">
              {/* 组件型号选择 */}
              <div className="form-section">
                <h4 className="form-section-title">{t('bracket.panel_title')}</h4>
                <div className="model-selector-grid">
                  {pvPanels.map(panel => (
                    <div
                      key={panel.model}
                      className={`model-card ${panelModel === panel.model ? 'selected' : ''}`}
                      onClick={() => handlePanelChange(panel.model)}
                    >
                      <div className="model-name">{panel.watts}Wp</div>
                      <div className="model-detail">{getLocalizedProductLabel(panel, lang)}</div>
                      <div className="model-price">${panel.pricePerWp.toFixed(2)}/Wp</div>
                      <div className="model-efficiency">{t('bracket.efficiency')} {panel.efficiencyPct}%</div>
                      <div className="model-kw-per-set">
                        {selectedBracket.panelsPerSet} {t('bracket.panels_per_set')} = {panel.kwPerSet(selectedBracket.panelsPerSet)} {t('bracket.kw_per_set')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 支架型号选择 */}
              <div className="form-section">
                <h4 className="form-section-title">{t('bracket.bracket_title')}</h4>
                <div className="model-selector-grid">
                  {bracketSystems.map(bracket => (
                    <div
                      key={bracket.model}
                      className={`model-card ${bracketModel === bracket.model ? 'selected' : ''}`}
                      onClick={() => handleBracketChange(bracket.model)}
                    >
                      <div className="model-name">{bracket.panelsPerSet} {t('bracket.panels_per_set')}</div>
                      <div className="model-detail">{getLocalizedProductLabel(bracket, lang)}</div>
                      <div className="model-area">{lang === 'en' ? 'Area' : '占地'} {formatAreaDual(bracket.areaM2, lang).combined} / {lang === 'en' ? 'set' : '套'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 实时汇总 */}
          <div className="bracket-summary">
            <div className="summary-row">
              <span>{t('bracket.summary.panel')}</span>
              <strong>{selectedPanel.watts}Wp × {bracketSets * selectedBracket.panelsPerSet} {t('bracket.panels_unit')} = {pvKw} kW</strong>
            </div>
            <div className="summary-row">
              <span>{t('bracket.summary.bracket')}</span>
              <strong>{selectedBracketLabel || selectedBracket.displayName}</strong>
            </div>
            <div className="summary-row">
              <span>{t('bracket.summary.price')}</span>
              <strong>${selectedPanel.pricePerWp.toFixed(2)}/Wp（${(selectedPanel.pricePerWp * 1000).toFixed(0)}/kW）</strong>
            </div>
            <div className="summary-row">
              <span>{t('bracket.summary.area')}</span>
              <strong>{formatAreaDual(areaM2, lang).combined} {t('bracket.area_note')}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
