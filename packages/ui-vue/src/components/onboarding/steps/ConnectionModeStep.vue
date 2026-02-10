<script setup lang="ts">
/**
 * Connection mode selection step for Electron onboarding.
 * Allows users to choose between local mode and connecting to a remote server.
 * This component is only shown in Electron when the app is unconfigured.
 */
import { ref, computed } from 'vue'
import type { ConnectionConfig, ConnectionMode } from '@stina/core'
import LargeButton from '../../buttons/LargeButton.vue'
import TextInput from '../../inputs/TextInput.vue'
import Icon from '../../common/Icon.vue'
import { t } from '../../../composables/useI18n.js'

const emit = defineEmits<{
  (e: 'confirm', config: ConnectionConfig): void
}>()

// State
const selectedMode = ref<ConnectionMode>('local')
const webUrl = ref('')
const isTesting = ref(false)
const testResult = ref<{ success: boolean; error?: string } | null>(null)

// Computed
const canConfirm = computed(() => {
  if (selectedMode.value === 'local') {
    return true
  }
  // For remote mode, URL must be provided and tested successfully
  return webUrl.value.trim().length > 0 && testResult.value?.success === true
})

const normalizedUrl = computed(() => {
  let url = webUrl.value.trim()
  // Add https:// if no protocol specified
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  // Remove trailing slash
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  return url
})

/**
 * Test connection to the remote server.
 * Tests against the API endpoint at /api/health.
 */
async function testConnection(): Promise<void> {
  if (!normalizedUrl.value) return

  isTesting.value = true
  testResult.value = null

  try {
    // Test against the API endpoint (web URL + /api)
    const apiUrl = `${normalizedUrl.value}/api`
    const result = await window.electronAPI!.connectionTest(apiUrl)
    testResult.value = result
  } catch (error) {
    testResult.value = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    isTesting.value = false
  }
}

/**
 * Clear test result when URL changes.
 */
function handleUrlChange(): void {
  testResult.value = null
}

/**
 * Confirm the selected mode and emit config.
 */
function confirm(): void {
  if (!canConfirm.value) return

  const config: ConnectionConfig = {
    mode: selectedMode.value,
    ...(selectedMode.value === 'remote' ? { webUrl: normalizedUrl.value } : {}),
  }

  emit('confirm', config)
}

/**
 * Select a connection mode.
 */
function selectMode(mode: ConnectionMode): void {
  selectedMode.value = mode
  // Clear test result when switching modes
  if (mode === 'local') {
    testResult.value = null
  }
}
</script>

<template>
  <div class="connection-mode-step">
    <h2 class="step-title">{{ t('onboarding.connection_title') }}</h2>
    <p class="step-subtitle">{{ t('onboarding.connection_subtitle') }}</p>

    <div class="options">
      <!-- Local Mode Option -->
      <button
        type="button"
        class="option-card"
        :class="{ selected: selectedMode === 'local' }"
        @click="selectMode('local')"
      >
        <div class="option-icon">
          <Icon name="laptop" :size="32" />
        </div>
        <div class="option-content">
          <h3 class="option-title">
            {{ t('onboarding.connection_local_title') }}
            <span class="recommended">{{ t('onboarding.connection_local_recommended') }}</span>
          </h3>
          <p class="option-description">{{ t('onboarding.connection_local_description') }}</p>
        </div>
        <div class="option-check">
          <Icon v-if="selectedMode === 'local'" name="check-circle" :size="24" />
        </div>
      </button>

      <!-- Remote Mode Option -->
      <button
        type="button"
        class="option-card"
        :class="{ selected: selectedMode === 'remote' }"
        @click="selectMode('remote')"
      >
        <div class="option-icon">
          <Icon name="cloud" :size="32" />
        </div>
        <div class="option-content">
          <h3 class="option-title">{{ t('onboarding.connection_remote_title') }}</h3>
          <p class="option-description">{{ t('onboarding.connection_remote_description') }}</p>
        </div>
        <div class="option-check">
          <Icon v-if="selectedMode === 'remote'" name="check-circle" :size="24" />
        </div>
      </button>
    </div>

    <!-- Server URL Input (shown when remote is selected) -->
    <div v-if="selectedMode === 'remote'" class="remote-config">
      <TextInput
        v-model="webUrl"
        :label="t('onboarding.connection_server_url_label')"
        :placeholder="t('onboarding.connection_server_url_placeholder')"
        @update:model-value="handleUrlChange"
      />

      <div class="test-section">
        <LargeButton
          :title="isTesting ? t('onboarding.connection_testing') : t('onboarding.connection_test')"
          :disabled="!webUrl.trim() || isTesting"
          @click="testConnection"
        />

        <div v-if="testResult" class="test-result" :class="{ success: testResult.success, error: !testResult.success }">
          <Icon :name="testResult.success ? 'check-circle' : 'alert-circle'" :size="20" />
          <span>
            {{ testResult.success ? t('onboarding.connection_test_success') : testResult.error || t('onboarding.connection_test_failed') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Confirm Button -->
    <div class="confirm-section">
      <LargeButton
        :title="t('onboarding.connection_confirm')"
        :disabled="!canConfirm"
        type="primary"
        @click="confirm"
      />
    </div>
  </div>
</template>

<style scoped>
.connection-mode-step {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  > .step-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-general-color);
    margin: 0;
    text-align: center;
  }

  > .step-subtitle {
    font-size: 0.9375rem;
    color: var(--theme-general-color-muted);
    margin: 0;
    text-align: center;
  }

  > .options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.5rem;

    > .option-card {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1.25rem;
      border: 2px solid var(--theme-general-border-color);
      border-radius: var(--border-radius, 0.75rem);
      background: var(--theme-general-background);
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;

      &:hover {
        border-color: var(--theme-general-color-primary);
        background: var(--theme-general-background-secondary);
      }

      &.selected {
        border-color: var(--theme-general-color-primary);
        background: var(--theme-general-background-secondary);
      }

      > .option-icon {
        flex-shrink: 0;
        color: var(--theme-general-color-primary);
      }

      > .option-content {
        flex: 1;

        > .option-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--theme-general-color);
          margin: 0 0 0.25rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;

          > .recommended {
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--theme-general-color-success);
            background: var(--theme-general-background-success);
            padding: 0.125rem 0.5rem;
            border-radius: 0.25rem;
          }
        }

        > .option-description {
          font-size: 0.875rem;
          color: var(--theme-general-color-muted);
          margin: 0;
          line-height: 1.4;
        }
      }

      > .option-check {
        flex-shrink: 0;
        color: var(--theme-general-color-primary);
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      &.selected > .option-check {
        opacity: 1;
      }
    }
  }

  > .remote-config {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--theme-general-background-secondary);
    border-radius: var(--border-radius, 0.75rem);

    > .test-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      > .test-result {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: var(--border-radius-small, 0.375rem);
        font-size: 0.875rem;

        &.success {
          background: var(--theme-general-background-success, #d4edda);
          color: var(--theme-general-color-success, #155724);
        }

        &.error {
          background: var(--theme-general-color-danger-background, #f8d7da);
          color: var(--theme-general-color-danger, #721c24);
        }
      }
    }
  }

  > .confirm-section {
    margin-top: 0.5rem;
  }
}
</style>
