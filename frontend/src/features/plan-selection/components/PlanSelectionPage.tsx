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

  const topOptions = options.filter(o => o.isRecommended || o.isRunnerUp || o.isThird).slice(0, 3);
  const displayOptions = topOptions.length >= 3 ? topOptions : options.slice(0, Math.min(3, options.length));
  const recommendedOption = options.find(o => o.isRecommended) ?? options[0];
  const runnerUpOption = options.find(o => o.isRunnerUp) ?? options[1] ?? null;
  const displayLayoutMaxSets = typeof layoutMaxSets === 'number' && layoutMaxSets > 0 ? layoutMaxSets : null;
  const recommendedFuelSavingPct = recommendedOption?.annualDieselOnlyLiters > 0
    ? Math.max(0, Math.min(100, Math.round((1 - recommendedOption.annualDieselLiters / recommendedOption.annualDieselOnlyLiters) * 100)))
    : 0;

  const planStyles = [
    { accent: '#2b6cb0', bg: '#ebf8ff', badgeLabel: t('plan.badge.best') },
    { accent: '#276749', bg: '#f0fff4', badgeLabel: t('plan.badge.second') },
    { accent: '#744210', bg: '#fffde7', badgeLabel: t('plan.badge.third') },
  ];

  function getStyle(opt: OptimizeOption, idx: number) {
    if (opt.isRecommended) return planStyles[0];
    if (opt.isRunnerUp) return planStyles[1];
    if (opt.isThird) return planStyles[2];
    return planStyles[idx] ?? planStyles[2];
  }

  function handleSelect(opt: OptimizeOption, idx: number) {
    if (isLoadingDetail) return;
    setPendingIdx(idx);
    onSelect(opt);
  }

  const dynamicNotes = (() => {
    if (!recommendedOption) return [];

    const notes: Array<{ title: string; body: string; accent: string }> = [];

    if (displayLayoutMaxSets != null) {
      const hitsLayoutCap = recommendedOption.bracketSets >= displayLayoutMaxSets;
      notes.push({
        title: lang === 'en' ? 'Site Limit' : '场地约束',
        body: hitsLayoutCap
          ? (lang === 'en'
              ? `The map layout allows up to ${displayLayoutMaxSets} bracket sets, and the current recommendation already reaches that upper limit.`
              : `地图排布上限为 ${displayLayoutMaxSets} 套，当前推荐为 ${recommendedOption.bracketSets} 套，已经触及场地上限。`)
          : (lang === 'en'
              ? `The map layout allows up to ${displayLayoutMaxSets} bracket sets, but the current recommendation uses ${recommendedOption.bracketSets} sets because adding more sets did not improve the overall economics enough.`
              : `地图排布上限为 ${displayLayoutMaxSets} 套，但当前推荐为 ${recommendedOption.bracketSets} 套，说明继续增加套数并没有带来更好的综合经济性。`),
        accent: '#2b6cb0',
      });
    } else {
      notes.push({
        title: lang === 'en' ? 'Sizing Basis' : '推荐依据',
        body: lang === 'en'
          ? `The current recommendation uses ${recommendedOption.bracketSets} bracket sets after comparing payback, solar share, diesel reduction, and annual savings across the refined candidate plans.`
          : `当前推荐方案采用 ${recommendedOption.bracketSets} 套支架，是在入围精算候选中综合比较回本周期、太阳能占比、节油率和年节省后得到的结果。`,
        accent: '#2b6cb0',
      });
    }

    const paybackGap = runnerUpOption
      ? Math.abs(recommendedOption.paybackYears - runnerUpOption.paybackYears)
      : null;
    const annualSavingGap = runnerUpOption
      ? Math.abs(recommendedOption.annualSavingsUsd - runnerUpOption.annualSavingsUsd)
      : null;

    let performanceBody: string;
    if (runnerUpOption && paybackGap != null && paybackGap < 0.3 && annualSavingGap != null && annualSavingGap < 1000) {
      performanceBody = lang === 'en'
        ? 'The top plans are close to each other. Plan 1 is only slightly ahead of Plan 2, so you can also compare site preference, budget, and diesel usage before final selection.'
        : '前两名方案差距较小，方案 1 只是略优于方案 2，最终选择时也可以结合预算、用油量和现场偏好一起判断。';
    } else if (recommendedOption.paybackYears <= 5 && recommendedOption.solarFractionPct >= 70) {
      performanceBody = lang === 'en'
        ? `The current best plan stays in a strong range with about ${recommendedOption.paybackYears} years payback and ${recommendedOption.solarFractionPct}% solar fraction, balancing economics and diesel reduction.`
        : `当前最优方案处于较强区间，回本约 ${recommendedOption.paybackYears} 年、太阳能占比 ${recommendedOption.solarFractionPct}% ，经济性和降油耗比较平衡。`;
    } else if (recommendedOption.paybackYears > 7) {
      performanceBody = lang === 'en'
        ? `The current site conditions lead to a relatively long payback of about ${recommendedOption.paybackYears} years, so this recommendation is more conservative on investment recovery.`
        : `当前场景下回本约 ${recommendedOption.paybackYears} 年，周期相对偏长，因此这次推荐会更偏向稳健回收而不是单纯做大配置。`;
    } else {
      performanceBody = lang === 'en'
        ? `The recommendation prioritizes overall economics at about ${recommendedOption.paybackYears} years payback, while keeping annual savings around $${recommendedOption.annualSavingsUsd.toLocaleString()}.`
        : `推荐结果优先兼顾整体经济性，当前方案回本约 ${recommendedOption.paybackYears} 年，年节省约 $${recommendedOption.annualSavingsUsd.toLocaleString()}。`;
    }

    notes.push({
      title: lang === 'en' ? 'Performance' : '方案表现',
      body: performanceBody,
      accent: '#276749',
    });

    let dieselBody: string;
    if (recommendedOption.dieselKw <= 0) {
      dieselBody = lang === 'en'
        ? 'The recommended plan does not rely on diesel generation, which means the current load and PV-storage combination can be covered without adding a generator.'
        : '当前推荐方案不依赖柴油发电，说明现有负荷在这组光储配置下可以不新增柴发。';
    } else if (recommendedOption.dieselIsNew) {
      dieselBody = lang === 'en'
        ? `This recommendation includes a new ${recommendedOption.dieselKw} kW diesel generator because the load profile still needs generator support for reliability and coverage.`
        : `当前推荐包含一台新的 ${recommendedOption.dieselKw} kW 柴发，说明该负荷场景下仍需要发电机参与兜底和可靠性保障。`;
    } else {
      dieselBody = lang === 'en'
        ? `This recommendation continues using the existing ${recommendedOption.dieselKw} kW diesel generator and reduces fuel use to about ${recommendedOption.annualDieselLiters.toLocaleString()} L/year.`
        : `当前推荐沿用现有 ${recommendedOption.dieselKw} kW 柴发，并将年柴油消耗压到约 ${recommendedOption.annualDieselLiters.toLocaleString()} L。`;
    }

    notes.push({
      title: lang === 'en' ? 'Diesel Strategy' : '柴发策略',
      body: dieselBody,
      accent: '#744210',
    });

    if (recommendedOption.curtailmentPct > 0.5) {
      notes.push({
        title: lang === 'en' ? 'Curtailment' : '弃光说明',
        body: lang === 'en'
          ? `This plan has about ${recommendedOption.curtailmentPct}% PV curtailment, meaning some solar energy is available but cannot be absorbed by the load or battery. It is not a fault; it usually means PV capacity is intentionally sized higher for fuel reduction and reliability.`
          : `该方案弃光率约 ${recommendedOption.curtailmentPct}%，表示有一部分光伏可发电量未被负载或电池吸收。这不是故障，通常说明为了节油和可靠性，光伏容量留有一定冗余。`,
        accent: '#805ad5',
      });
    }

    return notes;
  })();

  const metricExplanations = [
    {
      title: lang === 'en' ? 'Solar Share' : '太阳能占比',
      body: lang === 'en'
        ? 'The share of annual load served by utilized PV energy. Curtailed PV is excluded, so the value is capped at 100%.'
        : '表示全年负载中由实际利用的光伏电量覆盖的比例。弃光不计入，因此不会超过 100%。',
    },
    {
      title: lang === 'en' ? 'Fuel Saving Rate' : '节油率',
      body: lang === 'en'
        ? `Compared with diesel-only operation: (diesel-only fuel - microgrid fuel) / diesel-only fuel. The current recommendation is about ${recommendedFuelSavingPct}%.`
        : `相对纯柴油供电的节油比例，公式为：（纯柴油年耗油 - 微电网年耗油）/ 纯柴油年耗油。当前推荐约 ${recommendedFuelSavingPct}%。`,
    },
    {
      title: lang === 'en' ? 'Curtailment' : '弃光率',
      body: lang === 'en'
        ? 'The portion of available PV generation that cannot be used or stored. Higher curtailment means more solar surplus, not necessarily a system problem.'
        : '表示光伏可发电量中无法被负载消纳、也无法存入电池的比例。弃光偏高代表光伏有富余，不一定是系统异常。',
    },
    {
      title: lang === 'en' ? 'Payback' : '回本周期',
      body: lang === 'en'
        ? 'Estimated selling price divided by annual operating-cost savings versus diesel-only operation.'
        : '按方案售价除以相对纯柴油方案的年运行成本节省估算，用于比较投资回收速度。',
    },
  ];

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
      {isLoadingDetail && (
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
              {lang === 'en' ? 'Running detailed simulation...' : '正在运行精算仿真...'}
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
                ? '8760-hour energy simulation in progress, generating detailed economic report...'
                : '正在进行 8760 小时能量仿真，生成详细经济报告...'}
            </div>
          </div>
        </div>
      )}
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
          {lang === 'en' ? 'Annual Load' : '年用电量'} {annualLoadKwh.toLocaleString()} kWh / {lang === 'en' ? 'Diesel' : '柴发'} {dieselKw} kW
        </div>
      </div>

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
            const style = getStyle(opt, idx);
            const isHover = hoveredIdx === idx;
            const isPending = pendingIdx === idx && isLoadingDetail;
            const payColor = opt.paybackYears <= 5 ? '#276749' : opt.paybackYears <= 7 ? '#92400e' : '#c53030';
            const dieselUse = formatVolumeDual(opt.annualDieselLiters, lang);
            const fuelSavingPct = opt.annualDieselOnlyLiters > 0
              ? Math.max(0, Math.min(100, Math.round((1 - opt.annualDieselLiters / opt.annualDieselOnlyLiters) * 100)))
              : 0;
            const badgeLabel = opt.label || style.badgeLabel;

            return (
              <div
                key={opt.bracketSets}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
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
                    {opt.bracketSets} {lang === 'en' ? 'Bracket Sets' : '套折叠支架'}
                  </div>
                  <div style={{ fontSize: '0.96rem', opacity: 0.92, lineHeight: 1.5 }}>
                    {opt.pvKw.toFixed(1)} kWp PV / {opt.batteryKwh} kWh {lang === 'en' ? 'Storage' : '储能'} / {opt.dieselKw} kW {lang === 'en' ? 'Diesel' : '柴发'}
                  </div>
                </div>

                <div style={{ padding: '1.6rem 1.7rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.15rem' }}>
                    <MetricBox label={t('plan.payback')} value={formatBreakevenYear(opt.paybackYears, lang)} color={payColor} />
                    <MetricBox
                      label={t('plan.solar_frac')}
                      value={`${opt.solarFractionPct}%`}
                      color={opt.solarFractionPct >= 70 ? '#276749' : '#92400e'}
                      note={lang === 'en' ? 'served load share' : '覆盖负载比例'}
                    />
                    <MetricBox label={t('plan.npv')} value={`$${(opt.npv10yrUsd / 1000).toFixed(0)}k`} color={opt.npv10yrUsd > 0 ? '#276749' : '#c53030'} />
                    <MetricBox label={t('plan.annual_saving')} value={`$${opt.annualSavingsUsd.toLocaleString()}`} color="#2b6cb0" />
                    <MetricBox
                      label={t('plan.diesel_usage')}
                      value={(
                        <>
                          <div>{dieselUse.primary}</div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#718096' }}>{dieselUse.secondary}</div>
                        </>
                      )}
                      color="#718096"
                    />
                    <MetricBox
                      label={t('plan.fuel_saving')}
                      value={`${fuelSavingPct}%`}
                      color="#276749"
                      note={lang === 'en' ? 'vs diesel-only' : '相对纯柴油'}
                    />
                    <MetricBox
                      label={lang === 'en' ? 'Curtailment' : '弃光率'}
                      value={`${opt.curtailmentPct ?? 0}%`}
                      color={(opt.curtailmentPct ?? 0) > 15 ? '#92400e' : '#718096'}
                      note={lang === 'en' ? 'unused PV' : '未消纳光伏'}
                    />
                  </div>

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
                    {lang === 'en' ? 'Diesel' : '柴发'} {opt.dieselKw} kW / {opt.dieselIsNew ? t('plan.diesel.new') : t('plan.diesel.existing')}
                  </div>

                  <div style={{ fontSize: '0.88rem', lineHeight: 1.65, color: '#718096', borderTop: '1px solid #edf2f7', paddingTop: '0.85rem', marginTop: 'auto' }}>
                    {lang === 'en' ? 'Diesel-only annual cost ~' : '纯柴油年费用约 '}
                    ${opt.annualDieselOnlyCostUsd.toLocaleString()}
                    {lang === 'en' ? ', microgrid saves ~ ' : '，微电网可节省约 '}
                    <strong style={{ color: '#276749' }}>
                      ${opt.annualSavingsUsd.toLocaleString()}{lang === 'en' ? '/yr' : '/年'}
                    </strong>
                  </div>
                </div>

                <div style={{ padding: '0 1.7rem 1.7rem' }}>
                  <button
                    onClick={() => handleSelect(opt, idx)}
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
                </div>
              </div>
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
