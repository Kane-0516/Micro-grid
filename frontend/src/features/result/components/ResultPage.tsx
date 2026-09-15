/**
 * ResultPage.tsx — 微电网解决方案结果页
 * 展示 API 返回的完整经济分析数据（USD）
 */
import { useState } from 'react';
import type { ConfigData, CalculateResponse } from '@/types/index';
import DownloadReportModal from './DownloadReportModal';
import { useLang } from '@/context/LangContext';
import { useProducts } from '@/store/useProductsStore';
import { getLocalizedProductLabel } from '@/utils/productLabel';
import {
  buildDownloadReportData,
  ResultKpiStrip,
  ResultTabContent,
  ResultTabNav,
} from './ResultPageSections';
import {
  type ExtendedSimulation,
  type ExtendedSummary,
  type Lang,
  type ResultTab,
  buildEmsNames,
  buildLayoutContext,
  buildScenarioNames,
  localized,
} from './resultPageShared';
import './ResultPage.css';

interface ResultPageProps {
  config:         ConfigData;
  apiResult:      CalculateResponse | null;
  isCalculating:  boolean;
  apiError:       string | null;
  apiErrorDiagnostics?: Record<string, unknown> | null;
  isSimulationRunning?: boolean;
  onRetry:        () => void;
  onBack?:        () => void;
  onRestart:      () => void;
}

function LoadingResult({ message, description }: Readonly<{ message: string; description: string }>) {
  return (
    <div className="result-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{
          width: '360px', background: 'rgba(255,255,255,0.95)', borderRadius: '14px',
          padding: '2rem 2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a365d', marginBottom: '1rem' }}>{message}</div>
          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <div style={{
              width: '40%', height: '100%', background: 'linear-gradient(90deg, #3182ce, #63b3ed, #3182ce)',
              borderRadius: '3px', animation: 'siteMapProgressSlide 1.5s ease-in-out infinite',
            }} />
          </div>
          <div style={{ fontSize: '0.82rem', color: '#718096' }}>{description}</div>
        </div>
      </div>
    </div>
  );
}

function ResultActions({
  backLabel,
  retryLabel,
  restartLabel,
  onBack,
  onRetry,
  onRestart,
}: Readonly<{
  backLabel: string;
  retryLabel?: string;
  restartLabel: string;
  onBack?: () => void;
  onRetry?: () => void;
  onRestart: () => void;
}>) {
  return (
    <div className="error-actions">
      {onBack && <button type="button" className="btn btn-secondary" onClick={onBack}>{backLabel}</button>}
      {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}>{retryLabel}</button>}
      <button type="button" className="btn btn-secondary" onClick={onRestart}>{restartLabel}</button>
    </div>
  );
}

function ErrorResult({
  message,
  traceback,
  diagnostics,
  lang,
  labels,
  onBack,
  onRetry,
  onRestart,
}: Readonly<{
  message: string;
  traceback?: string;
  diagnostics: Record<string, unknown> | null;
  lang: Lang;
  labels: { title: string; back: string; retry: string; restart: string };
  onBack?: () => void;
  onRetry: () => void;
  onRestart: () => void;
}>) {
  const timing = diagnostics && typeof diagnostics.timingSeconds === 'object'
    ? diagnostics.timingSeconds as Record<string, unknown>
    : null;
  return (
    <div className="result-page">
      <div className="result-error">
        <div className="error-icon">!</div>
        <h2>{labels.title}</h2>
        <p className="error-msg">{message}</p>
        {diagnostics && (
          <div style={{
            marginTop: '1rem', marginBottom: '1rem', padding: '1rem', borderRadius: '12px',
            background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'left',
            maxWidth: '720px', marginInline: 'auto',
          }}>
            <div style={{ fontWeight: 700, color: '#1a365d', marginBottom: '0.6rem' }}>
              {localized(lang, 'Performance diagnostics', '性能诊断')}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#4a5568', lineHeight: 1.7 }}>
              <div>{localized(lang, 'Cache hit', '命中缓存')}: <strong>{String(Boolean(diagnostics.cacheHit))}</strong></div>
              <div>{localized(lang, 'Candidate count', '候选数量')}: <strong>{String(diagnostics.candidateCount ?? '—')}</strong></div>
              <div>{localized(lang, 'Total seconds', '总耗时')}: <strong>{String(diagnostics.totalSeconds ?? '—')}s</strong></div>
              {timing && (
                <div style={{ marginTop: '0.55rem' }}>
                  <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.25rem' }}>
                    {localized(lang, 'Stage timing', '阶段耗时')}
                  </div>
                  {Object.entries(timing).map(([key, value]) => <div key={key}>{key}: <strong>{String(value)}s</strong></div>)}
                </div>
              )}
            </div>
          </div>
        )}
        {traceback && <pre className="error-trace">{traceback}</pre>}
        <ResultActions
          backLabel={labels.back}
          retryLabel={labels.retry}
          restartLabel={labels.restart}
          onBack={onBack}
          onRetry={onRetry}
          onRestart={onRestart}
        />
      </div>
    </div>
  );
}

function EmptyResult({
  title,
  backLabel,
  restartLabel,
  onBack,
  onRestart,
}: Readonly<{
  title: string;
  backLabel: string;
  restartLabel: string;
  onBack?: () => void;
  onRestart: () => void;
}>) {
  return (
    <div className="result-page">
      <div className="result-error">
        <h2>{title}</h2>
        <ResultActions backLabel={backLabel} restartLabel={restartLabel} onBack={onBack} onRestart={onRestart} />
      </div>
    </div>
  );
}

function DiyEstimateNotice({ lang }: Readonly<{ lang: Lang }>) {
  return (
    <div style={{
      background: 'linear-gradient(90deg, #f6fbff 0%, #eef7fb 52%, var(--theme-tone-warm-bg) 100%)',
      borderBottom: '2px solid var(--theme-tone-warm-accent)', padding: '0.75rem 1.5rem',
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem', fontSize: '0.88rem',
      color: 'var(--theme-tone-warm-text)', lineHeight: 1.65,
    }}>
      <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: '0.05rem' }}>⚠️</span>
      <div>
        <strong style={{ color: 'var(--theme-tone-warm-text)' }}>
          {localized(lang, 'DIY Mode — Estimation Notice', 'DIY 模式 — 估算精度说明')}
        </strong>
        <span style={{ marginLeft: '0.6rem' }}>
          {localized(
            lang,
            'This report is based on your specified voltage & current (peak demand). Since actual annual load (kWh) is unknown, the economic analysis (ROI, payback period, LCOE) is an engineering estimate with ±20–30% uncertainty. For higher accuracy, please use the ',
            '本报告基于您输入的电压与电流（峰值需求）推算，由于未提供实际年用电量（kWh），经济分析（投资回报、回本年限、LCOE）为工程估算，误差范围约 ±20–30%。如需更高精度，建议使用',
          )}
          <strong>{localized(lang, '"Known Load" ', '"已知负载" ')}</strong>
          {localized(lang, 'path with actual consumption data.', '路径并提供实际用电数据。')}
        </span>
      </div>
    </div>
  );
}

function SimulationProgress({ lang, title }: Readonly<{ lang: Lang; title: string }>) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)',
    }}>
      <div style={{
        width: '360px', background: 'rgba(255,255,255,0.95)', borderRadius: '14px',
        padding: '1.5rem 1.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', textAlign: 'center',
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.75rem' }}>{title}</div>
        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: '40%', height: '100%', background: 'linear-gradient(90deg, #3182ce, #63b3ed, #3182ce)',
            borderRadius: '3px', animation: 'siteMapProgressSlide 1.5s ease-in-out infinite',
          }} />
        </div>
        <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.6rem' }}>
          {localized(
            lang,
            '8760-hour energy simulation in progress, data will update automatically upon completion.',
            '8760 小时逐时能量仿真进行中，完成后数据将自动更新。',
          )}
        </div>
      </div>
    </div>
  );
}

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
}: Readonly<ResultPageProps>) {
  const { t, lang } = useLang();
  const { pvPanels } = useProducts();
  const [activeTab, setActiveTab] = useState<ResultTab>('showcase');
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  if (isCalculating) {
    return <LoadingResult message={t('result.loading')} description={t('result.loading.desc')} />;
  }

  if (apiError || (apiResult && !apiResult.success)) {
    const errMsg = apiError || apiResult?.error || localized(lang, 'Unknown error', '未知错误');
    const diagnostics = apiErrorDiagnostics && typeof apiErrorDiagnostics === 'object' ? apiErrorDiagnostics : null;
    return (
      <ErrorResult
        message={errMsg}
        traceback={apiResult?.traceback}
        diagnostics={diagnostics}
        lang={lang}
        labels={{ title: t('result.error'), back: t('btn.back_modify'), retry: t('result.retry'), restart: t('result.restart') }}
        onBack={onBack}
        onRetry={onRetry}
        onRestart={onRestart}
      />
    );
  }

  if (!apiResult) {
    return (
      <EmptyResult
        title={t('result.no_data')}
        backLabel={t('btn.back_modify')}
        restartLabel={t('result.restart')}
        onBack={onBack}
        onRestart={onRestart}
      />
    );
  }

  const sc = apiResult.systemConfig ?? null;
  const sim = apiResult.simulation ?? null;
  const summary = apiResult.summary ?? null;
  const summaryExt = summary as ExtendedSummary | null;
  const simExt = sim as ExtendedSimulation | null;
  const layout = buildLayoutContext(config, lang);
  const scenarioName = buildScenarioNames(lang);
  const emsName = buildEmsNames(lang);
  const dieselDisplayName = sc?.dieselModelDisplay ?? sc?.dieselModel ?? '—';
  const resolvedPanelModel = sc?.panelModel || config.panelModel || '';
  const panelDisplayName = resolvedPanelModel
    ? (getLocalizedProductLabel(pvPanels.find((panel) => panel.model === resolvedPanelModel), lang) || resolvedPanelModel)
    : '—';
  const panelLabel = localized(lang, resolvedPanelModel || '—', panelDisplayName);
  const breakevenLabel = summary?.breakevenYear
    ? localized(lang, `Year ${summary.breakevenYear}`, `第 ${summary.breakevenYear} 年`)
    : t('kpi.over_20');

  return (
    <div className="result-page">
      {config.scenario === 'diy' && <DiyEstimateNotice lang={lang} />}

      <div className="result-header">
        <div className="result-header-left">
          {onBack && (
            <button type="button" className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '0.85rem' }}>
              {t('btn.back_modify')}
            </button>
          )}
          <h1>{t('result.title')}</h1>
          <p className="subtitle">
            {summary?.projectName || (lang === 'en' ? 'Project' : '项目')} · {t('result.subtitle')} {summary?.analysisYears ?? 20} {t('result.years')}
          </p>
        </div>
      </div>

      {isSimulationRunning && <SimulationProgress lang={lang} title={t('result.pypsa_label')} />}

      {!isSimulationRunning && (
        <div style={{
          background: 'linear-gradient(90deg, var(--theme-tone-bg) 0%, var(--theme-tone-warm-bg) 100%)',
          borderBottom: '2px solid var(--theme-tone-warm-border)',
          padding: '0.45rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.82rem', color: 'var(--theme-tone-text)',
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--theme-warm-600)', display: 'inline-block', flexShrink: 0 }} />
          {t('result.simulated')}
        </div>
      )}

      <ResultKpiStrip sc={sc} sim={sim} config={config} breakevenLabel={breakevenLabel} lang={lang} t={t} />
      <ResultTabNav activeTab={activeTab} lang={lang} t={t} onSelect={setActiveTab} />

      <div className="result-tab-content">
        <ResultTabContent
          activeTab={activeTab}
          apiResult={apiResult}
          config={config}
          summary={summary}
          summaryExt={summaryExt}
          simExt={simExt}
          sc={sc}
          sim={sim}
          layout={layout}
          panelDisplayName={panelDisplayName}
          panelLabel={panelLabel}
          resolvedPanelModel={resolvedPanelModel}
          dieselDisplayName={dieselDisplayName}
          scenarioName={scenarioName}
          emsName={emsName}
          breakevenLabel={breakevenLabel}
          lang={lang}
          t={t}
        />
      </div>

      <div className="result-footer">
        <button type="button" className="btn btn-secondary" onClick={() => setShowDownloadModal(true)}>
          {t('sys.download_report')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onRestart}>{t('sys.reconfigure')}</button>
      </div>

      {showDownloadModal && (
        <DownloadReportModal
          reportData={buildDownloadReportData(apiResult, config, layout, lang)}
          onClose={() => setShowDownloadModal(false)}
        />
      )}
    </div>
  );
}
