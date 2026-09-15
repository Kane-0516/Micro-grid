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

type Lang = ReturnType<typeof useLang>['lang'];

function localized(lang: Lang, english: string, chinese: string): string {
  return lang === 'en' ? english : chinese;
}

function getLabels(lang: Lang) {
  return {
    title: localized(lang, 'ROI Curve (Microgrid vs Diesel-only)', '投资回报曲线（微电网 vs 纯柴油）'),
    noData: localized(lang, 'No data available', '暂无数据'),
    titleShort: localized(lang, 'ROI Curve', '投资回报曲线'),
    totalCapex: localized(lang, 'Total Investment', '系统总投资'),
    payback: localized(lang, 'Payback Year', '回本年限'),
    yearLabel: localized(lang, 'Yr ', '第 '),
    yearSuffix: localized(lang, '', ' 年'),
    lcoeCross: localized(lang, 'LCOE Crossover', 'LCOE 交叉年'),
    cumCost: localized(lang, 'Cumulative Cost Comparison (USD)', '累计总投入对比（USD）'),
    xAxis: localized(lang, 'Year', '年份'),
    yAxis: localized(lang, 'USD (K)', 'USD（千）'),
    mgCumul: localized(lang, 'MG Cumulative', '微电网累计投入'),
    dieselCumul: localized(lang, 'Diesel Cumulative', '纯柴油累计投入'),
    cumulRev: localized(lang, 'Cumulative Revenue (positive = break-even)', '累计收益（正=回本）'),
    lcoeCmp: localized(lang, 'LCOE Comparison ($/kWh)', '度电成本 LCOE 对比（$/kWh）'),
    mgLcoe: localized(lang, 'MG LCOE', '微电网 LCOE'),
    dieselLcoe: localized(lang, 'Diesel LCOE', '纯柴油 LCOE'),
    note1: localized(lang, 'MG Cumulative = initial CAPEX + annual O&M + fuel cost', '微电网累计投入 = 初始 CAPEX + 历年运维 + 燃料成本'),
    note2: localized(lang, 'Diesel Cumulative = annual O&M + fuel cost (no CAPEX spread)', '纯柴油累计投入 = 历年柴油发电机运维 + 燃料成本（无初始投资分摊）'),
    note3: localized(lang, 'Cumulative Revenue = Diesel Cumulative − MG Cumulative (positive = break-even)', '累计收益 = 纯柴油累计投入 − 微电网累计投入（正值表示已回本）'),
    note4: localized(lang, 'LCOE Crossover = year when MG cost per kWh first drops below diesel', 'LCOE 交叉 = 微电网每度电成本首次低于纯柴油的年份'),
  };
}

type Labels = ReturnType<typeof getLabels>;
type ChartData = Record<string, string | number>[];

function buildChartData(comparisonTable: ComparisonRow[], labels: Labels): ChartData {
  return comparisonTable.map(row => ({
    year: row.year,
    [labels.mgCumul]: Math.round(row.mgCumulative),
    [labels.dieselCumul]: Math.round(row.dieselCumulative),
    [labels.cumulRev]: Math.round(row.cumulativeRevenue),
    [labels.mgLcoe]: row.mgLcoe,
    [labels.dieselLcoe]: row.dieselLcoe,
  }));
}

function formatUsd(value: number | null | undefined): string {
  return value == null ? '' : `$${Math.round(value).toLocaleString()}`;
}

function NoData({ labels }: { labels: Labels }) {
  return (
    <div className="roi-chart-container">
      <h3 className="chart-title">{labels.titleShort}</h3>
      <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>{labels.noData}</p>
    </div>
  );
}

function ChartInfoBar({ labels, sellingPrice, breakevenYear, lcoeCrossoverYear }: {
  labels: Labels;
  sellingPrice: number;
  breakevenYear: number | null;
  lcoeCrossoverYear: number | null;
}) {
  return (
    <div className="chart-info-bar">
      <div className="chart-badge">
        <span className="badge-label">{labels.totalCapex}</span>
        <span className="badge-value">${sellingPrice.toLocaleString()}</span>
      </div>
      {breakevenYear && (
        <div className="chart-badge success">
          <span className="badge-label">{labels.payback}</span>
          <span className="badge-value">{labels.yearLabel}{breakevenYear}{labels.yearSuffix}</span>
        </div>
      )}
      {lcoeCrossoverYear && (
        <div className="chart-badge info">
          <span className="badge-label">{labels.lcoeCross}</span>
          <span className="badge-value">{labels.yearLabel}{lcoeCrossoverYear}{labels.yearSuffix}</span>
        </div>
      )}
    </div>
  );
}

function CumulativeCostChart({ chartData, labels, breakevenYear, lang }: {
  chartData: ChartData;
  labels: Labels;
  breakevenYear: number | null;
  lang: Lang;
}) {
  return (
    <>
      <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#4a5568', fontSize: '0.9rem' }}>
        {labels.cumCost}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" label={{ value: labels.xAxis, position: 'insideBottom', offset: -2, fontSize: 12 }} />
          <YAxis
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            label={{ value: labels.yAxis, angle: -90, position: 'insideLeft', fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: any, name: string) => [formatUsd(Number(value)), name]}
            labelFormatter={label => `${labels.yearLabel}${label}${labels.yearSuffix}`}
          />
          <Legend />
          {breakevenYear && (
            <ReferenceLine
              x={breakevenYear}
              stroke="#48678c"
              strokeDasharray="4 4"
              label={{ value: `${localized(lang, 'Breakeven', '回本')} Y${breakevenYear}`, fill: '#1a365d', fontSize: 11 }}
            />
          )}
          <Area
            type="monotone"
            dataKey={labels.dieselCumul}
            fill="#efe3e3"
            stroke="#b77979"
            strokeWidth={2}
            fillOpacity={0.5}
            name={labels.dieselCumul}
          />
          <Line
            type="monotone"
            dataKey={labels.mgCumul}
            stroke="#2c5282"
            strokeWidth={2.5}
            dot={false}
            name={labels.mgCumul}
          />
          <Line
            type="monotone"
            dataKey={labels.cumulRev}
            stroke="#48678c"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
            name={labels.cumulRev}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function LcoeChart({ chartData, labels, lcoeCrossoverYear, lang }: {
  chartData: ChartData;
  labels: Labels;
  lcoeCrossoverYear: number | null;
  lang: Lang;
}) {
  return (
    <>
      <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontWeight: 600, color: '#4a5568', fontSize: '0.9rem' }}>
        {labels.lcoeCmp}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={v => `$${Number(v).toFixed(2)}`} />
          <Tooltip
            formatter={(v: any, name: string) => [`$${Number(v).toFixed(3)}/kWh`, name]}
            labelFormatter={label => `${labels.yearLabel}${label}${labels.yearSuffix}`}
          />
          <Legend />
          {lcoeCrossoverYear && (
            <ReferenceLine
              x={lcoeCrossoverYear}
              stroke="#946c38"
              strokeDasharray="4 4"
              label={{ value: `${localized(lang, 'LCOE Crossover', 'LCOE交叉')} Y${lcoeCrossoverYear}`, fill: '#7b5b2f', fontSize: 11 }}
            />
          )}
          <Line
            type="monotone"
            dataKey={labels.mgLcoe}
            stroke="#2c5282"
            strokeWidth={2}
            dot={false}
            name={labels.mgLcoe}
          />
          <Line
            type="monotone"
            dataKey={labels.dieselLcoe}
            stroke="#b77979"
            strokeWidth={2}
            dot={false}
            name={labels.dieselLcoe}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function ChartNotes({ labels, lang }: { labels: Labels; lang: Lang }) {
  return (
    <div className="chart-notes">
      <p>• <strong>{labels.mgCumul}</strong>: {labels.note1}</p>
      <p>• <strong>{labels.dieselCumul}</strong>: {labels.note2}</p>
      <p>• <strong>{localized(lang, 'Cumulative Revenue', '累计收益')}</strong>: {labels.note3}</p>
      <p>• <strong>{labels.lcoeCross}</strong>: {labels.note4}</p>
    </div>
  );
}

export default function ROIChart({
  comparisonTable,
  breakevenYear,
  lcoeCrossoverYear,
  sellingPrice,
}: ROIChartProps) {
  const { lang } = useLang();
  const labels = getLabels(lang);

  if (!comparisonTable || comparisonTable.length === 0) {
    return <NoData labels={labels} />;
  }

  const chartData = buildChartData(comparisonTable, labels);
  return (
    <div className="roi-chart-container">
      <h3 className="chart-title">{labels.title}</h3>
      <ChartInfoBar
        labels={labels}
        sellingPrice={sellingPrice}
        breakevenYear={breakevenYear}
        lcoeCrossoverYear={lcoeCrossoverYear}
      />
      <CumulativeCostChart chartData={chartData} labels={labels} breakevenYear={breakevenYear} lang={lang} />
      <LcoeChart chartData={chartData} labels={labels} lcoeCrossoverYear={lcoeCrossoverYear} lang={lang} />
      <ChartNotes labels={labels} lang={lang} />
    </div>
  );
}
