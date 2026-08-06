import SiteAreaMap from './SiteAreaMap';
import ConfigTopology from '@/features/topology/components/ConfigTopology';
import ConfigSummaryPanel from '@/components/ui/ConfigSummaryPanel';
import type { ConfigData, Scenario } from '@/types/index';
import type { StepType } from '@/utils/wizardFlow';

interface WizardLeftPanelProps {
  config: ConfigData;
  currentStepType: StepType;
  scenario: Scenario | null;
  showSiteAreaMap: boolean;
  topology: {
    data: any;
    visibility: any;
    pvFullFields: any;
  };
  updateConfig: (updates: Partial<ConfigData>) => void;
}

export default function WizardLeftPanel({
  config,
  scenario,
  showSiteAreaMap,
  topology,
  updateConfig,
}: WizardLeftPanelProps) {
  const showSummary = (scenario === 'known-load' || scenario === 'diy' || scenario === 'custom') && !showSiteAreaMap;

  return (
    <>
      {showSiteAreaMap ? (
        <SiteAreaMap
          latitude={config.latitude}
          longitude={config.longitude}
          locationName={config.locationName}
          availableAreaM2={config.availableAreaM2}
          grossAreaM2={config.grossAreaM2}
          maxBracketSetsByLayout={config.maxBracketSetsByLayout}
          onAreaMeasured={measurement =>
            updateConfig({
              availableAreaM2: measurement.usableAreaM2,
              grossAreaM2: measurement.grossAreaM2,
              maxBracketSetsByLayout: measurement.installableSets,
              bracketSets:
                config.bracketSets > 0
                  ? Math.min(config.bracketSets, measurement.installableSets)
                  : config.bracketSets,
            })
          }
          onLocationSelected={({ latitude, longitude, locationName }) =>
            updateConfig({ latitude, longitude, locationName })
          }
        />
      ) : (
        <ConfigTopology
          data={topology.data}
          visibility={topology.visibility}
          pvFullFields={topology.pvFullFields}
        />
      )}
      {showSummary && <ConfigSummaryPanel config={config} scenario={scenario} />}
    </>
  );
}
