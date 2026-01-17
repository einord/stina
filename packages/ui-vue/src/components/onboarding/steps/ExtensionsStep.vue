<script setup lang="ts">
/**
 * Extensions selection step for onboarding.
 * Shows popular extensions that users can optionally install.
 */
import { ref, inject, onMounted, computed } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import type { ExtensionDetails } from '@stina/extension-installer'
import Toggle from '../../inputs/Toggle.vue'
import Icon from '../../common/Icon.vue'
import { useApi } from '../../../composables/useApi.js'
import { t } from '../../../composables/useI18n.js'

// Popular extension IDs to suggest (can be configured)
const POPULAR_EXTENSION_IDS: string[] = [
  'stina-ext-work',
  'stina-ext-people',
]

const onboarding = inject<UseOnboardingReturn>('onboarding')!
const api = useApi()

// State
const popularExtensions = ref<ExtensionDetails[]>([])
const isInstalling = ref(false)
const installProgress = ref(0)

// Computed
const hasExtensions = computed(() => popularExtensions.value.length > 0)

/**
 * Load details for popular extensions.
 */
async function loadExtensions(): Promise<void> {
  if (POPULAR_EXTENSION_IDS.length === 0) return

  try {
    const details = await Promise.all(
      POPULAR_EXTENSION_IDS.map(async (id) => {
        try {
          return await api.extensions.getDetails(id)
        } catch {
          return null
        }
      })
    )

    popularExtensions.value = details.filter((d): d is ExtensionDetails => d !== null)
  } catch (err) {
    console.error('Failed to load extensions:', err)
  }
}

/**
 * Toggle extension selection.
 */
function toggleExtension(extensionId: string): void {
  const index = onboarding.selectedExtensionIds.value.indexOf(extensionId)
  if (index === -1) {
    onboarding.selectedExtensionIds.value.push(extensionId)
  } else {
    onboarding.selectedExtensionIds.value.splice(index, 1)
  }
}

/**
 * Check if an extension is selected.
 */
function isSelected(extensionId: string): boolean {
  return onboarding.selectedExtensionIds.value.includes(extensionId)
}

/**
 * Install all selected extensions.
 */
async function installSelected(): Promise<void> {
  const selectedIds = onboarding.selectedExtensionIds.value
  if (selectedIds.length === 0) return

  try {
    isInstalling.value = true
    installProgress.value = 0

    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i]!
      try {
        await api.extensions.install(id)
      } catch (err) {
        console.error(`Failed to install ${id}:`, err)
        // Continue with other extensions
      }
      installProgress.value = ((i + 1) / selectedIds.length) * 100
    }
  } finally {
    isInstalling.value = false
  }
}

// Expose install for parent
defineExpose({ installSelected })

onMounted(loadExtensions)
</script>

<template>
  <div class="extensions-step">
    <h2 class="step-title">{{ t('onboarding.extensions_title') }}</h2>
    <p class="step-subtitle">{{ t('onboarding.extensions_subtitle') }}</p>

    <!-- Extensions list -->
    <div v-if="hasExtensions" class="extensions-list">
      <div
        v-for="extension in popularExtensions"
        :key="extension.id"
        class="extension-item"
        :class="{ selected: isSelected(extension.id) }"
        @click="toggleExtension(extension.id)"
      >
        <div class="extension-info">
          <div class="extension-header">
            <span class="extension-name">{{ extension.name }}</span>
            <span v-if="extension.versions.length > 0" class="extension-version">v{{ extension.versions[0]?.version }}</span>
          </div>
          <p class="extension-description">{{ extension.description }}</p>
        </div>
        <div class="extension-checkbox">
          <div class="checkbox" :class="{ checked: isSelected(extension.id) }">
            <Icon v-if="isSelected(extension.id)" name="hugeicons:tick-02" />
          </div>
        </div>
      </div>
    </div>

    <!-- No extensions available -->
    <div v-else class="no-extensions">
      <p>{{ t('extensions.no_results') }}</p>
    </div>

    <!-- Installing progress -->
    <div v-if="isInstalling" class="installing-status">
      <Icon name="hugeicons:loading-02" class="loading-icon" />
      <span>{{ t('onboarding.extensions_installing') }}</span>
    </div>

    <p class="hint-text">{{ t('onboarding.extensions_hint') }}</p>
  </div>
</template>

<style scoped>
.extensions-step {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--theme-general-color);
  margin: 0;
  text-align: center;
}

.step-subtitle {
  font-size: 0.875rem;
  color: var(--theme-general-color-muted);
  margin: 0;
  text-align: center;
}

.extensions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.extension-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--theme-general-border-color);
  border-radius: 0.5rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    border-color: var(--theme-general-color-primary);
  }

  &.selected {
    border-color: var(--theme-general-color-primary);
    background-color: var(--theme-general-color-primary-bg, rgba(99, 102, 241, 0.05));
  }
}

.extension-info {
  flex: 1;
  min-width: 0;
}

.extension-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.extension-name {
  font-weight: 500;
  font-size: 0.9375rem;
  color: var(--theme-general-color);
}

.extension-version {
  font-size: 0.75rem;
  color: var(--theme-general-color-muted);
}

.extension-description {
  font-size: 0.8125rem;
  color: var(--theme-general-color-muted);
  margin: 0.25rem 0 0 0;
  line-height: 1.4;
}

.extension-checkbox {
  flex-shrink: 0;
}

.checkbox {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--theme-general-border-color);
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;

  &.checked {
    background-color: var(--theme-general-color-primary);
    border-color: var(--theme-general-color-primary);
    color: white;
  }
}

.no-extensions {
  text-align: center;
  padding: 2rem;
  color: var(--theme-general-color-muted);
}

.installing-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  color: var(--theme-general-color-muted);
  font-size: 0.875rem;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--theme-general-color-muted);
  text-align: center;
  margin: 0.5rem 0 0 0;
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
