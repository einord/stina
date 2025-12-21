<script setup lang="ts">
import MainNavigation from './panels/MainNavigation.vue'
import { computed, ref } from 'vue'

defineProps<{
  title?: string
}>()

// Temporary, will be replaced with user settings later
const rightPanelVisible = ref(false)
const rightPanelWidth = ref(300)

const gridTemplateColumnsStyle = computed(() => {
  return `auto minmax(0, 1fr) ${rightPanelVisible.value ? `${rightPanelWidth.value}px` : '0px'}`
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1 class="window-title">{{ title ?? $t('app.title') }}</h1>
      <div class="window-action">
        <!-- <IconToggleButton
          :icon="CalendarIcon"
          :tooltip="t('calendar.panel_toggle')"
          :active="calendarPanelOpen"
          @click="toggleCalendarPanel"
        />
        <IconToggleButton
          :icon="TodoIcon"
          :tooltip="t('app.todo_tooltip')"
          :active="todoPanelOpen"
          @click="toggleTodoPanel"
        /> -->
      </div>
    </header>
    <MainNavigation class="main-navigation" />
    <main>
      <slot />
    </main>
    <div v-if="rightPanelVisible" class="right-panel">
      <div class="resize-handle" @mousedown="startResize" @dblclick="resetWidth"></div>
      <slot name="right-panel" />
    </div>
    <div class="footer"></div>
  </div>
</template>

<style>
.app {
  height: 100%;
  display: grid;
  grid-template-columns: v-bind(gridTemplateColumnsStyle);
  grid-template-rows: auto auto 1rem;
  grid-template-areas:
    'header header header'
    'nav main right-panel'
    'nav main right-panel';
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
  }

  > main {
    height: 100%;
    min-height: 0;
    display: grid;
    background-color: var(--window-bg-empty);
    border-radius: var(--border-radius-normal);
    border: 1px solid var(--border);
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
