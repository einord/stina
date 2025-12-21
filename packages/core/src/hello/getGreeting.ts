import type { Greeting } from '@stina/shared'
import { t } from '@stina/i18n'

/**
 * Get a greeting message
 * @param name - Name to greet, defaults to "world"
 */
export function getGreeting(name = 'world'): Greeting {
  const resolvedName = name.trim() || t('greeting.default_name')
  return {
    message: t('greeting.message', { name: resolvedName }),
    timestamp: new Date().toISOString(),
  }
}
