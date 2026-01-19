<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type {
  ToolSettingsComponentView,
  ToolSettingsActionDataSource,
} from '@stina/extension-api'
import type { ToolSettingsViewInfo, ExtensionEvent } from '../../composables/useApi.js'
import { useApi } from '../../composables/useApi.js'
import {
  provideExtensionScope,
  type ExtensionScope,
} from '../../composables/useExtensionScope.js'
import { provideExtensionContext } from '../../composables/useExtensionContext.js'
import ExtensionComponent from '../extension-components/ExtensionComponent.vue'

const props = defineProps<{
  viewInfo: ToolSettingsViewInfo
}>()

const api = useApi()

// Provide extension context so child components can execute actions
provideExtensionContext(props.viewInfo.extensionId)

const view = computed(() => props.viewInfo.view as ToolSettingsComponentView)

const loading = ref(true)
const error = ref<string | null>(null)
const dataValues = ref<Record<string, unknown>>({})

/**
 * Fetch data for a single data source using the action API.
 */
async function fetchDataSource(
  key: string,
  source: ToolSettingsActionDataSource
): Promise<void> {
  try {
    const result = await api.actions.execute(
      props.viewInfo.extensionId,
      source.action,
      source.params ?? {}
    )

    if (result.success) {
      dataValues.value[key] = result.data
    } else {
      console.warn(
        `[ToolsViewComponent] Action "${source.action}" failed:`,
        result.error
      )
      dataValues.value[key] = null
    }
  } catch (err) {
    console.error(`[ToolsViewComponent] Error fetching "${key}":`, err)
    dataValues.value[key] = null
  }
}

/**
 * Fetch all data sources defined in the view.
 */
async function fetchAllData(): Promise<void> {
  const data = view.value.data
  if (!data) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    const entries = Object.entries(data)
    await Promise.all(
      entries.map(([key, source]) => fetchDataSource(key, source))
    )
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

/**
 * Refresh specific data sources that match the event name.
 */
function refreshOnEvent(eventName: string): void {
  const data = view.value.data
  if (!data) return

  for (const [key, source] of Object.entries(data)) {
    if (source.refreshOn?.includes(eventName)) {
      void fetchDataSource(key, source)
    }
  }
}

/**
 * Extension scope with resolved data values.
 * Keys are prefixed with "$" for access in components.
 */
const scope = computed<ExtensionScope>(() => {
  return { ...dataValues.value }
})

provideExtensionScope(scope)

let unsubscribe: (() => void) | null = null

onMounted(() => {
  void fetchAllData()

  unsubscribe = api.events.subscribe((event: ExtensionEvent) => {
    if (event.extensionId === props.viewInfo.extensionId) {
      refreshOnEvent(event.name)
    }
  })
})

onUnmounted(() => {
  unsubscribe?.()
})

watch(
  () => props.viewInfo.view,
  () => {
    void fetchAllData()
  },
  { deep: true }
)
</script>

<template>
  <div class="tools-view-component">
    <div v-if="loading" class="state">Loading...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <ExtensionComponent
      v-else-if="view.content"
      :extension-component="view.content"
    />
    <div v-else class="state">No content defined</div>
  </div>
</template>

<style scoped>
.tools-view-component {
  display: flex;
  flex-direction: column;

  > .state {
    color: var(--theme-general-muted, #6b7280);
    font-size: 0.85rem;

    &.error {
      color: var(--color-danger, #ef4444);
    }
  }
}
</style>
