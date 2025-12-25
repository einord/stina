import { t } from '@stina/i18n'
import type { SettingsStore } from '@stina/core'
import { STINA_NO_REPLY } from './messageTypes.js'

/**
 * Get system prompt in user's language
 * Uses i18n to translate the prompt based on current language setting
 * Can be overridden via Settings (app.systemPrompt)
 *
 * @param settingsStore - Optional settings store to check for user override
 * @returns System prompt in user's language
 */
export function getSystemPrompt(settingsStore?: SettingsStore): string {
  // Check for user override in settings
  if (settingsStore) {
    const override = settingsStore.get('app', 'systemPrompt')
    if (override && typeof override === 'string') {
      return override
    }
  }

  // Use translated default
  return t('chat.system_prompt', {
    no_reply_marker: STINA_NO_REPLY,
  })
}
