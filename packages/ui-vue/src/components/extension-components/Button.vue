<script lang="ts" setup>
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'
import { tryUseHostBinding } from '../../composables/useHostBinding.js'
import SimpleButton from '../buttons/SimpleButton.vue'

interface Props {
  text: string
  type?: 'normal' | 'primary' | 'danger' | 'accent'
  title?: string
  disabled?: boolean
  onClickAction?: string | { action: string; params?: Record<string, unknown> }
  /**
   * Field paths to clear (write empty string) on the bound form after a
   * successful action result. Useful for ephemeral inputs (paste fields,
   * search boxes) so the user gets visual confirmation that their input
   * was processed.
   */
  onSuccessClearFields?: string[]
  style?: Record<string, string>
}

const props = defineProps<Props>()
const context = tryUseExtensionContext()
const scope = useExtensionScope()
const hostBinding = tryUseHostBinding()

const rootStyle = computed(() => props.style as StyleValue)

const handleClick = async () => {
  if (!context || !props.onClickAction) return
  try {
    const result = (await context.executeAction(props.onClickAction, scope.value)) as
      | { success?: boolean; data?: { openUrl?: unknown } }
      | undefined

    // If the action wants the host to open a URL (e.g. an OAuth flow handing
    // off to the system browser), it returns the target as data.openUrl.
    const openUrl = result?.data?.openUrl
    if (typeof openUrl === 'string' && openUrl.length > 0) {
      // In Electron, window.open creates a sandboxed BrowserWindow that
      // typically can't render third-party auth pages — route via the
      // main process's shell.openExternal instead. Falls back to
      // window.open for the web client where electronAPI is undefined.
      const electronApi = (window as unknown as {
        electronAPI?: { openExternal?: (url: string) => Promise<unknown> }
      }).electronAPI
      if (electronApi?.openExternal) {
        void electronApi.openExternal(openUrl)
      } else {
        window.open(openUrl, '_blank', 'noopener,noreferrer')
      }
    }

    // Clear ephemeral fields after a successful action — gives the user
    // visual confirmation that their input was processed.
    if (
      result?.success !== false &&
      hostBinding &&
      props.onSuccessClearFields?.length
    ) {
      for (const field of props.onSuccessClearFields) {
        hostBinding(field, '')
      }
    }
  } catch (error) {
    console.error('Failed to execute action:', error)
  }
}
</script>

<template>
  <SimpleButton
    :type="props.type ?? 'normal'"
    :title="props.title"
    :disabled="props.disabled"
    :style="rootStyle"
    @click="handleClick"
  >
    {{ props.text }}
  </SimpleButton>
</template>
