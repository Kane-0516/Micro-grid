import type { CalculateResponse, ConfigData } from '@/types/index';
import ComponentCard from '@/components/ui/ComponentCard';
import SolarDieselAnalysisChart from './SolarDieselAnalysisChart';
import SchematicTopology from '@/features/topology/components/SchematicTopology';
import { resultToTopologyData } from '@/utils/resultToTopology';
import { formatAreaDual, formatFuelPriceDual, formatVolumeDual } from '@/utils/unitFormat';
import type { ReportData } from './DownloadReportModal';
import {
  type ExtendedSimulation,
  type ExtendedSummary,
  type Lang,
  type LayoutNoteContext,
  type ResultTab,
  fmtNum,
  fmtPct,
  fmtUsd,
  formatOptionalLifeYears,
  localized,
} from './resultPageShared';

interface TopologyOptions {
  panelModel?: string;
  panelDisplayName: string;
  loadType?: string;
  voltageLevel?: string;
  dieselPriceUsd?: number;
  lang: Lang;
}

function buildTopologyOptions(config: ConfigData, panelDisplayName: string, lang: Lang): TopologyOptions {
  return {
    panelModel: config.panelModel,
    panelDisplayName,
    loadType: config.loadType,
    voltageLevel: config.voltageLevel,
    dieselPriceUsd: config.dieselPriceUsd,
    lang,
  };
}

export function ResultShowcaseTab({
  apiResult,
  config,
  panelDisplayName,
  lang,
}: {
  apiResult: CalculateResponse;
  config: ConfigData;
  panelDisplayName: string;
  lang: Lang;
}) {
  return (
    <div className="result-card result-showcase-card">
      <SchematicTopology
        className="result-schematic-topology"
        data={resultToTopologyData(apiResult, buildTopologyOptions(config, panelDisplayName, lang))}
      />
    </div>
  );
}

function OperatingCostSplit({ summary, summaryExt, lang }: { summary: ExtendedSummary; summaryExt: ExtendedSummary | null; lang: Lang }) {
  return (
    <div style={{
      gridColumn: '1 / -1', marginTop: '0.25rem', padding: '0.75rem 0.9rem',
      background: '#f8fbff', border: '1px solid #d7e3f0', borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.45rem' }}>
        {localized(lang, 'Operating Cost Split', '运行成本拆分')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem 1rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
          {localized(lang, 'MG fuel', '微电网燃油')}: <strong>{fmtUsd(summary.mgAnnualFuelUsd)}</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
          {localized(lang, 'Diesel-only fuel', '纯柴发燃油')}: <strong>{fmtUsd(summary.dieselAnnualFuelUsd)}</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
          {localized(lang, 'MG fixed O&M', '微电网固定 O&M')}: <strong>{fmtUsd(summaryExt?.microgridFixedOmUsd)}</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
          {localized(lang, 'MG generator maintenance', '微电网机组维护')}: <strong>{fmtUsd(summaryExt?.microgridGeneratorMaintenanceUsd)}</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
          {localized(lang, 'Diesel-only maintenance', '纯柴发机组维护')}: <strong>{fmtUsd(summaryExt?.dieselOnlyGeneratorMaintenanceUsd)}</strong>
        </div>
      </div>
    </div>
  );
}

function NpcCompositionPanel({ summaryExt, lang }: { summaryExt: ExtendedSummary | null; lang: Lang }) {
  return (
    <div style={{
      gridColumn: '1 / -1', marginTop: '0.25rem', padding: '0.75rem 0.9rem',
      background: '#fffaf2', border: '1px solid #ecd9a7', borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7b4e00', marginBottom: '0.45rem' }}>
        {localized(lang, 'NPC Composition', 'NPC 构成')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem 1rem' }}>
        {[
          [localized(lang, 'MG capital NPC', '微电网资本现值'), summaryExt?.microgridCapitalNpcUsd],
          [localized(lang, 'Diesel-only capital NPC', '纯柴发资本现值'), summaryExt?.dieselOnlyCapitalNpcUsd],
          [localized(lang, 'MG replacement NPC', '微电网更换现值'), summaryExt?.microgridReplacementNpcUsd],
          [localized(lang, 'Diesel-only replacement NPC', '纯柴发更换现值'), summaryExt?.dieselOnlyReplacementNpcUsd],
          [localized(lang, 'MG salvage credit', '微电网残值抵扣'), summaryExt?.microgridSalvageNpcUsd],
          [localized(lang, 'Diesel-only salvage credit', '纯柴发残值抵扣'), summaryExt?.dieselOnlySalvageNpcUsd],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ fontSize: '0.8rem', color: '#4a5568' }}>
            {label}: <strong>{fmtUsd(value as number | null | undefined)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewFootnotes({
  config,
  layout,
  lang,
}: {
  config: ConfigData;
  layout: LayoutNoteContext;
  lang: Lang;
}) {
  return (
    <>
      {config.scenario === 'diy' && (
        <div style={{
          gridColumn: '1 / -1', marginTop: '0.5rem', paddingTop: '0.65rem',
          borderTop: '1px dashed #e2e8f0', fontSize: '0.78rem', color: '#a0aec0', lineHeight: 1.6,
        }}>
          {lang === 'en'
            ? '* DIY mode: economic figures are estimated from peak current demand. Actual annual kWh consumption was not provided — results may vary ±20–30% from reality. For a precise analysis, re-run with the "Known Load" path.'
            : '* DIY 模式：经济数据由峰值电流需求估算，未提供实际年用电量（kWh），结果与实际情况可能相差 ±20–30%。如需精确分析，请改用"已知负载"路径重新计算。'}
        </div>
      )}
      {layout.hasLayoutLimit && (
        <div style={{
          gridColumn: '1 / -1', marginTop: '0.5rem', paddingTop: '0.65rem',
          borderTop: '1px dashed #e2e8f0', fontSize: '0.78rem', color: '#4a5568', lineHeight: 1.7,
        }}>
          <div>{layout.siteLayoutNote}</div>
          <div>
            {localized(lang, 'Measured site area', '框选场地面积')}: {layout.measuredAreaDisplay || '—'} · {localized(lang, 'Area basis', '面积口径')}: {layout.usableAreaDisplay || '—'} · {localized(lang, 'Layout-based max sets', '排布上限套数')}: {layout.maxBracketSetsByLayout}
          </div>
        </div>
      )}
    </>
  );
}

export function ResultOverviewTab({
  summary,
  summaryExt,
  sc,
  config,
  layout,
  breakevenLabel,
  lang,
  t,
}: {
  summary: ExtendedSummary;
  summaryExt: ExtendedSummary | null;
  sc: NonNullable<CalculateResponse['systemConfig']>;
  config: ConfigData;
  layout: LayoutNoteContext;
  breakevenLabel: string;
  lang: Lang;
  t: (key: string) => string;
}) {
  return (
    <div>
      <div className="result-card">
        <h2 className="card-title">{t('overview.summary')}</h2>
        <div className="summary-grid">
          <div className="sum-row">
            <span className="sum-label">{t('sys.annual_load')}</span>
            <span className="sum-value">{fmtNum(summary.annualLoadKwh, 0)} kWh</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Microgrid NPC', '微电网 NPC')}</span>
            <span className="sum-value">{fmtUsd(summaryExt?.microgridNpcUsd)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Diesel-only NPC', '纯柴发 NPC')}</span>
            <span className="sum-value">{fmtUsd(summaryExt?.dieselOnlyNpcUsd)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'NPC Savings', 'NPC 节省')}</span>
            <span className="sum-value highlight-green">{fmtUsd(summaryExt?.npcSavingsUsd)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Project Life', '项目周期')}</span>
            <span className="sum-value">{fmtNum(sc.projectYears ?? summary.analysisYears, 0)} {localized(lang, 'years', '年')}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Microgrid COE', '微电网 COE')}</span>
            <span className="sum-value">{fmtUsd(summary.finalMgLcoe, 3)}/kWh</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Diesel-only COE', '纯柴发 COE')}</span>
            <span className="sum-value">{fmtUsd(summary.finalDieselLcoe, 3)}/kWh</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'MG Annualized Cost', '微电网年化成本')}</span>
            <span className="sum-value">{fmtUsd(summaryExt?.microgridAnnualizedCostUsd)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Diesel Annualized Cost', '纯柴发年化成本')}</span>
            <span className="sum-value">{fmtUsd(summaryExt?.dieselOnlyAnnualizedCostUsd)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Discounted Breakeven Year', '折现现金流回本年')}</span>
            <span className="sum-value highlight-green">{breakevenLabel}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'MG Operating Cost', '微电网运行成本')}</span>
            <span className="sum-value">{fmtUsd(summaryExt?.microgridOperatingCostUsd)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Diesel Operating Cost', '纯柴发运行成本')}</span>
            <span className="sum-value">{fmtUsd(summaryExt?.dieselOnlyOperatingCostUsd)}</span>
          </div>
          <OperatingCostSplit summary={summary} summaryExt={summaryExt} lang={lang} />
          <NpcCompositionPanel summaryExt={summaryExt} lang={lang} />
          <div style={{
            gridColumn: '1 / -1', marginTop: '0.25rem', padding: '0.75rem 0.9rem',
            background: '#f7fafc', border: '1px dashed #cbd5e0', borderRadius: '8px',
            fontSize: '0.78rem', color: '#4a5568', lineHeight: 1.7,
          }}>
            {lang === 'en'
              ? 'Interpretation: Operating Cost shows recurring annual burden, mainly fuel and maintenance. NPC Composition shows discounted lifecycle capital, replacement, and salvage-credit contributions only; it does not include the discounted fuel and O&M stream, so these lines do not sum to total NPC by themselves. COE is derived from total annualized cost divided by served load.'
              : '口径说明：运行成本反映年度持续性负担，主要由燃油和维护构成。NPC 构成仅展示折现后的初始资本、更换成本和残值抵扣，不包含燃油与 O&M 的折现现金流，因此这些分量本身不会直接相加等于总 NPC。COE 则是由总年化成本除以供电电量得到。'}
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'MG Generator Life', '微电网柴发寿命')}</span>
            <span className="sum-value">{formatOptionalLifeYears(lang, summaryExt?.microgridGeneratorLifeYears)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Diesel-only Generator Life', '纯柴发寿命')}</span>
            <span className="sum-value">{formatOptionalLifeYears(lang, summaryExt?.dieselOnlyGeneratorLifeYears)}</span>
          </div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Battery Life', '电池寿命')}</span>
            <span className="sum-value">{formatOptionalLifeYears(lang, summaryExt?.batteryLifeYears)}</span>
          </div>
          <OverviewFootnotes config={config} layout={layout} lang={lang} />
        </div>
      </div>
    </div>
  );
}

export function ResultSimulationTab({
  simExt,
  lang,
  t,
}: {
  simExt: ExtendedSimulation | null;
  lang: Lang;
  t: (key: string) => string;
}) {
  return (
    <div className="result-card">
      <h2 className="card-title">{t('sim.title')}</h2>
      {simExt ? (
        <>
          <div className="summary-grid">
            {[
              [t('sim.solar_frac'), fmtPct(simExt.solarFractionPct), 'highlight-green'],
              [t('sim.loss_load'), fmtPct(simExt.lossOfLoadPct), ''],
              [t('sim.curtail'), fmtPct(simExt.curtailmentPct), ''],
              [t('sim.mg_diesel'), `${formatVolumeDual(simExt.mgDieselLiters, lang).combined}/${localized(lang, 'yr', '年')}`, ''],
              [t('sim.mg_diesel_hr'), `${fmtNum(simExt.mgDieselHours, 0)} h/${localized(lang, 'yr', '年')}`, ''],
              [localized(lang, 'Diesel Starts', '柴发启动次数'), `${fmtNum(simExt.mgDieselStarts, 0)} ${localized(lang, 'starts/yr', '次/年')}`, ''],
              [t('sim.diesel_only'), `${formatVolumeDual(simExt.dieselOnlyLiters, lang).combined}/${localized(lang, 'yr', '年')}`, 'highlight-red'],
              [t('sim.diesel_only_hr'), `${fmtNum(simExt.dieselRunHoursA, 0)} h/${localized(lang, 'yr', '年')}`, ''],
              [t('sim.fuel_saving'), formatVolumeDual(simExt.annualFuelSavingLiters, lang).combined, 'highlight-green'],
              [t('sim.fuel_saving_usd'), fmtUsd(simExt.annualFuelSavingUsd), 'highlight-green'],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="sum-row">
                <span className="sum-label">{label}</span>
                <span className={`sum-value ${tone}`.trim()}>{value}</span>
              </div>
            ))}
          </div>
          <SolarDieselAnalysisChart analysis={simExt.solarDieselAnalysis} />
        </>
      ) : (
        <div className="sim-note"><p>{t('result.sim_pending')}</p></div>
      )}
    </div>
  );
}

function SystemComponentCards({
  config,
  sc,
  sim,
  panelDisplayName,
  resolvedPanelModel,
  dieselDisplayName,
  emsName,
  lang,
}: {
  config: ConfigData;
  sc: NonNullable<CalculateResponse['systemConfig']>;
  sim: CalculateResponse['simulation'] | null;
  panelDisplayName: string;
  resolvedPanelModel: string;
  dieselDisplayName: string;
  emsName: Record<string, string>;
  lang: Lang;
}) {
  const dieselKw = sc.dieselCapacityKw ?? config.dieselCapacityKw;
  const fuelReductionPct = sim ? (1 - sim.mgDieselLiters / (sim.dieselOnlyLiters || 1)) * 100 : null;

  return (
    <div className="components-grid">
      <ComponentCard
        title={localized(lang, 'Software (EMS)', '软件 (EMS)')}
        description={lang === 'en'
          ? 'VoltageEnergy microgrid management system supporting edge/cloud/predictive control modes, dynamically optimizing PV-storage-diesel coordination.'
          : 'VoltageEnergy 微电网管理系统，支持云端/边端/预测三种控制模式，动态优化光储柴协调调度。'}
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>}
        isVital
        details={lang === 'en'
          ? `EMS control mode: ${emsName[config.emsControlMethod] || config.emsControlMethod}. Supports real-time monitoring, fault alerts, remote O&M.`
          : `EMS 控制模式：${emsName[config.emsControlMethod] || config.emsControlMethod}。支持实时监控、故障预警、远程运维。`}
      />
      <ComponentCard
        title={localized(lang, 'Solar PV', '太阳能光伏')}
        description={lang === 'en'
          ? `${sc.bracketSets ?? config.bracketSets} folding bracket sets, ${sc.pvCapacityKw?.toFixed(1) ?? '—'} kW, ${resolvedPanelModel || config.panelModel} modules.`
          : `${sc.bracketSets ?? config.bracketSets} 套折叠支架，${sc.pvCapacityKw?.toFixed(1) ?? '—'} kW，${panelDisplayName}。`}
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v4M12 19v4M23 12h-4M5 12H1M20.66 3.34l-2.83 2.83M6.17 17.83l-2.83 2.83M20.66 20.66l-2.83-2.83M6.17 6.17L3.34 3.34" /></svg>}
        isVital
        details={lang === 'en'
          ? `Total PV ${sc.pvCapacityKw?.toFixed(1) ?? '—'} kW, footprint ${formatAreaDual(sc.occupiedAreaM2, lang).combined}, module ${resolvedPanelModel || config.panelModel} (${sc.panelWatts ?? '—'}Wp).`
          : `光伏总容量 ${sc.pvCapacityKw?.toFixed(1) ?? '—'} kW，占地 ${formatAreaDual(sc.occupiedAreaM2, lang).combined}，组件型号 ${panelDisplayName}。`}
      />
      <ComponentCard
        title={localized(lang, 'Battery Storage (BESS)', '电池储能 (BESS)')}
        description={lang === 'en'
          ? `${fmtNum(sc.batteryCapacityKwh)} kWh, ${sc.batteryPackCount ?? '—'} × ${sc.batteryModel ?? config.batteryPackModel}, supporting ${config.storageDays}-day autonomous supply.`
          : `${fmtNum(sc.batteryCapacityKwh)} kWh，${sc.batteryPackCount ?? '—'} 包 ${sc.batteryModel ?? config.batteryPackModel}，支撑 ${config.storageDays} 天自主供电。`}
        icon={<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="12" height="16" rx="2" /><rect x="8" y="6" width="8" height="12" fill="white" opacity="0.3" /><path d="M9 2h6v2H9z" /></svg>}
        isVital
        details={lang === 'en'
          ? `LFP battery, 90% DoD, ≥4000 cycle life, supporting ${config.storageDays}-day continuous supply.`
          : `磷酸铁锂 (LFP) 电池，深度放电 90%，循环寿命 ≥ 4000 次，支撑连续阴天 ${config.storageDays} 天供电。`}
      />
      {dieselKw > 0 && (
        <ComponentCard
          title={localized(lang, 'Diesel Generator', '柴油发电机')}
          description={lang === 'en'
            ? `${dieselKw} kW, annual run ${fmtNum(sim?.mgDieselHours, 0)} hrs in microgrid mode, fuel use reduced by ${fmtPct(fuelReductionPct)}.`
            : `${dieselKw} kW，微电网模式下年均运行 ${fmtNum(sim?.mgDieselHours, 0)} 小时，燃油消耗降低 ${fmtPct(fuelReductionPct)}。`}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 4v4M12 16v4M4 12h4M16 12h4" /></svg>}
          isVital
          details={lang === 'en'
            ? `Model: ${dieselDisplayName}, capacity ${dieselKw} kW. In microgrid mode solar covers ${fmtPct(sim?.solarFractionPct)} of load; diesel only starts during cloudy days or peak loads.`
            : `型号：${dieselDisplayName}，容量 ${dieselKw} kW。微电网协同下，太阳能承担 ${fmtPct(sim?.solarFractionPct)} 负载，柴发仅在阴天/高峰负载时启用。`}
        />
      )}
    </div>
  );
}

const CONTACT_ROWS: Record<Lang, [string, string][]> = {
  en: [
    ['Company', 'VoltageEnergy Technology Co., Ltd.'],
    ['Address', '666 Dongsheng Rd, Zhenhai District, Ningbo, Zhejiang, China'],
    ['Phone', '400-888-8888'],
    ['Email', 'info@voltageenergy.com'],
    ['Website', 'www.voltageenergy.com'],
    ['Sales', 'sales@voltageenergy.com'],
  ],
  zh: [
    ['公司名称', 'VoltageEnergy 能源科技有限公司'],
    ['公司地址', '浙江省宁波市镇海区蛟川街道东生路666号'],
    ['联系电话', '400-888-8888'],
    ['电子邮箱', 'info@voltageenergy.com'],
    ['官方网站', 'www.voltageenergy.com'],
    ['业务咨询', 'sales@voltageenergy.com'],
  ],
};

export function ResultSystemTab({
  sc,
  config,
  sim,
  layout,
  panelLabel,
  panelDisplayName,
  resolvedPanelModel,
  dieselDisplayName,
  scenarioName,
  emsName,
  lang,
  t,
}: {
  sc: NonNullable<CalculateResponse['systemConfig']>;
  config: ConfigData;
  sim: CalculateResponse['simulation'] | null;
  layout: LayoutNoteContext;
  panelLabel: string;
  panelDisplayName: string;
  resolvedPanelModel: string;
  dieselDisplayName: string;
  scenarioName: Record<string, string>;
  emsName: Record<string, string>;
  lang: Lang;
  t: (key: string) => string;
}) {
  return (
    <div>
      <div className="result-card">
        <h2 className="card-title">{t('sys.title')}</h2>
        <div className="summary-grid">
          <div className="sum-row"><span className="sum-label">{t('sys.scenario')}</span><span className="sum-value">{scenarioName[config.scenario] || config.scenario}</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.panel_model')}</span><span className="sum-value">{panelLabel} ({sc.panelWatts}Wp, ${sc.panelPricePerWp}/Wp)</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.bracket_sets')}</span><span className="sum-value">{sc.bracketSets} {localized(lang, 'sets', '套')} ({sc.bracketSets * sc.panelsPerSet} {localized(lang, 'panels', '块')})</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.pv_kw')}</span><span className="sum-value highlight-blue">{fmtNum(sc.pvCapacityKw)} kW</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.area')}</span><span className="sum-value">{formatAreaDual(sc.occupiedAreaM2, lang).combined}</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.batt_model')}</span><span className="sum-value">{sc.batteryModel}</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.batt_kwh')}</span><span className="sum-value">{fmtNum(sc.batteryCapacityKwh)} kWh ({sc.batteryPackCount} {localized(lang, 'packs', '包')})</span></div>
          <div className="sum-row">
            <span className="sum-label">{localized(lang, 'Diesel Generator', '柴油发电机')}</span>
            <span className="sum-value">
              {sc.dieselCapacityKw > 0 ? `${sc.dieselCapacityKw} kW (${dieselDisplayName})` : localized(lang, 'None', '无')}
            </span>
          </div>
          <div className="sum-row"><span className="sum-label">{t('sys.voltage')}</span><span className="sum-value">{sc.voltageLevel}</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.ems')}</span><span className="sum-value">{emsName[sc.emsMode] || sc.emsMode}</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.annual_load')}</span><span className="sum-value">{fmtNum(sc.annualLoadKwh, 0)} kWh</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.load_type')}</span><span className="sum-value">{sc.loadType}</span></div>
          <div className="sum-row"><span className="sum-label">{t('sys.latitude')}</span><span className="sum-value">{sc.latitude}°</span></div>
          <div className="sum-row"><span className="sum-label">{localized(lang, 'Longitude', '经度')}</span><span className="sum-value">{sc.longitude}°</span></div>
        </div>
        {layout.hasLayoutLimit && (
          <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px dashed #e2e8f0', fontSize: '0.82rem', color: '#4a5568', lineHeight: 1.7 }}>
            <div>{layout.siteLayoutNote}</div>
            <div>
              {localized(lang, 'Layout-based max installable bracket sets', '基于场地排布的最大可安装支架套数')}: {layout.maxBracketSetsByLayout}
            </div>
          </div>
        )}
      </div>
      <div className="components-section">
        <h2 className="card-title">{localized(lang, 'System Components', '系统组件')}</h2>
        <SystemComponentCards
          config={config}
          sc={sc}
          sim={sim}
          panelDisplayName={panelDisplayName}
          resolvedPanelModel={resolvedPanelModel}
          dieselDisplayName={dieselDisplayName}
          emsName={emsName}
          lang={lang}
        />
      </div>
      <div className="company-info">
        <h2>{localized(lang, 'Contact Us', '联系我们')}</h2>
        <div className="contact-grid">
          {CONTACT_ROWS[lang].map(([label, value]) => (
            <div key={label} className="contact-row">
              <span className="contact-label">{label}</span>
              <span className="contact-value">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultKpiStrip({
  sc,
  sim,
  config,
  breakevenLabel,
  lang,
  t,
}: {
  sc: NonNullable<CalculateResponse['systemConfig']> | null;
  sim: CalculateResponse['simulation'] | null;
  config: ConfigData;
  breakevenLabel: string;
  lang: Lang;
  t: (key: string) => string;
}) {
  const diySuffix = config.scenario === 'diy' ? ' *' : '';
  return (
    <div className="kpi-strip">
      <div className="kpi-card"><div className="kpi-label">{t('kpi.pv_kw')}</div><div className="kpi-value">{fmtNum(sc?.pvCapacityKw)} kW</div></div>
      <div className="kpi-card"><div className="kpi-label">{t('kpi.batt_kwh')}</div><div className="kpi-value">{fmtNum(sc?.batteryCapacityKwh)} kWh</div></div>
      <div className="kpi-card"><div className="kpi-label">{t('kpi.solar_frac')}</div><div className="kpi-value green">{fmtPct(sim?.solarFractionPct)}</div></div>
      <div className="kpi-card"><div className="kpi-label">{t('kpi.payback')}{diySuffix}</div><div className="kpi-value orange">{breakevenLabel}</div></div>
      <div className="kpi-card">
        <div className="kpi-label">{t('kpi.fuel_saving')}{diySuffix}</div>
        <div className="kpi-value" style={{ fontSize: '1rem', lineHeight: 1.25 }}>
          {formatVolumeDual(sim?.annualFuelSavingLiters, lang).combined}
        </div>
      </div>
    </div>
  );
}

export function ResultTabNav({
  activeTab,
  lang,
  t,
  onSelect,
}: {
  activeTab: ResultTab;
  lang: Lang;
  t: (key: string) => string;
  onSelect: (tab: ResultTab) => void;
}) {
  const tabs: [ResultTab, string][] = [
    ['showcase', localized(lang, 'Solution Showcase', '方案展示')],
    ['overview', t('tab.overview')],
    ['simulation', t('tab.simulation')],
    ['system', t('tab.system')],
  ];
  return (
    <div className="result-tabs">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`tab-btn ${activeTab === key ? 'active' : ''}`}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function buildDownloadReportData(
  apiResult: CalculateResponse,
  config: ConfigData,
  layout: LayoutNoteContext,
  lang: Lang,
): ReportData {
  return {
    systemConfig: {
      ...(apiResult.systemConfig ? (apiResult.systemConfig as Record<string, unknown>) : {}),
      locationName: config.locationName ?? '',
      longitude: config.longitude ?? null,
      dieselPriceUsd: config.dieselPriceUsd,
    },
    capex: apiResult.capex as Record<string, unknown> | undefined,
    simulation: apiResult.simulation as Record<string, unknown> | undefined,
    summary: {
      ...(apiResult.summary ? (apiResult.summary as Record<string, unknown>) : {}),
      dieselPriceUsd: config.dieselPriceUsd,
      dieselPriceDisplay: formatFuelPriceDual(config.dieselPriceUsd, lang).combined,
      siteLayoutNote: layout.hasLayoutLimit ? layout.siteLayoutNote : '',
      measuredSiteAreaDisplay: layout.measuredAreaDisplay,
      usableSiteAreaDisplay: layout.usableAreaDisplay,
      layoutMaxBracketSets: layout.maxBracketSetsByLayout ?? null,
    },
    comparisonTable: apiResult.comparisonTable as Record<string, unknown>[] | undefined,
  };
}

export function ResultTabContent({
  activeTab,
  apiResult,
  config,
  summary,
  summaryExt,
  simExt,
  sc,
  sim,
  layout,
  panelDisplayName,
  panelLabel,
  resolvedPanelModel,
  dieselDisplayName,
  scenarioName,
  emsName,
  breakevenLabel,
  lang,
  t,
}: {
  activeTab: ResultTab;
  apiResult: CalculateResponse;
  config: ConfigData;
  summary: ExtendedSummary | null;
  summaryExt: ExtendedSummary | null;
  simExt: ExtendedSimulation | null;
  sc: NonNullable<CalculateResponse['systemConfig']> | null;
  sim: CalculateResponse['simulation'] | null;
  layout: LayoutNoteContext;
  panelDisplayName: string;
  panelLabel: string;
  resolvedPanelModel: string;
  dieselDisplayName: string;
  scenarioName: Record<string, string>;
  emsName: Record<string, string>;
  breakevenLabel: string;
  lang: Lang;
  t: (key: string) => string;
}) {
  if (activeTab === 'showcase') {
    return <ResultShowcaseTab apiResult={apiResult} config={config} panelDisplayName={panelDisplayName} lang={lang} />;
  }
  if (activeTab === 'overview' && summary && sc) {
    return (
      <ResultOverviewTab
        summary={summary}
        summaryExt={summaryExt}
        sc={sc}
        config={config}
        layout={layout}
        breakevenLabel={breakevenLabel}
        lang={lang}
        t={t}
      />
    );
  }
  if (activeTab === 'simulation') {
    return <ResultSimulationTab simExt={simExt} lang={lang} t={t} />;
  }
  if (activeTab === 'system' && sc) {
    return (
      <ResultSystemTab
        sc={sc}
        config={config}
        sim={sim}
        layout={layout}
        panelLabel={panelLabel}
        panelDisplayName={panelDisplayName}
        resolvedPanelModel={resolvedPanelModel}
        dieselDisplayName={dieselDisplayName}
        scenarioName={scenarioName}
        emsName={emsName}
        lang={lang}
        t={t}
      />
    );
  }
  if (activeTab === 'schematic') {
    return (
      <div className="result-card result-schematic-wrap">
        <h2 className="card-title">{localized(lang, 'Product Schematic', '产品示意图')}</h2>
        <SchematicTopology
          className="result-schematic-topology"
          data={resultToTopologyData(apiResult, buildTopologyOptions(config, panelDisplayName, lang))}
        />
      </div>
    );
  }
  return null;
}
