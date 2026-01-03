<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import FormHeader from '../../common/FormHeader.vue'
import Select from '../../inputs/Select.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import type { AppSettingsDTO } from '@stina/shared'

const api = useApi()

const loading = ref(true)
const error = ref<string | null>(null)
const showClearConfirm = ref(false)

const theme = ref<'light' | 'dark'>('dark')

// Track if initial load is complete to avoid saving on mount
let initialized = false

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

onMounted(async () => {
  try {
    const settings = await api.settings.get()
    theme.value = settings.theme
    initialized = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
})

// Auto-save when theme changes
watch(theme, async (value) => {
  if (!initialized) return
  try {
    await api.settings.update({ theme: value })
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
})

async function clearHistory() {
  // TODO: Implement clear chat history endpoint
  showClearConfirm.value = false
}
</script>

<template>
  <div class="interface-settings">
    <FormHeader
      :title="$t('settings.interface.title')"
      :description="$t('settings.interface.description')"
    />

    <div v-if="loading" class="loading">{{ $t('common.loading') }}...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="form">
      <Select v-model="theme" :label="$t('settings.interface.theme')" :options="themeOptions" />

      <div class="danger-zone">
        <h3 class="title">{{ $t('settings.interface.danger_zone') }}</h3>
        <p class="description">{{ $t('settings.interface.clear_history_description') }}</p>

        <div v-if="!showClearConfirm" class="action">
          <SimpleButton type="danger" @click="showClearConfirm = true">
            {{ $t('settings.interface.clear_history') }}
          </SimpleButton>
        </div>
        <div v-else class="confirm">
          <p class="warning">{{ $t('settings.interface.clear_history_confirm') }}</p>
          <div class="buttons">
            <SimpleButton type="danger" @click="clearHistory">
              {{ $t('common.confirm') }}
            </SimpleButton>
            <SimpleButton type="normal" @click="showClearConfirm = false">
              {{ $t('common.cancel') }}
            </SimpleButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interface-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
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

    > .danger-zone {
      margin-top: 2rem;
      padding: 1rem;
      border: 1px solid var(--theme-general-color-danger, #dc2626);
      border-radius: var(--border-radius-small, 0.375rem);

      > .title {
        margin: 0 0 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--theme-general-color-danger, #dc2626);
      }

      > .description {
        margin: 0 0 1rem;
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }

      > .confirm {
        > .warning {
          margin: 0 0 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--theme-general-color-danger, #dc2626);
        }

        > .buttons {
          display: flex;
          gap: 0.5rem;
        }
      }
    }
  }
}
</style>
