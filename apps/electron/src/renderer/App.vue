<script setup lang="ts">
import { AppShell, createAuth, provideAuth } from '@stina/ui-vue'

// Create and provide auth (must be done in component after apiClient is provided)
const auth = createAuth()
provideAuth(auth)
</script>

<template>
  <AppShell />
</template>
