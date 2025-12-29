<script setup lang="ts">
import type { ExtensionDetails } from '@stina/extension-installer'
import Icon from '../common/Icon.vue'

const props = defineProps<{
  extension: ExtensionDetails
  installed: boolean
  installedVersion: string | null
  enabled: boolean
  actionInProgress: boolean
}>()

const emit = defineEmits<{
  close: []
  install: []
  uninstall: []
  toggleEnabled: []
}>()

function getCategoryIcon(category: string | undefined): string {
  switch (category) {
    case 'ai-provider':
      return 'ai-brain-01'
    case 'tool':
      return 'wrench-01'
    case 'theme':
      return 'paint-brush-01'
    case 'utility':
      return 'setting-04'
    default:
      return 'puzzle'
  }
}

function formatPermission(permission: string): string {
  if (permission.startsWith('network:')) {
    return `Network: ${permission.substring(8)}`
  }
  return permission.replace('.', ': ')
}
</script>

<template>
  <div class="details-overlay" @click.self="emit('close')">
    <aside class="details-panel">
      <header class="panel-header">
        <button class="close-btn" @click="emit('close')">
          <Icon name="cancel-01" />
        </button>
      </header>

      <div class="panel-content">
        <div class="extension-header">
          <div class="icon-wrapper">
            <Icon :name="getCategoryIcon(extension.categories[0])" />
          </div>
          <div class="header-info">
            <h2 class="name">
              {{ extension.name }}
              <Icon
                v-if="extension.verified"
                name="checkmark-circle-02"
                class="verified-icon"
                :title="$t('extensions.verified')"
              />
            </h2>
            <div class="author-info">
              <span class="author">{{ $t('extensions.by_author', { author: extension.author.name }) }}</span>
              <a
                v-if="extension.author.url"
                :href="extension.author.url"
                target="_blank"
                rel="noopener noreferrer"
                class="author-link"
              >
                <Icon name="link-external-01" />
              </a>
            </div>
          </div>
        </div>

        <p class="description">{{ extension.description }}</p>

        <div class="actions">
          <template v-if="actionInProgress">
            <button class="action-btn primary" disabled>
              <Icon name="loading-03" class="spin" />
              {{ installed ? $t('extensions.uninstalling') : $t('extensions.installing') }}
            </button>
          </template>
          <template v-else-if="installed">
            <button class="action-btn toggle" @click="emit('toggleEnabled')">
              <Icon :name="enabled ? 'toggle-on' : 'toggle-off'" />
              {{ enabled ? $t('extensions.disable') : $t('extensions.enable') }}
            </button>
            <button class="action-btn danger" @click="emit('uninstall')">
              <Icon name="delete-02" />
              {{ $t('extensions.uninstall') }}
            </button>
          </template>
          <template v-else>
            <button class="action-btn primary" @click="emit('install')">
              <Icon name="download-01" />
              {{ $t('extensions.install') }}
            </button>
          </template>
        </div>

        <div class="meta-section">
          <div class="meta-item">
            <Icon name="document-code" />
            <span class="label">{{ $t('extensions.license') }}</span>
            <span class="value">{{ extension.license }}</span>
          </div>
          <div class="meta-item">
            <Icon name="link-01" />
            <span class="label">{{ $t('extensions.repository') }}</span>
            <a :href="extension.repository" target="_blank" rel="noopener noreferrer" class="value link">
              {{ extension.repository }}
            </a>
          </div>
        </div>

        <div class="categories-section">
          <span v-for="cat in extension.categories" :key="cat" class="category-tag">
            {{ cat }}
          </span>
        </div>

        <section class="versions-section">
          <h3>{{ $t('extensions.changelog') }}</h3>
          <div v-for="version in extension.versions" :key="version.version" class="version-item">
            <div class="version-header">
              <span class="version-number">v{{ version.version }}</span>
              <span class="version-date">{{ version.releaseDate }}</span>
              <span
                v-if="installed && installedVersion === version.version"
                class="current-badge"
              >
                {{ $t('extensions.installed') }}
              </span>
            </div>
            <p v-if="version.changelog" class="version-changelog">{{ version.changelog }}</p>

            <div v-if="version.platforms || version.minStinaVersion" class="version-meta">
              <div v-if="version.platforms" class="meta-row">
                <Icon name="device-laptop" />
                <span>{{ $t('extensions.platforms') }}: {{ version.platforms.join(', ') }}</span>
              </div>
              <div v-if="version.minStinaVersion" class="meta-row">
                <Icon name="code" />
                <span>{{ $t('extensions.min_version', { version: version.minStinaVersion }) }}</span>
              </div>
            </div>

            <div v-if="version.permissions && version.permissions.length > 0" class="permissions">
              <h4>{{ $t('extensions.permissions') }}</h4>
              <ul>
                <li v-for="perm in version.permissions" :key="perm">
                  {{ formatPermission(perm) }}
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
  z-index: 100;
}

.details-panel {
  width: 100%;
  max-width: 480px;
  height: 100%;
  background: var(--background);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.2);
}

.panel-header {
  display: flex;
  justify-content: flex-end;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--border-radius-small);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--background-hover);
    color: var(--text);
  }
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.extension-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  background: var(--background-hover);
  border-radius: var(--border-radius-normal);
  color: var(--primary);
  font-size: 2rem;
}

.header-info {
  flex: 1;
}

.name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: var(--font-weight-semibold);
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.verified-icon {
  color: var(--success);
  font-size: 1.25rem;
}

.author-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.author {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.author-link {
  color: var(--primary);
  font-size: 0.875rem;

  &:hover {
    opacity: 0.8;
  }
}

.description {
  margin: 0;
  font-size: 1rem;
  color: var(--text);
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: var(--border-radius-small);
  font-size: 0.875rem;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all 0.2s;

  &.primary {
    background: var(--primary);
    color: var(--primary-foreground);

    &:hover:not(:disabled) {
      opacity: 0.9;
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  &.toggle {
    background: var(--background-hover);
    color: var(--text);

    &:hover {
      background: var(--border);
    }
  }

  &.danger {
    background: transparent;
    border: 1px solid var(--error);
    color: var(--error);

    &:hover {
      background: var(--error);
      color: white;
    }
  }
}

.meta-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--background-hover);
  border-radius: var(--border-radius-normal);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;

  .label {
    color: var(--text-muted);
  }

  .value {
    color: var(--text);

    &.link {
      color: var(--primary);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

.categories-section {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.category-tag {
  padding: 0.25rem 0.75rem;
  background: var(--background-hover);
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.versions-section {
  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }
}

.version-item {
  padding: 1rem;
  background: var(--background-hover);
  border-radius: var(--border-radius-normal);
  margin-bottom: 0.75rem;

  &:last-child {
    margin-bottom: 0;
  }
}

.version-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.version-number {
  font-weight: var(--font-weight-semibold);
  color: var(--text);
}

.version-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.current-badge {
  padding: 0.125rem 0.5rem;
  background: var(--success);
  color: white;
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
}

.version-changelog {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.version-meta {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.permissions {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);

  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: var(--font-weight-medium);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.75rem;
    color: var(--text-muted);

    li {
      margin-bottom: 0.25rem;
    }
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
