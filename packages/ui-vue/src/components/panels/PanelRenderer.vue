<script setup lang="ts">
import type { PanelViewInfo } from '../../composables/useApi.js'
import Icon from '../common/Icon.vue'
import PanelGroupedList from './PanelGroupedList.vue'
import { provideExtensionContext } from '../../composables/useExtensionContext.js'

const props = defineProps<{
  panel: PanelViewInfo
}>()

// Provide extension context so child components can execute actions
provideExtensionContext(props.panel.extensionId)
</script>

<template>
  <section class="panel">
    <header class="header">
      <Icon v-if="panel.icon" class="icon" :name="panel.icon" />
      <h2 class="title">{{ panel.title }}</h2>
    </header>
    <div class="content">
      <PanelGroupedList v-if="panel.view.kind === 'grouped-list'" :panel="panel" />
      <div v-else class="placeholder">
        <span class="label">Panel kind</span>
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
  border-radius: var(--border-radius-normal);
  border: 1px solid var(--theme-general-border-color);
  background: var(--theme-main-components-main-background);

  > .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    > .icon {
      font-size: 1rem;
      color: var(--theme-general-color);
    }

    > .title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: var(--font-weight-medium);
      color: var(--theme-general-color);
    }
  }

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
