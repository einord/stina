import type { WeatherLocation } from '@stina/settings';
import { getWeatherSettings, updateWeatherSettings } from '@stina/settings';

import {
  type GeocodedLocation,
  describeWeatherCode,
  fetchCurrentWeather,
  geocodeLocation,
} from './openMeteo.js';
import type { ToolDefinition } from '@stina/core';

/**
 * Converts unknown values into a plain object to simplify parsing.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Ensures stored settings are normalized to the geocoding shape.
 */
function toGeocodedLocation(location?: WeatherLocation | null): GeocodedLocation | null {
  if (!location) return null;
  return {
    name: location.name,
    admin1: location.admin1,
    admin2: location.admin2,
    country: location.country,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone,
    formattedName: location.formattedName ?? location.name,
  };
}

/**
 * Handles the set_weather_location tool by geocoding and persisting the result.
 */
async function handleSetWeatherLocation(args: unknown) {
  const payload = toRecord(args);
  const query = typeof payload['query'] === 'string' ? payload['query'].trim() : '';
  if (!query) {
    return { ok: false, error: 'set_weather_location requires a non-empty query' };
  }
  try {
    const match = await geocodeLocation(query);
    if (!match) {
      return { ok: false, error: `No location found for "${query}". Try a more specific name.` };
    }
    const settings = await updateWeatherSettings({ locationQuery: query, location: match });
    return { ok: true, location: match, settings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Handles weather_current by fetching current conditions for the saved or provided location.
 */
async function handleWeatherCurrent(args: unknown) {
  const payload = toRecord(args);
  const overrideQuery =
    typeof payload['location'] === 'string' && payload['location'].trim() !== ''
      ? payload['location'].trim()
      : null;

  try {
    let location: GeocodedLocation | null = null;
    let settings = await getWeatherSettings();

    if (overrideQuery) {
      location = await geocodeLocation(overrideQuery);
      if (!location) {
        return {
          ok: false,
          error: `No location found for "${overrideQuery}". Try a more specific name.`,
        };
      }
    } else {
      location = toGeocodedLocation(settings.location);
      if (!location && settings.locationQuery) {
        location = await geocodeLocation(settings.locationQuery);
        if (location) {
          settings = await updateWeatherSettings({ location });
        }
      }
    }

    if (!location) {
      return {
        ok: false,
        error: 'No weather location configured. Ask the user for their city/place, call set_weather_location, then retry.',
        needs_location: true,
      };
    }

    const weather = await fetchCurrentWeather(location);
    return {
      ok: true,
      weather,
      location: weather.location,
      condition_label: describeWeatherCode(weather.current.conditionCode),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export const weatherTools: ToolDefinition[] = [
  {
    spec: {
      name: 'set_weather_location',
      description:
        'Updates the saved weather location using a user-provided place name. If a weather request comes in without a saved location, ask the user for their city/place and call this immediately with their answer.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Location search query (city, region, or place).',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    handler: handleSetWeatherLocation,
  },
  {
    spec: {
      name: 'weather_current',
      description:
        'Fetches the current weather for the saved location. If no location is saved, ask the user for their city/place, call set_weather_location with it, then run this again.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Optional one-off location override (city or place name).',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    handler: handleWeatherCurrent,
  },
];
