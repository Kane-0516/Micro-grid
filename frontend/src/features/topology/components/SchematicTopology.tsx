/**
 * SchematicTopology.tsx — 生成方案示意图图形区域
 * 独立组件，用于结果页产品示意图，图形区域更高
 */
import MicrogridTopology from './MicrogridTopology';
import type { TopologyData } from './MicrogridTopology';
import './SchematicTopology.css';

interface SchematicTopologyProps {
  data?: Partial<TopologyData>;
  className?: string;
}

export default function SchematicTopology({ data, className = '' }: SchematicTopologyProps) {
  return (
    <div className={`schematic-topology ${className}`.trim()}>
      <MicrogridTopology
        className="schematic-topology__inner"
        data={data}
        variant="wizard"
        layoutMode="schematic"
      />
    </div>
  );
}
