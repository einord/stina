<script setup lang="ts">
import type { PanelViewInfo } from '../../composables/useApi.js'
import PanelComponentRenderer from './PanelComponentRenderer.vue'
import { provideExtensionContext } from '../../composables/useExtensionContext.js'
import Header from '../extension-components/Header.vue'

const props = defineProps<{
  panel: PanelViewInfo
}>()

// Provide extension context so child components can execute actions
provideExtensionContext(props.panel.extensionId)
</script>

<template>
  <section class="panel">
    <Header :title="panel.title" :icon="panel.icon" />
    <div class="content">
      <PanelComponentRenderer v-if="panel.view.kind === 'component'" :panel="panel" />
      <div v-else class="placeholder">
        <span class="label">Unsupported panel kind</span>
        <span class="value">{{ panel.view.kind }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;

  > .content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    > .placeholder {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--theme-general-muted, #6b7280);

      > .label {
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      > .value {
        font-weight: var(--font-weight-medium);
      }
    }
  }
}
</style>
