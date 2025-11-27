<script setup lang="ts">
  interface Props {
    /**
     * Main title displayed in the header.
     */
    title: string;
    /**
     * Optional description rendered under the title.
     */
    description?: string;
  }

  defineProps<Props>();
</script>

<template>
  <header class="form-header">
    <h1 class="title">{{ title }}</h1>
    <div v-if="description" class="description">
      {{ description }}
    </div>
  </header>
</template>

<style scoped>
  .form-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    > .title {
      margin: 0;
      color: var(--text);
      font-size: 1.25rem;
      line-height: 1.4;
    }

    > .description {
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.5;
    }
  }
</style>
