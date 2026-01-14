/**
 * Style Sanitizer for Extension Components
 *
 * Provides security by validating and sanitizing CSS styles
 * from untrusted extension sources.
 */

/** Set of allowed CSS properties */
const ALLOWED_PROPERTIES = new Set<string>([
  // Colors
  'color',
  'background-color',
  'background',
  'border-color',
  // Borders
  'border',
  'border-width',
  'border-style',
  'border-radius',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  // Spacing
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
  // Typography
  'font-size',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration',
  'line-height',
  'letter-spacing',
  'white-space',
  'word-break',
  'overflow-wrap',
  // Layout (safe properties)
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'flex-wrap',
  'align-self',
  'justify-self',
  'align-items',
  'justify-content',
  // Visual
  'opacity',
  'visibility',
  'overflow',
  'overflow-x',
  'overflow-y',
  'box-shadow',
  'outline',
  'cursor',
  'border-collapse',
  'border-spacing',
])

/** Properties that are explicitly blocked (for documentation/logging) */
const BLOCKED_PROPERTIES = new Set<string>([
  // Positioning (UI spoofing)
  'position',
  'z-index',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  // Interaction blocking (clickjacking)
  'pointer-events',
  // Content injection
  'content',
  // Transforms that could overlay UI
  'transform',
  'transform-origin',
  'translate',
  'rotate',
  'scale',
  // Clip/mask that could hide malicious content
  'clip-path',
  'mask',
  'mask-image',
  // Filter can be used for phishing
  'filter',
  'backdrop-filter',
])

/** Patterns that indicate dangerous CSS values */
const DANGEROUS_VALUE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /url\s*\(/i, description: 'url() - potential data exfiltration' },
  { pattern: /expression\s*\(/i, description: 'expression() - IE script execution' },
  { pattern: /javascript\s*:/i, description: 'javascript: protocol' },
  { pattern: /-moz-binding/i, description: 'Mozilla XBL binding' },
  { pattern: /behavior\s*:/i, description: 'IE behavior' },
  { pattern: /@import/i, description: '@import rule' },
  // Block Unicode escapes to prevent obfuscation attacks where dangerous content
  // could be hidden using escape sequences (e.g., \6a\61\76\61\73\63\72\69\70\74 = "javascript")
  { pattern: /\\[0-9a-f]{1,6}/i, description: 'Unicode escape sequence' },
]

/**
 * Result of style sanitization.
 */
export interface SanitizedStyleResult {
  /** The sanitized CSS styles as a CSSStyleDeclaration-compatible object */
  styles: Record<string, string>
  /** Any properties or values that were blocked */
  blocked: Array<{ property: string; value: string; reason: string }>
}

/**
 * Check if a CSS property is allowed.
 */
export function isAllowedProperty(property: string): boolean {
  const normalized = property.toLowerCase().trim()
  return ALLOWED_PROPERTIES.has(normalized)
}

/**
 * Check if a CSS value contains dangerous patterns.
 */
export function isDangerousValue(value: string): { dangerous: boolean; reason?: string } {
  const normalized = value.toLowerCase()

  for (const { pattern, description } of DANGEROUS_VALUE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        dangerous: true,
        reason: `Value matches dangerous pattern: ${description}`,
      }
    }
  }

  return { dangerous: false }
}

/**
 * Sanitize a single CSS value.
 * Returns the sanitized value or null if the value should be blocked.
 */
export function sanitizeValue(value: string): string | null {
  if (typeof value !== 'string') {
    return null
  }

  // Check for dangerous patterns
  const dangerCheck = isDangerousValue(value)
  if (dangerCheck.dangerous) {
    return null
  }

  // Basic sanitization: trim whitespace
  return value.trim()
}

/**
 * Convert kebab-case CSS property to camelCase for Vue style binding.
 */
export function toCamelCase(property: string): string {
  return property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Sanitize an entire style object.
 * Returns only safe properties with safe values.
 */
export function sanitizeStyles(styles: Record<string, unknown>): SanitizedStyleResult {
  const result: SanitizedStyleResult = {
    styles: {},
    blocked: [],
  }

  if (!styles || typeof styles !== 'object') {
    return result
  }

  for (const [property, value] of Object.entries(styles)) {
    // Skip non-string values (they should have been resolved by now)
    if (typeof value !== 'string') {
      result.blocked.push({
        property,
        value: String(value),
        reason: 'Value is not a string after resolution',
      })
      continue
    }

    const normalizedProperty = property.toLowerCase().trim()

    // Check if property is allowed
    if (!isAllowedProperty(normalizedProperty)) {
      const reason = BLOCKED_PROPERTIES.has(normalizedProperty)
        ? `Property "${property}" is explicitly blocked for security`
        : `Property "${property}" is not in the allowlist`

      result.blocked.push({ property, value, reason })
      continue
    }

    // Sanitize the value
    const sanitizedValue = sanitizeValue(value)
    if (sanitizedValue === null) {
      const dangerCheck = isDangerousValue(value)
      result.blocked.push({
        property,
        value,
        reason: dangerCheck.reason || 'Value failed sanitization',
      })
      continue
    }

    // Convert property to camelCase for Vue style binding
    const camelCaseProperty = toCamelCase(normalizedProperty)
    result.styles[camelCaseProperty] = sanitizedValue
  }

  return result
}
