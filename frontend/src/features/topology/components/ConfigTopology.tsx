/**
 * ConfigTopology.tsx — 已知负载/DIV 配置过程图形区域
 * 独立组件，配置过程中 Diesel 卡片在右侧
 */
import MicrogridTopology from './MicrogridTopology';
import type { TopologyData, TopologyVisibility } from './MicrogridTopology';
import './ConfigTopology.css';

interface ConfigTopologyProps {
  data?: Partial<TopologyData>;
  visibility?: Partial<TopologyVisibility>;
  /** 已知负载：PV 卡片始终显示 4 项 */
  pvFullFields?: boolean;
}

export default function ConfigTopology({ data, visibility, pvFullFields }: ConfigTopologyProps) {
  return (
    <div className="config-topology">
      <MicrogridTopology
        className="config-topology__inner"
        data={data}
        visibility={visibility}
        variant="wizard"
        layoutMode="config"
        pvFullFields={pvFullFields}
      />
    </div>
  );
}
