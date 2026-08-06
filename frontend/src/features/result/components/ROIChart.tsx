/**
 * ROIChart.tsx — Microgrid vs Diesel-only cumulative cost comparison chart
 */
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { ComparisonRow } from '@/types/index';
import { useLang } from '@/context/LangContext';
import './ROIChart.css';

interface ROIChartProps {
  comparisonTable: ComparisonRow[];
  breakevenYear: number | null;
  lcoeCrossoverYear: number | null;
  sellingPrice: number;
}

export default function ROIChart({
  comparisonTable,
  breakevenYear,
  lcoeCrossoverYear,
  sellingPrice,
}: ROIChartProps) {
  const { lang } = useLang();

  const L = {
    title:         lang === 'en' ? 'ROI Curve (Microgrid vs Diesel-only)' : '投资回报曲线（微电网 vs 纯柴油）',
    noData:        lang === 'en' ? 'No data available' : '暂无数据',
    titleShort:    lang === 'en' ? 'ROI Curve' : '投资回报曲线',
    totalCapex:    lang === 'en' ? 'Total Investment' : '系统总投资',
    payback:       lang === 'en' ? 'Payback Year' : '回本年限',
    yearLabel:     lang === 'en' ? 'Yr ' : '第 ',
    yearSuffix:    lang === 'en' ? '' : ' 年',
    lcoeCross:     lang === 'en' ? 'LCOE Crossover' : 'LCOE 交叉年',
    cumCost:       lang === 'en' ? 'Cumulative Cost Comparison (USD)' : '累计总投入对比（USD）',
    xAxis:         lang === 'en' ? 'Year' : '年份',
    yAxis:         lang === 'en' ? 'USD (K)' : 'USD（千）',
    mgCumul:       lang === 'en' ? 'MG Cumulative' : '微电网累计投入',
    dieselCumul:   lang === 'en' ? 'Diesel Cumulative' : '纯柴油累计投入',
    cumulRev:      lang === 'en' ? 'Cumulative Revenue (positive = break-even)' : '累计收益（正=回本）',
    lcoeCmp:       lang === 'en' ? 'LCOE Comparison ($/kWh)' : '度电成本 LCOE 对比（$/kWh）',
    mgLcoe:        lang === 'en' ? 'MG LCOE' : '微电网 LCOE',
    dieselLcoe:    lang === 'en' ? 'Diesel LCOE' : '纯柴油 LCOE',
    note1:         lang === 'en' ? 'MG Cumulative = initial CAPEX + annual O&M + fuel cost' : '微电网累计投入 = 初始 CAPEX + 历年运维 + 燃料成本',
    note2:         lang === 'en' ? 'Diesel Cumulative = annual O&M + fuel cost (no CAPEX spread)' : '纯柴油累计投入 = 历年柴油发电机运维 + 燃料成本（无初始投资分摊）',
    note3:         lang === 'en' ? 'Cumulative Revenue = Diesel Cumulative − MG Cumulative (positive = break-even)' : '累计收益 = 纯柴油累计投入 − 微电网累计投入（正值表示已回本）',
    note4:         lang === 'en' ? 'LCOE Crossover = year when MG cost per kWh first drops below diesel' : 'LCOE 交叉 = 微电网每度电成本首次低于纯柴油的年份',
  };

  if (!comparisonTable || comparisonTable.length === 0) {
    return (
      <div className="roi-chart-container">
        <h3 className="chart-title">{L.titleShort}</h3>
        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>{L.noData}</p>
      </div>
    );
  }

  const chartData = comparisonTable.map(row => ({
    year: row.year,
    [L.mgCumul]:     Math.round(row.mgCumulative),
    [L.dieselCumul]: Math.round(row.dieselCumulative),
    [L.cumulRev]:    Math.round(row.cumulativeRevenue),
    [L.mgLcoe]:      row.mgLcoe,
    [L.dieselLcoe]:  row.dieselLcoe,
  }));

  const fmtUsd = (v: number | undefined) => {
    if (v === undefined || v === null) return '';
    return `$${Math.round(v).toLocaleString()}`;
  };

  return (
    <div className="roi-chart-container">
      <h3 className="chart-title">{L.title}</h3>

      <div className="chart-info-bar">
        <div className="chart-badge">
          <span className="badge-label">{L.totalCapex}</span>
          <span className="badge-value">${sellingPrice.toLocaleString()}</span>
        </div>
        {breakevenYear && (
          <div className="chart-badge success">
            <span className="badge-label">{L.payback}</span>
            <span className="badge-value">{L.yearLabel}{breakevenYear}{L.yearSuffix}</span>
          </div>
        )}
        {lcoeCrossoverYear && (
          <div className="chart-badge info">
            <span className="badge-label">{L.lcoeCross}</span>
            <span className="badge-value">{L.yearLabel}{lcoeCrossoverYear}{L.yearSuffix}</span>
          </div>
        )}
      </div>

      {/* Cumulative cost comparison */}
      <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#4a5568', fontSize: '0.9rem' }}>
        {L.cumCost}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" label={{ value: L.xAxis, position: 'insideBottom', offset: -2, fontSize: 12 }} />
          <YAxis
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            label={{ value: L.yAxis, angle: -90, position: 'insideLeft', fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: any, name: string) => [fmtUsd(Number(value)), name]}
            labelFormatter={label => `${L.yearLabel}${label}${L.yearSuffix}`}
          />
          <Legend />
          {breakevenYear && (
            <ReferenceLine
              x={breakevenYear}
              stroke="#48678c"
              strokeDasharray="4 4"
              label={{ value: `${lang === 'en' ? 'Breakeven' : '回本'} Y${breakevenYear}`, fill: '#1a365d', fontSize: 11 }}
            />
          )}
          <Area
            type="monotone"
            dataKey={L.dieselCumul}
            fill="#efe3e3"
            stroke="#b77979"
            strokeWidth={2}
            fillOpacity={0.5}
            name={L.dieselCumul}
          />
          <Line
            type="monotone"
            dataKey={L.mgCumul}
            stroke="#2c5282"
            strokeWidth={2.5}
            dot={false}
            name={L.mgCumul}
          />
          <Line
            type="monotone"
            dataKey={L.cumulRev}
            stroke="#48678c"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
            name={L.cumulRev}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* LCOE comparison */}
      <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontWeight: 600, color: '#4a5568', fontSize: '0.9rem' }}>
        {L.lcoeCmp}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={v => `$${Number(v).toFixed(2)}`} />
          <Tooltip
            formatter={(v: any, name: string) => [`$${Number(v).toFixed(3)}/kWh`, name]}
            labelFormatter={label => `${L.yearLabel}${label}${L.yearSuffix}`}
          />
          <Legend />
          {lcoeCrossoverYear && (
            <ReferenceLine
              x={lcoeCrossoverYear}
              stroke="#946c38"
              strokeDasharray="4 4"
              label={{ value: `${lang === 'en' ? 'LCOE Crossover' : 'LCOE交叉'} Y${lcoeCrossoverYear}`, fill: '#7b5b2f', fontSize: 11 }}
            />
          )}
          <Line
            type="monotone"
            dataKey={L.mgLcoe}
            stroke="#2c5282"
            strokeWidth={2}
            dot={false}
            name={L.mgLcoe}
          />
          <Line
            type="monotone"
            dataKey={L.dieselLcoe}
            stroke="#b77979"
            strokeWidth={2}
            dot={false}
            name={L.dieselLcoe}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-notes">
        <p>• <strong>{L.mgCumul}</strong>: {L.note1}</p>
        <p>• <strong>{L.dieselCumul}</strong>: {L.note2}</p>
        <p>• <strong>{lang === 'en' ? 'Cumulative Revenue' : '累计收益'}</strong>: {L.note3}</p>
        <p>• <strong>{L.lcoeCross}</strong>: {L.note4}</p>
      </div>
    </div>
  );
}
