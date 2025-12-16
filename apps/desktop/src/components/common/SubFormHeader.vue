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
    <div class="header-main">
      <div class="title">
        <slot name="leading" />
        <h2 class="title-text">{{ title }}</h2>
      </div>
      <div v-if="$slots.default" class="actions">
        <slot />
      </div>
    </div>
    <div v-if="description" class="description">
      {{ description }}
    </div>
  </header>
</template>

<style scoped>
  .form-header {
    display: flex;
    flex-direction: column;
    justify-content: start;
    gap: 0.25rem;
    width: 100%;

    > .header-main {
      display: flex;
      flex-direction: row;
      align-items: start;
      gap: 0.5rem;
      justify-content: space-between;

      > .title {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;

        > .title-text {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
          line-height: 1.4;
        }
      }

      > .actions {
        display: inline-flex;
        gap: 0.5rem;
        align-items: start;
        justify-content: flex-end;
      }
    }
    > .description {
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.5;
      text-wrap: wrap;
      word-break: break-word;
      width: 100%;
    }
  }
</style>
