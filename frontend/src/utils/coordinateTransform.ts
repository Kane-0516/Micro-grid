export type CoordSystem = 'wgs84' | 'gcj02' | 'bd09';

const PI = Math.PI;
const X_PI = PI * 3000.0 / 180.0;
const EARTH_A = 6378245.0;
const EARTH_EE = 0.006693421622965943;

type Coordinate = {
  lat: number;
  lon: number;
};

function outOfChina(lat: number, lon: number) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLon(x: number, y: number) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function delta(lat: number, lon: number) {
  const dLat = transformLat(lon - 105.0, lat - 35.0);
  const dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  return {
    lat: (dLat * 180.0) / ((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic) * PI),
    lon: (dLon * 180.0) / (EARTH_A / sqrtMagic * Math.cos(radLat) * PI),
  };
}

export function wgs84ToGcj02(lat: number, lon: number): Coordinate {
  if (outOfChina(lat, lon)) return { lat, lon };

  const offset = delta(lat, lon);
  return {
    lat: lat + offset.lat,
    lon: lon + offset.lon,
  };
}

export function gcj02ToWgs84(lat: number, lon: number): Coordinate {
  if (outOfChina(lat, lon)) return { lat, lon };

  const converted = wgs84ToGcj02(lat, lon);
  return {
    lat: lat * 2 - converted.lat,
    lon: lon * 2 - converted.lon,
  };
}

export function gcj02ToBd09(lat: number, lon: number): Coordinate {
  const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * X_PI);

  return {
    lat: z * Math.sin(theta) + 0.006,
    lon: z * Math.cos(theta) + 0.0065,
  };
}

export function bd09ToGcj02(lat: number, lon: number): Coordinate {
  const x = lon - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);

  return {
    lat: z * Math.sin(theta),
    lon: z * Math.cos(theta),
  };
}

export function normalizeToWgs84(lat: number, lon: number, system: CoordSystem): Coordinate {
  if (system === 'gcj02') return gcj02ToWgs84(lat, lon);
  if (system === 'bd09') {
    const gcj02 = bd09ToGcj02(lat, lon);
    return gcj02ToWgs84(gcj02.lat, gcj02.lon);
  }
  return { lat, lon };
}

export function formatCoordinate(value: number, digits = 6) {
  return value.toFixed(digits);
}
