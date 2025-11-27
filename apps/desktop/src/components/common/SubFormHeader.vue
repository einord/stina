<script setup lang="ts">
  interface Props {
    /**
     * Secondary title displayed in the sub header.
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
    <h2 class="title">{{ title }}</h2>
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
      font-size: 1.1rem;
      line-height: 1.4;
    }

    > .description {
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }
  }
</style>
