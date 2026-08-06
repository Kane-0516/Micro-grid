import { useMemo } from 'react';
import { useLang } from '@/context/LangContext';
import { useProducts } from '@/store/useProductsStore';
import type { TopologyData } from '@/features/topology/components/MicrogridTopology';
import StandardProductTopology from '@/features/topology/components/StandardProductTopology';
import { getLocalizedProductLabel } from '@/utils/productLabel';
import './StandardProductPage.css';

interface StandardProductPageProps {
  size: 'small' | 'medium' | 'large';
}

export default function StandardProductPage({ size }: StandardProductPageProps) {
  const { lang } = useLang();
  const {
    calcPvKw,
    getPanelByModel,
    getBracketByModel,
    getBatteryByModel,
    dieselGenerators,
    standardProducts,
  } = useProducts();

  const preset = standardProducts.find((item) => item.size === size);
  const title = getLocalizedProductLabel(preset, lang) || size;

  const topologyData = useMemo<Partial<TopologyData>>(() => {
    if (!preset) return {};

    const panel = getPanelByModel(preset.panelModel);
    const bracket = getBracketByModel(preset.bracketModel);
    const batteryPack = getBatteryByModel(preset.batteryPackModel);
    const diesel = dieselGenerators.find((item) => item.model === preset.dieselModel) ?? dieselGenerators[0];

    const pvCapacityKw = calcPvKw(preset.bracketSets, preset.panelModel, preset.bracketModel);
    const batteryCapacityKwh = batteryPack.capacityKwh * preset.batteryPackCount;
    const occupiedAreaM2 = +(bracket.areaM2 * preset.bracketSets).toFixed(1);

    return {
      pv: {
        title: 'PV',
        capacity: { name: 'Max PV Capacity', value: pvCapacityKw, unit: 'kW' },
        sets: { name: 'Max Bracket Sets', value: preset.bracketSets, unit: 'sets' },
        panelModel: getLocalizedProductLabel(panel, lang) || panel.displayName,
        areaM2: occupiedAreaM2,
      },
      load: {
        title: 'Load',
        annualKwh: { name: 'Annual Load', value: preset.annualLoadKwh, unit: 'kWh' },
        loadType: preset.loadType,
        peakKw: preset.peakLoadKw,
      },
      diesel: {
        title: 'Diesel',
        capacity: { name: 'Generator Capacity', value: diesel.powerKw, unit: 'kW' },
        customItems: [
          { name: 'Generator Capacity', value: diesel.powerKw, unit: 'kW' },
          { name: 'Generator Model', value: getLocalizedProductLabel(diesel, lang) || diesel.displayName, unit: '' },
        ],
        isNew: false,
      },
      ess: {
        title: 'ESS',
        capacity: { name: 'Battery Capacity', value: batteryCapacityKwh, unit: 'kWh' },
        storageDays: { name: 'Storage Days', value: 1, unit: 'day' },
        packModel: getLocalizedProductLabel(batteryPack, lang) || batteryPack.displayName,
      },
    };
  }, [calcPvKw, dieselGenerators, getBatteryByModel, getBracketByModel, getPanelByModel, lang, preset]);

  return (
    <section className="standard-product-page">
      <div className="standard-product-page__grid-bg" aria-hidden="true" />
      <div className="standard-product-page__topology-wrap">
        <StandardProductTopology size={size} data={topologyData} />
      </div>
      <div className="standard-product-page__content">
        <header className="standard-product-page__header">
          <h2 className="standard-product-page__title">{title}</h2>
        </header>
      </div>
    </section>
  );
}
