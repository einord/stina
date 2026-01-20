<script setup lang="ts">
/**
 * Shared layout component for onboarding-style pages.
 * Provides the centered container, logo header, and consistent styling.
 */
import { computed } from 'vue'
import Icon from '../common/Icon.vue'

withDefaults(
  defineProps<{
    /** Whether to show the Stina logo in the header */
    showLogo?: boolean
    /** Maximum width of the container */
    maxWidth?: string
  }>(),
  {
    showLogo: true,
    maxWidth: '480px',
  }
)

// Check if we're in Electron (for drag region support)
const isElectron = computed(() => typeof window !== 'undefined' && 'electronAPI' in window)
</script>

<template>
  <div class="onboarding-layout">
    <!-- Drag region for Electron window (macOS hiddenInset titlebar) -->
    <div v-if="isElectron" class="drag-bar" />

    <div class="onboarding-container" :style="{ maxWidth }">
      <!-- Header with logo -->
      <div v-if="showLogo" class="header">
        <Icon name="stina:head" class="header-icon" />
      </div>

      <!-- Optional top slot (e.g., progress indicator) -->
      <slot name="top" />

      <!-- Main content -->
      <div class="content-wrapper">
        <slot />
      </div>

      <!-- Optional bottom slot (e.g., navigation buttons) -->
      <slot name="bottom" />
    </div>
  </div>
</template>

<style scoped>
.onboarding-layout {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--theme-general-background);
}

.onboarding-container {
  width: 100%;
  background: var(--theme-components-card-background, var(--theme-general-background));
  border: 1px solid var(--theme-general-border-color);
  border-radius: 1rem;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.header {
  text-align: center;
}

.header-icon {
  font-size: 4rem;
  color: var(--theme-general-color-muted);
}

.content-wrapper {
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

/* Drag region for Electron window movement */
.drag-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px; /* Matches titleBarOverlay.height in Electron */
  -webkit-app-region: drag;
  z-index: 9999;
  pointer-events: auto;
}
</style>
