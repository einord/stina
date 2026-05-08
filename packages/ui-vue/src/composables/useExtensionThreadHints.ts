import { ref } from 'vue'
import type { ExtensionThreadHints } from '@stina/extension-api'
import { useApi } from './useApi.js'

/**
 * Composable that loads and exposes thread-hint declarations from installed
 * extensions. Hints are fetched once on demand (call `load()`) and keyed by
 * extension id.
 *
 * Hints are not refreshed on extension lifecycle events — if the user installs
 * an extension mid-session, thread cards for that extension use trigger-kind
 * defaults until the next InboxView mount. A future step will tie into
 * /extensions/events SSE for live refresh.
 */
export function useExtensionThreadHints() {
  const apiClient = useApi()
  const hints = ref<Record<string, ExtensionThreadHints>>({})

  async function load(): Promise<void> {
    try {
      hints.value = await apiClient.extensions.getThreadHints()
    } catch (e) {
      console.warn('Failed to load extension thread hints', e)
    }
  }

  return { hints, load }
}
