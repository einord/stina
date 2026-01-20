<script setup lang="ts">
/**
 * Standalone view for connection mode setup.
 * Uses the shared OnboardingLayout for consistent styling.
 * This is shown in Electron when the app is unconfigured.
 */
import OnboardingLayout from './OnboardingLayout.vue'
import ConnectionModeStep from './steps/ConnectionModeStep.vue'
import type { ConnectionConfig } from '@stina/core'

const emit = defineEmits<{
  (e: 'confirm', config: ConnectionConfig): void
}>()

function handleConfirm(config: ConnectionConfig) {
  emit('confirm', config)
}
</script>

<template>
  <OnboardingLayout>
    <ConnectionModeStep @confirm="handleConfirm" />
  </OnboardingLayout>
</template>
