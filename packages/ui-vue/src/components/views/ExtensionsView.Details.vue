<script setup lang="ts">
/**
 * Extension details modal.
 * Shows extension information and settings for installed extensions.
 */
import { ref, watch, computed } from 'vue'
import type { ExtensionDetails } from '@stina/extension-installer'
import type { SettingDefinition } from '@stina/extension-api'
import { useApi } from '../../composables/useApi.js'
import Icon from '../common/Icon.vue'
import Modal from '../common/Modal.vue'
import ExtensionSettingsForm from '../common/ExtensionSettingsForm.vue'
import SimpleButton from '../buttons/SimpleButton.vue'

const props = defineProps<{
  extension: ExtensionDetails
  installed: boolean
  installedVersion: string | null
  /** Latest available version from registry */
  availableVersion: string | null
  enabled: boolean
  actionInProgress: boolean
  /** Whether an update action is in progress */
  updateInProgress: boolean
}>()

const emit = defineEmits<{
  close: []
  install: []
  uninstall: []
  toggleEnabled: []
  update: []
}>()

/**
 * Check if an update is available
 */
const hasUpdate = computed(() => {
  if (!props.installed || !props.installedVersion || !props.availableVersion) {
    return false
  }
  return props.availableVersion !== props.installedVersion
})

const api = useApi()
const open = defineModel<boolean>({ default: true })

// Settings state
const settings = ref<Record<string, unknown>>({})
const settingDefinitions = ref<SettingDefinition[]>([])
const settingsLoading = ref(false)
const settingsSaving = ref(false)

// Active tab for installed extensions
type Tab = 'info' | 'settings'
const activeTab = ref<Tab>('info')

const hasSettings = computed(() => settingDefinitions.value.length > 0)

/**
 * Load extension settings when viewing an installed extension
 */
async function loadSettings() {
  if (!props.installed) return

  settingsLoading.value = true
  try {
    const response = await api.extensions.getSettings(props.extension.id)
    settings.value = response.settings
    settingDefinitions.value = response.definitions
  } catch (error) {
    console.error('Failed to load extension settings:', error)
  } finally {
    settingsLoading.value = false
  }
}

/**
 * Handle setting update
 */
async function handleSettingUpdate(key: string, value: unknown) {
  settingsSaving.value = true
  try {
    await api.extensions.updateSetting(props.extension.id, key, value)
    settings.value = { ...settings.value, [key]: value }
  } catch (error) {
    console.error('Failed to update setting:', error)
  } finally {
    settingsSaving.value = false
  }
}

/**
 * Get icon for category
 */
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

/**
 * Format permission for display
 */
function formatPermission(permission: string): string {
  if (permission.startsWith('network:')) {
    return `Network: ${permission.substring(8)}`
  }
  return permission.replace('.', ': ')
}

/**
 * Close the modal
 */
function closeModal() {
  open.value = false
  emit('close')
}

// Load settings when extension changes or becomes installed
watch(
  () => [props.extension.id, props.installed],
  () => {
    if (props.installed) {
      loadSettings()
      activeTab.value = 'info'
    }
  },
  { immediate: true }
)
</script>

<template>
  <Modal
    v-model="open"
    :title="extension.name"
    :close-label="$t('common.close')"
    max-width="600px"
    @update:model-value="!$event && closeModal()"
  >
    <div class="extension-details">
      <!-- Header with icon and author -->
      <div class="extension-header">
        <div class="icon-wrapper">
          <Icon :name="getCategoryIcon(extension.categories[0])" />
        </div>
        <div class="header-info">
          <div class="name-row">
            <Icon
              v-if="extension.verified"
              name="checkmark-circle-02"
              class="verified-icon"
              :title="$t('extensions.verified')"
            />
            <span class="version">v{{ installedVersion || extension.versions[0]?.version }}</span>
          </div>
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

      <!-- Tabs for installed extensions -->
      <div v-if="installed && hasSettings" class="tabs">
        <button
          :class="['tab', { active: activeTab === 'info' }]"
          @click="activeTab = 'info'"
        >
          {{ $t('extensions.tab_info') }}
        </button>
        <button
          :class="['tab', { active: activeTab === 'settings' }]"
          @click="activeTab = 'settings'"
        >
          {{ $t('extensions.tab_settings') }}
        </button>
      </div>

      <!-- Info tab content -->
      <template v-if="activeTab === 'info'">
        <p class="description">{{ extension.description }}</p>

        <!-- Actions -->
        <div class="actions">
          <template v-if="actionInProgress || updateInProgress">
            <SimpleButton type="primary" disabled>
              <Icon name="loading-03" class="spin" />
              {{ updateInProgress ? $t('extensions.updating') : (installed ? $t('extensions.uninstalling') : $t('extensions.installing')) }}
            </SimpleButton>
          </template>
          <template v-else-if="installed">
            <SimpleButton v-if="hasUpdate" type="primary" @click="emit('update')">
              <Icon name="refresh-01" />
              {{ $t('extensions.update') }}
            </SimpleButton>
            <SimpleButton @click="emit('toggleEnabled')">
              <Icon :name="enabled ? 'toggle-on' : 'toggle-off'" />
              {{ enabled ? $t('extensions.disable') : $t('extensions.enable') }}
            </SimpleButton>
            <SimpleButton type="danger" @click="emit('uninstall')">
              <Icon name="delete-02" />
              {{ $t('extensions.uninstall') }}
            </SimpleButton>
          </template>
          <template v-else>
            <SimpleButton type="primary" @click="emit('install')">
              <Icon name="download-01" />
              {{ $t('extensions.install') }}
            </SimpleButton>
          </template>
        </div>

        <!-- Update available notice -->
        <div v-if="hasUpdate && !actionInProgress && !updateInProgress" class="update-notice">
          <Icon name="info-circle" />
          {{ $t('extensions.update_available', { version: availableVersion ?? '' }) }}
        </div>

        <!-- Meta info -->
        <div class="meta-section">
          <div class="meta-item">
            <Icon name="document-code" />
            <span class="label">{{ $t('extensions.license') }}</span>
            <span class="value">{{ extension.license || 'Unknown' }}</span>
          </div>
          <div class="meta-item">
            <Icon name="link-01" />
            <span class="label">{{ $t('extensions.repository') }}</span>
            <a :href="extension.repository" target="_blank" rel="noopener noreferrer" class="value link">
              {{ extension.repository }}
            </a>
          </div>
        </div>

        <!-- Categories -->
        <div class="categories-section">
          <span v-for="cat in extension.categories" :key="cat" class="category-tag">
            {{ cat }}
          </span>
        </div>

        <!-- Versions -->
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
      </template>

      <!-- Settings tab content -->
      <template v-else-if="activeTab === 'settings'">
        <div class="settings-content">
          <div v-if="settingsLoading" class="loading">
            <Icon name="loading-03" class="spin" />
            {{ $t('common.loading') }}
          </div>
          <ExtensionSettingsForm
            v-else
            :definitions="settingDefinitions"
            :values="settings"
            :loading="settingsSaving"
            @update="handleSettingUpdate"
          />
        </div>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.extension-details {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.extension-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;

  > .icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.5rem;
    height: 3.5rem;
    background: var(--theme-general-background-hover);
    border-radius: var(--border-radius-normal, 0.5rem);
    color: var(--theme-general-color-primary);
    font-size: 1.75rem;
  }

  > .header-info {
    flex: 1;

    > .name-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      > .verified-icon {
        color: var(--theme-general-color-success);
        font-size: 1.125rem;
      }

      > .version {
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }
    }

    > .author-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.25rem;

      > .author {
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }

      > .author-link {
        color: var(--theme-general-color-primary);
        font-size: 0.875rem;

        &:hover {
          opacity: 0.8;
        }
      }
    }
  }
}

.tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--theme-general-border-color);
  margin: 0 -1rem;
  padding: 0 1rem;

  > .tab {
    padding: 0.625rem 1rem;
    border: none;
    background: transparent;
    color: var(--theme-general-color-muted);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 0.2s;

    &:hover {
      color: var(--theme-general-color);
    }

    &.active {
      color: var(--theme-general-color-primary);
      border-bottom-color: var(--theme-general-color-primary);
    }
  }
}

.description {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--theme-general-color);
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.update-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  background: var(--theme-general-color-primary-bg, rgba(59, 130, 246, 0.1));
  color: var(--theme-general-color-primary);
  border-radius: var(--border-radius-small, 0.375rem);
  font-size: 0.8125rem;
}

.meta-section {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.875rem;
  background: var(--theme-general-background-hover);
  border-radius: var(--border-radius-normal, 0.5rem);

  > .meta-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;

    > .label {
      color: var(--theme-general-color-muted);
    }

    > .value {
      color: var(--theme-general-color);

      &.link {
        color: var(--theme-general-color-primary);
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
}

.categories-section {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;

  > .category-tag {
    padding: 0.25rem 0.75rem;
    background: var(--theme-general-background-hover);
    border-radius: 999px;
    font-size: 0.6875rem;
    color: var(--theme-general-color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.versions-section {
  > h3 {
    margin: 0 0 0.75rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--theme-general-color);
  }

  > .version-item {
    padding: 0.875rem;
    background: var(--theme-general-background-hover);
    border-radius: var(--border-radius-normal, 0.5rem);
    margin-bottom: 0.625rem;

    &:last-child {
      margin-bottom: 0;
    }

    > .version-header {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-bottom: 0.375rem;

      > .version-number {
        font-weight: 600;
        color: var(--theme-general-color);
        font-size: 0.875rem;
      }

      > .version-date {
        font-size: 0.6875rem;
        color: var(--theme-general-color-muted);
      }

      > .current-badge {
        padding: 0.125rem 0.5rem;
        background: var(--theme-general-color-success);
        color: white;
        border-radius: 999px;
        font-size: 0.5625rem;
        font-weight: 500;
        text-transform: uppercase;
      }
    }

    > .version-changelog {
      margin: 0 0 0.625rem;
      font-size: 0.8125rem;
      color: var(--theme-general-color-muted);
      line-height: 1.4;
    }

    > .permissions {
      padding-top: 0.625rem;
      border-top: 1px solid var(--theme-general-border-color);

      > h4 {
        margin: 0 0 0.375rem;
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--theme-general-color-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      > ul {
        margin: 0;
        padding-left: 1rem;
        font-size: 0.6875rem;
        color: var(--theme-general-color-muted);

        > li {
          margin-bottom: 0.1875rem;
        }
      }
    }
  }
}

.settings-content {
  min-height: 150px;

  > .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--theme-general-color-muted);
    padding: 2rem;
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
