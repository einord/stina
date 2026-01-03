const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export interface GeocodedLocation {
  name: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  formattedName: string;
}

export interface CurrentWeather {
  temperatureC?: number;
  apparentTemperatureC?: number;
  humidityPercent?: number;
  precipitationMm?: number;
  windSpeedMs?: number;
  windDirectionDegrees?: number;
  cloudCoverPercent?: number;
  conditionCode?: number;
  condition?: string;
  observedAt?: string;
  timezone?: string;
}

export interface CurrentWeatherPayload {
  location: GeocodedLocation;
  current: CurrentWeather;
}

/**
 * Performs a geocoding lookup against the Open-Meteo API and returns the best match.
 * @param query Free-form location string (city, region, country).
 */
export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo geocoding failed (${res.status} ${res.statusText})`);
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const results = Array.isArray(payload['results']) ? payload['results'] : [];
  if (results.length === 0) return null;
  const entry = results[0] as Record<string, unknown>;
  return normalizeLocation(entry);
}

/**
 * Fetches the current weather for the given coordinates from Open-Meteo.
 * @param location Geocoded location containing coordinates and display metadata.
 */
export async function fetchCurrentWeather(
  location: GeocodedLocation,
): Promise<CurrentWeatherPayload> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'auto',
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    precipitation_unit: 'mm',
  });
  const url = `${FORECAST_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo forecast failed (${res.status} ${res.statusText})`);
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const current = (payload['current'] as Record<string, unknown>) ?? {};
  const currentUnits = (payload['current_units'] as Record<string, string>) ?? {};

  const conditionCode =
    typeof current['weather_code'] === 'number'
      ? current['weather_code']
      : typeof current['weather_code'] === 'string'
        ? Number.parseInt(current['weather_code'], 10)
        : undefined;

  const observedAt = typeof current['time'] === 'string' ? current['time'] : undefined;
  const timezone = typeof payload['timezone'] === 'string' ? payload['timezone'] : location.timezone;

  const toNumber = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  return {
    location: {
      ...location,
      timezone,
    },
    current: {
      temperatureC: toNumber(current['temperature_2m']),
      apparentTemperatureC: toNumber(current['apparent_temperature']),
      humidityPercent: toNumber(current['relative_humidity_2m']),
      precipitationMm: toNumber(current['precipitation']),
      windSpeedMs: toNumber(current['wind_speed_10m']),
      windDirectionDegrees: toNumber(current['wind_direction_10m']),
      cloudCoverPercent: toNumber(current['cloud_cover']),
      conditionCode,
      condition: describeWeatherCode(conditionCode),
      observedAt,
      timezone,
    },
  };
}

/**
 * Maps Open-Meteo WMO condition codes to human-friendly labels.
 * @param code Numeric weather code from the API.
 */
export function describeWeatherCode(code: number | undefined): string | undefined {
  if (code == null || Number.isNaN(code)) return undefined;
  return WEATHER_CODE_DESCRIPTIONS[code] ?? `Code ${code}`;
}

function normalizeLocation(entry: Record<string, unknown>): GeocodedLocation {
  const name = typeof entry['name'] === 'string' ? entry['name'] : 'Unknown';
  const admin1 = typeof entry['admin1'] === 'string' ? entry['admin1'] : undefined;
  const admin2 = typeof entry['admin2'] === 'string' ? entry['admin2'] : undefined;
  const country = typeof entry['country'] === 'string' ? entry['country'] : undefined;
  const latitude =
    typeof entry['latitude'] === 'number'
      ? entry['latitude']
      : typeof entry['latitude'] === 'string'
        ? Number.parseFloat(entry['latitude'])
        : 0;
  const longitude =
    typeof entry['longitude'] === 'number'
      ? entry['longitude']
      : typeof entry['longitude'] === 'string'
        ? Number.parseFloat(entry['longitude'])
        : 0;
  const timezone = typeof entry['timezone'] === 'string' ? entry['timezone'] : undefined;
  const parts = [name, admin1, country].filter(Boolean);

  return {
    name,
    admin1,
    admin2,
    country,
    latitude,
    longitude,
    timezone,
    formattedName: parts.join(', '),
  };
}

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle (light)',
  57: 'Freezing drizzle (dense)',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Freezing rain (light)',
  67: 'Freezing rain (heavy)',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};
