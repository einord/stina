<script setup lang="ts">
import type { ExtensionListItem } from '@stina/extension-installer'
import Icon from '../../common/Icon.vue'

defineProps<{
  extension?: ExtensionListItem
  installed: boolean
  installedVersion: string | null
  enabled: boolean
  actionInProgress: boolean
}>()

const emit = defineEmits<{
  click: []
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

function handleActionClick(event: Event, action: () => void) {
  event.stopPropagation()
  action()
}
</script>

<template>
  <article
    v-if="extension"
    class="extension-card"
    :class="{ installed, disabled: !enabled && installed }"
    @click="emit('click')"
  >
    <div class="card-header">
      <div class="icon-wrapper">
        <Icon :name="getCategoryIcon(extension.categories[0])" />
      </div>
      <div class="header-content">
        <h3 class="name">
          {{ extension.name }}
          <Icon v-if="extension.verified" name="checkmark-circle-02" class="verified-icon" :title="$t('extensions.verified')" />
        </h3>
        <span class="author">{{ $t('extensions.by_author', { author: extension.author }) }}</span>
      </div>
    </div>

    <p class="description">{{ extension.description }}</p>

    <div class="card-footer">
      <div class="meta">
        <span v-if="extension.latestVersion" class="version">{{ $t('extensions.latest_version', { version: extension.latestVersion }) }}</span>
        <span v-if="installed && installedVersion" class="installed-version">
          {{ $t('extensions.installed_version', { version: installedVersion }) }}
        </span>
      </div>

      <div class="actions">
        <template v-if="actionInProgress">
          <Icon name="loading-03" class="spin" />
        </template>
        <template v-else-if="installed">
          <button
            class="action-btn toggle"
            :title="enabled ? $t('extensions.disable') : $t('extensions.enable')"
            @click="(e) => handleActionClick(e, () => emit('toggleEnabled'))"
          >
            <Icon :name="enabled ? 'toggle-on' : 'toggle-off'" />
          </button>
          <button
            class="action-btn danger"
            :title="$t('extensions.uninstall')"
            @click="(e) => handleActionClick(e, () => emit('uninstall'))"
          >
            <Icon name="delete-02" />
          </button>
        </template>
        <template v-else>
          <button
            class="action-btn primary"
            @click="(e) => handleActionClick(e, () => emit('install'))"
          >
            {{ $t('extensions.install') }}
          </button>
        </template>
      </div>
    </div>

    <div class="categories">
      <span v-for="cat in extension.categories" :key="cat" class="category-tag">
        {{ cat }}
      </span>
    </div>
  </article>

  <article v-else class="extension-card placeholder">
    <div class="card-header">
      <div class="icon-wrapper">
        <Icon name="puzzle" />
      </div>
      <div class="header-content">
        <h3 class="name">Unknown Extension</h3>
        <span class="author">{{ $t('extensions.installed_version', { version: installedVersion ?? 'unknown' }) }}</span>
      </div>
    </div>

    <div class="card-footer">
      <div class="actions">
        <template v-if="actionInProgress">
          <Icon name="loading-03" class="spin" />
        </template>
        <template v-else>
          <button
            class="action-btn toggle"
            :title="enabled ? $t('extensions.disable') : $t('extensions.enable')"
            @click="(e) => handleActionClick(e, () => emit('toggleEnabled'))"
          >
            <Icon :name="enabled ? 'toggle-on' : 'toggle-off'" />
          </button>
          <button
            class="action-btn danger"
            :title="$t('extensions.uninstall')"
            @click="(e) => handleActionClick(e, () => emit('uninstall'))"
          >
            <Icon name="delete-02" />
          </button>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped>
.extension-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--border-radius-normal);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &.installed {
    border-left: 3px solid var(--success);
  }

  &.disabled {
    opacity: 0.6;
  }
}

.card-header {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  background: var(--background-hover);
  border-radius: var(--border-radius-small);
  color: var(--primary);
  font-size: 1.25rem;
}

.header-content {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 1rem;
  font-weight: var(--font-weight-semibold);
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.verified-icon {
  color: var(--success);
  font-size: 1rem;
}

.author {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.description {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: auto;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.version {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.installed-version {
  font-size: 0.75rem;
  color: var(--success);
}

.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: var(--border-radius-small);
  font-size: 0.75rem;
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

  &.toggle {
    background: transparent;
    color: var(--text-muted);
    padding: 0.375rem;

    &:hover {
      background: var(--background-hover);
      color: var(--text);
    }
  }

  &.danger {
    background: transparent;
    color: var(--text-muted);
    padding: 0.375rem;

    &:hover {
      background: var(--error);
      color: white;
    }
  }
}

.categories {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.category-tag {
  padding: 0.125rem 0.5rem;
  background: var(--background-hover);
  border-radius: 999px;
  font-size: 0.625rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
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

.placeholder {
  opacity: 0.7;
}
</style>
