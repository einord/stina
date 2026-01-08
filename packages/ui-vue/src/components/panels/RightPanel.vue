<script setup lang="ts">
defineProps<{
  openPanelIds: string[]
}>()
</script>

<template>
  <aside class="right-panel">
    <div v-for="panelId in openPanelIds" :key="panelId" class="extension">
      <!-- Dynamic panel content from extensions goes here -->
      Hello from {{ panelId }} panel
    </div>
  </aside>
</template>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  min-height: 100%;
  overflow-y: auto;
}
</style>
