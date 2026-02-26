<script setup lang="ts">
/**
 * Extension details modal.
 * Shows extension information and settings for installed extensions.
 */
import { ref, watch, computed } from 'vue'
import type { ExtensionDetails } from '@stina/extension-installer'
import type { SettingDefinition, LocalizedString } from '@stina/extension-api'
import { resolveLocalizedString } from '@stina/extension-api'
import { useApi, type ExtensionToolInfo } from '../../../composables/useApi.js'
import { useI18n } from '../../../composables/useI18n.js'
import Icon from '../../common/Icon.vue'
import MarkDown from '../../common/MarkDown.vue'
import Modal from '../../common/Modal.vue'
import CodeBlock from '../../common/CodeBlock.vue'
import ExtensionSettingsForm from '../../common/ExtensionSettingsForm.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Select from '../../inputs/Select.vue'
import Toggle from '../../inputs/Toggle.vue'

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
  /** Whether the current user is an admin (can manage extensions) */
  isAdmin: boolean
}>()

const emit = defineEmits<{
  close: []
  install: [version?: string]
  uninstall: []
  toggleEnabled: []
  update: [version?: string]
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
const { getLang } = useI18n()
const open = defineModel<boolean>({ default: true })

// Version selection
const selectedVersion = ref('')

const recommendedVersion = computed(() => {
  return props.extension.versions.find((version) => version.isVerified) ?? props.extension.versions[0] ?? null
})

const selectedVersionInfo = computed(() => {
  return (
    props.extension.versions.find((version) => version.version === selectedVersion.value) ??
    recommendedVersion.value
  )
})

const versionOptions = computed(() => {
  const recommended = recommendedVersion.value?.version
  return props.extension.versions.map((version) => ({
    value: version.version,
    isVerified: version.isVerified,
    isRecommended: recommended === version.version,
  }))
})

const canChangeVersion = computed(() => {
  if (!props.installed || !props.installedVersion || !selectedVersionInfo.value) {
    return false
  }
  return selectedVersionInfo.value.version !== props.installedVersion
})

const latestVersionInfo = computed(() => {
  if (!props.availableVersion) return null
  return props.extension.versions.find((version) => version.version === props.availableVersion) ?? null
})

const latestIsVerified = computed(() => latestVersionInfo.value?.isVerified ?? false)

const headerVersion = computed(() => {
  return props.installedVersion ?? selectedVersionInfo.value?.version ?? props.extension.versions[0]?.version ?? ''
})

const enabledModel = computed({
  get: () => props.enabled,
  set: (value) => {
    if (value !== props.enabled) {
      emit('toggleEnabled')
    }
  },
})

// Settings state
const settings = ref<Record<string, unknown>>({})
const settingDefinitions = ref<SettingDefinition[]>([])
const settingsLoading = ref(false)
const settingsSaving = ref(false)

// Tools state
const tools = ref<ExtensionToolInfo[]>([])
const toolsLoading = ref(false)

// Tool confirmation overrides
const toolOverrides = ref<Map<string, boolean>>(new Map())
const overridesLoading = ref(false)

// Active tab for installed extensions
type Tab = 'info' | 'settings' | 'tools'
const activeTab = ref<Tab>('info')

const hasSettings = computed(() => settingDefinitions.value.length > 0)
const hasTools = computed(() => tools.value.length > 0 || toolsLoading.value)
const showSelectedWarning = computed(() => Boolean(selectedVersionInfo.value && !selectedVersionInfo.value.isVerified))
const showRecommendedHint = computed(() => {
  return Boolean(
    recommendedVersion.value &&
      selectedVersionInfo.value &&
      recommendedVersion.value.version !== selectedVersionInfo.value.version &&
      !showSelectedWarning.value
  )
})

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
 * Load tools registered by the extension
 */
async function loadTools() {
  if (!props.installed) return

  toolsLoading.value = true
  try {
    tools.value = await api.extensions.getTools(props.extension.id)
  } catch (error) {
    console.error('Failed to load extension tools:', error)
    tools.value = []
  } finally {
    toolsLoading.value = false
  }
}

/**
 * Load tool confirmation overrides for the extension
 */
async function loadToolOverrides() {
  if (!props.installed) return

  overridesLoading.value = true
  try {
    const overrides = await api.extensions.getToolConfirmations(props.extension.id)
    toolOverrides.value = new Map(overrides.map((o) => [o.toolId, o.requiresConfirmation]))
  } catch (error) {
    console.error('Failed to load tool confirmation overrides:', error)
  } finally {
    overridesLoading.value = false
  }
}

/**
 * Get effective confirmation state for a tool (override or default)
 */
function getToolConfirmation(tool: ExtensionToolInfo): boolean {
  const override = toolOverrides.value.get(tool.id)
  return override ?? tool.requiresConfirmation
}

/**
 * Check if a tool has a user override
 */
function hasToolOverride(toolId: string): boolean {
  return toolOverrides.value.has(toolId)
}

/**
 * Toggle tool confirmation override
 */
async function toggleToolConfirmation(tool: ExtensionToolInfo) {
  const currentValue = getToolConfirmation(tool)
  const newValue = !currentValue

  try {
    await api.extensions.setToolConfirmation(props.extension.id, tool.id, newValue)
    toolOverrides.value = new Map(toolOverrides.value)
    toolOverrides.value.set(tool.id, newValue)
  } catch (error) {
    console.error('Failed to update tool confirmation:', error)
  }
}

/**
 * Reset a single tool's override to manifest default
 */
async function resetToolOverride(tool: ExtensionToolInfo) {
  try {
    await api.extensions.removeToolConfirmation(props.extension.id, tool.id)
    const newMap = new Map(toolOverrides.value)
    newMap.delete(tool.id)
    toolOverrides.value = newMap
  } catch (error) {
    console.error('Failed to reset tool override:', error)
  }
}

/**
 * Reset all tool overrides for this extension
 */
async function resetAllToolOverrides() {
  try {
    await api.extensions.resetToolConfirmations(props.extension.id)
    toolOverrides.value = new Map()
  } catch (error) {
    console.error('Failed to reset tool overrides:', error)
  }
}

/**
 * Whether any overrides exist
 */
const hasAnyOverrides = computed(() => toolOverrides.value.size > 0)

/**
 * Resolve a localized string to the current locale
 */
function resolveString(value: LocalizedString): string {
  return resolveLocalizedString(value, getLang())
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

// Load settings and tools when extension changes or becomes installed
watch(
  () => [props.extension.id, props.installed],
  () => {
    if (props.installed) {
      loadSettings()
      loadTools()
      loadToolOverrides()
      activeTab.value = 'info'
    }
  },
  { immediate: true }
)

watch(
  () => [props.extension.id, props.installedVersion],
  () => {
    if (props.installed && props.installedVersion) {
      selectedVersion.value = props.installedVersion
      return
    }
    selectedVersion.value = recommendedVersion.value?.version ?? props.extension.versions[0]?.version ?? ''
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
            <span class="version">v{{ headerVersion }}</span>
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
      <div v-if="installed && (hasSettings || hasTools)" class="tabs">
        <button
          :class="['tab', { active: activeTab === 'info' }]"
          @click="activeTab = 'info'"
        >
          {{ $t('extensions.tab_info') }}
        </button>
        <button
          v-if="hasSettings"
          :class="['tab', { active: activeTab === 'settings' }]"
          @click="activeTab = 'settings'"
        >
          {{ $t('extensions.tab_settings') }}
        </button>
        <button
          v-if="hasTools"
          :class="['tab', { active: activeTab === 'tools' }]"
          @click="activeTab = 'tools'"
        >
          {{ $t('extensions.tab_tools') }}
        </button>
      </div>

      <!-- Info tab content -->
      <template v-if="activeTab === 'info'">
        <p class="description">{{ extension.description }}</p>

        <!-- Version selection -->
        <div class="version-select">
          <label class="label">{{ $t('extensions.install_version_label') }}</label>
          <Select
            v-model="selectedVersion"
            :options="
              versionOptions.map((option) => ({
                value: option.value,
                label: [
                  `v${option.value}`,
                  option.isVerified ? $t('extensions.verified') : $t('extensions.unverified'),
                  option.isRecommended ? $t('extensions.recommended') : null,
                ]
                  .filter(Boolean)
                  .join(' | '),
              }))
            "
          />
          <p v-if="showSelectedWarning" class="notice warning">
            <Icon name="alert-02" />
            {{ $t('extensions.unverified_version_warning') }}
          </p>
          <p v-else-if="showRecommendedHint" class="notice hint">
            <Icon name="info-circle" />
            {{ $t('extensions.recommended_version', { version: recommendedVersion?.version ?? '' }) }}
          </p>
        </div>

        <!-- Actions -->
        <div class="actions">
          <template v-if="actionInProgress || updateInProgress">
            <SimpleButton type="primary" disabled>
              <Icon name="loading-03" class="spin" />
              {{ updateInProgress ? $t('extensions.updating') : (installed ? $t('extensions.uninstalling') : $t('extensions.installing')) }}
            </SimpleButton>
          </template>
          <template v-else-if="installed">
            <SimpleButton
              v-if="canChangeVersion"
              type="primary"
              :disabled="!isAdmin"
              :title="!isAdmin ? $t('extensions.admin_only_manage') : undefined"
              @click="isAdmin && emit('update', selectedVersionInfo?.version)"
            >
              <Icon name="refresh-01" />
              {{ $t('extensions.update_to_version', { version: selectedVersionInfo?.version ?? '' }) }}
            </SimpleButton>
            <Toggle
              v-model="enabledModel"
              :label="$t('extensions.enabled')"
              :disabled="!isAdmin"
              :title="!isAdmin ? $t('extensions.admin_only_enable_disable') : undefined"
            />
            <SimpleButton
              type="danger"
              :disabled="!isAdmin"
              :title="!isAdmin ? $t('extensions.admin_only_uninstall') : undefined"
              @click="isAdmin && emit('uninstall')"
            >
              <Icon name="delete-02" />
              {{ $t('extensions.uninstall') }}
            </SimpleButton>
          </template>
          <template v-else>
            <SimpleButton
              type="primary"
              :disabled="!isAdmin"
              :title="!isAdmin ? $t('extensions.admin_only_install') : undefined"
              @click="isAdmin && emit('install', selectedVersionInfo?.version)"
            >
              <Icon name="download-01" />
              {{ $t('extensions.install_version', { version: selectedVersionInfo?.version ?? '' }) }}
            </SimpleButton>
          </template>
        </div>

        <!-- Update available notice -->
        <div v-if="hasUpdate && !actionInProgress && !updateInProgress" class="update-notice" :class="{ warning: !latestIsVerified }">
          <Icon :name="latestIsVerified ? 'info-circle' : 'alert-02'" />
          <span v-if="latestIsVerified">{{ $t('extensions.update_available', { version: availableVersion ?? '' }) }}</span>
          <span v-else>{{ $t('extensions.update_unverified', { version: availableVersion ?? '' }) }}</span>
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
              <span v-if="version.isVerified" class="verified-badge">
                {{ $t('extensions.verified') }}
              </span>
              <span v-if="recommendedVersion?.version === version.version" class="recommended-badge">
                {{ $t('extensions.recommended') }}
              </span>
              <span
                v-if="installed && installedVersion === version.version"
                class="current-badge"
              >
                {{ $t('extensions.installed') }}
              </span>
            </div>
            <MarkDown v-if="version.changelog" class="version-changelog" :content="version.changelog" />

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
          <!-- Admin-only notice for non-admins -->
          <div v-if="!isAdmin" class="admin-notice">
            <Icon name="info-circle" />
            {{ $t('extensions.admin_only_settings') }}
          </div>
          <div v-if="settingsLoading" class="loading">
            <Icon name="loading-03" class="spin" />
            {{ $t('common.loading') }}
          </div>
          <ExtensionSettingsForm
            v-else
            :definitions="settingDefinitions"
            :values="settings"
            :loading="settingsSaving"
            :extension-id="extension.id"
            :disabled="!isAdmin"
            @update="handleSettingUpdate"
          />
        </div>
      </template>

      <!-- Tools tab content -->
      <template v-else-if="activeTab === 'tools'">
        <div class="tools-content">
          <div v-if="toolsLoading" class="loading">
            <Icon name="loading-03" class="spin" />
            {{ $t('common.loading') }}
          </div>
          <div v-else-if="tools.length === 0" class="empty">
            {{ $t('extensions.no_tools') }}
          </div>
          <template v-else>
            <div class="tools-list">
              <div v-for="tool in tools" :key="tool.id" class="tool-item">
                <div class="tool-header">
                  <Icon name="wrench-01" class="tool-icon" />
                  <div class="tool-info">
                    <span class="tool-name">{{ resolveString(tool.name) }}</span>
                    <code class="tool-id">{{ tool.id }}</code>
                  </div>
                </div>
                <p class="tool-description">{{ resolveString(tool.description) }}</p>
                <div class="tool-confirmation">
                  <label class="confirmation-toggle" @click.prevent="toggleToolConfirmation(tool)">
                    <input
                      type="checkbox"
                      :checked="getToolConfirmation(tool)"
                      @click.prevent
                    />
                    <span class="confirmation-label">{{ $t('extensions.requires_confirmation') }}</span>
                  </label>
                  <button
                    v-if="hasToolOverride(tool.id)"
                    class="reset-link"
                    @click="resetToolOverride(tool)"
                  >
                    {{ $t('extensions.reset_to_default') }}
                  </button>
                </div>
                <CodeBlock
                  v-if="tool.parameters"
                  :content="tool.parameters"
                  :label="$t('extensions.parameters')"
                  collapsible
                />
              </div>
            </div>
            <div v-if="hasAnyOverrides" class="tools-footer">
              <button class="reset-all-btn" @click="resetAllToolOverrides">
                {{ $t('extensions.reset_all_confirmations') }}
              </button>
            </div>
          </template>
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

.version-select {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  > .label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--theme-general-color);
  }

  > .notice {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.75rem;

    &.warning {
      color: var(--theme-general-color-warning, #b45309);
    }

    &.hint {
      color: var(--theme-general-color-muted);
    }
  }
}

.actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;

  > :deep(.toggle-input) {
    align-self: center;
  }

  > :deep(.toggle-wrapper) {
    align-items: center;
  }

  > :deep(.label) {
    font-size: 0.75rem;
  }
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

  &.warning {
    background: var(--theme-general-color-warning-background, rgba(245, 158, 11, 0.15));
    color: var(--theme-general-color-warning, #b45309);
  }
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

      > .verified-badge,
      > .recommended-badge {
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        font-size: 0.5625rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      > .verified-badge {
        background: var(--theme-general-color-success-background, rgba(34, 197, 94, 0.15));
        color: var(--theme-general-color-success, #16a34a);
      }

      > .recommended-badge {
        background: var(--theme-general-background-hover);
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

  > .admin-notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-general-color-warning-background, rgba(245, 158, 11, 0.15));
    color: var(--theme-general-color-warning, #b45309);
    border-radius: var(--border-radius-small, 0.375rem);
    font-size: 0.8125rem;
    margin-bottom: 1rem;
  }

  > .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--theme-general-color-muted);
    padding: 2rem;
  }
}

.tools-content {
  min-height: 150px;

  > .loading,
  > .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--theme-general-color-muted);
    padding: 2rem;
  }

  > .tools-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .tool-item {
      padding: 0.875rem;
      background: var(--theme-general-background-hover);
      border-radius: var(--border-radius-normal, 0.5rem);

      > .tool-header {
        display: flex;
        align-items: flex-start;
        gap: 0.625rem;
        margin-bottom: 0.5rem;

        > .tool-icon {
          color: var(--theme-general-color-primary);
          font-size: 1.125rem;
          flex-shrink: 0;
          margin-top: 0.125rem;
        }

        > .tool-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;

          > .tool-name {
            font-weight: 600;
            color: var(--theme-general-color);
            font-size: 0.9375rem;
          }

          > .tool-id {
            font-size: 0.6875rem;
            color: var(--theme-general-color-muted);
            font-family: var(--font-mono, monospace);
            background: var(--theme-general-background);
            padding: 0.125rem 0.375rem;
            border-radius: 0.25rem;
          }
        }
      }

      > .tool-description {
        margin: 0 0 0.625rem;
        font-size: 0.8125rem;
        color: var(--theme-general-color-muted);
        line-height: 1.5;
      }
    }
  }
}

.tool-confirmation {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.625rem;

  > .confirmation-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--theme-general-color);

    > input[type="checkbox"] {
      cursor: pointer;
      accent-color: var(--theme-general-color-primary);
    }
  }

  > .reset-link {
    background: none;
    border: none;
    color: var(--theme-general-color-primary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0;

    &:hover {
      text-decoration: underline;
    }
  }
}

.tools-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.75rem;
  border-top: 1px solid var(--theme-general-border-color);
  margin-top: 0.5rem;

  > .reset-all-btn {
    background: none;
    border: 1px solid var(--theme-general-border-color);
    color: var(--theme-general-color-muted);
    font-size: 0.75rem;
    padding: 0.375rem 0.75rem;
    border-radius: var(--border-radius-small, 0.375rem);
    cursor: pointer;

    &:hover {
      color: var(--theme-general-color);
      border-color: var(--theme-general-color);
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
