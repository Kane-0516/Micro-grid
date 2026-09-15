import { useState, type ReactNode } from 'react';
import type { OptimizeOption } from '@/types/index';
import { useLang } from '@/context/LangContext';
import { formatVolumeDual } from '@/utils/unitFormat';

interface PlanSelectionPageProps {
  options: OptimizeOption[];
  dieselKw: number;
  annualLoadKwh: number;
  layoutMaxSets?: number | null;
  isLoadingDetail: boolean;
  onSelect: (opt: OptimizeOption) => void;
  onBack: () => void;
}

type Lang = ReturnType<typeof useLang>['lang'];
type Translate = ReturnType<typeof useLang>['t'];

interface DynamicNote {
  title: string;
  body: string;
  accent: string;
}

interface PlanStyle {
  accent: string;
  bg: string;
  badgeLabel: string;
}

function localized(lang: Lang, english: string, chinese: string): string {
  return lang === 'en' ? english : chinese;
}

function MetricBox({ label, value, color, note }: { label: string; value: ReactNode; color?: string; note?: string }) {
  return (
    <div
      style={{
        background: '#f7fafc',
        borderRadius: '8px',
        padding: '0.75rem 0.9rem',
        textAlign: 'center',
        minHeight: '78px',
      }}
    >
      <div style={{ fontSize: '0.8rem', color: '#718096', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: color ?? '#2d3748' }}>{value}</div>
      {note && <div style={{ marginTop: '3px', fontSize: '0.72rem', color: '#a0aec0', lineHeight: 1.25 }}>{note}</div>}
    </div>
  );
}

function formatBreakevenYear(value: number, lang: string): string {
  if (!Number.isFinite(value) || value >= 99) return lang === 'en' ? 'Not recovered within project life' : '项目期内未回本';
  return lang === 'en' ? `Year ${Math.round(value)}` : `第 ${Math.round(value)} 年`;
}

function getDisplayOptions(options: OptimizeOption[]): OptimizeOption[] {
  const topOptions = options.filter(option => option.isRecommended || option.isRunnerUp || option.isThird).slice(0, 3);
  return topOptions.length >= 3 ? topOptions : options.slice(0, Math.min(3, options.length));
}

function getPlanStyles(t: Translate): PlanStyle[] {
  return [
    { accent: '#2b6cb0', bg: '#ebf8ff', badgeLabel: t('plan.badge.best') },
    { accent: '#276749', bg: '#f0fff4', badgeLabel: t('plan.badge.second') },
    { accent: '#744210', bg: '#fffde7', badgeLabel: t('plan.badge.third') },
  ];
}

function getPlanStyle(opt: OptimizeOption, idx: number, styles: PlanStyle[]): PlanStyle {
  if (opt.isRecommended) return styles[0];
  if (opt.isRunnerUp) return styles[1];
  if (opt.isThird) return styles[2];
  return styles[idx] ?? styles[2];
}

function buildSizingNote(option: OptimizeOption, layoutMaxSets: number | null, lang: Lang): DynamicNote {
  if (layoutMaxSets == null) {
    return {
      title: localized(lang, 'Sizing Basis', '推荐依据'),
      body: localized(
        lang,
        `The current recommendation uses ${option.bracketSets} bracket sets after comparing payback, solar share, diesel reduction, and annual savings across the refined candidate plans.`,
        `当前推荐方案采用 ${option.bracketSets} 套支架，是在入围精算候选中综合比较回本周期、太阳能占比、节油率和年节省后得到的结果。`,
      ),
      accent: '#2b6cb0',
    };
  }

  const hitsLayoutCap = option.bracketSets >= layoutMaxSets;
  return {
    title: localized(lang, 'Site Limit', '场地约束'),
    body: hitsLayoutCap
      ? localized(
          lang,
          `The map layout allows up to ${layoutMaxSets} bracket sets, and the current recommendation already reaches that upper limit.`,
          `地图排布上限为 ${layoutMaxSets} 套，当前推荐为 ${option.bracketSets} 套，已经触及场地上限。`,
        )
      : localized(
          lang,
          `The map layout allows up to ${layoutMaxSets} bracket sets, but the current recommendation uses ${option.bracketSets} sets because adding more sets did not improve the overall economics enough.`,
          `地图排布上限为 ${layoutMaxSets} 套，但当前推荐为 ${option.bracketSets} 套，说明继续增加套数并没有带来更好的综合经济性。`,
        ),
    accent: '#2b6cb0',
  };
}

function buildPerformanceBody(option: OptimizeOption, runnerUp: OptimizeOption | null, lang: Lang): string {
  const paybackGap = runnerUp ? Math.abs(option.paybackYears - runnerUp.paybackYears) : null;
  const annualSavingGap = runnerUp ? Math.abs(option.annualSavingsUsd - runnerUp.annualSavingsUsd) : null;

  if (runnerUp && paybackGap != null && paybackGap < 0.3 && annualSavingGap != null && annualSavingGap < 1000) {
    return localized(
      lang,
      'The top plans are close to each other. Plan 1 is only slightly ahead of Plan 2, so you can also compare site preference, budget, and diesel usage before final selection.',
      '前两名方案差距较小，方案 1 只是略优于方案 2，最终选择时也可以结合预算、用油量和现场偏好一起判断。',
    );
  }
  if (option.paybackYears <= 5 && option.solarFractionPct >= 70) {
    return localized(
      lang,
      `The current best plan stays in a strong range with about ${option.paybackYears} years payback and ${option.solarFractionPct}% solar fraction, balancing economics and diesel reduction.`,
      `当前最优方案处于较强区间，回本约 ${option.paybackYears} 年、太阳能占比 ${option.solarFractionPct}% ，经济性和降油耗比较平衡。`,
    );
  }
  if (option.paybackYears > 7) {
    return localized(
      lang,
      `The current site conditions lead to a relatively long payback of about ${option.paybackYears} years, so this recommendation is more conservative on investment recovery.`,
      `当前场景下回本约 ${option.paybackYears} 年，周期相对偏长，因此这次推荐会更偏向稳健回收而不是单纯做大配置。`,
    );
  }
  return localized(
    lang,
    `The recommendation prioritizes overall economics at about ${option.paybackYears} years payback, while keeping annual savings around $${option.annualSavingsUsd.toLocaleString()}.`,
    `推荐结果优先兼顾整体经济性，当前方案回本约 ${option.paybackYears} 年，年节省约 $${option.annualSavingsUsd.toLocaleString()}。`,
  );
}

function buildDieselBody(option: OptimizeOption, lang: Lang): string {
  if (option.dieselKw <= 0) {
    return localized(
      lang,
      'The recommended plan does not rely on diesel generation, which means the current load and PV-storage combination can be covered without adding a generator.',
      '当前推荐方案不依赖柴油发电，说明现有负荷在这组光储配置下可以不新增柴发。',
    );
  }
  if (option.dieselIsNew) {
    return localized(
      lang,
      `This recommendation includes a new ${option.dieselKw} kW diesel generator because the load profile still needs generator support for reliability and coverage.`,
      `当前推荐包含一台新的 ${option.dieselKw} kW 柴发，说明该负荷场景下仍需要发电机参与兜底和可靠性保障。`,
    );
  }
  return localized(
    lang,
    `This recommendation continues using the existing ${option.dieselKw} kW diesel generator and reduces fuel use to about ${option.annualDieselLiters.toLocaleString()} L/year.`,
    `当前推荐沿用现有 ${option.dieselKw} kW 柴发，并将年柴油消耗压到约 ${option.annualDieselLiters.toLocaleString()} L。`,
  );
}

function buildDynamicNotes(
  option: OptimizeOption | undefined,
  runnerUp: OptimizeOption | null,
  layoutMaxSets: number | null,
  lang: Lang,
): DynamicNote[] {
  if (!option) return [];

  const notes = [
    buildSizingNote(option, layoutMaxSets, lang),
    {
      title: localized(lang, 'Performance', '方案表现'),
      body: buildPerformanceBody(option, runnerUp, lang),
      accent: '#276749',
    },
    {
      title: localized(lang, 'Diesel Strategy', '柴发策略'),
      body: buildDieselBody(option, lang),
      accent: '#744210',
    },
  ];
  if (option.curtailmentPct > 0.5) {
    notes.push({
      title: localized(lang, 'Curtailment', '弃光说明'),
      body: localized(
        lang,
        `This plan has about ${option.curtailmentPct}% PV curtailment, meaning some solar energy is available but cannot be absorbed by the load or battery. It is not a fault; it usually means PV capacity is intentionally sized higher for fuel reduction and reliability.`,
        `该方案弃光率约 ${option.curtailmentPct}%，表示有一部分光伏可发电量未被负载或电池吸收。这不是故障，通常说明为了节油和可靠性，光伏容量留有一定冗余。`,
      ),
      accent: '#805ad5',
    });
  }
  return notes;
}

function buildMetricExplanations(lang: Lang, recommendedFuelSavingPct: number) {
  return [
    {
      title: localized(lang, 'Solar Share', '太阳能占比'),
      body: localized(lang, 'The share of annual load served by utilized PV energy. Curtailed PV is excluded, so the value is capped at 100%.', '表示全年负载中由实际利用的光伏电量覆盖的比例。弃光不计入，因此不会超过 100%。'),
    },
    {
      title: localized(lang, 'Fuel Saving Rate', '节油率'),
      body: localized(lang, `Compared with diesel-only operation: (diesel-only fuel - microgrid fuel) / diesel-only fuel. The current recommendation is about ${recommendedFuelSavingPct}%.`, `相对纯柴油供电的节油比例，公式为：（纯柴油年耗油 - 微电网年耗油）/ 纯柴油年耗油。当前推荐约 ${recommendedFuelSavingPct}%。`),
    },
    {
      title: localized(lang, 'Curtailment', '弃光率'),
      body: localized(lang, 'The portion of available PV generation that cannot be used or stored. Higher curtailment means more solar surplus, not necessarily a system problem.', '表示光伏可发电量中无法被负载消纳、也无法存入电池的比例。弃光偏高代表光伏有富余，不一定是系统异常。'),
    },
    {
      title: localized(lang, 'Payback', '回本周期'),
      body: localized(lang, 'Estimated selling price divided by annual operating-cost savings versus diesel-only operation.', '按方案售价除以相对纯柴油方案的年运行成本节省估算，用于比较投资回收速度。'),
    },
  ];
}

function PlanMetrics({ opt, lang, t }: { opt: OptimizeOption; lang: Lang; t: Translate }) {
  const payColor = opt.paybackYears <= 5 ? '#276749' : opt.paybackYears <= 7 ? '#92400e' : '#c53030';
  const dieselUse = formatVolumeDual(opt.annualDieselLiters, lang);
  const fuelSavingPct = opt.annualDieselOnlyLiters > 0
    ? Math.max(0, Math.min(100, Math.round((1 - opt.annualDieselLiters / opt.annualDieselOnlyLiters) * 100)))
    : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.15rem' }}>
      <MetricBox label={t('plan.payback')} value={formatBreakevenYear(opt.paybackYears, lang)} color={payColor} />
      <MetricBox label={t('plan.solar_frac')} value={`${opt.solarFractionPct}%`} color={opt.solarFractionPct >= 70 ? '#276749' : '#92400e'} note={localized(lang, 'served load share', '覆盖负载比例')} />
      <MetricBox label={t('plan.npv')} value={`$${(opt.npv10yrUsd / 1000).toFixed(0)}k`} color={opt.npv10yrUsd > 0 ? '#276749' : '#c53030'} />
      <MetricBox label={t('plan.annual_saving')} value={`$${opt.annualSavingsUsd.toLocaleString()}`} color="#2b6cb0" />
      <MetricBox
        label={t('plan.diesel_usage')}
        value={<><div>{dieselUse.primary}</div><div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#718096' }}>{dieselUse.secondary}</div></>}
        color="#718096"
      />
      <MetricBox label={t('plan.fuel_saving')} value={`${fuelSavingPct}%`} color="#276749" note={localized(lang, 'vs diesel-only', '相对纯柴油')} />
      <MetricBox label={localized(lang, 'Curtailment', '弃光率')} value={`${opt.curtailmentPct ?? 0}%`} color={(opt.curtailmentPct ?? 0) > 15 ? '#92400e' : '#718096'} note={localized(lang, 'unused PV', '未消纳光伏')} />
    </div>
  );
}

function DieselSummary({ opt, lang, t }: { opt: OptimizeOption; lang: Lang; t: Translate }) {
  return (
    <>
      <div
        style={{
          background: opt.dieselIsNew ? '#fff5f5' : '#f0fff4',
          border: `1px solid ${opt.dieselIsNew ? '#fed7d7' : '#9ae6b4'}`,
          borderRadius: '10px',
          padding: '0.7rem 0.95rem',
          fontSize: '0.9rem',
          color: opt.dieselIsNew ? '#c53030' : '#276749',
          marginBottom: '1rem',
        }}
      >
        {localized(lang, 'Diesel', '柴发')} {opt.dieselKw} kW / {opt.dieselIsNew ? t('plan.diesel.new') : t('plan.diesel.existing')}
      </div>
      <div style={{ fontSize: '0.88rem', lineHeight: 1.65, color: '#718096', borderTop: '1px solid #edf2f7', paddingTop: '0.85rem', marginTop: 'auto' }}>
        {localized(lang, 'Diesel-only annual cost ~', '纯柴油年费用约 ')}
        ${opt.annualDieselOnlyCostUsd.toLocaleString()}
        {localized(lang, ', microgrid saves ~ ', '，微电网可节省约 ')}
        <strong style={{ color: '#276749' }}>
          ${opt.annualSavingsUsd.toLocaleString()}{localized(lang, '/yr', '/年')}
        </strong>
      </div>
    </>
  );
}

function SelectPlanButton({ isHover, isPending, isLoadingDetail, style, t, onClick }: {
  isHover: boolean;
  isPending: boolean;
  isLoadingDetail: boolean;
  style: PlanStyle;
  t: Translate;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoadingDetail}
      style={{
        width: '100%',
        padding: '0.95rem 1rem',
        borderRadius: '14px',
        border: 'none',
        background: isPending || isHover ? style.accent : style.bg,
        color: isPending || isHover ? '#fff' : style.accent,
        fontWeight: 700,
        fontSize: '1.02rem',
        cursor: isLoadingDetail ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        opacity: isLoadingDetail && !isPending ? 0.6 : 1,
        letterSpacing: '0.02em',
      }}
    >
      {isPending ? t('plan.loading_detail') : t('plan.select_btn')}
    </button>
  );
}

function PlanCard({
  opt,
  idx,
  style,
  isHover,
  isPending,
  isLoadingDetail,
  lang,
  t,
  onHover,
  onSelect,
}: {
  opt: OptimizeOption;
  idx: number;
  style: PlanStyle;
  isHover: boolean;
  isPending: boolean;
  isLoadingDetail: boolean;
  lang: Lang;
  t: Translate;
  onHover: (idx: number | null) => void;
  onSelect: (opt: OptimizeOption, idx: number) => void;
}) {
  const badgeLabel = opt.label || style.badgeLabel;

  return (
    <div
      onMouseEnter={() => onHover(idx)}
      onMouseLeave={() => onHover(null)}
      style={{
        background: '#fff',
        borderRadius: '14px',
        border: `2px solid ${isHover ? style.accent : '#e2e8f0'}`,
        boxShadow: isHover ? `0 16px 48px ${style.accent}32` : '0 8px 24px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
        transition: 'all 0.22s',
        transform: isHover ? 'translateY(-6px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '620px',
      }}
    >
      <div style={{ background: style.accent, padding: '1.45rem 1.7rem', color: '#fff' }}>
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.22)',
            borderRadius: '999px',
            padding: '5px 14px',
            fontSize: '0.8rem',
            fontWeight: 700,
            marginBottom: '0.7rem',
            letterSpacing: '0.04em',
          }}
        >
          {badgeLabel}
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.4rem', lineHeight: 1.2 }}>
          {opt.bracketSets} {localized(lang, 'Bracket Sets', '套折叠支架')}
        </div>
        <div style={{ fontSize: '0.96rem', opacity: 0.92, lineHeight: 1.5 }}>
          {opt.pvKw.toFixed(1)} kWp PV / {opt.batteryKwh} kWh {localized(lang, 'Storage', '储能')} / {opt.dieselKw} kW {localized(lang, 'Diesel', '柴发')}
        </div>
      </div>

      <div style={{ padding: '1.6rem 1.7rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <PlanMetrics opt={opt} lang={lang} t={t} />
        <DieselSummary opt={opt} lang={lang} t={t} />
      </div>

      <div style={{ padding: '0 1.7rem 1.7rem' }}>
        <SelectPlanButton
          isHover={isHover}
          isPending={isPending}
          isLoadingDetail={isLoadingDetail}
          style={style}
          t={t}
          onClick={() => onSelect(opt, idx)}
        />
      </div>
    </div>
  );
}

function LoadingOverlay({ lang }: { lang: Lang }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.35)',
    }}>
      <div style={{
        width: '320px',
        background: 'rgba(255,255,255,0.95)',
        borderRadius: '14px',
        padding: '1.5rem 1.75rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1a365d', marginBottom: '0.75rem' }}>
          {localized(lang, 'Running detailed simulation...', '正在运行精算仿真...')}
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
          {localized(lang, '8760-hour energy simulation in progress, generating detailed economic report...', '正在进行 8760 小时能量仿真，生成详细经济报告...')}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ annualLoadKwh, dieselKw, isLoadingDetail, lang, t, onBack }: {
  annualLoadKwh: number;
  dieselKw: number;
  isLoadingDetail: boolean;
  lang: Lang;
  t: Translate;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        background: '#1a365d',
        padding: '0.85rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <button
        onClick={onBack}
        disabled={isLoadingDetail}
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff',
          borderRadius: '8px',
          padding: '0.4rem 1rem',
          cursor: isLoadingDetail ? 'not-allowed' : 'pointer',
          fontSize: '0.87rem',
          opacity: isLoadingDetail ? 0.5 : 1,
        }}
      >
        {t('btn.back_modify')}
      </button>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.04em' }}>
        {t('plan.title')}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
        {localized(lang, 'Annual Load', '年用电量')} {annualLoadKwh.toLocaleString()} kWh / {localized(lang, 'Diesel', '柴发')} {dieselKw} kW
      </div>
    </div>
  );
}

export default function PlanSelectionPage({
  options,
  dieselKw,
  annualLoadKwh,
  layoutMaxSets,
  isLoadingDetail,
  onSelect,
  onBack,
}: PlanSelectionPageProps) {
  const { t, lang } = useLang();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);

  const displayOptions = getDisplayOptions(options);
  const recommendedOption = options.find(o => o.isRecommended) ?? options[0];
  const runnerUpOption = options.find(o => o.isRunnerUp) ?? options[1] ?? null;
  const displayLayoutMaxSets = typeof layoutMaxSets === 'number' && layoutMaxSets > 0 ? layoutMaxSets : null;
  const recommendedFuelSavingPct = recommendedOption?.annualDieselOnlyLiters > 0
    ? Math.max(0, Math.min(100, Math.round((1 - recommendedOption.annualDieselLiters / recommendedOption.annualDieselOnlyLiters) * 100)))
    : 0;

  const planStyles = getPlanStyles(t);
  const dynamicNotes = buildDynamicNotes(recommendedOption, runnerUpOption, displayLayoutMaxSets, lang);
  const metricExplanations = buildMetricExplanations(lang, recommendedFuelSavingPct);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f0f4f8 0%, #e8f4fd 100%)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* 精算加载遮罩 */}
      {isLoadingDetail && <LoadingOverlay lang={lang} />}
      <PageHeader
        annualLoadKwh={annualLoadKwh}
        dieselKw={dieselKw}
        isLoadingDetail={isLoadingDetail}
        lang={lang}
        t={t}
        onBack={onBack}
      />

      <div
        style={{
          flex: 1,
          padding: '1rem 1.4rem 1.6rem',
          maxWidth: '1880px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1a365d', margin: '0 0 0.5rem' }}>
            {lang === 'en'
              ? `System Recommends ${displayOptions.length} Plans for You`
              : `系统为您推荐以下 ${displayOptions.length} 套方案`}
          </h2>
          <p style={{ color: '#718096', fontSize: '0.97rem', margin: 0 }}>
            {displayLayoutMaxSets != null && recommendedOption
              ? (lang === 'en'
                  ? `Map layout limit: ${displayLayoutMaxSets} sets. Current recommendation: ${recommendedOption.bracketSets} sets.`
                  : `地图排布上限：${displayLayoutMaxSets} 套。当前推荐：${recommendedOption.bracketSets} 套。`)
              : t('plan.subtitle')}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${displayOptions.length}, minmax(0, 1fr))`,
            gap: '1.3rem',
            marginBottom: '1rem',
            alignItems: 'stretch',
            maxWidth: '1680px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {displayOptions.map((opt, idx) => {
            const style = getPlanStyle(opt, idx, planStyles);
            return (
              <PlanCard
                key={opt.bracketSets}
                opt={opt}
                idx={idx}
                style={style}
                isHover={hoveredIdx === idx}
                isPending={pendingIdx === idx && isLoadingDetail}
                isLoadingDetail={isLoadingDetail}
                lang={lang}
                t={t}
                onHover={setHoveredIdx}
                onSelect={(selected, selectedIdx) => {
                  if (isLoadingDetail) return;
                  setPendingIdx(selectedIdx);
                  onSelect(selected);
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '1.35rem 1.8rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.05)',
            maxWidth: '1680px',
            margin: '0 auto',
          }}
        >
          <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
            {t('plan.notes.title')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Math.max(dynamicNotes.length, 1), 4)}, minmax(0, 1fr))`, gap: '1.3rem', fontSize: '0.9rem', color: '#4a5568', lineHeight: 1.7 }}>
            {dynamicNotes.map(note => (
              <div key={note.title} style={{ paddingRight: '0.35rem' }}>
                <div style={{ fontWeight: 700, color: note.accent, marginBottom: '0.3rem' }}>{note.title}</div>
                <div>{note.body}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1.1rem', paddingTop: '1rem', borderTop: '1px solid #edf2f7' }}>
            <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.65rem', fontSize: '0.95rem' }}>
              {lang === 'en' ? 'Metric Definitions' : '指标含义'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem', fontSize: '0.84rem', color: '#4a5568', lineHeight: 1.6 }}>
              {metricExplanations.map(item => (
                <div key={item.title} style={{ background: '#f8fafc', border: '1px solid #edf2f7', borderRadius: '8px', padding: '0.75rem 0.85rem' }}>
                  <div style={{ fontWeight: 700, color: '#2d3748', marginBottom: '0.3rem' }}>{item.title}</div>
                  <div>{item.body}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: '0.85rem', fontSize: '0.82rem', color: '#a0aec0', borderTop: '1px solid #f0f0f0', paddingTop: '0.7rem' }}>
            {t('plan.auto_report')}
          </div>
        </div>
      </div>
    </div>
  );
}
