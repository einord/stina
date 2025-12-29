<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi.js'
import type { ExtensionListItem, InstalledExtension, ExtensionDetails, VersionInfo } from '@stina/extension-installer'
import Icon from '../common/Icon.vue'
import ExtensionCard from './ExtensionsView.Card.vue'
import ExtensionDetailsPanel from './ExtensionsView.Details.vue'
import PermissionPrompt from './ExtensionsView.PermissionPrompt.vue'

type Tab = 'browse' | 'installed'
type Category = 'all' | 'ai-provider' | 'tool' | 'theme' | 'utility'

const api = useApi()

const activeTab = ref<Tab>('browse')
const searchQuery = ref('')
const selectedCategory = ref<Category>('all')
const verifiedOnly = ref(false)

const availableExtensions = ref<ExtensionListItem[]>([])
const installedExtensions = ref<InstalledExtension[]>([])
const selectedExtension = ref<ExtensionDetails | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const actionInProgress = ref<string | null>(null)

// Permission prompt state
const pendingInstall = ref<{ extension: ExtensionDetails; version: VersionInfo } | null>(null)

const categories: { value: Category; labelKey: string }[] = [
  { value: 'all', labelKey: 'extensions.all_categories' },
  { value: 'ai-provider', labelKey: 'extensions.category_ai_provider' },
  { value: 'tool', labelKey: 'extensions.category_tool' },
  { value: 'theme', labelKey: 'extensions.category_theme' },
  { value: 'utility', labelKey: 'extensions.category_utility' },
]

const filteredExtensions = computed(() => {
  let extensions = availableExtensions.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    extensions = extensions.filter(
      (ext) =>
        ext.name.toLowerCase().includes(query) ||
        ext.description.toLowerCase().includes(query) ||
        ext.id.toLowerCase().includes(query)
    )
  }

  if (selectedCategory.value !== 'all') {
    extensions = extensions.filter((ext) => ext.categories.includes(selectedCategory.value as never))
  }

  if (verifiedOnly.value) {
    extensions = extensions.filter((ext) => ext.verified)
  }

  return extensions
})

const installedMap = computed(() => {
  const map = new Map<string, InstalledExtension>()
  for (const ext of installedExtensions.value) {
    map.set(ext.id, ext)
  }
  return map
})

function isInstalled(id: string): boolean {
  return installedMap.value.has(id)
}

function getInstalledVersion(id: string): string | null {
  return installedMap.value.get(id)?.version ?? null
}

function isEnabled(id: string): boolean {
  return installedMap.value.get(id)?.enabled ?? false
}

async function loadExtensions() {
  loading.value = true
  error.value = null
  try {
    const [available, installed] = await Promise.all([
      api.extensions.getAvailable(),
      api.extensions.getInstalled(),
    ])
    availableExtensions.value = available
    installedExtensions.value = installed
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load extensions'
  } finally {
    loading.value = false
  }
}

async function selectExtension(id: string) {
  try {
    selectedExtension.value = await api.extensions.getDetails(id)
  } catch (err) {
    console.error('Failed to load extension details:', err)
  }
}

function closeDetails() {
  selectedExtension.value = null
}

async function requestInstall(id: string) {
  // Get extension details to show permissions
  try {
    const details = await api.extensions.getDetails(id)
    const latestVersion = details.versions[0]

    if (latestVersion && latestVersion.permissions && latestVersion.permissions.length > 0) {
      // Show permission prompt
      pendingInstall.value = { extension: details, version: latestVersion }
    } else {
      // No permissions needed, install directly
      await installExtension(id)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to get extension details'
  }
}

async function confirmInstall() {
  if (!pendingInstall.value) return

  const id = pendingInstall.value.extension.id
  pendingInstall.value = null
  await installExtension(id)
}

function cancelInstall() {
  pendingInstall.value = null
}

async function installExtension(id: string) {
  actionInProgress.value = id
  try {
    const result = await api.extensions.install(id)
    if (result.success) {
      await loadExtensions()
    } else {
      error.value = result.error ?? 'Installation failed'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Installation failed'
  } finally {
    actionInProgress.value = null
  }
}

async function uninstallExtension(id: string) {
  actionInProgress.value = id
  try {
    const result = await api.extensions.uninstall(id)
    if (result.success) {
      await loadExtensions()
      if (selectedExtension.value?.id === id) {
        selectedExtension.value = await api.extensions.getDetails(id)
      }
    } else {
      error.value = result.error ?? 'Uninstallation failed'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Uninstallation failed'
  } finally {
    actionInProgress.value = null
  }
}

async function toggleEnabled(id: string) {
  const ext = installedMap.value.get(id)
  if (!ext) return

  actionInProgress.value = id
  try {
    if (ext.enabled) {
      await api.extensions.disable(id)
    } else {
      await api.extensions.enable(id)
    }
    await loadExtensions()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Operation failed'
  } finally {
    actionInProgress.value = null
  }
}

onMounted(() => {
  loadExtensions()
})
</script>

<template>
  <div class="extensions-view">
    <header class="extensions-header">
      <h1>{{ $t('extensions.title') }}</h1>
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'browse' }]"
          @click="activeTab = 'browse'"
        >
          {{ $t('extensions.browse') }}
        </button>
        <button
          :class="['tab', { active: activeTab === 'installed' }]"
          @click="activeTab = 'installed'"
        >
          {{ $t('extensions.installed') }}
          <span v-if="installedExtensions.length" class="badge">{{ installedExtensions.length }}</span>
        </button>
      </div>
    </header>

    <div class="extensions-toolbar">
      <div class="search-box">
        <Icon name="search-01" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('extensions.search_placeholder')"
        />
      </div>
      <select v-model="selectedCategory" class="category-filter">
        <option v-for="cat in categories" :key="cat.value" :value="cat.value">
          {{ $t(cat.labelKey) }}
        </option>
      </select>
      <label class="verified-toggle">
        <input v-model="verifiedOnly" type="checkbox" />
        {{ $t('extensions.verified_only') }}
      </label>
    </div>

    <div class="extensions-content">
      <div v-if="loading" class="loading">
        <Icon name="loading-03" class="spin" />
      </div>

      <div v-else-if="error" class="error">
        {{ error }}
      </div>

      <template v-else-if="activeTab === 'browse'">
        <div v-if="filteredExtensions.length === 0" class="empty">
          {{ $t('extensions.no_results') }}
        </div>
        <div v-else class="extensions-grid">
          <ExtensionCard
            v-for="ext in filteredExtensions"
            :key="ext.id"
            :extension="ext"
            :installed="isInstalled(ext.id)"
            :installed-version="getInstalledVersion(ext.id)"
            :enabled="isEnabled(ext.id)"
            :action-in-progress="actionInProgress === ext.id"
            @click="selectExtension(ext.id)"
            @install="requestInstall(ext.id)"
            @uninstall="uninstallExtension(ext.id)"
            @toggle-enabled="toggleEnabled(ext.id)"
          />
        </div>
      </template>

      <template v-else>
        <div v-if="installedExtensions.length === 0" class="empty">
          {{ $t('extensions.no_installed') }}
        </div>
        <div v-else class="extensions-grid">
          <ExtensionCard
            v-for="ext in installedExtensions"
            :key="ext.id"
            :extension="availableExtensions.find((a) => a.id === ext.id)"
            :installed="true"
            :installed-version="ext.version"
            :enabled="ext.enabled"
            :action-in-progress="actionInProgress === ext.id"
            @click="selectExtension(ext.id)"
            @uninstall="uninstallExtension(ext.id)"
            @toggle-enabled="toggleEnabled(ext.id)"
          />
        </div>
      </template>
    </div>

    <ExtensionDetailsPanel
      v-if="selectedExtension"
      :extension="selectedExtension"
      :installed="isInstalled(selectedExtension.id)"
      :installed-version="getInstalledVersion(selectedExtension.id)"
      :enabled="isEnabled(selectedExtension.id)"
      :action-in-progress="actionInProgress === selectedExtension.id"
      @close="closeDetails"
      @install="requestInstall(selectedExtension.id)"
      @uninstall="uninstallExtension(selectedExtension.id)"
      @toggle-enabled="toggleEnabled(selectedExtension.id)"
    />

    <PermissionPrompt
      v-if="pendingInstall"
      :extension="pendingInstall.extension"
      :version="pendingInstall.version"
      @confirm="confirmInstall"
      @cancel="cancelInstall"
    />
  </div>
</template>

<style scoped>
.extensions-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem;
  overflow: hidden;
}

.extensions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }
}

.tabs {
  display: flex;
  gap: 0.5rem;
}

.tab {
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--border-radius-small);
  font-size: 0.875rem;
  transition: all 0.2s;

  &:hover {
    background: var(--background-hover);
  }

  &.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.375rem;
  margin-left: 0.375rem;
  font-size: 0.75rem;
  font-weight: var(--font-weight-medium);
  background: var(--background-hover);
  border-radius: 999px;
}

.tab.active .badge {
  background: rgba(255, 255, 255, 0.2);
}

.extensions-toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 0.75rem;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--border-radius-small);

  input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 0.875rem;
    outline: none;

    &::placeholder {
      color: var(--text-muted);
    }
  }
}

.category-filter {
  padding: 0.5rem 0.75rem;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--border-radius-small);
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
}

.verified-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.875rem;
  cursor: pointer;

  input {
    cursor: pointer;
  }
}

.extensions-content {
  flex: 1;
  overflow: auto;
}

.loading,
.error,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
}

.error {
  color: var(--error);
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

.extensions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}
</style>
