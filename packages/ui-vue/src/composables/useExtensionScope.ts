import { inject, provide, computed, type InjectionKey, type ComputedRef } from 'vue'
import { sanitizeStyles, type SanitizedStyleResult } from '../utils/styleSanitizer.js'

// Re-export for convenience
export type { SanitizedStyleResult } from '../utils/styleSanitizer.js'

/** Scope containing resolved data for extension components. */
export type ExtensionScope = Record<string, unknown>

const EXTENSION_SCOPE_KEY: InjectionKey<ComputedRef<ExtensionScope>> = Symbol('extension-scope')

/**
 * Provide a scope for child extension components.
 * Merges with parent scope if one exists.
 */
export function provideExtensionScope(scopeData: ComputedRef<ExtensionScope> | ExtensionScope): void {
  const parentScope = inject(EXTENSION_SCOPE_KEY, null)

  const mergedScope = computed(() => {
    const parent: ExtensionScope = parentScope?.value ?? {}
    const current: ExtensionScope =
      scopeData && typeof scopeData === 'object' && 'value' in scopeData
        ? (scopeData as ComputedRef<ExtensionScope>).value
        : (scopeData as ExtensionScope)
    return { ...parent, ...current }
  })

  provide(EXTENSION_SCOPE_KEY, mergedScope)
}

/**
 * Inject the current extension scope.
 */
export function useExtensionScope(): ComputedRef<ExtensionScope> {
  return inject(EXTENSION_SCOPE_KEY, computed(() => ({})))
}

/**
 * Resolve a value that may contain $-prefixed references.
 *
 * @example
 * resolveValue("$project.name", { project: { name: "My Project" } })
 * // => "My Project"
 *
 * resolveValue("Static text", { })
 * // => "Static text"
 *
 * resolveValue("$items", { items: [1, 2, 3] })
 * // => [1, 2, 3]
 */
export function resolveValue(value: unknown, scope: ExtensionScope): unknown {
  if (typeof value !== 'string') {
    return value
  }

  if (!value.startsWith('$')) {
    return value
  }

  // Remove $ prefix and split by dots for nested access
  const path = value.slice(1)
  return getNestedValue(scope, path)
}

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Resolve and sanitize styles from an extension component.
 *
 * 1. Resolves any $-prefixed values in the style object
 * 2. Sanitizes the resolved styles, blocking dangerous properties/values
 *
 * @param style - The style object from the component (may contain $-refs)
 * @param scope - The current extension scope
 * @returns Sanitized styles ready for Vue :style binding
 */
export function resolveAndSanitizeStyles(
  style: Record<string, unknown> | undefined,
  scope: ExtensionScope
): SanitizedStyleResult {
  if (!style || typeof style !== 'object') {
    return { styles: {}, blocked: [] }
  }

  // First pass: resolve all $-prefixed values
  const resolvedStyles: Record<string, unknown> = {}
  for (const [property, value] of Object.entries(style)) {
    resolvedStyles[property] = resolveValue(value, scope)
  }

  // Second pass: sanitize the resolved styles
  return sanitizeStyles(resolvedStyles)
}

/** Props with sanitized style result attached. */
export interface ResolvedComponentProps extends Record<string, unknown> {
  __sanitizedStyle?: SanitizedStyleResult
}

/**
 * Resolve all $-prefixed values in an object's properties.
 * Does not recurse into nested objects (children are handled separately).
 * Style property is resolved and sanitized separately.
 */
export function resolveComponentProps(
  props: Record<string, unknown>,
  scope: ExtensionScope
): ResolvedComponentProps {
  const resolved: ResolvedComponentProps = {}

  for (const [key, value] of Object.entries(props)) {
    // Skip children - they are handled by ExtensionChildren
    // Skip content only if it's a component definition (object), not a string
    if (key === 'children' || (key === 'content' && typeof value === 'object')) {
      resolved[key] = value
    } else if (key === 'style') {
      // Handle style separately with sanitization
      resolved.__sanitizedStyle = resolveAndSanitizeStyles(
        value as Record<string, unknown>,
        scope
      )
    } else {
      resolved[key] = resolveValue(value, scope)
    }
  }

  return resolved
}

/**
 * Check if children is an iterator (has each/as/items) or a static array.
 */
export function isIterator(
  children: unknown
): children is { each: string | unknown[]; as: string; items: unknown[] } {
  return (
    children !== null &&
    typeof children === 'object' &&
    'each' in children &&
    'as' in children &&
    'items' in children
  )
}
