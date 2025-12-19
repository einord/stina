<script setup lang="ts">
import { AppShell, AppBadge, HomePage } from '@stina/ui-vue'
</script>

<template>
  <AppShell>
    <template #header-extra>
      <AppBadge label="Electron" />
    </template>
    <HomePage />
  </AppShell>
</template>
