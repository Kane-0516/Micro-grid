import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '@/types/index';
import { useLang } from '@/context/LangContext';

type SolarDieselAnalysis = SimulationResult['solarDieselAnalysis'];

interface SolarDieselAnalysisChartProps {
  analysis?: SolarDieselAnalysis | null;
}

const fmtNum = (value?: number | null, digits = 0) => (
  value == null ? '--' : value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
);

export default function SolarDieselAnalysisChart({ analysis }: SolarDieselAnalysisChartProps) {
  const { lang } = useLang();

  if (!analysis?.monthly || analysis.monthly.length === 0) {
    return null;
  }

  const labels = {
    title: lang === 'en' ? 'Solar Weather vs Diesel Runtime' : '日照气象与柴发运行关系',
    subtitle: lang === 'en'
      ? 'Monthly PV equivalent hours and diesel runtime are calculated from the hourly dispatch simulation for the selected weather/load base year.'
      : '月度光伏等效小时与柴发运行小时来自所选气象/负载基准年的小时级调度仿真。',
    annualHours: lang === 'en' ? 'Annual PV Eq. Hours' : '年等效满发小时',
    corr: lang === 'en' ? 'Inverse Correlation' : '反向相关性',
    strongestSolar: lang === 'en' ? 'Best Solar Month' : '最佳日照月份',
    highestDiesel: lang === 'en' ? 'Highest Diesel Month' : '柴发高运行月份',
    dieselHours: lang === 'en' ? 'Diesel runtime (h)' : '柴发运行小时',
    pvHours: lang === 'en' ? 'PV eq. hours' : '光伏等效小时',
    month: lang === 'en' ? 'Month' : '月份',
    pvGen: lang === 'en' ? 'PV generation' : 'PV 发电量',
    dieselGen: lang === 'en' ? 'Diesel generation' : '柴油发电量',
    period: lang === 'en' ? 'Weather/Load Base Year' : '气象/负载基准年',
    note: lang === 'en'
      ? 'A higher positive inverse-correlation value means better solar months generally require fewer diesel runtime hours in the same hourly simulation year.'
      : '反向相关性越高，说明在同一小时级仿真年份内，日照更好的月份通常越不需要柴油机长时间运行。',
  };

  const monthly = analysis.monthly;
  const bestSolarMonth = monthly.reduce((best, row) => row.pvEquivalentHours > best.pvEquivalentHours ? row : best, monthly[0]);
  const highestDieselMonth = monthly.reduce((best, row) => row.dieselHours > best.dieselHours ? row : best, monthly[0]);

  return (
    <div className="solar-diesel-analysis">
      <div className="solar-diesel-head">
        <div>
          <h3>{labels.title}</h3>
          <p>{labels.subtitle}</p>
        </div>
        <div className="solar-diesel-badges">
          {analysis.analysisPeriod && (
            <div className="solar-diesel-badge">
              <span>{labels.period}</span>
              <strong>{analysis.analysisPeriod}</strong>
            </div>
          )}
          <div className="solar-diesel-badge">
            <span>{labels.annualHours}</span>
            <strong>{fmtNum(analysis.annualPvEquivalentHours, 0)} h</strong>
          </div>
          <div className="solar-diesel-badge">
            <span>{labels.corr}</span>
            <strong>{fmtNum(analysis.weatherDieselCorrelation, 3)}</strong>
          </div>
          <div className="solar-diesel-badge">
            <span>{labels.strongestSolar}</span>
            <strong>{bestSolarMonth.label}</strong>
          </div>
          <div className="solar-diesel-badge">
            <span>{labels.highestDiesel}</span>
            <strong>{highestDieselMonth.label}</strong>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={monthly} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" />
          <YAxis yAxisId="left" stroke="#9b2c2c" />
          <YAxis yAxisId="right" orientation="right" stroke="#2b6cb0" />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === labels.dieselHours) return [`${fmtNum(value, 0)} h`, name];
              if (name === labels.pvHours) return [`${fmtNum(value, 1)} h`, name];
              if (name === labels.pvGen || name === labels.dieselGen) return [`${fmtNum(value, 0)} kWh`, name];
              return [fmtNum(value, 1), name];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="dieselHours" name={labels.dieselHours} fill="#c53030" radius={[6, 6, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="pvEquivalentHours" name={labels.pvHours} stroke="#2b6cb0" strokeWidth={3} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="table-scroll" style={{ marginTop: '1rem' }}>
        <table className="data-table solar-diesel-table">
          <thead>
            <tr>
              <th>{labels.month}</th>
              <th className="td-num">{labels.pvHours}</th>
              <th className="td-num">{labels.pvGen}</th>
              <th className="td-num">{labels.dieselHours}</th>
              <th className="td-num">{labels.dieselGen}</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((row) => (
              <tr key={row.month}>
                <td>{row.label}</td>
                <td className="td-num">{fmtNum(row.pvEquivalentHours, 1)}</td>
                <td className="td-num">{fmtNum(row.pvGenerationKwh, 0)}</td>
                <td className="td-num">{fmtNum(row.dieselHours, 0)}</td>
                <td className="td-num">{fmtNum(row.dieselGenerationKwh, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="sim-note" style={{ marginTop: '0.85rem' }}>{labels.note}</p>
    </div>
  );
}
