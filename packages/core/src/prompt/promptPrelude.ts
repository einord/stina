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
  return { date, time };
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
  const { date, time } = formatDateTime(locale);
  const systemInfo = t('chat.system_information', { date, time });
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
