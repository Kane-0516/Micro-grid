/**
 * StandardProductTopology.tsx — 标准化产品页图形区域
 * 独立组件，用于小型/中型/大型光储柴发一体展示
 */
import MicrogridTopology from './MicrogridTopology';
import type { TopologyData } from './MicrogridTopology';
import StandardProductSummaryPanel from '@/components/ui/StandardProductSummaryPanel';
import './StandardProductTopology.css';

interface StandardProductTopologyProps {
  size: 'small' | 'medium' | 'large';
  data: Partial<TopologyData>;
}

export default function StandardProductTopology({ size, data }: StandardProductTopologyProps) {
  return (
    <div className="standard-product-topology">
      <MicrogridTopology
        className="standard-product-topology__inner"
        data={data}
        variant="standard"
        layoutMode="standard"
      />
      <StandardProductSummaryPanel size={size} />
    </div>
  );
}
