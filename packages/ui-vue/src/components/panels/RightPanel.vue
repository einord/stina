<script setup lang="ts">
import { computed } from 'vue'
import type { PanelViewInfo } from '../../composables/useApi.js'
import PanelRenderer from './PanelRenderer.vue'
import type { HeaderProps } from '@stina/extension-api'
import ExtensionComponent from '../extension-components/ExtensionComponent.vue'

const props = defineProps<{
  openPanelIds: string[]
  panelViews: PanelViewInfo[]
  loading?: boolean
  error?: string | null
}>()

const getPanelKey = (panel: PanelViewInfo): string => `${panel.extensionId}:${panel.id}`

const openPanels = computed(() =>
  props.panelViews.filter((panel) => props.openPanelIds.includes(getPanelKey(panel)))
)

const testHeader: HeaderProps = {
  component: 'Header',
  level: 2,
  title: 'Det fungerar!',
  icon: 'task-01',
  description: 'This is a test header inside the right panel.',
}
</script>

<template>
  <aside class="right-panel">
    <ExtensionComponent :extension-component="testHeader" />

    <div v-if="loading" class="state">Loading panels...</div>
    <div v-else-if="error" class="state">{{ error }}</div>
    <PanelRenderer v-for="panel in openPanels" :key="getPanelKey(panel)" :panel="panel" />
  </aside>
</template>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  min-height: 100%;
  overflow-y: auto;
  min-width: 1rem;

  > .state {
    color: var(--theme-general-muted, #6b7280);
    font-size: 0.9rem;
  }
}
</style>
