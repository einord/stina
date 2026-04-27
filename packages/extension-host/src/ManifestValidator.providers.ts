/**
 * Provider Validation
 *
 * Validates provider definitions. Detailed schema validation for the
 * declarative `configView` (component tree) is handled by the same
 * extensionComponent validation used for panels and toolSettings views.
 */

import type { ProviderDefinition } from '@stina/extension-api'

/**
 * Validate provider definitions
 * @param providers Array of providers to validate
 * @param errors Array to collect errors
 */
export function validateProviders(providers: unknown[], errors: string[]): void {
  for (const provider of providers) {
    if (typeof provider !== 'object' || !provider) {
      errors.push('Each provider must be an object')
      continue
    }

    const p = provider as Partial<ProviderDefinition>
    const providerId = typeof p.id === 'string' ? p.id : 'unknown'

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Provider missing "id" field')
    }

    if (!p.name || typeof p.name !== 'string') {
      errors.push(`Provider "${providerId}" missing "name" field`)
    }

    if (p.configView !== undefined) {
      if (typeof p.configView !== 'object' || !p.configView) {
        errors.push(`Provider "${providerId}": configView must be an object`)
      } else if (typeof p.configView.content !== 'object' || !p.configView.content) {
        errors.push(`Provider "${providerId}": configView.content must be a component object`)
      }
    }
  }
}
