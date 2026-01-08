<script setup lang="ts">
import { computed, ref } from 'vue'
import IconToggleButton from './buttons/IconToggleButton.vue'
import MainNavigation from './panels/MainNavigation.vue'
import type { NavigationView } from './panels/MainNavigation.vue'
import ChatView from './views/ChatView.vue'
import ToolsView from './views/ToolsView.vue'
import SettingsView from './views/SettingsView.vue'
import RightPanel from './panels/RightPanel.vue'

defineProps<{
  title?: string
}>()

const currentView = ref<NavigationView>('chat')

// Temporary, will be replaced with user settings later
const rightPanelWidth = ref(300)
const openedRightPanels = ref<Set<string>>(new Set()) // TODO: Read from / write to settings
const rightPanelVisible = computed(() => openedRightPanels.value.size > 0)

const gridTemplateColumnsStyle = computed(() => {
  return `auto minmax(0, 1fr) ${rightPanelVisible.value ? `${rightPanelWidth.value}px` : '0px'}`
})

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
</script>

<template>
  <div class="shell">
    <header class="app-header">
      <h1 class="window-title">{{ title ?? $t('app.title') }}</h1>
      <div class="window-action">
        <!-- TODO: These two toggle buttons are only examples. Any active extension that adds a right panel will have a toggle here. -->
        <IconToggleButton
          icon="calendar-03"
          :tooltip="$t('calendar.panel_toggle')"
          :active="openedRightPanels.has('calendar')"
          @click="toggleRightPanelExtension('calendar')"
        />
        <IconToggleButton
          icon="check-list"
          :tooltip="$t('app.todo_tooltip')"
          :active="openedRightPanels.has('todo')"
          @click="toggleRightPanelExtension('todo')"
        />
      </div>
    </header>
    <MainNavigation v-model="currentView" class="main-navigation" />
    <main>
      <ChatView v-if="currentView === 'chat'" />
      <ToolsView v-if="currentView === 'tools'" />
      <SettingsView v-if="currentView === 'settings'" />
    </main>
    <div v-if="rightPanelVisible" class="right-panel">
      <div class="resize-handle" @mousedown="startResize" @dblclick="resetWidth"></div>
      <RightPanel :open-panel-ids="Array.from(openedRightPanels.values())" />
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
