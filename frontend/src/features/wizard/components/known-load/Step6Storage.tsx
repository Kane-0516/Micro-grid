import { useProducts } from '@/context/ProductsContext';
import { useLang } from '@/context/LangContext';
import type { StorageDays, ConfigData } from '@/types/index';
import { getLocalizedProductLabel } from '@/utils/productLabel';

interface Step6StorageProps {
  storageDays: StorageDays | null;
  batteryPackModel: string;
  dieselCapacityKw: number;
  pvCapacityKw?: number;
  bracketSets?: number;
  panelModel?: string;
  annualLoadKwh?: number;
  onUpdate: (data: Partial<ConfigData>) => void;
}

export default function Step6Storage({
  storageDays,
  batteryPackModel,
  dieselCapacityKw,
  pvCapacityKw = 0,
  bracketSets = 0,
  panelModel = '',
  annualLoadKwh = 0,
  onUpdate,
}: Step6StorageProps) {
  const { t, lang } = useLang();
  const {
    batteryPacks, getBatteryByModel,
    calcBatteryPacks, calcBatteryKwh,
    calcBatteryPacksFromLoad,
    defaultBatteryModel,
  } = useProducts();

  const selectedPack = getBatteryByModel(batteryPackModel);
  const RECOMMENDED_MODEL = defaultBatteryModel;

  const getPvInfo = (days: StorageDays, model?: string) => {
    const m     = model ?? batteryPackModel;
    const packs = calcBatteryPacks(dieselCapacityKw, pvCapacityKw, days, m);
    const kwh   = calcBatteryKwh(dieselCapacityKw, pvCapacityKw, days, m);
    return { packs, kwh };
  };

  const hasLoad = annualLoadKwh > 0;
  const dailyLoad = hasLoad ? Math.round(annualLoadKwh / 365) : 0;
  const getLoadInfo = (days: StorageDays, model: string, mode: 'hybrid' | 'autonomous') => {
    const packs = calcBatteryPacksFromLoad(annualLoadKwh, days, model, mode);
    const pack  = getBatteryByModel(model);
    return { packs, kwh: packs * pack.capacityKwh };
  };

  const dayOptions: { days: StorageDays; labelKey: string; descKey: string; badge?: string }[] = [
    { days: 1, labelKey: 'storage.day1', descKey: 'storage.day1.desc', badge: t('storage.recommended') },
    { days: 2, labelKey: 'storage.day2', descKey: 'storage.day2.desc' },
    { days: 3, labelKey: 'storage.day3', descKey: 'storage.day3.desc' },
  ];

  const hasPv      = pvCapacityKw > 0;
  const hasContext = hasPv || dieselCapacityKw > 0;

  return (
    <div>
      {/* ── 负荷法推荐 */}
      {hasLoad && (
        <div style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'var(--theme-tone-bg)', borderRadius: '10px', borderLeft: '4px solid var(--theme-tone-accent)', fontSize: '0.88rem', lineHeight: '1.8', color: 'var(--theme-tone-text)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
            {t('storage.load_rec_title')}
            {lang === 'en'
              ? ` (Annual ${annualLoadKwh.toLocaleString()} kWh / Daily avg ${dailyLoad} kWh)`
              : `（年用电 ${annualLoadKwh.toLocaleString()} kWh / 日均 ${dailyLoad} kWh）`}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--theme-tone-text)', marginBottom: '0.5rem' }}>
            {t('storage.load_rec_sub')}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--theme-brand-100)' }}>
                  <th style={{ padding: '0.3rem 0.6rem', textAlign: 'left', borderRadius: '4px 0 0 4px' }}>{t('storage.mode_col')}</th>
                  <th style={{ padding: '0.3rem 0.6rem', textAlign: 'center' }}>{t('storage.day1_col')}</th>
                  <th style={{ padding: '0.3rem 0.6rem', textAlign: 'center' }}>{t('storage.day2_col')}</th>
                  <th style={{ padding: '0.3rem 0.6rem', textAlign: 'center', borderRadius: '0 4px 4px 0' }}>{t('storage.notes_col')}</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: 'white' }}>
                  <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--theme-tone-text)' }}>
                    {t('storage.hybrid_mode')}
                    <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--theme-brand-600)' }}>{t('storage.hybrid_formula')}</div>
                  </td>
                  {([1, 2] as StorageDays[]).map(d => {
                    const { packs, kwh } = getLoadInfo(d, RECOMMENDED_MODEL, 'hybrid');
                    return (
                      <td key={d} style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                        <strong>{packs}</strong> {t('storage.packs_unit')}（{kwh} kWh）
                        <div style={{ fontSize: '0.72rem', color: '#718096' }}>
                          ${(packs * getBatteryByModel(RECOMMENDED_MODEL).priceUsd).toLocaleString()}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.76rem', color: '#718096' }}>
                    {t('storage.hybrid_note')}
                  </td>
                </tr>
                <tr style={{ background: 'var(--theme-tone-bg)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--theme-tone-text)' }}>
                    {t('storage.auto_mode')}
                    <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--theme-brand-600)' }}>{t('storage.auto_formula')}</div>
                  </td>
                  {([1, 2] as StorageDays[]).map(d => {
                    const { packs, kwh } = getLoadInfo(d, RECOMMENDED_MODEL, 'autonomous');
                    return (
                      <td key={d} style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                        <strong>{packs}</strong> {t('storage.packs_unit')}（{kwh} kWh）
                        <div style={{ fontSize: '0.72rem', color: '#718096' }}>
                          ${(packs * getBatteryByModel(RECOMMENDED_MODEL).priceUsd).toLocaleString()}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.76rem', color: '#718096' }}>
                    {t('storage.auto_note')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.76rem', color: 'var(--theme-brand-600)' }}>
            {t('storage.load_note_prefix')}
          </div>
        </div>
      )}

      {/* ── PV/柴发法推荐 */}
      {hasContext && (
        <div style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'var(--theme-tone-bg)', borderRadius: '10px', borderLeft: '4px solid var(--theme-tone-accent)', fontSize: '0.88rem', lineHeight: '1.7', color: 'var(--theme-tone-text)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
            {t('storage.pv_rec_title')}
          </div>
          {hasPv && (
            <div>
              {t('storage.pv_label')} <strong>{pvCapacityKw.toFixed(2)} kW</strong>
              {bracketSets > 0 && lang === 'en'
                ? ` (${bracketSets} sets${panelModel ? ` ${panelModel}` : ''})`
                : bracketSets > 0
                ? `（${bracketSets} 套${panelModel ? ` ${panelModel}` : ''}）`
                : ''}
            </div>
          )}
          {dieselCapacityKw > 0 && (
            <div>{t('storage.diesel_label')} <strong>{dieselCapacityKw} kW</strong></div>
          )}
          <div style={{ marginTop: '0.4rem', borderTop: '1px solid var(--theme-tone-border)', paddingTop: '0.4rem' }}>
            {lang === 'en' ? 'Formula: ' : '按 '}
            <strong>
              {pvCapacityKw > 0 ? `PV ${pvCapacityKw.toFixed(1)}kW × 3h` : `${t('storage.diesel_label')} ${dieselCapacityKw}kW × 4h`}
            </strong>
            {lang === 'en' ? ` (${RECOMMENDED_MODEL}): ` : ` 计算（${RECOMMENDED_MODEL}）：`}
            {dayOptions.map(({ days, labelKey }) => {
              const { packs, kwh } = getPvInfo(days, RECOMMENDED_MODEL);
              return (
                <span key={days} style={{ marginLeft: '0.8rem' }}>
                  {t(labelKey)} → <strong>{packs}</strong> {t('storage.packs_unit')}（{kwh} kWh）
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 储能天数选择 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
          {t('storage.select_days')}
        </div>
        {dayOptions.map(({ days, labelKey, descKey, badge }) => {
          const { packs, kwh } = getPvInfo(days);
          const active = storageDays === days;
          return (
            <div
              key={days}
              onClick={() => onUpdate({ storageDays: days })}
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.1rem', marginBottom: '0.6rem', border: `2px solid ${active ? '#1a365d' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', background: active ? '#ebf4ff' : 'white', transition: 'all 0.2s' }}
            >
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? '#1a365d' : '#cbd5e0'}`, background: active ? '#1a365d' : 'transparent' }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: '#2d3748', marginRight: '0.5rem' }}>{t(labelKey)}</span>
                {badge && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '8px', background: 'var(--theme-brand-100)', color: 'var(--theme-tone-text)', marginRight: '0.5rem' }}>{badge}</span>
                )}
                <span style={{ fontSize: '0.82rem', color: '#718096' }}>{t(descKey)}</span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, color: '#1a365d', fontSize: '0.98rem' }}>
                  {packs} {t('storage.packs_unit')} · {kwh} kWh
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>
                  ({selectedPack.capacityKwh} kWh/{t('storage.packs_unit')})
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 电池包型号选择 */}
      <div style={{ padding: '1.25rem', background: '#f8f9fa', borderRadius: '10px' }}>
        <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.85rem', fontSize: '0.95rem' }}>
          {t('storage.pack_label')}
          <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#718096', marginLeft: '0.5rem' }}>
            {t('storage.pack_label_note')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '0.7rem' }}>
          {batteryPacks.map(pack => {
            const isSelected    = batteryPackModel === pack.model;
            const isRecommended = pack.model === RECOMMENDED_MODEL;
            return (
              <div
                key={pack.model}
                onClick={() => onUpdate({ batteryPackModel: pack.model })}
                style={{ padding: '0.85rem 0.9rem', border: `2px solid ${isSelected ? '#1a365d' : isRecommended ? 'var(--theme-tone-border)' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', textAlign: 'center', background: isSelected ? '#ebf4ff' : isRecommended ? 'var(--theme-tone-bg)' : 'white', position: 'relative', transition: 'all 0.2s' }}
              >
                {isRecommended && (
                  <div style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', background: 'var(--theme-brand-700)', color: 'white', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                    {t('storage.recommended')}
                  </div>
                )}
                <div style={{ fontWeight: 800, color: '#1a365d', fontSize: '1.05rem' }}>
                  {pack.capacityKwh} kWh
                </div>
                <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.15rem', lineHeight: 1.3 }}>
                  {getLocalizedProductLabel(pack, lang) || pack.displayName}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-tone-text)', fontWeight: 700, marginTop: '0.3rem' }}>
                  ${pack.priceUsd.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginTop: '0.1rem' }}>
                  {(pack.priceUsd / pack.capacityKwh).toFixed(0)}/kWh · {pack.cycleLife.toLocaleString()} {t('storage.times')}
                </div>
              </div>
            );
          })}
        </div>

        {storageDays && (() => {
          const { packs, kwh } = getPvInfo(storageDays);
          const totalCost = packs * selectedPack.priceUsd;
          return (
            <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--theme-tone-border)', fontSize: '0.88rem', color: 'var(--theme-tone-text)', lineHeight: 1.7 }}>
              <span style={{ fontWeight: 700 }}>{t('storage.current_config')}</span>
              {packs} {t('storage.packs_unit')} × {selectedPack.capacityKwh} kWh =&nbsp;
              <strong>{kwh.toLocaleString()} kWh</strong>
              &nbsp;·&nbsp;
              {t('storage.ref_cost')} <strong>${totalCost.toLocaleString()}</strong>
              &nbsp;·&nbsp;
              {t('storage.cycle_life')} {selectedPack.cycleLife.toLocaleString()} {t('storage.times')}
              &nbsp;·&nbsp;
              <span style={{ color: '#718096' }}>{(selectedPack.priceUsd / selectedPack.capacityKwh).toFixed(0)} $/kWh</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
