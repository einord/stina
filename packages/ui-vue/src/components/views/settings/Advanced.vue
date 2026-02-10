<script setup lang="ts">
import { ref, onMounted, watch, inject, computed } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import { useI18n } from '../../../composables/useI18n.js'
import { useAutoUpdate } from '../../../composables/useAutoUpdate.js'
import FormHeader from '../../common/FormHeader.vue'
import Toggle from '../../inputs/Toggle.vue'
import ConnectionModeStep from '../../onboarding/steps/ConnectionModeStep.vue'
import type { ConnectionConfig } from '@stina/core'

const api = useApi()
const { t } = useI18n()
const { channel, setChannel, isSupported: isAutoUpdateSupported } = useAutoUpdate()

const loading = ref(true)
const error = ref<string | null>(null)

const debugMode = ref(false)
const appVersion = ref<string | null>(null)

// Connection config - only available in Electron
// Using Symbol.for() to match the symbol in Electron's main.ts
const connectionConfigKey = Symbol.for('stina:connectionConfig')
const connectionConfig = inject<ConnectionConfig | undefined>(connectionConfigKey, undefined)

// Check if we're in Electron by looking for the electronAPI on window
const isElectron = computed(() => typeof window !== 'undefined' && 'electronAPI' in window)

// Show change connection modal
const showConnectionModal = ref(false)

// Track if initial load is complete to avoid saving on mount
let initialized = false

onMounted(async () => {
  try {
    const [settings, healthResponse] = await Promise.all([api.settings.get(), api.health()])
    debugMode.value = settings.debugMode
    appVersion.value = healthResponse.version ?? null
    initialized = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
})

// Auto-save when toggle changes
watch(debugMode, async (value) => {
  if (!initialized) return
  try {
    await api.settings.update({ debugMode: value })
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
})

/**
 * Handle connection mode change from modal
 */
async function handleConnectionChange(config: ConnectionConfig) {
  try {
    const electronAPI = (
      window as unknown as {
        electronAPI: {
          connectionSetConfig: (
            config: ConnectionConfig
          ) => Promise<{ success: boolean; requiresRestart: boolean }>
          appRestart: () => Promise<void>
        }
      }
    ).electronAPI

    const result = await electronAPI.connectionSetConfig(config)
    if (result.requiresRestart) {
      await electronAPI.appRestart()
    }
  } catch (e) {
    console.error('Failed to change connection mode:', e)
  }
}

/**
 * Get display text for current connection mode
 */
const connectionModeText = computed(() => {
  if (!connectionConfig) return ''
  if (connectionConfig.mode === 'local') {
    return t('settings.advanced.connection_local')
  }
  if (connectionConfig.mode === 'remote' && connectionConfig.webUrl) {
    return t('settings.advanced.connection_remote', { url: connectionConfig.webUrl })
  }
  return t('settings.advanced.connection_unconfigured')
})
</script>

<template>
  <div class="advanced-settings">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="form">
      <FormHeader
        :title="$t('settings.advanced.title')"
        :description="$t('settings.advanced.description')"
      />
      <Toggle
        v-model="debugMode"
        :label="$t('settings.advanced.debug_mode')"
        :description="$t('settings.advanced.debug_mode_description')"
      />

      <!-- Connection settings (Electron only) -->
      <template v-if="isElectron && connectionConfig">
        <FormHeader
          :title="$t('settings.advanced.connection_title')"
          :description="$t('settings.advanced.connection_current') + ': ' + connectionModeText"
        />

        <button type="button" class="change-connection-btn" @click="showConnectionModal = true">
          {{ $t('settings.advanced.connection_change') }}
        </button>
      </template>

      <!-- Update channel (Electron only) -->
      <template v-if="isElectron && isAutoUpdateSupported">
        <FormHeader
          :title="$t('settings.advanced.update_channel_title')"
          :description="$t('settings.advanced.update_channel_description')"
        />
        <div class="update-channel-options">
          <label class="channel-option">
            <input
              type="radio"
              name="update-channel"
              value="stable"
              :checked="channel === 'stable'"
              @change="setChannel('stable')"
            />
            <span class="channel-label">{{ $t('settings.advanced.update_channel_stable') }}</span>
            <span class="channel-description">{{ $t('settings.advanced.update_channel_stable_description') }}</span>
          </label>
          <label class="channel-option">
            <input
              type="radio"
              name="update-channel"
              value="beta"
              :checked="channel === 'beta'"
              @change="setChannel('beta')"
            />
            <span class="channel-label">{{ $t('settings.advanced.update_channel_beta') }}</span>
            <span class="channel-description">{{ $t('settings.advanced.update_channel_beta_description') }}</span>
          </label>
        </div>
      </template>

      <!-- Version info -->
      <FormHeader
        :title="$t('settings.advanced.version_title')"
        :description="$t('settings.advanced.version') + ': ' + (appVersion ?? 'unknown')"
      />
    </div>

    <!-- Connection change modal -->
    <Teleport to="body">
      <div
        v-if="showConnectionModal"
        class="modal-overlay"
        @click.self="showConnectionModal = false"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h2>{{ $t('settings.advanced.connection_change_title') }}</h2>
            <button class="close-btn" @click="showConnectionModal = false">&times;</button>
          </div>

          <div class="modal-warning">
            <span class="warning-icon">&#9888;</span>
            <p>{{ $t('settings.advanced.connection_warning') }}</p>
          </div>

          <ConnectionModeStep @confirm="handleConnectionChange" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.advanced-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 32rem;

  > .loading,
  > .error {
    padding: 1rem;
    border-radius: var(--border-radius-small, 0.375rem);
  }

  > .error {
    background: var(--theme-general-color-danger-background, #fef2f2);
    color: var(--theme-general-color-danger, #dc2626);
  }

  > .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
}

.section-divider {
  height: 1px;
  background: var(--theme-general-border-color, #e5e7eb);
  margin: 0.5rem 0;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--theme-general-color, #374151);
  margin: 0;
}

.connection-info,
.version-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.connection-label,
.version-label {
  color: var(--theme-general-color-secondary, #6b7280);
}

.connection-value,
.version-value {
  color: var(--theme-general-color, #374151);
  font-weight: 500;
}

.update-channel-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.channel-option {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  cursor: pointer;

  input[type="radio"] {
    margin: 0;
    accent-color: var(--theme-general-color-primary, #3b82f6);
  }

  .channel-label {
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium, 500);
    color: var(--theme-general-color, #374151);
  }

  .channel-description {
    width: 100%;
    padding-left: 1.25rem;
    font-size: 0.8125rem;
    color: var(--theme-general-color-secondary, #6b7280);
  }
}

.change-connection-btn {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--theme-general-color, #374151);
  background: var(--theme-general-background, #fff);
  border: 1px solid var(--theme-general-border-color, #d1d5db);
  border-radius: var(--border-radius-small, 0.375rem);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--theme-general-background-hover, #f9fafb);
    border-color: var(--theme-general-color-primary, #3b82f6);
  }
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--theme-general-background, #fff);
  border-radius: var(--border-radius-medium, 0.5rem);
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--theme-general-border-color, #e5e7eb);

  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-general-color, #111827);
  }
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--theme-general-color-secondary, #6b7280);
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: var(--theme-general-color, #111827);
  }
}

.modal-warning {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--theme-general-color-warning-background, #fffbeb);
  border-bottom: 1px solid var(--theme-general-border-color, #e5e7eb);

  .warning-icon {
    color: var(--theme-general-color-warning, #f59e0b);
    font-size: 1.25rem;
  }

  p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-general-color, #374151);
  }
}
</style>
