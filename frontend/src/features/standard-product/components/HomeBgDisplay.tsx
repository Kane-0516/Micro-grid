import homeBgSvg from '@/assets/home-bg.svg?raw';
import { useProducts } from '@/context/ProductsContext';
import './HomeBgDisplay.css';

export interface HomeBgMetric {
  name: string;
  value: string | number;
  unit: string;
}

export interface HomeBgData {
  pv: {
    title: string;
    metric: HomeBgMetric;
  };
  load: {
    title: string;
    metric: HomeBgMetric;
  };
  diesel: {
    title: string;
    power: HomeBgMetric;
    fuel: HomeBgMetric;
  };
  ess: {
    title: string;
    power: HomeBgMetric;
    soc: HomeBgMetric;
  };
}

interface HomeBgDisplayProps {
  className?: string;
  data?: Partial<HomeBgData>;
}

function fillSvg(svg: string, data: HomeBgData) {
  const map: Record<string, string | number> = {
    __PV_TITLE__: data.pv.title,
    __PV_NAME__: data.pv.metric.name,
    __PV_VALUE__: data.pv.metric.value,
    __PV_UNIT__: data.pv.metric.unit,
    __LOAD_TITLE__: data.load.title,
    __LOAD_NAME__: data.load.metric.name,
    __LOAD_VALUE__: data.load.metric.value,
    __LOAD_UNIT__: data.load.metric.unit,
    __DIESEL_TITLE__: data.diesel.title,
    __DIESEL_P_NAME__: data.diesel.power.name,
    __DIESEL_P_VALUE__: data.diesel.power.value,
    __DIESEL_P_UNIT__: data.diesel.power.unit,
    __DIESEL_FUEL_NAME__: data.diesel.fuel.name,
    __DIESEL_FUEL_VALUE__: data.diesel.fuel.value,
    __DIESEL_FUEL_UNIT__: data.diesel.fuel.unit,
    __ESS_TITLE__: data.ess.title,
    __ESS_P_NAME__: data.ess.power.name,
    __ESS_P_VALUE__: data.ess.power.value,
    __ESS_P_UNIT__: data.ess.power.unit,
    __ESS_SOC_NAME__: data.ess.soc.name,
    __ESS_SOC_VALUE__: data.ess.soc.value,
    __ESS_SOC_UNIT__: data.ess.soc.unit,
  };

  let next = svg;
  for (const [token, value] of Object.entries(map)) {
    next = next.split(token).join(String(value));
  }
  return next;
}

export default function HomeBgDisplay({ className = '', data }: HomeBgDisplayProps) {
  const { homeBgDefaults } = useProducts();
  const defaultData: HomeBgData = {
    pv: {
      title: 'PV',
      metric: { name: 'PV Capacity', value: homeBgDefaults.pvKw, unit: 'kW' },
    },
    load: {
      title: 'Load',
      metric: { name: 'Annual Load', value: homeBgDefaults.annualLoadKwh, unit: 'kWh' },
    },
    diesel: {
      title: 'Diesel',
      power: { name: 'Diesel Capacity', value: homeBgDefaults.dieselKw, unit: 'kW' },
      fuel: { name: 'Diesel Price', value: homeBgDefaults.dieselPriceUsd, unit: 'USD/L' },
    },
    ess: {
      title: 'BESS',
      power: { name: 'Battery Capacity', value: homeBgDefaults.batteryKwh, unit: 'kWh' },
      soc: { name: 'Storage Days', value: homeBgDefaults.storageDays, unit: 'day' },
    },
  };
  const merged: HomeBgData = {
    pv: {
      title: data?.pv?.title ?? defaultData.pv.title,
      metric: { ...defaultData.pv.metric, ...(data?.pv?.metric ?? {}) },
    },
    load: {
      title: data?.load?.title ?? defaultData.load.title,
      metric: { ...defaultData.load.metric, ...(data?.load?.metric ?? {}) },
    },
    diesel: {
      title: data?.diesel?.title ?? defaultData.diesel.title,
      power: { ...defaultData.diesel.power, ...(data?.diesel?.power ?? {}) },
      fuel: { ...defaultData.diesel.fuel, ...(data?.diesel?.fuel ?? {}) },
    },
    ess: {
      title: data?.ess?.title ?? defaultData.ess.title,
      power: { ...defaultData.ess.power, ...(data?.ess?.power ?? {}) },
      soc: { ...defaultData.ess.soc, ...(data?.ess?.soc ?? {}) },
    },
  };
  const svgMarkup = fillSvg(homeBgSvg, merged);

  return (
    <div className={`home-bg-display ${className}`.trim()}>
      <div
        className="home-bg-display__svg-wrap"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    </div>
  );
}
