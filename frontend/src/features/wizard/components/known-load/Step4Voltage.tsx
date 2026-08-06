import { useLang } from '@/context/LangContext';
import OptionButton from '@/components/ui/OptionButton';
import type { VoltageLevel } from '@/types/index';

interface Step4VoltageProps {
  voltageLevel: VoltageLevel | null;
  onSelect: (voltage: VoltageLevel) => void;
}

export default function Step4Voltage({ voltageLevel, onSelect }: Step4VoltageProps) {
  const { t } = useLang();
  return (
    <div>
      <OptionButton
        label={t('volt.120_240')}
        description={t('volt.120_240.desc')}
        selected={voltageLevel === '120V/240V'}
        onClick={() => onSelect('120V/240V')}
      />
      <OptionButton
        label={t('volt.120_208')}
        description={t('volt.120_208.desc')}
        selected={voltageLevel === '120V/208V'}
        onClick={() => onSelect('120V/208V')}
      />
      <OptionButton
        label={t('volt.277_480')}
        description={t('volt.277_480.desc')}
        selected={voltageLevel === '277V/480V'}
        onClick={() => onSelect('277V/480V')}
      />
    </div>
  );
}
