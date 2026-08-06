import { useEffect, useRef, useState } from 'react';
import type { ConfigData } from '@/types/index';
import { fetchGeocode, fetchReverseGeocode, fetchSolarHours } from '@/api/client';
import { useLang } from '@/context/LangContext';
import { useProducts } from '@/context/ProductsContext';
import { formatCoordinate } from '@/utils/coordinateTransform';
import { formatIrradianceDualFtFirst } from '@/utils/unitFormat';
import { detectCountryCodeForQuery, detectCountryCodeForCoords } from '@/utils/geocodeHelpers';
import { getLocalizedProductLabel } from '@/utils/productLabel';

interface StepLocationProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  peakSunHoursPerDay?: number;
  annualEffHours?: number;
  annualKwhPerM2?: number;
  panelModel?: string;
  onUpdate: (data: Partial<ConfigData>) => void;
  apiAvailable?: boolean | null;
  showPanelSelector?: boolean;
  showSolarResult?: boolean;
}

interface SolarResult {
  peakSunHoursPerDay: number;
  annualEffHours: number;
  annualKwhPerM2: number;
  climateZone: string;
  note: string;
}

function formatResolvedAddress(payload: {
  display_name?: string;
  formatted_address?: string;
  address?: Record<string, unknown>;
}, fallbackLabel = 'Selected site') {
  const address = payload.address ?? {};
  const parts = [
    address.country,
    address.state,
    address.province,
    address.city || address.town || address.village || address.municipality,
    address.county || address.district || address.suburb,
    address.road || address.street,
    address.house_number || address.housenumber,
    address.postcode,
  ];

  const joined = parts
    .filter(part => typeof part === 'string' && part.trim())
    .map(part => String(part).trim())
    .join(', ');

  return joined || payload.formatted_address || payload.display_name || fallbackLabel;
}

function toFriendlyGeocodeError(message: string) {
  if (/External geocoder is unreachable from this machine/i.test(message)) {
    return 'Address search is unavailable because this machine cannot reach the geocoder. Use current location or select a site on the map.';
  }
  if (/Pelias geocoder is unavailable/i.test(message)) {
    return 'Pelias geocoder is not running. Start the Pelias API service and verify its data import first.';
  }
  return `Unable to search this location. ${message}`;
}

export default function StepLocation({
  locationName = '',
  latitude,
  longitude,
  peakSunHoursPerDay,
  annualEffHours,
  annualKwhPerM2,
  panelModel: initialPanelModel,
  onUpdate,
  apiAvailable,
  showPanelSelector = true,
  showSolarResult = true,
}: StepLocationProps) {
  const { t, lang } = useLang();
  const { pvPanels, defaultPanelModel } = useProducts();

  const [projectLocation, setProjectLocation] = useState(locationName);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [loadingSolar, setLoadingSolar] = useState(false);
  const [solarError, setSolarError] = useState('');
  const [selectedPanel, setSelectedPanel] = useState(initialPanelModel ?? defaultPanelModel);
  const [solarResult, setSolarResult] = useState<SolarResult | null>(
    peakSunHoursPerDay != null && annualEffHours != null
      ? {
          peakSunHoursPerDay,
          annualEffHours,
          annualKwhPerM2: annualKwhPerM2 ?? peakSunHoursPerDay * 365,
          climateZone: '',
          note: '',
        }
      : null,
  );
  const lastSolarLookupRef = useRef(
    latitude != null && longitude != null && peakSunHoursPerDay != null && annualEffHours != null
      ? `${latitude.toFixed(6)},${longitude.toFixed(6)}`
      : '',
  );

  const isLocationActionBusy = searchingLocation || geolocating;

  useEffect(() => {
    setProjectLocation(locationName ?? '');
  }, [locationName]);

  useEffect(() => {
    setSelectedPanel(initialPanelModel ?? defaultPanelModel);
  }, [defaultPanelModel, initialPanelModel]);

  const querySolarHours = async (nextLat: number, nextLon: number) => {
    const coordKey = `${nextLat.toFixed(6)},${nextLon.toFixed(6)}`;
    if (lastSolarLookupRef.current === coordKey) return;

    setLoadingSolar(true);
    setSolarError('');
    try {
      const result = await fetchSolarHours(nextLat, nextLon);
      const nextSolarResult: SolarResult = {
        peakSunHoursPerDay: result.peak_sun_hours_per_day,
        annualEffHours: result.annual_eff_hours,
        annualKwhPerM2: result.annual_kwh_per_m2,
        climateZone: result.climate_zone,
        note: result.note,
      };
      setSolarResult(nextSolarResult);
      lastSolarLookupRef.current = coordKey;
      onUpdate({
        peakSunHoursPerDay: nextSolarResult.peakSunHoursPerDay,
        annualEffHours: nextSolarResult.annualEffHours,
        annualKwhPerM2: nextSolarResult.annualKwhPerM2,
      });
    } catch {
      setSolarResult(null);
      lastSolarLookupRef.current = '';
      setSolarError(
        apiAvailable === false
          ? (lang === 'en'
            ? 'Solar parameters could not be loaded because the backend API is unavailable.'
            : '后端接口不可用，日照参数未能加载。')
          : (lang === 'en'
            ? 'Solar parameters could not be loaded. Retry by keeping this page open, reselecting the site, or refreshing the page.'
            : '日照参数加载失败。可停留当前页面等待自动重试，或重新选择地点，或刷新页面重试。'),
      );
    } finally {
      setLoadingSolar(false);
    }
  };

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    void querySolarHours(latitude, longitude);
  }, [latitude, longitude]);

  useEffect(() => {
    if (apiAvailable !== true) return;
    if (latitude == null || longitude == null) return;
    if (solarResult) return;
    void querySolarHours(latitude, longitude);
  }, [apiAvailable, latitude, longitude]);

  const syncResolvedCoords = async (nextLat: number, nextLon: number, nextLocationName: string) => {
    setProjectLocation(nextLocationName);
    onUpdate({
      latitude: nextLat,
      longitude: nextLon,
      locationName: nextLocationName,
    });
    await querySolarHours(nextLat, nextLon);
  };

  const handleSearchLocation = async () => {
    const query = projectLocation.trim();
    if (!query) {
      setGeocodeError(lang === 'en' ? 'Enter a city, address, or place name first.' : '请先输入城市、地址或地点名称。');
      return;
    }

    setSearchingLocation(true);
    setGeocodeError('');
    try {
      const results = await fetchGeocode(query, detectCountryCodeForQuery(query));
      const first = results[0];
      if (!first) {
        setGeocodeError(
          lang === 'en'
            ? 'No matching location was found. Try a nearby city name, ZIP code, or select the site directly on the map.'
            : '未找到匹配的位置。请尝试输入附近城市名、邮编，或直接在地图上选点。',
        );
        return;
      }

      const nextLat = Number(first.lat);
      const nextLon = Number(first.lon);
      const nextLocationName =
        first.formatted_address ||
        first.display_name ||
        formatResolvedAddress(first, lang === 'en' ? 'Selected site' : '已选站点') ||
        query;

      await syncResolvedCoords(nextLat, nextLon, nextLocationName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGeocodeError(
        lang === 'en'
          ? toFriendlyGeocodeError(message)
          : /External geocoder is unreachable from this machine/i.test(message)
            ? '当前设备无法连接地理编码服务，请使用当前位置或在地图上选点。'
            : /Pelias geocoder is unavailable/i.test(message)
              ? 'Pelias 地理编码服务未启动，请先启动 Pelias API 并确认数据已导入。'
              : `无法搜索该位置：${message}`,
      );
    } finally {
      setSearchingLocation(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setGeocodeError(lang === 'en' ? 'This browser does not support geolocation.' : '当前浏览器不支持定位。');
      return;
    }

    setGeolocating(true);
    setGeocodeError('');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });

      const nextLat = position.coords.latitude;
      const nextLon = position.coords.longitude;
      const countryCode = detectCountryCodeForCoords(nextLat, nextLon);

      try {
        const reverse = await fetchReverseGeocode(nextLat, nextLon, countryCode);
        await syncResolvedCoords(nextLat, nextLon, formatResolvedAddress(reverse, lang === 'en' ? 'Selected site' : '已选站点'));
      } catch {
        await syncResolvedCoords(nextLat, nextLon, `${formatCoordinate(nextLat)}, ${formatCoordinate(nextLon)}`);
      }
    } catch {
      setGeocodeError(
        lang === 'en'
          ? 'Unable to determine the current location. Check browser location permission and try again.'
          : '无法获取当前位置，请检查浏览器定位权限后重试。',
      );
    } finally {
      setGeolocating(false);
    }
  };

  const coordinateLabel =
    latitude != null && longitude != null ? `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}` : '';

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <div style={{ marginBottom: '0.45rem', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: '#1f2937' }}>
            {lang === 'en' ? 'Project location' : '项目地点'}
          </span>{' '}
          <span style={{ fontSize: '0.78rem', color: '#2b6cb0' }}>
            💡 {lang === 'en'
              ? 'Search by address or click on the map. Note: solar parameters update when coordinates change.'
              : '可直接输入地址搜索，也可以直接在地图上选择位置，值得注意的是：坐标变化后，日照参数也会随之更新。'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={projectLocation}
            onChange={event => setProjectLocation(event.target.value)}
            placeholder={lang === 'en' ? 'Search a city, address, or place' : '搜索城市、地址或地点'}
            style={{
              flex: '1 1 320px',
              minWidth: 0,
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '0.8rem 0.95rem',
              fontSize: '0.95rem',
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearchLocation();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleSearchLocation()}
            disabled={isLocationActionBusy}
            style={{
              border: 'none',
              borderRadius: '10px',
              padding: '0.8rem 1rem',
              fontWeight: 700,
              color: '#fff',
              background: 'var(--theme-brand-700)',
              cursor: isLocationActionBusy ? 'wait' : 'pointer',
            }}
          >
            {searchingLocation ? t('loc.searching') : (lang === 'en' ? 'Search' : '搜索')}
          </button>
          <button
            type="button"
            onClick={() => void handleUseCurrentLocation()}
            disabled={isLocationActionBusy}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '0.8rem 1rem',
              fontWeight: 700,
              color: '#1e293b',
              background: '#fff',
              cursor: isLocationActionBusy ? 'wait' : 'pointer',
            }}
          >
            {geolocating ? (lang === 'en' ? 'Locating...' : '定位中...') : (lang === 'en' ? 'Use Current Location' : '使用当前位置')}
          </button>
        </div>

        {geocodeError && (
          <div
            style={{
              marginTop: '0.75rem',
              borderRadius: '10px',
              padding: '0.7rem 0.85rem',
              color: 'var(--theme-tone-danger-text)',
              background: 'var(--theme-tone-danger-bg)',
              border: '1px solid var(--theme-tone-danger-border)',
              fontSize: '0.85rem',
            }}
          >
            {geocodeError}
          </div>
        )}

        {solarError && (
          <div
            style={{
              marginTop: '0.75rem',
              borderRadius: '10px',
              padding: '0.7rem 0.85rem',
              color: 'var(--theme-tone-warm-text)',
              background: 'var(--theme-tone-warm-bg)',
              border: '1px solid var(--theme-tone-warm-border)',
              fontSize: '0.85rem',
            }}
          >
            {solarError}
          </div>
        )}
      </div>

      {coordinateLabel && (
        <div
          style={{
            borderRadius: '12px',
            padding: '0.85rem 0.95rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'grid',
            gap: '0.35rem',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {lang === 'en' ? 'Selected coordinates' : '已选坐标'}
          </div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{coordinateLabel}</div>
        </div>
      )}

      {showSolarResult && (
        <div
          style={{
            borderRadius: '14px',
            padding: '1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('loc.solar_result')}</div>
            {loadingSolar && <div style={{ fontSize: '0.8rem', color: 'var(--theme-brand-700)' }}>{t('loc.querying')}</div>}
          </div>

          {solarResult ? (
            <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t('loc.peak_sun')}</div>
                  <div style={{ marginTop: '0.2rem', fontWeight: 700, color: '#0f172a' }}>
                    {solarResult.peakSunHoursPerDay.toFixed(2)} h/day
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t('loc.annual_hrs')}</div>
                  <div style={{ marginTop: '0.2rem', fontWeight: 700, color: '#0f172a' }}>
                    {solarResult.annualEffHours.toFixed(0)} h
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t('loc.irradiance')}</div>
                  <div style={{ marginTop: '0.2rem', fontWeight: 700, color: '#0f172a' }}>
                    {formatIrradianceDualFtFirst(solarResult.annualKwhPerM2)}
                  </div>
                </div>
              </div>

              {(solarResult.climateZone || solarResult.note) && (
                <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.6 }}>
                  {solarResult.climateZone && <div>{lang === 'en' ? 'Climate zone' : '气候带'}: {solarResult.climateZone}</div>}
                  {solarResult.note && <div>{solarResult.note}</div>}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#64748b' }}>
              {apiAvailable === false
                ? (lang === 'en'
                  ? 'Offline mode: the reverse-geocoder and solar API are currently unreachable.'
                  : '当前为离线模式，地理编码与日照接口暂时不可用。')
                : (lang === 'en'
                  ? 'Search a location, use current location, or select a point on the map to load solar parameters.'
                  : '请搜索地点、使用当前位置，或在地图上选择一点以加载日照参数。')}
            </div>
          )}
        </div>
      )}

      {showPanelSelector && (
        <div>
          <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: '0.45rem' }}>{t('loc.panel_label')}</div>
          <select
            value={selectedPanel}
            onChange={event => {
              const nextPanel = event.target.value;
              setSelectedPanel(nextPanel);
              onUpdate({ panelModel: nextPanel });
            }}
            style={{
              width: '100%',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '0.8rem 0.95rem',
              fontSize: '0.95rem',
              background: '#fff',
            }}
          >
            {pvPanels.map(panel => (
              <option key={panel.model} value={panel.model}>
                {getLocalizedProductLabel(panel, lang) || panel.displayName}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
