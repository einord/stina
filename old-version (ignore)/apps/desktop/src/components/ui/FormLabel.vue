<script setup lang="ts">
defineProps<{
  /**
   * Indicates that the associated form field is required.
   */
  required?: boolean;
}>();
</script>

<template>
  <div class="form-label">
    <slot></slot><span v-if="required" class="asterisk">&ast;</span>
  </div>
</template>

<style scoped>
  .form-label {
    font-weight: var(--font-weight-medium);

    > .asterisk {
      margin-left: 0.25rem;
    }
  }
</style>
