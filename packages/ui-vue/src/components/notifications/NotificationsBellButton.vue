<script setup lang="ts">
import { ref } from 'vue'
import NavigationButton from '../panels/NavigationButton.vue'
import NotificationsDropdown from './NotificationsDropdown.vue'
import { useNotificationStream } from '../../composables/useNotificationStream.js'
import { tryUseNotifications } from '../../composables/useNotifications.js'
import type { NotificationEvent } from '@stina/api-client'

const emit = defineEmits<{
  (e: 'select-thread', threadId: string): void
}>()

const { recent, unreadCount, markRead } = useNotificationStream()
const dropdownOpen = ref(false)

function handleBellClick() {
  // Gate: request OS-level notification permission on first click (not proactively
  // on startup — browser UX anti-pattern). The in-app dropdown always works
  // regardless of permission state.
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    const notifService = tryUseNotifications()
    if (notifService) {
      void notifService.requestPermission()
    }
  }

  dropdownOpen.value = !dropdownOpen.value
  if (dropdownOpen.value) {
    markRead()
  }
}

function handleSelectThread(event: NotificationEvent) {
  dropdownOpen.value = false
  emit('select-thread', event.thread_id)
}

function handleClose() {
  dropdownOpen.value = false
}
</script>

<template>
  <div class="notifications-bell-button">
    <NavigationButton
      :title="'Notiser'"
      :enable-activated="false"
      class="bell-button"
      @click="handleBellClick"
    >
      <Icon name="bell-01" class="icon" />
    </NavigationButton>
    <span
      v-if="unreadCount > 0"
      class="unread-badge"
      :aria-label="`${unreadCount} olästa notiser`"
    >
      {{ unreadCount > 9 ? '9+' : unreadCount }}
    </span>
    <NotificationsDropdown
      v-if="dropdownOpen"
      :notifications="recent"
      @select="handleSelectThread"
      @close="handleClose"
    />
  </div>
</template>

<style scoped>
.notifications-bell-button {
  position: relative;

  > .bell-button {
    text-align: center;
    color: var(--theme-main-components-navbar-foreground);
    width: auto;
    height: auto;
    display: grid;
    place-items: center;
    padding: var(--spacing-normal);
    position: relative;

    > .icon {
      font-size: 1.25rem;
    }
  }

  > .unread-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    background: var(--theme-status-error, #e53e3e);
    color: #fff;
    border-radius: 9999px;
    font-size: 0.6rem;
    font-weight: 700;
    min-width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    line-height: 1;
    pointer-events: none;
  }
}
</style>
