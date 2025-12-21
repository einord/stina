<script setup lang="ts">
import MainNavigation from './panels/MainNavigation.vue'
import { useI18n } from '../composables/useI18n.js'

defineProps<{
  title?: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1 class="window-title">{{ title ?? t('app.title') }}</h1>
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
    <MainNavigation />
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<style>
.app {
  height: 100%;

  > .app-header {
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

  > .app-main {
    flex: 1;
    min-height: 0;
    /* display: none; */
  }
}
</style>
