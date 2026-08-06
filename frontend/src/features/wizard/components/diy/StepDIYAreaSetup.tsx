import type { ConfigData } from '@/types/index';
import { useLang } from '@/context/LangContext';
import { useProducts } from '@/context/ProductsContext';
import StepLocation from '../known-load/StepLocation';
import StepArea from '../known-load/StepArea';

interface StepDIYAreaSetupProps {
  locationName?: string;
  latitude?: number | null;
  longitude?: number | null;
  peakSunHoursPerDay?: number | null;
  annualEffHours?: number | null;
  annualKwhPerM2?: number | null;
  availableAreaM2?: number;
  grossAreaM2?: number | null;
  maxBracketSetsByLayout?: number | null;
  panelModel?: string;
  bracketModel?: string;
  apiAvailable?: boolean | null;
  onUpdate: (data: Partial<ConfigData> & { pvCapacityKw?: number; bracketSets?: number }) => void;
}

export default function StepDIYAreaSetup({
  locationName,
  latitude,
  longitude,
  peakSunHoursPerDay,
  annualEffHours,
  annualKwhPerM2,
  availableAreaM2,
  grossAreaM2,
  maxBracketSetsByLayout,
  panelModel,
  bracketModel,
  apiAvailable,
  onUpdate,
}: StepDIYAreaSetupProps) {
  const { lang } = useLang();
  const { defaultPanelModel, defaultBracketModel } = useProducts();
  const resolvedPanelModel = panelModel ?? defaultPanelModel;
  const resolvedBracketModel = bracketModel ?? defaultBracketModel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <section>
        <div
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: '#718096',
            textTransform: 'uppercase',
            marginBottom: '0.6rem',
          }}
        >
          {lang === 'en' ? 'A - Project Location' : 'A - 项目地点'}
        </div>
        <StepLocation
          locationName={locationName ?? ''}
          latitude={latitude ?? undefined}
          longitude={longitude ?? undefined}
          peakSunHoursPerDay={peakSunHoursPerDay ?? undefined}
          annualEffHours={annualEffHours ?? undefined}
          annualKwhPerM2={annualKwhPerM2 ?? undefined}
          panelModel={resolvedPanelModel}
          onUpdate={data => onUpdate(data as any)}
          apiAvailable={apiAvailable}
          showPanelSelector={false}
          showSolarResult={false}
        />
      </section>

      <section>
        <div
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: '#718096',
            textTransform: 'uppercase',
            marginBottom: '0.6rem',
          }}
        >
          {lang === 'en' ? 'B - Site Area' : 'B - 场地面积'}
        </div>
        <StepArea
          availableAreaM2={availableAreaM2}
          grossAreaM2={grossAreaM2}
          maxBracketSetsByLayout={maxBracketSetsByLayout}
          panelModel={resolvedPanelModel}
          bracketModel={resolvedBracketModel}
          onUpdate={data => onUpdate(data as any)}
        />
      </section>
    </div>
  );
}
