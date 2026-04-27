/**
 * Host-managed two-way binding for extension components.
 *
 * Used when the host (Stina) — not the extension — owns the form state.
 * Extension wrapper components (TextInput, Select, etc.) call
 * `tryUseHostBinding()` to detect this mode. If a binding setter is
 * available and the field has no `onChangeAction`, the wrapper updates
 * the host state directly instead of round-tripping through an
 * extension action.
 *
 * The binding path is derived from the field's `value` prop when it is
 * a `$`-reference (e.g. `"$settings.apiKey"`).
 */

import { inject, provide, type InjectionKey } from 'vue'

export type HostBindingSetter = (path: string, value: unknown) => void

const HOST_BINDING_KEY: InjectionKey<HostBindingSetter> = Symbol('host-binding')

export function provideHostBinding(setter: HostBindingSetter): void {
  provide(HOST_BINDING_KEY, setter)
}

export function tryUseHostBinding(): HostBindingSetter | undefined {
  return inject(HOST_BINDING_KEY, undefined)
}

/**
 * Extract the binding path from a `$`-prefixed value reference.
 * Returns `undefined` if the value isn't a `$`-reference.
 *
 * @example
 *   bindingPath("$settings.apiKey") // => "settings.apiKey"
 *   bindingPath("hardcoded")        // => undefined
 *   bindingPath(42)                 // => undefined
 */
export function bindingPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('$')) return undefined
  return value.slice(1)
}
