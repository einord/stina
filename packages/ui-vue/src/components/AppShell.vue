<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import IconToggleButton from './buttons/IconToggleButton.vue'
import MainNavigation from './panels/MainNavigation.vue'
import type { NavigationView } from './panels/MainNavigation.vue'
import ChatView from './views/ChatView.vue'
import ToolsView from './views/ToolsView.vue'
import SettingsView from './views/SettingsView.vue'
import RightPanel from './panels/RightPanel.vue'
import { useApi, type PanelViewInfo } from '../composables/useApi.js'

const props = defineProps<{
  title?: string
  /** Start a fresh conversation in ChatView (used after onboarding) */
  startFreshConversation?: boolean
}>()

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const handleLogout = () => {
  emit('logout')
}

const currentView = ref<NavigationView>('chat')

// Temporary, will be replaced with user settings later
const rightPanelWidth = ref(300)
const openedRightPanels = ref<Set<string>>(new Set()) // TODO: Read from / write to settings
const rightPanelVisible = computed(() => openedRightPanels.value.size > 0)

const api = useApi()
const panelViews = ref<PanelViewInfo[]>([])
const panelViewsLoading = ref(false)
const panelViewsError = ref<string | null>(null)

const gridTemplateColumnsStyle = computed(() => {
  return `auto minmax(0, 1fr) ${rightPanelVisible.value ? `${rightPanelWidth.value}px` : '1rem'}`
})

const getPanelKey = (panel: PanelViewInfo): string => `${panel.extensionId}:${panel.id}`

const panelToggles = computed(() =>
  panelViews.value.map((panel) => ({
    id: getPanelKey(panel),
    title: panel.title,
    icon: panel.icon ?? 'check-list',
  }))
)

/** Toggle the selected right panel extension. */
const toggleRightPanelExtension = (extensionId: string) => {
  if (openedRightPanels.value.has(extensionId)) {
    openedRightPanels.value.delete(extensionId)
  } else {
    openedRightPanels.value.add(extensionId)
  }
}

// Panel resize handlers
const startResize = (_event: MouseEvent) => {
  // TODO: Implement panel resize
}

const resetWidth = () => {
  rightPanelWidth.value = 300
}

const syncOpenedPanels = (availableIds: Set<string>) => {
  for (const id of openedRightPanels.value) {
    if (!availableIds.has(id)) {
      openedRightPanels.value.delete(id)
    }
  }
}

const loadPanelViews = async (): Promise<void> => {
  panelViewsLoading.value = true
  panelViewsError.value = null

  try {
    const views = await api.panels.list()
    panelViews.value = views
    syncOpenedPanels(new Set(views.map(getPanelKey)))
  } catch (error) {
    panelViewsError.value = error instanceof Error ? error.message : 'Failed to load panels'
  } finally {
    panelViewsLoading.value = false
  }
}

onMounted(() => {
  void loadPanelViews()
})
</script>

<template>
  <div class="shell">
    <header class="app-header">
      <h1 class="window-title">{{ title ?? $t('app.title') }}</h1>
      <div class="window-action">
        <IconToggleButton
          v-for="panel in panelToggles"
          :key="panel.id"
          :icon="panel.icon"
          :tooltip="panel.title"
          :active="openedRightPanels.has(panel.id)"
          @click="toggleRightPanelExtension(panel.id)"
        />
      </div>
    </header>
    <MainNavigation v-model="currentView" class="main-navigation" @logout="handleLogout" />
    <main>
      <ChatView v-if="currentView === 'chat'" :start-fresh="props.startFreshConversation" />
      <ToolsView v-if="currentView === 'tools'" />
      <SettingsView v-if="currentView === 'settings'" />
    </main>
    <div class="right-panel">
      <div class="resize-handle" @mousedown="startResize" @dblclick="resetWidth"></div>
      <RightPanel
        :open-panel-ids="Array.from(openedRightPanels.values())"
        :panel-views="panelViews"
        :loading="panelViewsLoading"
        :error="panelViewsError"
      />
    </div>
    <div class="footer"></div>
  </div>
</template>

<style>
.shell {
  height: 100%;
  display: grid;
  grid-template-columns: v-bind(gridTemplateColumnsStyle);
  grid-template-rows: auto 1fr 1rem;
  grid-template-areas:
    'header header header'
    'nav main right-panel'
    'nav footer right-panel';
  height: 100%;
  min-height: 0;

  > .app-header {
    grid-area: header;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1em;
    -webkit-app-region: drag;

    > .window-title {
      margin: 0;
      font-size: 1rem;
      font-weight: var(--font-weight-medium);
      color: var(--text);
      flex: 1 1;
      margin-left: 70px;
      /* text-align: center; */
    }

    > .window-action {
      right: 4em;
      top: 2em;
      display: flex;
      align-items: center;
      gap: 0.5em;
      -webkit-app-region: no-drag;
    }
  }

  > .main-navigation {
    grid-area: nav;
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  > main {
    height: 100%;
    min-height: 100%;
    max-height: 100%;
    display: grid;
    background-color: var(--theme-main-components-main-background);
    border-radius: var(--border-radius-normal);
    border: 1px solid var(--theme-general-border-color);
    overflow: hidden;
  }

  > .right-panel {
    grid-area: right-panel;
    height: 100%;
    overflow: hidden auto;
    position: relative;
    grid-row: span 2;

    > .resize-handle {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: ew-resize;
      z-index: 10;
      transition: background-color 0.2s;

      &:hover {
        background-color: var(--primary);
        opacity: 0.3;
      }

      &:active {
        background-color: var(--primary);
        opacity: 0.5;
      }
    }
  }

  > .footer {
    grid-area: footer;
  }
}
</style>
