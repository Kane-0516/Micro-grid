/**
 * Step5LoadInput.tsx — 用电负载信息（已知负载路径）
 */
import { useEffect, useState, useRef } from 'react';
import type { ConfigData, DailyLoadSlot, LoadType, LoadInputMode } from '@/types/index';
import { useLang } from '@/context/LangContext';

interface Step5LoadInputProps {
  annualLoadKwh?: number;
  loadType?: LoadType;
  loadInputMode?: LoadInputMode;
  dailyLoadSlots?: DailyLoadSlot[];
  peakLoadKw?: number;
  onUpdate: (data: Partial<ConfigData>) => void;
}

interface TimeSlot { label: string; hours: number; loadKw: number; input: string }

const DEFAULT_SLOTS: DailyLoadSlot[] = [
  { label: 'midnight', hours: 6,  loadKw: 0 },
  { label: 'morning',  hours: 3,  loadKw: 0 },
  { label: 'forenoon', hours: 3,  loadKw: 0 },
  { label: 'afternoon',hours: 6,  loadKw: 0 },
  { label: 'evening',  hours: 4,  loadKw: 0 },
  { label: 'night',    hours: 2,  loadKw: 0 },
];

function parseNonNegativeNumber(value: string): number | null {
  const normalized = value.trim().includes('.') ? value.replace(/,/g, '') : value.replace(',', '.');
  if (normalized === '' || normalized === '.' || normalized === '-') return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hydrateSlots(saved?: DailyLoadSlot[]): TimeSlot[] {
  const source = saved?.length ? saved : DEFAULT_SLOTS;
  return source.map((slot, idx) => {
    const fallback = DEFAULT_SLOTS[idx] ?? slot;
    const loadKw = Number.isFinite(Number(slot.loadKw)) ? Math.max(0, Number(slot.loadKw)) : 0;
    return {
      label: slot.label || fallback.label,
      hours: Number.isFinite(Number(slot.hours)) && Number(slot.hours) > 0 ? Number(slot.hours) : fallback.hours,
      loadKw,
      input: loadKw > 0 ? String(loadKw) : '',
    };
  });
}

function serializeSlots(slots: TimeSlot[]): DailyLoadSlot[] {
  return slots.map(({ label, hours, loadKw }) => ({ label, hours, loadKw }));
}

export default function Step5LoadInput({ annualLoadKwh, loadType, loadInputMode = 'annual', dailyLoadSlots, peakLoadKw, onUpdate }: Step5LoadInputProps) {
  const { lang, t } = useLang();
  const [mode,      setMode]      = useState<LoadInputMode>(loadInputMode);
  const [inputVal,  setInputVal]  = useState(annualLoadKwh ? String(annualLoadKwh) : '');
  const [csvError,  setCsvError]  = useState('');
  const [csvLoaded, setCsvLoaded] = useState(loadInputMode === 'import' && Boolean(annualLoadKwh && annualLoadKwh > 0));
  const fileRef = useRef<HTMLInputElement>(null);

  // time slots - labels built from t() at render time
  const [slots, setSlots] = useState<TimeSlot[]>(() => hydrateSlots(dailyLoadSlots));

  useEffect(() => {
    setMode(loadInputMode);
  }, [loadInputMode]);

  useEffect(() => {
    if (mode === 'annual') {
      setInputVal(prev => {
        const parsedPrev = parseNonNegativeNumber(prev);
        if ((parsedPrev ?? 0) === (annualLoadKwh ?? 0)) return prev;
        return annualLoadKwh ? String(annualLoadKwh) : '';
      });
    }
    if (mode === 'import') {
      setCsvLoaded(Boolean(annualLoadKwh && annualLoadKwh > 0));
    }
  }, [annualLoadKwh, mode]);

  useEffect(() => {
    setSlots(prev => {
      const next = hydrateSlots(dailyLoadSlots);
      const sameValues = prev.length === next.length && prev.every((slot, idx) => (
        slot.label === next[idx].label
        && slot.hours === next[idx].hours
        && slot.loadKw === next[idx].loadKw
      ));
      return sameValues ? prev : next;
    });
  }, [dailyLoadSlots]);

  const LOAD_TYPES: { value: LoadType; label: string; desc: string; }[] = [
    { value: 'residential',       label: t('load.type.residential'),       desc: t('load.type.res.desc') },
    { value: 'commercial',        label: t('load.type.commercial'),        desc: t('load.type.comm.desc') },
    { value: 'industrial',        label: t('load.type.industrial'),        desc: t('load.type.ind.desc') },
    { value: 'office' as LoadType,           label: t('load.type.office'),           desc: t('load.type.office.desc') },
    { value: 'school' as LoadType,           label: t('load.type.school'),           desc: t('load.type.school.desc') },
    { value: 'hospital' as LoadType,         label: t('load.type.hospital'),         desc: t('load.type.hospital.desc') },
    { value: 'hotel' as LoadType,            label: t('load.type.hotel'),            desc: t('load.type.hotel.desc') },
    { value: 'restaurant' as LoadType,       label: t('load.type.restaurant'),       desc: t('load.type.restaurant.desc') },
    { value: 'retail' as LoadType,           label: t('load.type.retail'),           desc: t('load.type.retail.desc') },
    { value: 'warehouse' as LoadType,        label: t('load.type.warehouse'),        desc: t('load.type.warehouse.desc') },
    { value: 'supermarket' as LoadType,      label: t('load.type.supermarket'),      desc: t('load.type.supermarket.desc') },
    { value: 'apartment' as LoadType,        label: t('load.type.apartment'),        desc: t('load.type.apartment.desc') },
  ];

  const EXAMPLES = [
    { labelKey: 'load.ex.small_res',   descKey: 'load.ex.small_res.desc',   kwh: 5_000 },
    { labelKey: 'load.ex.medium_res',  descKey: 'load.ex.medium_res.desc',  kwh: 18_000 },
    { labelKey: 'load.ex.commercial',  descKey: 'load.ex.commercial.desc',  kwh: 50_000 },
    { labelKey: 'load.ex.industrial',  descKey: 'load.ex.industrial.desc',  kwh: 131_400 },
  ];

  const MODE_TABS = [
    { key: 'annual'  as LoadInputMode, labelKey: 'load.mode.annual.label',  hintKey: 'load.mode.annual.hint' },
    { key: 'hourly'  as LoadInputMode, labelKey: 'load.mode.hourly.label',  hintKey: 'load.mode.hourly.hint' },
    { key: 'import'  as LoadInputMode, labelKey: 'load.mode.import.label',  hintKey: 'load.mode.import.hint' },
  ];

  const handleModeChange = (m: LoadInputMode) => { setMode(m); onUpdate({ loadInputMode: m }); };

  const handleKwhInput = (val: string) => {
    setInputVal(val);
    const num = parseNonNegativeNumber(val);
    if (num !== null && num > 0) {
      const peak = Math.round(num / 365 / 8 * 10) / 10;
      onUpdate({ annualLoadKwh: num, peakLoadKw: peak });
    }
  };
  const handleExample = (kwh: number) => {
    setInputVal(String(kwh));
    const peak = Math.round(kwh / 365 / 8 * 10) / 10;
    onUpdate({ annualLoadKwh: kwh, peakLoadKw: peak });
  };

  const handleSlotChange = (idx: number, val: string) => {
    const parsed = parseNonNegativeNumber(val);
    const updated = slots.map((s, i) => i === idx ? { ...s, input: val, loadKw: parsed ?? 0 } : s);
    setSlots(updated);
    const annualKwh = updated.reduce((sum, s) => sum + s.loadKw * s.hours * 365, 0);
    const peakKw    = Math.max(...updated.map(s => s.loadKw));
    onUpdate({ annualLoadKwh: Math.round(annualKwh), peakLoadKw: peakKw, dailyLoadSlots: serializeSlots(updated) });
  };
  const slotAnnual = slots.reduce((s, r) => s + r.loadKw * r.hours * 365, 0);
  const slotPeak   = Math.max(...slots.map(s => s.loadKw), 0);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    setCsvLoaded(false);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text  = ev.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const values: number[] = [];
        for (const line of lines) {
          const cols = line.split(/[,;\t]+/);
          const last = parseFloat(cols[cols.length - 1]);
          if (!isNaN(last) && last >= 0) values.push(last);
        }
        if (values.length < 8) {
          setCsvError(t('load.csv_err_rows'));
          return;
        }
        const annualKwh = values.length >= 8760
          ? values.reduce((s, v) => s + v, 0)
          : values.reduce((s, v) => s + v, 0) * (8760 / values.length);
        const peakKw = Math.max(...values);
        onUpdate({ annualLoadKwh: Math.round(annualKwh), peakLoadKw: Math.round(peakKw * 10) / 10 });
        setCsvLoaded(true);
      } catch {
        setCsvError(t('load.csv_err_parse'));
      }
    };
    reader.readAsText(file);
  };

  const handleLoadType = (lt: LoadType) => onUpdate({ loadType: lt });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>



      {/* ── 模式切换 Tab */}
      <div>
        <div style={{ display: 'flex', gap: '0', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          {MODE_TABS.map((tab, idx) => (
            <button
              key={tab.key}
              onClick={() => handleModeChange(tab.key)}
              style={{
                flex: 1, padding: '0.7rem 0.5rem',
                background: mode === tab.key ? '#1a365d' : 'white',
                color: mode === tab.key ? 'white' : '#4a5568',
                border: 'none',
                borderRight: idx < MODE_TABS.length - 1 ? '1px solid #e2e8f0' : 'none',
                cursor: 'pointer', fontSize: '0.85rem',
                fontWeight: mode === tab.key ? 700 : 400,
                transition: 'all 0.15s',
              }}
            >
              <div>{t(tab.labelKey)}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.75, marginTop: '0.15rem' }}>{t(tab.hintKey)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 模式一：年总用电量 */}
      {mode === 'annual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.6rem' }}>
              {t('load.annual_kwh_label')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => handleKwhInput(e.target.value)}
                placeholder={t('load.placeholder')}
                style={{ flex: 1, padding: '0.65rem 1rem', border: '1px solid #cbd5e0', borderRadius: '8px', fontSize: '1rem', maxWidth: '260px' }}
              />
              <span style={{ color: '#718096', fontSize: '0.9rem' }}>{t('load.annual_kwh_unit')}</span>
            </div>
            {annualLoadKwh && annualLoadKwh > 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 1rem', background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)', borderRadius: '6px', fontSize: '0.88rem', color: 'var(--theme-tone-text)' }}>
                {t('load.daily_avg')} <strong>{(annualLoadKwh / 365).toFixed(1)} kWh</strong>
                {lang === 'en' ? ', ' : '，'}
                {t('load.monthly_avg')} <strong>{Math.round(annualLoadKwh / 12).toLocaleString()} kWh</strong>
                {lang === 'en' ? ', ' : '，'}
                {t('load.est_peak')} <strong>~{peakLoadKw?.toFixed(1) ?? '—'} kW</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 模式二：时段电流 */}
      {mode === 'hourly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#4a5568', lineHeight: 1.6 }}>
            {t('load.hourly_desc')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {slots.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: i % 2 === 0 ? '#f8f9fa' : 'white', borderRadius: '8px' }}>
                <span style={{ flex: 1, fontSize: '0.88rem', color: '#4a5568', minWidth: '160px' }}>
                  {t(`load.slot.${s.label}`)}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#a0aec0', minWidth: '40px' }}>
                  {s.hours}h
                </span>
                <input
                  type="number"
                  value={s.input}
                  onChange={e => handleSlotChange(i, e.target.value)}
                  placeholder="0"
                  min={0} step="any" inputMode="decimal"
                  style={{ width: '90px', padding: '0.4rem 0.6rem', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '0.95rem', textAlign: 'right' }}
                />
                <span style={{ fontSize: '0.82rem', color: '#718096' }}>kW</span>
                <span style={{ fontSize: '0.78rem', color: '#a0aec0', minWidth: '90px', textAlign: 'right' }}>
                  = {(s.loadKw * s.hours).toFixed(1)} {t('load.kwh_per_day')}
                </span>
              </div>
            ))}
          </div>
          {slotAnnual > 0 && (
            <div style={{ padding: '0.75rem 1rem', background: 'var(--theme-tone-bg)', border: '1px solid var(--theme-tone-border)', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--theme-tone-text)', lineHeight: 1.7 }}>
              {t('load.slot.daily_avg')} <strong>{(slotAnnual / 365).toFixed(1)} kWh</strong>
              {lang === 'en' ? ', ' : '，'}
              {t('load.slot.annual')} <strong>{Math.round(slotAnnual).toLocaleString()} kWh</strong>
              {lang === 'en' ? ', ' : '，'}
              {t('load.slot.peak')} <strong>{slotPeak.toFixed(1)} kW</strong>
            </div>
          )}
        </div>
      )}

      {/* ── 模式三：导入用电表格 */}
      {mode === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '0.8rem 1rem', background: 'var(--theme-tone-bg)', borderLeft: '4px solid var(--theme-tone-accent)', borderRadius: '8px', fontSize: '0.84rem', color: 'var(--theme-tone-text)', lineHeight: 1.7 }}>
            <strong>{t('load.csv_format')}</strong>{t('load.csv_format_desc')}
          </div>

          <div
            style={{ border: '2px dashed #cbd5e0', borderRadius: '10px', padding: '2rem', textAlign: 'center', cursor: 'pointer', background: csvLoaded ? 'var(--theme-tone-bg)' : '#fafafa', transition: 'all 0.2s' }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            {csvLoaded ? (
              <>
                <div style={{ fontSize: '1.5rem', color: 'var(--theme-tone-text)', marginBottom: '0.4rem' }}>{t('load.csv_imported')}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--theme-tone-text)' }}>
                  {lang === 'en' ? 'Annual load ' : '年总用电量 '}
                  <strong>{annualLoadKwh?.toLocaleString()} kWh</strong>
                  {lang === 'en' ? ', Peak ' : '，峰值 '}
                  <strong>{peakLoadKw?.toFixed(1)} kW</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.3rem' }}>{t('load.csv_reupload')}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.95rem', color: '#4a5568', marginBottom: '0.3rem' }}>{t('load.csv_click')}</div>
                <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{t('load.csv_drag')}</div>
              </>
            )}
          </div>

          {csvError && (
            <div style={{ padding: '0.6rem 0.9rem', background: 'var(--theme-tone-danger-bg)', border: '1px solid var(--theme-tone-danger-border)', borderRadius: '6px', fontSize: '0.84rem', color: 'var(--theme-tone-danger-text)' }}>
              {csvError}
            </div>
          )}
        </div>
      )}

      {/* ── 负载类型 */}
      <div>
        <div style={{ fontWeight: 600, color: '#2d3748', marginBottom: '0.6rem', fontSize: '0.95rem' }}>
          {t('load.type.label')}
          <span style={{ fontWeight: 400, fontSize: '0.78rem', color: '#718096', marginLeft: '0.4rem' }}>
            {t('load.type.label_note')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          {LOAD_TYPES.map(lt => (
            <div
              key={lt.value}
              onClick={() => handleLoadType(lt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.6rem 0.75rem',
                border: `2px solid ${loadType === lt.value ? '#1a365d' : '#e2e8f0'}`,
                borderRadius: '8px', cursor: 'pointer',
                background: loadType === lt.value ? '#ebf4ff' : 'white',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${loadType === lt.value ? '#1a365d' : '#cbd5e0'}`, background: loadType === lt.value ? '#1a365d' : 'transparent' }} />
              <div>
                <div style={{ fontWeight: 600, color: '#2d3748', fontSize: '0.88rem' }}>{lt.label}</div>
                <div style={{ fontSize: '0.72rem', color: '#718096' }}>{lt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
