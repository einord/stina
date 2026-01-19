<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi, type ToolSettingsViewInfo } from '../../composables/useApi.js'
import { useI18n } from '../../composables/useI18n.js'
import ToolsViewMenu from './ToolsView.Menu.vue'
import ToolsViewComponent from './ToolsView.Component.vue'
import ToolsViewList from './ToolsView.List.vue'
import Icon from '../common/Icon.vue'

const api = useApi()
const { t } = useI18n()

const views = ref<ToolSettingsViewInfo[]>([])
const currentViewKey = ref<string | null>(null)
const viewsLoading = ref(false)
const viewsError = ref<string | null>(null)

const menuItems = computed(() =>
  views.value.map((view) => ({
    id: getViewKey(view),
    title: view.title,
  }))
)

const currentView = computed(
  () => views.value.find((view) => getViewKey(view) === currentViewKey.value) ?? null
)

const isComponentView = computed(() => currentView.value?.view.kind === 'component')

function getViewKey(view: ToolSettingsViewInfo): string {
  return `${view.extensionId}:${view.id}`
}

async function loadViews(): Promise<void> {
  viewsLoading.value = true
  viewsError.value = null

  try {
    const result = await api.tools.getSettingsViews()
    views.value = result
    if (!currentViewKey.value && result.length > 0) {
      const firstView = result[0]
      if (firstView) {
        currentViewKey.value = getViewKey(firstView)
      }
    }
  } catch (error) {
    viewsError.value = error instanceof Error ? error.message : 'Failed to load tools'
  } finally {
    viewsLoading.value = false
  }
}

onMounted(() => {
  void loadViews()
})
</script>

<template>
  <div class="tools-view">
    <ToolsViewMenu v-model="currentViewKey" :items="menuItems" />

    <div class="content">
      <div class="extension-name">
        <Icon name="puzzle" />
        {{ t('tools.from_extension', { name: currentView?.extensionName ?? '-' }) }}
      </div>

      <div v-if="viewsLoading" class="status loading">
        <Icon name="loading-03" class="spin" />
        {{ $t('common.loading') }}
      </div>
      <div v-else-if="viewsError" class="status error">
        {{ viewsError }}
      </div>
      <div v-else-if="!currentView" class="status muted">
        {{ $t('tools.no_tools') }}
      </div>

      <!-- Component-based view -->
      <div v-else-if="isComponentView" class="component-view">
        <h2 class="title">{{ currentView.title }}</h2>
        <p v-if="currentView.description" class="description">{{ currentView.description }}</p>
        <ToolsViewComponent :view-info="currentView" />
      </div>

      <!-- List-based view -->
      <ToolsViewList v-else :view-info="currentView" />
    </div>
  </div>
</template>

<style scoped>
.tools-view {
  display: grid;
  grid-template-columns: auto 1fr;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-y: hidden;

  > .content {
    padding: var(--spacing-large);
    height: 100%;
    max-height: 100%;
    overflow-y: auto;

    > .extension-name {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 1rem;
      color: var(--theme-general-color-muted);
    }

    > .component-view {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 32rem;

      > .title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--theme-general-color);
      }

      > .description {
        margin: 0;
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }
    }

    > .status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--theme-general-color-muted);

      &.error {
        color: var(--theme-general-color-danger, #dc2626);
      }

      &.loading {
        color: var(--theme-general-color-muted);
      }
    }
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
