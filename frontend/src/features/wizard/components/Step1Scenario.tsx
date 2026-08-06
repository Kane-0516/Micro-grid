import OptionButton from '@/components/ui/OptionButton';
import type { ScenarioType } from '@/types/index';
import { useLang } from '@/context/LangContext';

interface Step1ScenarioProps {
  selectedScenario: ScenarioType | null;
  onSelect: (scenario: ScenarioType) => void;
}

export default function Step1Scenario({ selectedScenario, onSelect }: Step1ScenarioProps) {
  const { lang } = useLang();

  return (
    <div>
      {/* Known-Load Solution */}
      <OptionButton
        label={lang === 'en' ? 'Known-Load Solution' : '已知负载解决方案'}
        description={
          lang === 'en'
            ? 'You know your actual electricity consumption (kWh/year or monthly bills). The system automatically sizes PV, storage, and diesel to minimize payback period and maximize solar fraction. Best accuracy for economic analysis.'
            : '您已知实际用电量（年度 kWh 或月度账单）。系统自动优化光伏、储能和柴发容量，最小化回本周期并最大化太阳能占比。经济分析精度最高。'
        }
        selected={selectedScenario === 'known-load'}
        onClick={() => onSelect('known-load')}
      />

      {/* DIY Solution */}
      <OptionButton
        label={lang === 'en' ? 'DIY Solution' : 'DIY 解决方案'}
        description={
          lang === 'en'
            ? 'You specify the system components directly — voltage level, current draw, inverter count, PV bracket sets, and battery packs. Useful when you have a specific equipment configuration in mind. Economic analysis is an estimate (±20–30%) since actual annual load (kWh) is not provided.'
            : '您直接指定系统组件——电压等级、电流、逆变器数量、光伏支架套数和电池包。适合已有明确设备配置方案的场景。由于未提供实际年用电量，经济分析为估算值（误差 ±20–30%）。'
        }
        selected={selectedScenario === 'diy'}
        onClick={() => onSelect('diy')}
      />

      {/* No-Load / Standard Product */}
      <OptionButton
        label={lang === 'en' ? 'Standard Product (No Load Data)' : '标准产品（无负载数据）'}
        description={
          lang === 'en'
            ? 'No load data available. The system configures based on standard integrated PV-storage tray capacity. Suitable for new projects or early-stage capacity planning.'
            : '暂无负载数据。系统根据标准光储一体化托盘容量进行配置，适合新建项目或早期容量规划阶段。'
        }
        selected={selectedScenario === 'no-load'}
        onClick={() => onSelect('no-load')}
      />
    </div>
  );
}
