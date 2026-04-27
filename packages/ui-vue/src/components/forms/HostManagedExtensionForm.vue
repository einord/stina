<script lang="ts" setup>
/**
 * Renders an extension component tree where the *host* owns the form
 * state. Inputs without an `onChangeAction` write directly into the
 * v-model object via two-way binding; inputs with an `onChangeAction`
 * still call the extension as usual (e.g. an OAuth "Sign in" button).
 *
 * Used for provider-config forms where the host stores values in its
 * own DB (e.g. modelConfig.settingsOverride) instead of the extension's
 * settings store.
 */
import { computed } from 'vue'
import type { ExtensionComponentData } from '@stina/extension-api'
import { provideExtensionScope } from '../../composables/useExtensionScope.js'
import { provideHostBinding, type HostBindingSetter } from '../../composables/useHostBinding.js'
import ExtensionComponent from '../extension-components/ExtensionComponent.vue'

const props = defineProps<{
  /** Component tree to render. */
  tree: ExtensionComponentData
  /**
   * Scope key under which the form values are exposed. Bindings use
   * `value: "$<scopeKey>.<field>"` (default `settings`).
   */
  scopeKey?: string
}>()

const settings = defineModel<Record<string, unknown>>({ default: () => ({}) })

const scopeKeyName = computed(() => props.scopeKey ?? 'settings')

provideExtensionScope(
  computed(() => ({ [scopeKeyName.value]: settings.value }))
)

const setBinding: HostBindingSetter = (path, value) => {
  // Path looks like "settings.apiKey" — strip the scope key prefix and
  // write the remainder into the model. Supports nested paths via dots.
  const parts = path.split('.')
  if (parts[0] !== scopeKeyName.value) return
  const tail = parts.slice(1)
  if (tail.length === 0) return

  const next: Record<string, unknown> = { ...(settings.value ?? {}) }
  let cursor: Record<string, unknown> = next
  for (let i = 0; i < tail.length - 1; i++) {
    const segment = tail[i]!
    const existing = cursor[segment]
    cursor[segment] =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {}
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[tail[tail.length - 1]!] = value

  settings.value = next
}

provideHostBinding(setBinding)
</script>

<template>
  <ExtensionComponent :extension-component="tree" />
</template>
