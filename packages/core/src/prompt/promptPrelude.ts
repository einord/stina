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
  return settings.desktop?.language || getLang() || 'en';
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
 * Returns system locale date/time strings plus timezone metadata for LLM grounding.
 */
function formatDateTime(locale: string) {
  const now = new Date();
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const timeZone = Intl.DateTimeFormat(locale).resolvedOptions().timeZone || 'UTC';
  const utcOffset = formatUtcOffset(-now.getTimezoneOffset());

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
  const { date, time, timeZone, utcOffset } = formatDateTime(locale);
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
