<script setup lang="ts">
import type { ExtensionDetails, VersionInfo } from '@stina/extension-installer'
import Icon from '../common/Icon.vue'

const props = defineProps<{
  extension: ExtensionDetails
  version: VersionInfo
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function getPermissionIcon(permission: string): string {
  if (permission.startsWith('network:')) {
    return 'wifi'
  }
  if (permission.startsWith('settings')) {
    return 'settings-02'
  }
  if (permission.startsWith('provider')) {
    return 'ai-brain-01'
  }
  if (permission.startsWith('storage')) {
    return 'folder-01'
  }
  if (permission.startsWith('clipboard')) {
    return 'copy-01'
  }
  return 'lock-key'
}

function getPermissionLabel(permission: string): string {
  if (permission.startsWith('network:')) {
    const target = permission.substring(8)
    return `Network access to ${target}`
  }
  if (permission === 'settings.register') {
    return 'Register custom settings'
  }
  if (permission === 'settings.read') {
    return 'Read application settings'
  }
  if (permission === 'settings.write') {
    return 'Modify application settings'
  }
  if (permission === 'provider.register') {
    return 'Register as AI provider'
  }
  if (permission === 'storage.local') {
    return 'Store local data'
  }
  if (permission === 'clipboard.read') {
    return 'Read clipboard'
  }
  if (permission === 'clipboard.write') {
    return 'Write to clipboard'
  }
  return permission
}

function getPermissionRisk(permission: string): 'low' | 'medium' | 'high' {
  if (permission.startsWith('network:localhost')) {
    return 'low'
  }
  if (permission.startsWith('network:')) {
    return 'medium'
  }
  if (permission === 'settings.write' || permission === 'clipboard.read') {
    return 'medium'
  }
  return 'low'
}
</script>

<template>
  <div class="permission-overlay" @click.self="emit('cancel')">
    <div class="permission-dialog">
      <header class="dialog-header">
        <Icon name="shield-01" class="shield-icon" />
        <h2>{{ $t('extensions.permissions') }}</h2>
      </header>

      <div class="dialog-content">
        <p class="intro">
          <strong>{{ extension.name }}</strong> {{ $t('extensions.permission_intro') }}
        </p>

        <ul class="permission-list">
          <li
            v-for="perm in version.permissions"
            :key="perm"
            :class="['permission-item', `risk-${getPermissionRisk(perm)}`]"
          >
            <Icon :name="getPermissionIcon(perm)" class="perm-icon" />
            <span class="perm-label">{{ getPermissionLabel(perm) }}</span>
            <span v-if="getPermissionRisk(perm) !== 'low'" class="risk-badge">
              {{ getPermissionRisk(perm) }}
            </span>
          </li>
        </ul>

        <div v-if="extension.verified" class="verified-notice">
          <Icon name="checkmark-circle-02" />
          <span>{{ $t('extensions.verified_notice') }}</span>
        </div>

        <p class="warning">
          <Icon name="alert-02" />
          {{ $t('extensions.permission_warning') }}
        </p>
      </div>

      <footer class="dialog-footer">
        <button class="btn secondary" @click="emit('cancel')">
          {{ $t('extensions.cancel') }}
        </button>
        <button class="btn primary" @click="emit('confirm')">
          <Icon name="download-01" />
          {{ $t('extensions.install') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.permission-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.permission-dialog {
  width: 100%;
  max-width: 480px;
  background: var(--background);
  border-radius: var(--border-radius-normal);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  background: var(--background-hover);
  border-bottom: 1px solid var(--border);

  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }
}

.shield-icon {
  font-size: 1.5rem;
  color: var(--primary);
}

.dialog-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.intro {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text);
  line-height: 1.5;

  strong {
    color: var(--primary);
  }
}

.permission-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--background-hover);
  border-radius: var(--border-radius-small);
  border-left: 3px solid var(--success);

  &.risk-medium {
    border-left-color: var(--warning, #f59e0b);
  }

  &.risk-high {
    border-left-color: var(--error);
  }
}

.perm-icon {
  font-size: 1.25rem;
  color: var(--text-muted);
}

.perm-label {
  flex: 1;
  font-size: 0.875rem;
  color: var(--text);
}

.risk-badge {
  padding: 0.125rem 0.5rem;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  border-radius: 999px;
  background: var(--warning, #f59e0b);
  color: white;
}

.permission-item.risk-high .risk-badge {
  background: var(--error);
}

.verified-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(16, 185, 129, 0.1);
  border-radius: var(--border-radius-small);
  font-size: 0.875rem;
  color: var(--success);
}

.warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 1rem;
  background: rgba(245, 158, 11, 0.1);
  border-radius: var(--border-radius-small);
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.4;

  .stina-icon {
    color: var(--warning, #f59e0b);
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--background-hover);
  border-top: 1px solid var(--border);
}

.btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: var(--border-radius-small);
  font-size: 0.875rem;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all 0.2s;

  &.primary {
    background: var(--primary);
    color: var(--primary-foreground);

    &:hover {
      opacity: 0.9;
    }
  }

  &.secondary {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);

    &:hover {
      background: var(--background-hover);
      color: var(--text);
    }
  }
}
</style>
