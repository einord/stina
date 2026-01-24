/**
 * Provider Validation
 *
 * Validates provider definitions and their config schemas.
 */

import type {
  ProviderDefinition,
  ProviderConfigSchema,
  ProviderConfigProperty,
  ProviderConfigSelectOption,
  ProviderConfigValidation,
} from '@stina/extension-api'

const VALID_CONFIG_PROPERTY_TYPES = ['string', 'number', 'boolean', 'select', 'password', 'url']

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

    // Validate configSchema if present
    if (p.configSchema !== undefined) {
      validateConfigSchema(providerId, p.configSchema, errors)
    }
  }
}

/**
 * Validate a provider's configuration schema
 * @param providerId The provider ID for error messages
 * @param schema The config schema to validate
 * @param errors Array to collect errors
 */
export function validateConfigSchema(providerId: string, schema: unknown, errors: string[]): void {
  if (typeof schema !== 'object' || !schema) {
    errors.push(`Provider "${providerId}": configSchema must be an object`)
    return
  }

  const s = schema as Partial<ProviderConfigSchema>

  if (!s.properties || typeof s.properties !== 'object') {
    errors.push(`Provider "${providerId}": configSchema must have "properties" object`)
    return
  }

  // Validate order array if present
  if (s.order !== undefined) {
    if (!Array.isArray(s.order)) {
      errors.push(`Provider "${providerId}": configSchema.order must be an array`)
    } else {
      const propertyKeys = Object.keys(s.properties as object)
      for (const key of s.order) {
        if (typeof key !== 'string') {
          errors.push(`Provider "${providerId}": configSchema.order must contain only strings`)
        } else if (!propertyKeys.includes(key)) {
          errors.push(
            `Provider "${providerId}": configSchema.order references unknown property "${key}"`
          )
        }
      }
    }
  }

  // Validate each property
  const properties = s.properties as Record<string, ProviderConfigProperty>
  for (const [key, prop] of Object.entries(properties)) {
    validateConfigProperty(providerId, key, prop, errors)
  }
}

/**
 * Validate a single config property
 */
function validateConfigProperty(
  providerId: string,
  propKey: string,
  prop: unknown,
  errors: string[]
): void {
  const prefix = `Provider "${providerId}": configSchema.properties.${propKey}`

  if (typeof prop !== 'object' || !prop) {
    errors.push(`${prefix} must be an object`)
    return
  }

  const p = prop as Partial<ProviderConfigProperty>

  // Required: type
  if (!p.type || typeof p.type !== 'string') {
    errors.push(`${prefix} missing "type" field`)
  } else if (!VALID_CONFIG_PROPERTY_TYPES.includes(p.type)) {
    errors.push(
      `${prefix} has invalid type "${p.type}". Valid: ${VALID_CONFIG_PROPERTY_TYPES.join(', ')}`
    )
  }

  // Required: title
  if (!p.title || typeof p.title !== 'string') {
    errors.push(`${prefix} missing "title" field`)
  }

  // Optional: description
  if (p.description !== undefined && typeof p.description !== 'string') {
    errors.push(`${prefix}.description must be a string`)
  }

  // Optional: placeholder
  if (p.placeholder !== undefined && typeof p.placeholder !== 'string') {
    errors.push(`${prefix}.placeholder must be a string`)
  }

  // Optional: required
  if (p.required !== undefined && typeof p.required !== 'boolean') {
    errors.push(`${prefix}.required must be a boolean`)
  }

  // For select type: options required
  if (p.type === 'select') {
    validateSelectOptions(prefix, p, errors)
  }

  // Optional: validation
  if (p.validation !== undefined) {
    validatePropertyValidation(prefix, p.validation, errors)
  }
}

/**
 * Validate select-type property options
 */
function validateSelectOptions(
  prefix: string,
  p: Partial<ProviderConfigProperty>,
  errors: string[]
): void {
  if (!p.options || !Array.isArray(p.options)) {
    errors.push(`${prefix} of type "select" must have "options" array`)
    return
  }

  for (let i = 0; i < p.options.length; i++) {
    const opt = p.options[i]
    if (typeof opt !== 'object' || !opt) {
      errors.push(`${prefix}.options[${i}] must be an object`)
      continue
    }
    const o = opt as Partial<ProviderConfigSelectOption>
    if (typeof o.value !== 'string') {
      errors.push(`${prefix}.options[${i}].value must be a string`)
    }
    if (typeof o.label !== 'string') {
      errors.push(`${prefix}.options[${i}].label must be a string`)
    }
  }
}

/**
 * Validate a property's validation constraints
 */
function validatePropertyValidation(
  prefix: string,
  validation: unknown,
  errors: string[]
): void {
  if (typeof validation !== 'object' || !validation) {
    errors.push(`${prefix}.validation must be an object`)
    return
  }

  const v = validation as Partial<ProviderConfigValidation>

  if (v.pattern !== undefined && typeof v.pattern !== 'string') {
    errors.push(`${prefix}.validation.pattern must be a string`)
  }
  if (v.minLength !== undefined && typeof v.minLength !== 'number') {
    errors.push(`${prefix}.validation.minLength must be a number`)
  }
  if (v.maxLength !== undefined && typeof v.maxLength !== 'number') {
    errors.push(`${prefix}.validation.maxLength must be a number`)
  }
  if (v.min !== undefined && typeof v.min !== 'number') {
    errors.push(`${prefix}.validation.min must be a number`)
  }
  if (v.max !== undefined && typeof v.max !== 'number') {
    errors.push(`${prefix}.validation.max must be a number`)
  }
}
