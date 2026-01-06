<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import FormHeader from '../../common/FormHeader.vue'
import Select from '../../inputs/Select.vue'
import Combobox from '../../common/Combobox.vue'
import type { AppSettingsDTO } from '@stina/shared'

const api = useApi()

const loading = ref(true)
const error = ref<string | null>(null)

const language = ref<'en' | 'sv'>('en')
const timezone = ref('UTC')
const timezones = ref<Array<{ id: string; label: string }>>([])

// Track if initial load is complete to avoid saving on mount
let initialized = false

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'sv', label: 'Svenska' },
]

const timezoneOptions = computed(() =>
  timezones.value.map((tz) => ({
    value: tz.id,
    label: tz.label,
    description: tz.id,
  }))
)

onMounted(async () => {
  try {
    const [settings, tzList] = await Promise.all([api.settings.get(), api.settings.getTimezones()])

    language.value = settings.language
    timezone.value = settings.timezone
    timezones.value = tzList
    initialized = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
})

// Auto-save when values change
async function saveSettings(updates: Partial<AppSettingsDTO>) {
  if (!initialized) return
  try {
    await api.settings.update(updates)
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

watch(language, (value) => {
  saveSettings({ language: value })
})

watch(timezone, (value) => {
  saveSettings({ timezone: value })
})
</script>

<template>
  <div class="localization-settings">
    <FormHeader
      :title="$t('settings.localization.title')"
      :description="$t('settings.localization.description')"
    />

    <div v-if="loading" class="loading">{{ $t('common.loading') }}...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="form">
      <Select
        v-model="language"
        :label="$t('settings.localization.language')"
        :options="languageOptions"
      />

      <div class="field">
        <label class="label">{{ $t('settings.localization.timezone') }}</label>
        <Combobox
          v-model="timezone"
          :options="timezoneOptions"
          :placeholder="$t('settings.localization.timezone_placeholder')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.localization-settings {
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

    > .field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;

      > .label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--theme-general-color);
      }
    }
  }
}
</style>
