<script setup lang="ts">
import { ref } from 'vue'
import Icon from './common/Icon.vue'
import { useAutoUpdate } from '../composables/useAutoUpdate.js'
import { useI18n } from '../composables/useI18n.js'
import IconNavigationButton from './panels/NavigationButton.IconNavigationButton.vue'

const { status, updateInfo, progress, isUpdateReady, isSupported, quitAndInstall } = useAutoUpdate()
const { t } = useI18n()
const dropdownRef = ref<HTMLElement | null>(null)

const showNotification = () => {
  return (
    isSupported.value &&
    (status.value === 'available' ||
      status.value === 'downloading' ||
      status.value === 'downloaded')
  )
}

const handleRestart = () => {
  dropdownRef.value?.hidePopover?.()
  quitAndInstall()
}
</script>

<template>
  <div v-if="showNotification()" class="update-notification-container">
    <IconNavigationButton
      class="update-button"
      :value="false"
      :title="t('update.available')"
      icon="download-04"
      :enable-activated="false"
      popovertarget="update-dropdown-menu"
    />
    <span class="update-badge" />
    <div id="update-dropdown-menu" ref="dropdownRef" class="dropdown-menu" popover>
      <div class="menu-header">
        <Icon name="download-04" class="header-icon" />
        <span class="header-text">{{ t('update.available') }}</span>
      </div>
      <div class="menu-body">
        <p v-if="updateInfo" class="version-text">
          {{ t('update.new_version', { version: updateInfo.version }) }}
        </p>
        <p v-if="status === 'downloading'" class="status-text">
          {{ t('update.downloading') }}<span v-if="progress !== null"> ({{ progress }}%)</span>
        </p>
        <a
          class="changelog-link"
          href="https://github.com/einord/stina/releases"
          target="_blank"
          rel="noopener"
        >
          {{ t('update.view_changelog') }}
        </a>
      </div>
      <div v-if="isUpdateReady" class="menu-footer">
        <button class="restart-button" type="button" @click="handleRestart">
          {{ t('update.restart_and_update') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-notification-container {
  position: relative;
}

.update-button {
  anchor-name: --update-button;
}

.update-badge {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--theme-general-color-primary, #3b82f6);
  pointer-events: none;
}

.dropdown-menu {
  position: fixed;
  inset: unset;
  inset-block-end: 4rem;
  inset-inline-start: 0.5rem;
  margin-bottom: 0;
  margin-left: 0.5rem;
  min-width: 220px;
  max-width: 280px;
  padding: 0;
  background: var(--theme-main-components-main-background, white);
  border: 1px solid var(--theme-general-border-color, #ddd);
  border-radius: 0.5rem;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;

  @supports (anchor-name: --test) {
    position-anchor: --update-button;
    inset-block-end: anchor(top);
    inset-inline-start: anchor(left);
  }
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--theme-general-border-color, #ddd);

  .header-icon {
    font-size: 1rem;
    color: var(--theme-general-color-primary, #3b82f6);
  }

  .header-text {
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium, 500);
    color: var(--theme-general-color, #333);
  }
}

.menu-body {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  .version-text {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-general-color, #333);
  }

  .status-text {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-general-color-secondary, #666);
  }

  .changelog-link {
    font-size: 0.8125rem;
    color: var(--theme-general-color-primary, #3b82f6);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}

.menu-footer {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--theme-general-border-color, #ddd);
}

.restart-button {
  width: 100%;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: var(--font-weight-medium, 500);
  color: white;
  background: var(--theme-general-color-primary, #3b82f6);
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.9;
  }
}
</style>
