<template>
  <div class="pad">
    <ThemeSelector />
    <AIProviderSettings />
  </div>
</template>

<script setup lang="ts">
import ThemeSelector from '../components/settings/ThemeSelector.vue';
import AIProviderSettings from '../components/settings/AIProviderSettings.vue';
</script>

<style scoped>
.pad { padding: var(--space-4); display: grid; gap: var(--space-4); }
</style>
