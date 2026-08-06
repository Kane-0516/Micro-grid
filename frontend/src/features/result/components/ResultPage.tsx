/**
 * ResultPage.tsx — 微电网解决方案结果页
 * 展示 API 返回的完整经济分析数据（USD）
 */
import { useState } from 'react';
import type { ConfigData, CalculateResponse } from '@/types/index';
import ComponentCard from '@/components/ui/ComponentCard';
import DownloadReportModal from './DownloadReportModal';
import SolarDieselAnalysisChart from './SolarDieselAnalysisChart';
import SchematicTopology from '@/features/topology/components/SchematicTopology';
import { resultToTopologyData } from '@/utils/resultToTopology';
import { useLang } from '@/context/LangContext';
import { useProducts } from '@/store/useProductsStore';
import { formatAreaDual, formatFuelPriceDual, formatVolumeDual } from '@/utils/unitFormat';
import { getLocalizedProductLabel } from '@/utils/productLabel';
import './ResultPage.css';

interface ResultPageProps {
  config:         ConfigData;
  apiResult:      CalculateResponse | null;
  isCalculating:  boolean;
  apiError:       string | null;
  apiErrorDiagnostics?: Record<string, unknown> | null;
  isSimulationRunning?: boolean;   // 后台精算中
  onRetry:        () => void;
  onBack?:        () => void;
  onRestart:      () => void;
}

// ── 辅助格式化 ────────────────────────────────────────────────
const fmtUsd   = (v?: number | null, d = 0) =>
  v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmtPct   = (v?: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;
const fmtNum   = (v?: number | null, d = 1) => v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function ResultPage({
  config,
  apiResult,
  isCalculating,
  apiError,
  apiErrorDiagnostics = null,
  isSimulationRunning = false,
  onRetry,
  onBack,
  onRestart,
}: ResultPageProps) {
  const { t, lang } = useLang();
  const { pvPanels } = useProducts();
  const [activeTab, setActiveTab] = useState<'showcase' | 'overview' | 'capex' | 'simulation' | 'system' | 'schematic'>('showcase');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const sc = apiResult?.systemConfig ?? null;
  const sim = apiResult?.simulation ?? null;
  const summary = apiResult?.summary ?? null;
  const comparisonTable = apiResult?.comparisonTable ?? null;
  const summaryExt = summary as (typeof summary & {
    microgridNpcUsd?: number | null;
    dieselOnlyNpcUsd?: number | null;
    npcSavingsUsd?: number | null;
    microgridAnnualizedCostUsd?: number | null;
    dieselOnlyAnnualizedCostUsd?: number | null;
    microgridOperatingCostUsd?: number | null;
    dieselOnlyOperatingCostUsd?: number | null;
    annualOperatingSavingsUsd?: number | null;
    simplePaybackYears?: number | null;
    microgridFixedOmUsd?: number | null;
    microgridGeneratorMaintenanceUsd?: number | null;
    dieselOnlyGeneratorMaintenanceUsd?: number | null;
    microgridCapitalNpcUsd?: number | null;
    microgridReplacementNpcUsd?: number | null;
    microgridSalvageNpcUsd?: number | null;
    dieselOnlyCapitalNpcUsd?: number | null;
    dieselOnlyReplacementNpcUsd?: number | null;
    dieselOnlySalvageNpcUsd?: number | null;
    realDiscountRatePct?: number | null;
    nominalDiscountRatePct?: number | null;
    inflationRatePct?: number | null;
    microgridGeneratorLifeYears?: number | null;
    dieselOnlyGeneratorLifeYears?: number | null;
    batteryLifeYears?: number | null;
  }) | null;
  const simExt = sim as (typeof sim & {
    mgDieselStarts?: number | null;
  }) | null;
  const dieselDisplayName = sc?.dieselModelDisplay ?? sc?.dieselModel ?? '—';
  const resolvedPanelModel = sc?.panelModel || config.panelModel || '';
  const panelDisplayName = resolvedPanelModel
    ? (getLocalizedProductLabel(pvPanels.find((panel) => panel.model === resolvedPanelModel), lang) || resolvedPanelModel)
    : '—';
  const panelLabel = lang === 'en' ? (resolvedPanelModel || '—') : panelDisplayName;
  // ── 加载状态 ──────────────────────────────────────────────
  if (isCalculating) {
    return (
      <div className="result-page">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh',
        }}>
          <div style={{
            width: '360px',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '14px',
            padding: '2rem 2rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a365d', marginBottom: '1rem' }}>
              {t('result.loading')}
            </div>
            <div style={{
              width: '100%', height: '6px',
              background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden',
              marginBottom: '0.75rem',
            }}>
              <div style={{
                width: '40%', height: '100%',
                background: 'linear-gradient(90deg, #3182ce, #63b3ed, #3182ce)',
                borderRadius: '3px',
                animation: 'siteMapProgressSlide 1.5s ease-in-out infinite',
              }} />
            </div>
            <div style={{ fontSize: '0.82rem', color: '#718096' }}>
              {t('result.loading.desc')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 错误状态 ──────────────────────────────────────────────
  if (apiError || (apiResult && !apiResult.success)) {
    const errMsg = apiError || apiResult?.error || (lang === 'en' ? 'Unknown error' : '未知错误');
    const diagnostics = apiErrorDiagnostics && typeof apiErrorDiagnostics === 'object' ? apiErrorDiagnostics : null;
    const timing = diagnostics && typeof diagnostics.timingSeconds === 'object'
      ? diagnostics.timingSeconds as Record<string, unknown>
      : null;
    return (
      <div className="result-page">
        <div className="result-error">
          <div className="error-icon">!</div>
          <h2>{t('result.error')}</h2>
          <p className="error-msg">{errMsg}</p>
          {diagnostics && (
            <div
              style={{
                marginTop: '1rem',
                marginBottom: '1rem',
                padding: '1rem',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                textAlign: 'left',
                maxWidth: '720px',
                marginInline: 'auto',
              }}
            >
              <div style={{ fontWeight: 700, color: '#1a365d', marginBottom: '0.6rem' }}>
                {lang === 'en' ? 'Performance diagnostics' : '性能诊断'}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#4a5568', lineHeight: 1.7 }}>
                <div>
                  {lang === 'en' ? 'Cache hit' : '命中缓存'}:{' '}
                  <strong>{String(Boolean(diagnostics.cacheHit))}</strong>
                </div>
                <div>
                  {lang === 'en' ? 'Candidate count' : '候选数量'}:{' '}
                  <strong>{String(diagnostics.candidateCount ?? '—')}</strong>
                </div>
                <div>
                  {lang === 'en' ? 'Total seconds' : '总耗时'}:{' '}
                  <strong>{String(diagnostics.totalSeconds ?? '—')}s</strong>
                </div>
                {timing && (
                  <div style={{ marginTop: '0.55rem' }}>
                    <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.25rem' }}>
                      {lang === 'en' ? 'Stage timing' : '阶段耗时'}
                    </div>
                    {Object.entries(timing).map(([key, value]) => (
                      <div key={key}>
                        {key}: <strong>{String(value)}s</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {apiResult?.traceback && (
            <pre className="error-trace">{apiResult.traceback}</pre>
          )}
          <div className="error-actions">
            {onBack && (
              <button className="btn btn-secondary" onClick={onBack}>
                {t('btn.back_modify')}
              </button>
            )}
            <button className="btn btn-primary" onClick={onRetry}>{t('result.retry')}</button>
            <button className="btn btn-secondary" onClick={onRestart}>{t('result.restart')}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 无结果（不应发生）──────────────────────────────────────
  if (!apiResult) {
    return (
      <div className="result-page">
        <div className="result-error">
          <h2>{t('result.no_data')}</h2>
          <div className="error-actions">
            {onBack && (
              <button className="btn btn-secondary" onClick={onBack}>
                {t('btn.back_modify')}
              </button>
            )}
            <button className="btn btn-secondary" onClick={onRestart}>{t('result.restart')}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 场景/EMS 名称 ────────────────────────────────────────
  const scenarioName: Record<string, string> = lang === 'en' ? {
    'known-load': 'Known-Load',
    'diy':        'User DIY',
    'no-load':    'No-Load',
  } : {
    'known-load': '已知负载情况',
    'diy':        '用户自定义 (DIY)',
    'no-load':    '无负载情况',
  };
  const emsName: Record<string, string> = lang === 'en' ? {
    edge:       'Edge Control',
    cloud:      'Cloud Platform',
    prediction: 'Predictive Control',
  } : {
    edge:       '边端控制',
    cloud:      '云端控制',
    prediction: '基于预测',
  };

  const breakevenLabel = summary?.breakevenYear
    ? (lang === 'en' ? `Year ${summary.breakevenYear}` : `第 ${summary.breakevenYear} 年`)
    : t('kpi.over_20');

  const hasLayoutLimit = typeof config.maxBracketSetsByLayout === 'number' && config.maxBracketSetsByLayout >= 0;
  const siteLayoutNote = lang === 'en'
    ? 'PV bracket sets are laid out fully inside the selected site polygon, with a 10 ft (3048 mm) gap kept between neighboring sets.'
    : '光伏支架按完整落在场地多边形内进行排布，并在相邻支架之间保留 10 英尺（3048 mm）间距。';
  const measuredAreaDisplay = config.grossAreaM2 && config.grossAreaM2 > 0
    ? formatAreaDual(config.grossAreaM2, lang).combined
    : '';
  const usableAreaDisplay = config.availableAreaM2 && config.availableAreaM2 > 0
    ? formatAreaDual(config.availableAreaM2, lang).combined
    : '';

  return (
    <div className="result-page">

      {/* ── DIY 估算精度提示横幅 ── */}
      {config.scenario === 'diy' && (
        <div style={{
          background: 'linear-gradient(90deg, #f6fbff 0%, #eef7fb 52%, var(--theme-tone-warm-bg) 100%)',
          borderBottom: '2px solid var(--theme-tone-warm-accent)',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          fontSize: '0.88rem',
          color: 'var(--theme-tone-warm-text)',
          lineHeight: 1.65,
        }}>
          <span style={{
            fontSize: '1.1rem',
            flexShrink: 0,
            marginTop: '0.05rem',
          }}>⚠️</span>
          <div>
            <strong style={{ color: 'var(--theme-tone-warm-text)' }}>
              {lang === 'en'
                ? 'DIY Mode — Estimation Notice'
                : 'DIY 模式 — 估算精度说明'}
            </strong>
            <span style={{ marginLeft: '0.6rem' }}>
              {lang === 'en'
                ? 'This report is based on your specified voltage & current (peak demand). Since actual annual load (kWh) is unknown, the economic analysis (ROI, payback period, LCOE) is an engineering estimate with ±20–30% uncertainty. For higher accuracy, please use the '
                : '本报告基于您输入的电压与电流（峰值需求）推算，由于未提供实际年用电量（kWh），经济分析（投资回报、回本年限、LCOE）为工程估算，误差范围约 ±20–30%。如需更高精度，建议使用'}
              <strong>
                {lang === 'en' ? '"Known Load" ' : '"已知负载" '}
              </strong>
              {lang === 'en'
                ? 'path with actual consumption data.'
                : '路径并提供实际用电数据。'}
            </span>
          </div>
        </div>
      )}

      {/* ── 顶部标题栏 ── */}
      <div className="result-header">
        <div className="result-header-left">
          {onBack && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onBack}
              style={{ marginBottom: '0.85rem' }}
            >
              {t('btn.back_modify')}
            </button>
          )}
          <h1>{t('result.title')}</h1>
          <p className="subtitle">
            {summary?.projectName || (lang === 'en' ? 'Project' : '项目')} · {t('result.subtitle')} {summary?.analysisYears ?? 20} {t('result.years')}
          </p>
        </div>
      </div>

      {/* ── 仿真精算进度条 ── */}
      {isSimulationRunning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
        }}>
          <div style={{
            width: '360px',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '14px',
            padding: '1.5rem 1.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.75rem' }}>
              {t('result.pypsa_label')}
            </div>
            <div style={{
              width: '100%', height: '6px',
              background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden',
            }}>
              <div style={{
                width: '40%', height: '100%',
                background: 'linear-gradient(90deg, #3182ce, #63b3ed, #3182ce)',
                borderRadius: '3px',
                animation: 'siteMapProgressSlide 1.5s ease-in-out infinite',
              }} />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.6rem' }}>
              {lang === 'en'
                ? '8760-hour energy simulation in progress, data will update automatically upon completion.'
                : '8760 小时逐时能量仿真进行中，完成后数据将自动更新。'}
            </div>
          </div>
        </div>
      )}

      {/* ── 数据来源标签 ── */}
      {!isSimulationRunning && apiResult && (
        <div style={{
          background: 'linear-gradient(90deg, var(--theme-tone-bg) 0%, var(--theme-tone-warm-bg) 100%)',
          borderBottom: '2px solid var(--theme-tone-warm-border)',
          padding: '0.45rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.82rem',
          color: 'var(--theme-tone-text)',
        }}>
          <span style={{
            width: '8px', height: '8px',
            borderRadius: '50%',
            background: 'var(--theme-warm-600)',
            display: 'inline-block',
            flexShrink: 0,
          }} />
          {t('result.simulated')}
        </div>
      )}

      {/* ── KPI 摘要卡片 ── */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi.pv_kw')}</div>
          <div className="kpi-value">{fmtNum(sc?.pvCapacityKw)} kW</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi.batt_kwh')}</div>
          <div className="kpi-value">{fmtNum(sc?.batteryCapacityKwh)} kWh</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi.solar_frac')}</div>
          <div className="kpi-value green">{fmtPct(sim?.solarFractionPct)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi.payback')}{config.scenario === 'diy' ? ' *' : ''}</div>
          <div className="kpi-value orange">{breakevenLabel}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('kpi.fuel_saving')}{config.scenario === 'diy' ? ' *' : ''}</div>
          <div className="kpi-value" style={{ fontSize: '1rem', lineHeight: 1.25 }}>
            {formatVolumeDual(sim?.annualFuelSavingLiters, lang).combined}
          </div>
        </div>
      </div>

      {/* ── 标签页导航 ── */}
      <div className="result-tabs">
        {([
          ['showcase',   lang === 'en' ? 'Solution Showcase' : '方案展示'],
          ['overview',   t('tab.overview')],
          ['simulation', t('tab.simulation')],
          ['system',     t('tab.system')],
          // ['schematic',  lang === 'en' ? 'Product Schematic' : '产品示意图'], // 已隐藏
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          标签页内容
      ════════════════════════════════════════════════════════════ */}
      <div className="result-tab-content">

        {/* ── 方案展示 ── */}
        {activeTab === 'showcase' && (
          <div className="result-card result-showcase-card">
            <SchematicTopology
              className="result-schematic-topology"
              data={resultToTopologyData(apiResult, {
                panelModel: config.panelModel,
                panelDisplayName,
                loadType: config.loadType,
                voltageLevel: config.voltageLevel,
                dieselPriceUsd: config.dieselPriceUsd,
                lang,
              })}
            />
          </div>
        )}

        {/* ── 经济总览 ── */}
        {activeTab === 'overview' && (
          <div>
            {summary && (
              <div className="result-card">
                <h2 className="card-title">{t('overview.summary')}</h2>
                <div className="summary-grid">
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.annual_load')}</span>
                    <span className="sum-value">{fmtNum(summary.annualLoadKwh, 0)} kWh</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Microgrid NPC' : '微电网 NPC'}</span>
                    <span className="sum-value">{fmtUsd(summaryExt?.microgridNpcUsd)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel-only NPC' : '纯柴发 NPC'}</span>
                    <span className="sum-value">{fmtUsd(summaryExt?.dieselOnlyNpcUsd)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'NPC Savings' : 'NPC 节省'}</span>
                    <span className="sum-value highlight-green">{fmtUsd(summaryExt?.npcSavingsUsd)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Project Life' : '项目周期'}</span>
                    <span className="sum-value">{fmtNum(sc?.projectYears ?? summary?.analysisYears, 0)} {lang === 'en' ? 'years' : '年'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Microgrid COE' : '微电网 COE'}</span>
                    <span className="sum-value">{fmtUsd(summary.finalMgLcoe, 3)}/kWh</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel-only COE' : '纯柴发 COE'}</span>
                    <span className="sum-value">{fmtUsd(summary.finalDieselLcoe, 3)}/kWh</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'MG Annualized Cost' : '微电网年化成本'}</span>
                    <span className="sum-value">{fmtUsd(summaryExt?.microgridAnnualizedCostUsd)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel Annualized Cost' : '纯柴发年化成本'}</span>
                    <span className="sum-value">{fmtUsd(summaryExt?.dieselOnlyAnnualizedCostUsd)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Discounted Breakeven Year' : '折现现金流回本年'}</span>
                    <span className="sum-value highlight-green">{breakevenLabel}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'MG Operating Cost' : '微电网运行成本'}</span>
                    <span className="sum-value">{fmtUsd(summaryExt?.microgridOperatingCostUsd)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel Operating Cost' : '纯柴发运行成本'}</span>
                    <span className="sum-value">{fmtUsd(summaryExt?.dieselOnlyOperatingCostUsd)}</span>
                  </div>
                  <div style={{
                    gridColumn: '1 / -1',
                    marginTop: '0.25rem',
                    padding: '0.75rem 0.9rem',
                    background: '#f8fbff',
                    border: '1px solid #d7e3f0',
                    borderRadius: '8px',
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.45rem' }}>
                      {lang === 'en' ? 'Operating Cost Split' : '运行成本拆分'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem 1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'MG fuel' : '微电网燃油'}: <strong>{fmtUsd(summary.mgAnnualFuelUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'Diesel-only fuel' : '纯柴发燃油'}: <strong>{fmtUsd(summary.dieselAnnualFuelUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'MG fixed O&M' : '微电网固定 O&M'}: <strong>{fmtUsd(summaryExt?.microgridFixedOmUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'MG generator maintenance' : '微电网机组维护'}: <strong>{fmtUsd(summaryExt?.microgridGeneratorMaintenanceUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'Diesel-only maintenance' : '纯柴发机组维护'}: <strong>{fmtUsd(summaryExt?.dieselOnlyGeneratorMaintenanceUsd)}</strong>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    gridColumn: '1 / -1',
                    marginTop: '0.25rem',
                    padding: '0.75rem 0.9rem',
                    background: '#fffaf2',
                    border: '1px solid #ecd9a7',
                    borderRadius: '8px',
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7b4e00', marginBottom: '0.45rem' }}>
                      {lang === 'en' ? 'NPC Composition' : 'NPC 构成'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem 1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'MG capital NPC' : '微电网资本现值'}: <strong>{fmtUsd(summaryExt?.microgridCapitalNpcUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'Diesel-only capital NPC' : '纯柴发资本现值'}: <strong>{fmtUsd(summaryExt?.dieselOnlyCapitalNpcUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'MG replacement NPC' : '微电网更换现值'}: <strong>{fmtUsd(summaryExt?.microgridReplacementNpcUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'Diesel-only replacement NPC' : '纯柴发更换现值'}: <strong>{fmtUsd(summaryExt?.dieselOnlyReplacementNpcUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'MG salvage credit' : '微电网残值抵扣'}: <strong>{fmtUsd(summaryExt?.microgridSalvageNpcUsd)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                        {lang === 'en' ? 'Diesel-only salvage credit' : '纯柴发残值抵扣'}: <strong>{fmtUsd(summaryExt?.dieselOnlySalvageNpcUsd)}</strong>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    gridColumn: '1 / -1',
                    marginTop: '0.25rem',
                    padding: '0.75rem 0.9rem',
                    background: '#f7fafc',
                    border: '1px dashed #cbd5e0',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    color: '#4a5568',
                    lineHeight: 1.7,
                  }}>
                    {lang === 'en'
                      ? 'Interpretation: Operating Cost shows recurring annual burden, mainly fuel and maintenance. NPC Composition shows discounted lifecycle capital, replacement, and salvage-credit contributions only; it does not include the discounted fuel and O&M stream, so these lines do not sum to total NPC by themselves. COE is derived from total annualized cost divided by served load.'
                      : '口径说明：运行成本反映年度持续性负担，主要由燃油和维护构成。NPC 构成仅展示折现后的初始资本、更换成本和残值抵扣，不包含燃油与 O&M 的折现现金流，因此这些分量本身不会直接相加等于总 NPC。COE 则是由总年化成本除以供电电量得到。'}
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'MG Generator Life' : '微电网柴发寿命'}</span>
                    <span className="sum-value">{summaryExt?.microgridGeneratorLifeYears == null ? '—' : `${fmtNum(summaryExt.microgridGeneratorLifeYears, 1)} ${lang === 'en' ? 'years' : '年'}`}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel-only Generator Life' : '纯柴发寿命'}</span>
                    <span className="sum-value">{summaryExt?.dieselOnlyGeneratorLifeYears == null ? '—' : `${fmtNum(summaryExt.dieselOnlyGeneratorLifeYears, 1)} ${lang === 'en' ? 'years' : '年'}`}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Battery Life' : '电池寿命'}</span>
                    <span className="sum-value">{summaryExt?.batteryLifeYears == null ? '—' : `${fmtNum(summaryExt.batteryLifeYears, 1)} ${lang === 'en' ? 'years' : '年'}`}</span>
                  </div>
                  {config.scenario === 'diy' && (
                    <div style={{
                      gridColumn: '1 / -1',
                      marginTop: '0.5rem',
                      paddingTop: '0.65rem',
                      borderTop: '1px dashed #e2e8f0',
                      fontSize: '0.78rem',
                      color: '#a0aec0',
                      lineHeight: 1.6,
                    }}>
                      {lang === 'en'
                        ? '* DIY mode: economic figures are estimated from peak current demand. Actual annual kWh consumption was not provided — results may vary ±20–30% from reality. For a precise analysis, re-run with the "Known Load" path.'
                        : '* DIY 模式：经济数据由峰值电流需求估算，未提供实际年用电量（kWh），结果与实际情况可能相差 ±20–30%。如需精确分析，请改用"已知负载"路径重新计算。'}
                    </div>
                  )}
                  {hasLayoutLimit && (
                    <div style={{
                      gridColumn: '1 / -1',
                      marginTop: '0.5rem',
                      paddingTop: '0.65rem',
                      borderTop: '1px dashed #e2e8f0',
                      fontSize: '0.78rem',
                      color: '#4a5568',
                      lineHeight: 1.7,
                    }}>
                      <div>{siteLayoutNote}</div>
                      <div>
                        {lang === 'en' ? 'Measured site area' : '框选场地面积'}: {measuredAreaDisplay || '—'} · {lang === 'en' ? 'Area basis' : '面积口径'}: {usableAreaDisplay || '—'} · {lang === 'en' ? 'Layout-based max sets' : '排布上限套数'}: {config.maxBracketSetsByLayout}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CAPEX 明细（暂时隐藏）──
        {activeTab === 'capex' && capex && ( ... )}
        ── */}

        {/* ── 仿真结果 ── */}
        {activeTab === 'simulation' && (
          <div className="result-card">
            <h2 className="card-title">{t('sim.title')}</h2>
            {simExt ? (
              <>
                <div className="summary-grid">
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.solar_frac')}</span>
                    <span className="sum-value highlight-green">{fmtPct(simExt.solarFractionPct)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.loss_load')}</span>
                    <span className="sum-value">{fmtPct(simExt.lossOfLoadPct)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.curtail')}</span>
                    <span className="sum-value">{fmtPct(simExt.curtailmentPct)}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.mg_diesel')}</span>
                    <span className="sum-value">{formatVolumeDual(simExt.mgDieselLiters, lang).combined}/{lang === 'en' ? 'yr' : '年'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.mg_diesel_hr')}</span>
                    <span className="sum-value">{fmtNum(simExt.mgDieselHours, 0)} h/{lang === 'en' ? 'yr' : '年'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel Starts' : '柴发启动次数'}</span>
                    <span className="sum-value">{fmtNum(simExt.mgDieselStarts, 0)} {lang === 'en' ? 'starts/yr' : '次/年'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.diesel_only')}</span>
                    <span className="sum-value highlight-red">{formatVolumeDual(simExt.dieselOnlyLiters, lang).combined}/{lang === 'en' ? 'yr' : '年'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.diesel_only_hr')}</span>
                    <span className="sum-value">{fmtNum(simExt.dieselRunHoursA, 0)} h/{lang === 'en' ? 'yr' : '年'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.fuel_saving')}</span>
                    <span className="sum-value highlight-green">{formatVolumeDual(simExt.annualFuelSavingLiters, lang).combined}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sim.fuel_saving_usd')}</span>
                    <span className="sum-value highlight-green">{fmtUsd(simExt.annualFuelSavingUsd)}</span>
                  </div>
                </div>

                <SolarDieselAnalysisChart analysis={simExt.solarDieselAnalysis} />
              </>
            ) : (
              <div className="sim-note">
                <p>{t('result.sim_pending')}</p>
              </div>
            )}
          </div>
        )}

        {/* ── 系统配置 ── */}
        {activeTab === 'system' && (
          <div>
            {sc && (
              <div className="result-card">
                <h2 className="card-title">{t('sys.title')}</h2>
                <div className="summary-grid">
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.scenario')}</span>
                    <span className="sum-value">{scenarioName[config.scenario] || config.scenario}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.panel_model')}</span>
                    <span className="sum-value">{panelLabel} ({sc.panelWatts}Wp, ${sc.panelPricePerWp}/Wp)</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.bracket_sets')}</span>
                    <span className="sum-value">{sc.bracketSets} {lang === 'en' ? 'sets' : '套'} ({sc.bracketSets * sc.panelsPerSet} {lang === 'en' ? 'panels' : '块'})</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.pv_kw')}</span>
                    <span className="sum-value highlight-blue">{fmtNum(sc.pvCapacityKw)} kW</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.area')}</span>
                    <span className="sum-value">{formatAreaDual(sc.occupiedAreaM2, lang).combined}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.batt_model')}</span>
                    <span className="sum-value">{sc.batteryModel}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.batt_kwh')}</span>
                    <span className="sum-value">{fmtNum(sc.batteryCapacityKwh)} kWh ({sc.batteryPackCount} {lang === 'en' ? 'packs' : '包'})</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Diesel Generator' : '柴油发电机'}</span>
                    <span className="sum-value">
                      {sc.dieselCapacityKw > 0
                      ? `${sc.dieselCapacityKw} kW (${dieselDisplayName})`
                        : (lang === 'en' ? 'None' : '无')}
                    </span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.voltage')}</span>
                    <span className="sum-value">{sc.voltageLevel}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.ems')}</span>
                    <span className="sum-value">{emsName[sc.emsMode] || sc.emsMode}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.annual_load')}</span>
                    <span className="sum-value">{fmtNum(sc.annualLoadKwh, 0)} kWh</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.load_type')}</span>
                    <span className="sum-value">{sc.loadType}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{t('sys.latitude')}</span>
                    <span className="sum-value">{sc.latitude}°</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-label">{lang === 'en' ? 'Longitude' : '经度'}</span>
                    <span className="sum-value">{sc.longitude}°</span>
                  </div>
                </div>
                {hasLayoutLimit && (
                  <div style={{
                    marginTop: '0.85rem',
                    paddingTop: '0.85rem',
                    borderTop: '1px dashed #e2e8f0',
                    fontSize: '0.82rem',
                    color: '#4a5568',
                    lineHeight: 1.7,
                  }}>
                    <div>{siteLayoutNote}</div>
                    <div>
                      {lang === 'en' ? 'Layout-based max installable bracket sets' : '基于场地排布的最大可安装支架套数'}: {config.maxBracketSetsByLayout}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 系统组件卡片 */}
            <div className="components-section">
              <h2 className="card-title">{lang === 'en' ? 'System Components' : '系统组件'}</h2>
              <div className="components-grid">
                <ComponentCard
                  title={lang === 'en' ? 'Software (EMS)' : '软件 (EMS)'}
                  description={lang === 'en'
                    ? 'MicroGrid microgrid management system supporting edge/cloud/predictive control modes, dynamically optimizing PV-storage-diesel coordination.'
                    : 'MicroGrid 微电网管理系统，支持云端/边端/预测三种控制模式，动态优化光储柴协调调度。'}
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <path d="M8 21h8M12 17v4"/>
                    </svg>
                  }
                  isVital={true}
                  details={lang === 'en'
                    ? `EMS control mode: ${emsName[config.emsControlMethod] || config.emsControlMethod}. Supports real-time monitoring, fault alerts, remote O&M.`
                    : `EMS 控制模式：${emsName[config.emsControlMethod] || config.emsControlMethod}。支持实时监控、故障预警、远程运维。`}
                />
                <ComponentCard
                  title={lang === 'en' ? 'Solar PV' : '太阳能光伏'}
                  description={lang === 'en'
                    ? `${sc?.bracketSets ?? config.bracketSets} folding bracket sets, ${sc?.pvCapacityKw?.toFixed(1) ?? '—'} kW, ${resolvedPanelModel || config.panelModel} modules.`
                    : `${sc?.bracketSets ?? config.bracketSets} 套折叠支架，${sc?.pvCapacityKw?.toFixed(1) ?? '—'} kW，${panelDisplayName}。`}
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5"/>
                      <path d="M12 1v4M12 19v4M23 12h-4M5 12H1M20.66 3.34l-2.83 2.83M6.17 17.83l-2.83 2.83M20.66 20.66l-2.83-2.83M6.17 6.17L3.34 3.34"/>
                    </svg>
                  }
                  isVital={true}
                  details={lang === 'en'
                    ? `Total PV ${sc?.pvCapacityKw?.toFixed(1) ?? '—'} kW, footprint ${formatAreaDual(sc?.occupiedAreaM2, lang).combined}, module ${resolvedPanelModel || config.panelModel} (${sc?.panelWatts ?? '—'}Wp).`
                    : `光伏总容量 ${sc?.pvCapacityKw?.toFixed(1) ?? '—'} kW，占地 ${formatAreaDual(sc?.occupiedAreaM2, lang).combined}，组件型号 ${panelDisplayName}。`}
                />
                <ComponentCard
                  title={lang === 'en' ? 'Battery Storage (BESS)' : '电池储能 (BESS)'}
                  description={lang === 'en'
                    ? `${fmtNum(sc?.batteryCapacityKwh)} kWh, ${sc?.batteryPackCount ?? '—'} × ${sc?.batteryModel ?? config.batteryPackModel}, supporting ${config.storageDays}-day autonomous supply.`
                    : `${fmtNum(sc?.batteryCapacityKwh)} kWh，${sc?.batteryPackCount ?? '—'} 包 ${sc?.batteryModel ?? config.batteryPackModel}，支撑 ${config.storageDays} 天自主供电。`}
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="12" height="16" rx="2"/>
                      <rect x="8" y="6" width="8" height="12" fill="white" opacity="0.3"/>
                      <path d="M9 2h6v2H9z"/>
                    </svg>
                  }
                  isVital={true}
                  details={lang === 'en'
                    ? `LFP battery, 90% DoD, ≥4000 cycle life, supporting ${config.storageDays}-day continuous supply.`
                    : `磷酸铁锂 (LFP) 电池，深度放电 90%，循环寿命 ≥ 4000 次，支撑连续阴天 ${config.storageDays} 天供电。`}
                />
                {(sc?.dieselCapacityKw ?? config.dieselCapacityKw) > 0 && (
                  <ComponentCard
                    title={lang === 'en' ? 'Diesel Generator' : '柴油发电机'}
                    description={lang === 'en'
                      ? `${sc?.dieselCapacityKw ?? config.dieselCapacityKw} kW, annual run ${fmtNum(sim?.mgDieselHours, 0)} hrs in microgrid mode, fuel use reduced by ${fmtPct(sim ? (1 - sim.mgDieselLiters / (sim.dieselOnlyLiters || 1)) * 100 : null)}.`
                      : `${sc?.dieselCapacityKw ?? config.dieselCapacityKw} kW，微电网模式下年均运行 ${fmtNum(sim?.mgDieselHours, 0)} 小时，燃油消耗降低 ${fmtPct(sim ? (1 - sim.mgDieselLiters / (sim.dieselOnlyLiters || 1)) * 100 : null)}。`}
                    icon={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="8"/>
                        <path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>
                      </svg>
                    }
                    isVital={true}
                    details={lang === 'en'
                      ? `Model: ${dieselDisplayName}, capacity ${sc?.dieselCapacityKw ?? config.dieselCapacityKw} kW. In microgrid mode solar covers ${fmtPct(sim?.solarFractionPct)} of load; diesel only starts during cloudy days or peak loads.`
                      : `型号：${dieselDisplayName}，容量 ${sc?.dieselCapacityKw ?? config.dieselCapacityKw} kW。微电网协同下，太阳能承担 ${fmtPct(sim?.solarFractionPct)} 负载，柴发仅在阴天/高峰负载时启用。`}
                  />
                )}
              </div>
            </div>

            {/* 联系信息 */}
            <div className="company-info">
              <h2>{lang === 'en' ? 'Contact Us' : '联系我们'}</h2>
              <div className="contact-grid">
                {(lang === 'en' ? [
                  ['Company', 'MicroGrid'],
                  ['Address', '—'],
                  ['Phone', '—'],
                  ['Email', 'info@example.com'],
                  ['Website', 'www.example.com'],
                  ['Sales', 'sales@example.com'],
                ] : [
                  ['公司名称', 'MicroGrid'],
                  ['公司地址', '—'],
                  ['联系电话', '—'],
                  ['电子邮箱', 'info@example.com'],
                  ['官方网站', 'www.example.com'],
                  ['业务咨询', 'sales@example.com'],
                ]).map(([label, value]) => (
                  <div key={label} className="contact-row">
                    <span className="contact-label">{label}</span>
                    <span className="contact-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 产品示意图 ── */}
        {activeTab === 'schematic' && (
          <div className="result-card result-schematic-wrap">
            <h2 className="card-title">{lang === 'en' ? 'Product Schematic' : '产品示意图'}</h2>
            <SchematicTopology
              className="result-schematic-topology"
              data={resultToTopologyData(apiResult, {
                panelModel: config.panelModel,
                panelDisplayName,
                loadType: config.loadType,
                voltageLevel: config.voltageLevel,
                dieselPriceUsd: config.dieselPriceUsd,
                lang,
              })}
            />
          </div>
        )}
      </div>

      {/* ── 底部操作 ── */}
      <div className="result-footer">
        <button className="btn btn-secondary" onClick={() => setShowDownloadModal(true)}>
          {t('sys.download_report')}
        </button>
        <button className="btn btn-primary" onClick={onRestart}>{t('sys.reconfigure')}</button>
      </div>

      {/* ── 下载报告弹窗 ── */}
      {showDownloadModal && (
        <DownloadReportModal
          reportData={{
            systemConfig:    {
              ...(apiResult?.systemConfig ? (apiResult.systemConfig as Record<string, unknown>) : {}),
              locationName: config.locationName ?? '',
              longitude: config.longitude ?? null,
              dieselPriceUsd: config.dieselPriceUsd,
            },
            capex:           apiResult?.capex          as Record<string, unknown> | undefined,
            simulation:      apiResult?.simulation     as Record<string, unknown> | undefined,
            summary:         {
              ...(apiResult?.summary ? (apiResult.summary as Record<string, unknown>) : {}),
              dieselPriceUsd: config.dieselPriceUsd,
              dieselPriceDisplay: formatFuelPriceDual(config.dieselPriceUsd, lang).combined,
              siteLayoutNote: hasLayoutLimit ? siteLayoutNote : '',
              measuredSiteAreaDisplay: measuredAreaDisplay,
              usableSiteAreaDisplay: usableAreaDisplay,
              layoutMaxBracketSets: config.maxBracketSetsByLayout ?? null,
            },
            comparisonTable: apiResult?.comparisonTable as Record<string, unknown>[] | undefined,
          }}
          onClose={() => setShowDownloadModal(false)}
        />
      )}
    </div>
  );
}
