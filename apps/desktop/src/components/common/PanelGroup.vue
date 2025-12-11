<script setup lang="ts">
  import { computed } from 'vue';

  import FormHeader from './FormHeader.vue';

  const props = defineProps<{
    title: string;
    description?: string;
    collapsed?: boolean;
  }>();

  const emit = defineEmits<{
    (event: 'toggle'): void;
  }>();

  const isCollapsed = computed(() => props.collapsed === true);

  function handleToggle() {
    emit('toggle');
  }
</script>

<template>
  <section class="panel-group">
    <FormHeader class="header" :title="title" :description="description" @click="handleToggle" />
    <div class="content">
      <div v-if="!isCollapsed" class="group-list">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
  .panel-group {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
    background-color: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    overflow: auto;

    &:not(:first-child) {
      margin-top: 1rem;
    }

    &.grouped {
      gap: 0.75rem;
    }

    &.closed-group {
      opacity: 0.8;

      > .header {
        background-color: var(--panel);
      }
    }

    > .header {
      padding: 1rem;
      cursor: pointer;
      background-color: var(--border);
      transition: all 0.2s ease-in-out;

      &:hover {
        background-color: var(--border-dark);
      }
    }

    > .content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      > .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;

        > .group-title {
          margin: 0;
          font-size: 1rem;
        }
      }

      > .group-list {
        display: flex;
        flex-direction: column;
      }
    }
  }
</style>
