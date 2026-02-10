<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type {
  ExtensionListItem,
  InstalledExtensionInfo,
  ExtensionDetails,
  VersionInfo,
} from '@stina/extension-installer'
import { useApi } from '../../../composables/useApi.js'
import { useAuth } from '../../../composables/useAuth.js'
import FormHeader from '../../common/FormHeader.vue'
import EntityList from '../../common/EntityList.vue'
import ExtensionsFilters from './Extensions.Filters.vue'
import ExtensionsListItem from './Extensions.ListItem.vue'
import ExtensionDetailsPanel from './Extensions.Details.vue'
import PermissionPrompt from './Extensions.PermissionPrompt.vue'
import UninstallConfirmModal from './Extensions.UninstallConfirmModal.vue'
import UploadLocalModal from './Extensions.UploadLocalModal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'
import {
  getLatestVerifiedVersion,
  isVersionVerified,
} from './extensionsUtils.js'

type Category = 'all' | 'ai-provider' | 'tool' | 'theme' | 'utility'

interface ExtensionRow {
  extension: ExtensionListItem
  installed: InstalledExtensionInfo | null
  installVersion: string | null
  installVersionVerified: boolean
  installedVerified: boolean
  /** Whether the installed extension has an invalid manifest */
  manifestInvalid: boolean
  /** Manifest validation errors */
  manifestErrors?: string[]
}

const api = useApi()
const { isAdmin } = useAuth()

const searchQuery = ref('')
const selectedCategory = ref<Category>('all')
const verifiedOnly = ref(false)
const installedOnly = ref(false)

const availableExtensions = ref<ExtensionListItem[]>([])
const installedExtensions = ref<InstalledExtensionInfo[]>([])
const selectedExtension = ref<ExtensionDetails | null>(null)
const showDetailsModal = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const actionInProgress = ref<string | null>(null)
const updateInProgress = ref<string | null>(null)

// Permission prompt state
const pendingInstall = ref<{ extension: ExtensionDetails; version: VersionInfo } | null>(null)

// Uninstall confirmation state
const pendingUninstall = ref<{ id: string; name: string; isUploadedLocal: boolean } | null>(null)

// Upload local modal state
const showUploadLocalModal = ref(false)

const categories: { value: Category; labelKey: string }[] = [
  { value: 'all', labelKey: 'extensions.all_categories' },
  { value: 'ai-provider', labelKey: 'extensions.category_ai_provider' },
  { value: 'tool', labelKey: 'extensions.category_tool' },
  { value: 'theme', labelKey: 'extensions.category_theme' },
  { value: 'utility', labelKey: 'extensions.category_utility' },
]

const availableById = computed(() => {
  return new Map(availableExtensions.value.map((extension) => [extension.id, extension]))
})

const installedById = computed(() => {
  return new Map(installedExtensions.value.map((extension) => [extension.id, extension]))
})

function matchesQuery(extension: ExtensionListItem, query: string): boolean {
  if (!query) return true
  const normalized = query.toLowerCase()
  return (
    extension.name.toLowerCase().includes(normalized) ||
    extension.description.toLowerCase().includes(normalized) ||
    extension.id.toLowerCase().includes(normalized)
  )
}

const filteredAvailable = computed(() => {
  let extensions = availableExtensions.value

  if (searchQuery.value) {
    extensions = extensions.filter((extension) => matchesQuery(extension, searchQuery.value))
  }

  if (selectedCategory.value !== 'all') {
    extensions = extensions.filter((extension) =>
      extension.categories.includes(selectedCategory.value as never)
    )
  }

  if (verifiedOnly.value) {
    extensions = extensions.filter(
      (extension) => (extension.verifiedVersions?.length ?? 0) > 0 || extension.verified
    )
  }

  return extensions
})

const installedFallback = computed(() => {
  return installedExtensions.value
    .filter((installed) => !availableById.value.has(installed.id))
    .map((installed) => getDisplayExtension(installed))
    .filter((extension) => matchesQuery(extension, searchQuery.value))
})

function getDisplayExtension(installed: InstalledExtensionInfo): ExtensionListItem {
  const available = availableById.value.get(installed.id)
  if (available) return available
  return {
    id: installed.id,
    repository: '',
    categories: [],
    verified: false,
    blocked: false,
    featured: false,
    verifiedVersions: [],
    name: installed.id,
    description: '',
    author: 'Unknown',
    latestVersion: null,
  }
}

const listSource = computed(() => {
  if (!installedOnly.value) {
    return [...filteredAvailable.value, ...installedFallback.value]
  }
  const installedFromRegistry = filteredAvailable.value.filter((extension) =>
    installedById.value.has(extension.id)
  )
  return [...installedFromRegistry, ...installedFallback.value]
})

const listItems = computed<ExtensionRow[]>(() => {
  return listSource.value.map((extension) => {
    const installed = installedById.value.get(extension.id) ?? null
    const latestVersion = extension.latestVersion ?? null
    const recommendedVersion = getLatestVerifiedVersion(extension.verifiedVersions)
    const installVersion = recommendedVersion ?? latestVersion

    return {
      extension,
      installed,
      installVersion,
      installVersionVerified: isVersionVerified(installVersion, extension.verifiedVersions),
      installedVerified: isVersionVerified(installed?.version ?? null, extension.verifiedVersions),
      manifestInvalid: installed ? !installed.manifestValid : false,
      manifestErrors: installed?.manifestErrors,
    }
  })
})

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
    showDetailsModal.value = true
  } catch (err) {
    console.error('Failed to load extension details:', err)
  }
}

function closeDetails() {
  showDetailsModal.value = false
  selectedExtension.value = null
}

function getRecommendedVersionInfo(versions: VersionInfo[]): VersionInfo | null {
  return versions.find((version) => version.isVerified) ?? versions[0] ?? null
}

async function requestInstall(id: string, version?: string) {
  try {
    const details =
      selectedExtension.value?.id === id ? selectedExtension.value : await api.extensions.getDetails(id)
    const targetVersion = version
      ? details.versions.find((entry) => entry.version === version)
      : getRecommendedVersionInfo(details.versions)

    if (!targetVersion) {
      error.value = 'Selected version not found'
      return
    }

    if (targetVersion.permissions && targetVersion.permissions.length > 0) {
      pendingInstall.value = { extension: details, version: targetVersion }
    } else {
      await installExtension(id, targetVersion.version)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to get extension details'
  }
}

async function confirmInstall() {
  if (!pendingInstall.value) return

  const { extension, version } = pendingInstall.value
  pendingInstall.value = null
  await installExtension(extension.id, version.version)
}

function cancelInstall() {
  pendingInstall.value = null
}

async function installExtension(id: string, version?: string) {
  actionInProgress.value = id
  try {
    const result = await api.extensions.install(id, version)
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

function requestUninstall(id: string, name: string) {
  const installed = installedById.value.get(id)
  pendingUninstall.value = { id, name, isUploadedLocal: installed?.isUploadedLocal ?? false }
}

async function confirmUninstall(deleteData: boolean) {
  if (!pendingUninstall.value) return

  const { id, isUploadedLocal } = pendingUninstall.value
  pendingUninstall.value = null
  actionInProgress.value = id
  try {
    // All extensions (including uploaded local) use the same uninstall method
    const result = await api.extensions.uninstall(id, deleteData)
    if (result.success) {
      await loadExtensions()
      if (selectedExtension.value?.id === id) {
        // For uploaded local extensions, we can't get details anymore since they're not in registry
        if (!isUploadedLocal) {
          selectedExtension.value = await api.extensions.getDetails(id)
        } else {
          selectedExtension.value = null
          showDetailsModal.value = false
        }
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

function cancelUninstall() {
  pendingUninstall.value = null
}

async function uploadLocalExtension(file: File) {
  showUploadLocalModal.value = false
  actionInProgress.value = 'uploading-local'
  try {
    const result = await api.extensions.uploadLocal(file)
    if (result.success) {
      await loadExtensions()
    } else {
      error.value = result.error ?? 'Failed to upload local extension'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to upload local extension'
  } finally {
    actionInProgress.value = null
  }
}

function cancelUploadLocal() {
  showUploadLocalModal.value = false
}

async function toggleEnabled(id: string) {
  const ext = installedById.value.get(id)
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

async function updateExtension(id: string, version?: string) {
  updateInProgress.value = id
  try {
    const result = await api.extensions.update(id, version)
    if (result.success) {
      await loadExtensions()
      if (selectedExtension.value?.id === id) {
        selectedExtension.value = await api.extensions.getDetails(id)
      }
    } else {
      error.value = result.error ?? 'Update failed'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Update failed'
  } finally {
    updateInProgress.value = null
  }
}

onMounted(() => {
  loadExtensions()
})
</script>

<template>
  <div class="extensions-view">
    <FormHeader
      :title="$t('extensions.title')"
      :description="$t('extensions.description')"
      icon="puzzle"
    >
      <SimpleButton v-if="isAdmin" @click="showUploadLocalModal = true">
        <Icon name="upload-cloud-02" />
        {{ $t('extensions.upload_local') }}
      </SimpleButton>
    </FormHeader>

    <ExtensionsFilters
      v-model:query="searchQuery"
      v-model:category="selectedCategory"
      v-model:verified-only="verifiedOnly"
      v-model:installed-only="installedOnly"
      :categories="categories"
      :show-category="true"
      :show-verified="true"
      :show-installed="true"
    />

    <EntityList
      :child-items="listItems"
      :loading="loading"
      :error="error ?? undefined"
      :empty-text="installedOnly ? $t('extensions.no_installed') : $t('extensions.no_results')"
    >
      <template #loading>
        {{ $t('common.loading') }}
      </template>
      <template #default="{ item }">
        <ExtensionsListItem
          :extension="item.extension"
          :installed="item.installed"
          :install-version="item.installVersion"
          :install-version-verified="item.installVersionVerified"
          :installed-verified="item.installedVerified"
          :action-in-progress="actionInProgress === item.extension.id"
          :is-admin="isAdmin"
          :manifest-invalid="item.manifestInvalid"
          :manifest-errors="item.manifestErrors"
          :is-uploaded-local="item.installed?.isUploadedLocal ?? false"
          @click="selectExtension(item.extension.id)"
          @install="requestInstall(item.extension.id, item.installVersion ?? undefined)"
          @uninstall="requestUninstall(item.extension.id, item.extension.name)"
          @toggle-enabled="toggleEnabled(item.extension.id)"
        />
      </template>
    </EntityList>

    <ExtensionDetailsPanel
      v-if="selectedExtension"
      v-model="showDetailsModal"
      :extension="selectedExtension!"
      :installed="Boolean(installedById.get(selectedExtension!.id))"
      :installed-version="installedById.get(selectedExtension!.id)?.version ?? null"
      :available-version="availableById.get(selectedExtension!.id)?.latestVersion ?? null"
      :enabled="installedById.get(selectedExtension!.id)?.enabled ?? false"
      :action-in-progress="actionInProgress === selectedExtension!.id"
      :update-in-progress="updateInProgress === selectedExtension!.id"
      :is-admin="isAdmin"
      @close="closeDetails"
      @install="(version) => requestInstall(selectedExtension!.id, version)"
      @uninstall="requestUninstall(selectedExtension!.id, selectedExtension!.name)"
      @toggle-enabled="toggleEnabled(selectedExtension!.id)"
      @update="(version) => updateExtension(selectedExtension!.id, version)"
    />

    <PermissionPrompt
      v-if="pendingInstall"
      :extension="pendingInstall.extension"
      :version="pendingInstall.version"
      @confirm="confirmInstall"
      @cancel="cancelInstall"
    />

    <UninstallConfirmModal
      v-if="pendingUninstall"
      :extension-name="pendingUninstall.name"
      :extension-id="pendingUninstall.id"
      :is-uploaded-local="pendingUninstall.isUploadedLocal"
      @confirm="confirmUninstall"
      @cancel="cancelUninstall"
    />

    <UploadLocalModal
      v-if="showUploadLocalModal"
      @confirm="uploadLocalExtension"
      @cancel="cancelUploadLocal"
    />
  </div>
</template>

<style scoped>
.extensions-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;

  > :deep(.entity-list) {
    > .list {
      > .item {
        padding: 1rem 1.25rem;

        &:has(> .extension-item) {
          border-color: var(--theme-general-border-color);
        }

        &:hover {
          border-color: var(--theme-general-border-color-hover, var(--theme-general-border-color));
        }
      }
    }
  }
}
</style>
