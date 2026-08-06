import type { TrayCapacity } from '@/types/index';
import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import { getLocalizedProductLabel } from '@/utils/productLabel';

interface Step7TrayProps {
  trayCapacity: TrayCapacity | null;
  onSelect: (capacity: TrayCapacity) => void;
}

export default function Step7Tray({ trayCapacity, onSelect }: Step7TrayProps) {
  const { integratedSpecs } = useProducts();
  const { t, lang } = useLang();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {integratedSpecs.map(spec => {
        const selected = trayCapacity === spec.size;
        return (
          <div
            key={spec.size}
            onClick={() => onSelect(spec.size as TrayCapacity)}
            style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', border: `2px solid ${selected ? '#1a365d' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', background: selected ? '#ebf4ff' : 'white', transition: 'all 0.2s', gap: '1rem' }}
          >
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${selected ? '#1a365d' : '#cbd5e0'}`, background: selected ? '#1a365d' : 'transparent', flexShrink: 0 }} />

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#2d3748', fontSize: '0.98rem' }}>
                {getLocalizedProductLabel(spec, lang)}
              </div>
              <div style={{ fontSize: '0.83rem', color: '#718096', marginTop: '0.2rem' }}>
                {t('tray.pv_label')} {spec.pvKw} kW · {t('tray.storage_label')} {spec.batteryKwh} kWh
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a365d' }}>{spec.pvKw} kW</div>
                <div style={{ fontSize: '0.72rem', color: '#a0aec0' }}>{t('tray.pv_label')}</div>
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--theme-brand-700)' }}>{spec.batteryKwh} kWh</div>
                <div style={{ fontSize: '0.72rem', color: '#a0aec0' }}>{t('tray.storage_label')}</div>
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--theme-tone-text)' }}>
                  {(spec.pvKw * 4.5 * 365 * 0.75 / 1000).toFixed(0)}
                  <span style={{ fontSize: '0.75rem' }}>MWh</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#a0aec0' }}>{t('tray.annual_gen')}</div>
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ padding: '0.75rem 1rem', background: 'var(--theme-tone-warm-bg)', border: '1px solid var(--theme-tone-warm-border)', borderRadius: '8px', fontSize: '0.83rem', color: 'var(--theme-tone-warm-text)' }}>
        {t('tray.extra_note')}
      </div>
    </div>
  );
}
