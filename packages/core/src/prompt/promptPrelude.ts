import { getLang, t } from '@stina/i18n';
import type { PersonalityPreset, SettingsState } from '@stina/settings';

type PreludeResult = {
  content: string;
  debugContent: string;
};

const personalityPresetKeys: Record<Exclude<PersonalityPreset, 'custom'>, string> = {
  friendly: 'chat.personality.presets.friendly.instruction',
  concise: 'chat.personality.presets.concise.instruction',
  sarcastic: 'chat.personality.presets.sarcastic.instruction',
  professional: 'chat.personality.presets.professional.instruction',
  informative: 'chat.personality.presets.informative.instruction',
  coach: 'chat.personality.presets.coach.instruction',
  no_bullshit: 'chat.personality.presets.no_bullshit.instruction',
};

function resolveLocale(settings: SettingsState): string {
  return settings.localization?.language || settings.desktop?.language || getLang() || 'en';
}

/**
 * Formats a numeric UTC offset in minutes to `UTC±HH:MM`.
 */
function formatUtcOffset(offsetMinutes: number): string {
  const total = Math.abs(offsetMinutes);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/**
 * Parses a "GMT±H" / "GMT±HH:MM" offset string into minutes.
 */
function parseGmtOffset(value: string): number | null {
  const match = value.match(/(?:GMT|UTC)(?:(?<sign>[+-])(?<hh>\d{1,2})(?::?(?<mm>\d{2}))?)?/);
  if (!match || !match.groups) return null;
  const sign = match.groups.sign;
  const hh = match.groups.hh;
  const mm = match.groups.mm;
  if (!sign || !hh) return 0;
  const hours = Number(hh);
  const minutes = mm ? Number(mm) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const total = hours * 60 + minutes;
  return sign === '-' ? -total : total;
}

/**
 * Computes the current UTC offset minutes for a given timezone and date.
 */
function getUtcOffsetMinutesForTimeZone(date: Date, timeZone: string): number {
  const tzName = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
      }).formatToParts(date);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    } catch {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'short',
      }).formatToParts(date);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    }
  })();
  return parseGmtOffset(tzName) ?? 0;
}

/**
 * Resolves the timezone Stina should use for grounding and scheduling.
 */
function resolveTimeZone(settings: SettingsState, locale: string): string {
  const override = settings.localization?.timezone?.trim();
  if (override) return override;
  return Intl.DateTimeFormat(locale).resolvedOptions().timeZone || 'UTC';
}

/**
 * Returns locale date/time strings plus timezone metadata for LLM grounding.
 */
function formatDateTime(locale: string, timeZone: string) {
  const now = new Date();
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const utcOffsetMinutes = getUtcOffsetMinutesForTimeZone(now, timeZone);
  const utcOffset = formatUtcOffset(utcOffsetMinutes);

  return { date, time, timeZone, utcOffset };
}

function resolvePersonalityText(settings: SettingsState): string | null {
  const personality = settings.personality;
  if (!personality) return null;

  if (personality.preset && personality.preset !== 'custom') {
    const key = personalityPresetKeys[personality.preset];
    if (key) return t(key);
  }

  const custom = personality.customText?.trim();
  // If custom preset is selected but text is empty/whitespace, intentionally fall back to no personality.
  return custom ? custom : null;
}

export function buildPromptPrelude(
  settings: SettingsState,
  conversationId: string,
): PreludeResult {
  const locale = resolveLocale(settings);
  const timeZone = resolveTimeZone(settings, locale);
  const { date, time, utcOffset } = formatDateTime(locale, timeZone);
  const systemInfo = t('chat.system_information', { date, time, timeZone, utcOffset });
  const personRegistry = t('chat.person_registry_instruction');
  const personality = resolvePersonalityText(settings);

  const lines = [systemInfo, personRegistry];
  if (personality) lines.push(personality);

  const content = lines.join('\n');
  const debugLines = [`[system-info] ${systemInfo}`, `[person-registry] ${personRegistry}`];
  if (personality) debugLines.push(`[personality] ${personality}`);

  return {
    content,
    debugContent: debugLines.join('\n'),
  };
}
