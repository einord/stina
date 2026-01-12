import { inject, provide, computed, type InjectionKey, type ComputedRef } from 'vue'

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
 * Resolve all $-prefixed values in an object's properties.
 * Does not recurse into nested objects (children are handled separately).
 */
export function resolveComponentProps(
  props: Record<string, unknown>,
  scope: ExtensionScope
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    // Skip children - they are handled by ExtensionChildren
    if (key === 'children' || key === 'content') {
      resolved[key] = value
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
