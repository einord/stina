<script setup lang="ts">
  import { ref } from 'vue';

  const props = defineProps<{
    title: string;
    meta?: string;
    status?: string;
    statusDetails?: string;
    statusVariant?: 'default' | 'neutral' | 'info' | 'success' | 'error';
    metaVariant?: 'default' | 'danger';
    muted?: boolean;
  }>();

  const isOpen = ref(false);

  function handleToggle() {
    isOpen.value = !isOpen.value;
  }
</script>

<template>
  <article class="panel-group-item" :class="{ muted }">
    <header class="item-header" @click="handleToggle">
      <div class="first-row">
        <div class="title">{{ title }}</div>
        <div class="badge">
          <slot name="badge" />
        </div>
      </div>
      <div class="second-row">
        <p v-if="meta" class="meta" :class="metaVariant">{{ meta }}</p>
        <slot name="status">
          <span v-if="status" class="status-pill" :class="statusVariant ?? 'default'">
            <span>{{ status }}</span>
            <span v-if="statusDetails">{{ statusDetails }}</span>
          </span>
        </slot>
      </div>
    </header>
    <section class="item-body" :class="{ isOpen: isOpen }">
      <slot />
    </section>
  </article>
</template>

<style scoped>
  .panel-group-item {
    border-bottom: 1px solid var(--border);
    overflow-x: hidden;
    transition:
      opacity 0.2s ease,
      filter 0.2s ease;
    background: transparent;

    &.muted {
      opacity: 0.6;
      filter: grayscale(0.2);
    }

    > .item-header {
      padding: 1rem;
      transition: all 0.2s ease-in-out;
      background-color: var(--panel-hover);
      cursor: pointer;

      &:hover {
        background-color: hsl(from var(--panel-hover) h s 22%);
      }

      > .first-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 0.5rem;

        > .title {
          font-weight: var(--font-weight-medium);
          flex-grow: 1;
        }

        > .badge {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
      }

      > .second-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 0.5rem;

        > .meta {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);

          &.danger {
            color: #c44c4c;
            font-weight: var(--font-weight-medium);
          }
        }

        > .status-pill {
          display: inline-flex;
          gap: 0.5em;
          padding: 0.25rem 0.5rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: var(--font-weight-thin);
          background: var(--accent);
          color: var(--accent-fg);
          margin-left: auto;

          &.neutral {
            background: var(--neutral);
            color: var(--neutral-fg);
          }
          &.info {
            background: var(--info);
            color: var(--info-fg);
          }
          &.success {
            background: var(--success);
            color: var(--success-fg);
          }
          &.error {
            background: var(--error);
            color: var(--error-fg);
          }
        }
      }
    }

    > .item-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;

      &.isOpen {
        max-height: max-content;
        overflow: auto;
      }
    }
  }
</style>
