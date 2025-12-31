<script setup lang="ts" generic="T">
import FormHeader from './FormHeader.vue'

/**
 * Generic list shell for settings entities (providers, projects, etc.).
 * Renders an optional header, empty/error/loading states, and a stacked card list.
 */
defineProps<{
  title?: string
  icon?: string
  description?: string | string[]
  loading?: boolean
  error?: string
  emptyText?: string
  childItems: T[]
}>()
</script>

<template>
  <div class="entity-list">
    <FormHeader
      v-if="title || description"
      :title="title ?? ''"
      :description="description"
      :icon="icon"
    >
      <slot name="actions" />
    </FormHeader>

    <p v-if="loading" class="status muted">
      <slot name="loading">{{ emptyText }}</slot>
    </p>
    <p v-else-if="error != null" class="status error">{{ error }}</p>
    <p v-else-if="!childItems || childItems.length === 0" class="status muted">
      <slot name="empty">{{ emptyText }}</slot>
    </p>

    <ul v-else class="list">
      <li v-for="(item, index) in childItems" :key="index" class="item">
        <slot :item="item" :index="index" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.entity-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  > .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;

    > .heading {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      > .title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text);
      }

      > .subtitle {
        margin: 0;
        color: var(--muted);

        &:not(:first-of-type) {
          margin-top: 1rem;
        }
      }
    }

    > .actions {
      display: inline-flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  }

  > .status {
    margin: 0;
    &.muted {
      color: var(--muted);
    }
    &.error {
      color: #c44c4c;
    }
  }

  > .list {
    display: flex;
    flex-direction: column;
    padding: 0;

    > .item {
      list-style: none;
      margin: -2px 0 0 0;
      padding: 1rem;
      border: 1px solid var(--theme-general-border-color);
      transition: border-color 0.15s ease;
      border-radius: 0;

      &:first-of-type {
        border-top-left-radius: var(--border-radius-normal);
        border-top-right-radius: var(--border-radius-normal);
      }

      &:last-of-type {
        border-bottom-left-radius: var(--border-radius-normal);
        border-bottom-right-radius: var(--border-radius-normal);
      }
    }
  }
}
</style>
