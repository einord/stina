<script setup lang="ts">
/**
 * Progress indicator for the onboarding wizard.
 * Displays dots showing the current step position.
 */
defineProps<{
  /** Current step number (1-based) */
  currentStep: number
  /** Total number of steps */
  totalSteps: number
}>()
</script>

<template>
  <div class="onboarding-progress">
    <div
      v-for="step in totalSteps"
      :key="step"
      class="progress-dot"
      :class="{
        active: step === currentStep,
        completed: step < currentStep,
      }"
    />
  </div>
</template>

<style scoped>
.onboarding-progress {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.progress-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--theme-general-border-color);
  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.progress-dot.completed {
  background: var(--theme-general-color-primary);
}

.progress-dot.active {
  background: var(--theme-general-color-primary);
  transform: scale(1.25);
}
</style>
