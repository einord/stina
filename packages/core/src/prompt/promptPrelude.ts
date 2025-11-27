import { getLang, t } from '@stina/i18n';
import type { InteractionMessage } from '@stina/chat/types';
import type { PersonalityPreset, SettingsState } from '@stina/settings';

type PreludeResult = {
  messages: InteractionMessage[];
  debugText: string;
};

const personalityPresetKeys: Record<Exclude<PersonalityPreset, 'custom'>, string> = {
  friendly: 'chat.personality.presets.friendly.instruction',
  concise: 'chat.personality.presets.concise.instruction',
  sarcastic: 'chat.personality.presets.sarcastic.instruction',
  dry: 'chat.personality.presets.dry.instruction',
  informative: 'chat.personality.presets.informative.instruction',
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
  return custom ? custom : null;
}

export function buildPromptPrelude(
  settings: SettingsState,
  conversationId: string,
): PreludeResult {
  const locale = resolveLocale(settings);
  const { date, time } = formatDateTime(locale);
  const systemInfo = t('chat.system_information', { date, time });
  const personality = resolvePersonalityText(settings);

  const lines = [systemInfo];
  if (personality) lines.push(personality);

  const content = lines.join('\n');
  const debugLines = [`[system-info] ${systemInfo}`];
  if (personality) debugLines.push(`[personality] ${personality}`);

  const message: InteractionMessage = {
    id: 'prelude_system',
    interactionId: 'prelude',
    conversationId,
    role: 'instructions',
    content,
    ts: Date.now(),
    provider: null,
    aborted: false,
    metadata: null,
  };

  return {
    messages: [message],
    debugText: debugLines.join('\n'),
  };
}
