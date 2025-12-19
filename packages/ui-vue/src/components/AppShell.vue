<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>{{ title ?? 'Stina' }}</h1>
      <slot name="header-extra" />
    </header>
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.5;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #ffffff);
  color: var(--color-foreground, #1f2937);

  > .app-header {
    padding: var(--spacing, 1rem);
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-muted, #f3f4f6);
    display: flex;
    align-items: center;
    gap: 0.5rem;

    > h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-primary, #6366f1);
    }
  }

  > .app-main {
    flex: 1;
    padding: var(--spacing, 1rem);
  }
}
</style>
