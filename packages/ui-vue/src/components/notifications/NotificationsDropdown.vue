<script setup lang="ts">
import type { NotificationEvent } from '@stina/api-client'

const props = defineProps<{
  notifications: NotificationEvent[]
}>()

const emit = defineEmits<{
  (e: 'select', notification: NotificationEvent): void
  (e: 'close'): void
}>()

/**
 * Format a unix-ms timestamp as a relative time string in Swedish.
 * Coarse-grained: "just nu", "X min sedan", "X h sedan", "X dagar sedan".
 */
function relativeTime(notifiedAt: number): string {
  const diffMs = Date.now() - notifiedAt
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just nu'
  if (diffMin < 60) return `${diffMin} min sedan`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} h sedan`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} dagar sedan`
}

function iconForKind(kind: NotificationEvent['kind']): string {
  return kind === 'failure' ? 'alert-triangle' : 'bell-01'
}
</script>

<template>
  <div class="notifications-dropdown" role="dialog" aria-label="Notiser">
    <div class="dropdown-header">
      <span class="dropdown-title">Notiser</span>
      <button class="close-button" :title="'Stäng'" @click="emit('close')">
        <Icon name="x-close" />
      </button>
    </div>

    <div v-if="props.notifications.length === 0" class="empty-state">
      <span>Inga notiser ännu</span>
    </div>

    <ul v-else class="notification-list">
      <li
        v-for="notif in props.notifications"
        :key="notif.thread_id"
        class="notification-item"
        :class="{ 'is-failure': notif.kind === 'failure' }"
        @click="emit('select', notif)"
      >
        <Icon :name="iconForKind(notif.kind)" class="notif-icon" />
        <div class="notif-body">
          <div class="notif-title">{{ notif.title }}</div>
          <div v-if="notif.preview" class="notif-preview">{{ notif.preview }}</div>
          <div class="notif-time">{{ relativeTime(notif.notified_at) }}</div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.notifications-dropdown {
  position: absolute;
  left: calc(100% + 4px);
  top: 0;
  width: 280px;
  background: var(--theme-surface-elevated, var(--surface-elevated, #fff));
  border: 1px solid var(--theme-border, var(--border, #e2e8f0));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  overflow: hidden;

  > .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-border, var(--border, #e2e8f0));

    > .dropdown-title {
      font-weight: 600;
      font-size: 0.85rem;
    }

    > .close-button {
      background: none;
      border: none;
      cursor: pointer;
      color: inherit;
      padding: 2px;
      display: flex;
      align-items: center;
      opacity: 0.6;

      &:hover {
        opacity: 1;
      }
    }
  }

  > .empty-state {
    padding: 16px 12px;
    font-size: 0.85rem;
    opacity: 0.6;
    text-align: center;
  }

  > .notification-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;

    > .notification-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid var(--theme-border-subtle, rgba(0, 0, 0, 0.06));

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--theme-surface-hover, rgba(0, 0, 0, 0.04));
      }

      &.is-failure {
        > .notif-icon {
          color: var(--theme-status-warning, #d97706);
        }
      }

      > .notif-icon {
        flex-shrink: 0;
        font-size: 0.9rem;
        margin-top: 2px;
        opacity: 0.7;
      }

      > .notif-body {
        flex: 1;
        min-width: 0;

        > .notif-title {
          font-weight: 500;
          font-size: 0.85rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        > .notif-preview {
          font-size: 0.78rem;
          opacity: 0.7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }

        > .notif-time {
          font-size: 0.72rem;
          opacity: 0.5;
          margin-top: 2px;
        }
      }
    }
  }
}
</style>
