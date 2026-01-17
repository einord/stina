<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import FormHeader from '../../common/FormHeader.vue'
import TextInput from '../../inputs/TextInput.vue'
import type { AppSettingsDTO } from '@stina/shared'

const api = useApi()

const loading = ref(true)
const error = ref<string | null>(null)

const firstName = ref('')
const nickname = ref('')

// Track if initial load is complete to avoid saving on mount
let initialized = false

onMounted(async () => {
  try {
    const settings = await api.settings.get()
    firstName.value = settings.firstName ?? ''
    nickname.value = settings.nickname ?? ''
    initialized = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
})

// Debounced auto-save for text fields
// Accumulate all pending changes and save them together
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let pendingUpdates: Partial<AppSettingsDTO> = {}

function debouncedSave(updates: Partial<AppSettingsDTO>) {
  if (!initialized) return

  // Merge new updates with pending ones
  pendingUpdates = { ...pendingUpdates, ...updates }

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    const updatesToSave = pendingUpdates
    pendingUpdates = {}
    try {
      await api.settings.update(updatesToSave)
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }, 1000)
}

watch(firstName, (value) => {
  debouncedSave({ firstName: value || null })
})

watch(nickname, (value) => {
  debouncedSave({ nickname: value || null })
})
</script>

<template>
  <div class="profile-settings">
    <FormHeader
      :title="$t('settings.profile.title')"
      :description="$t('settings.profile.description')"
    />

    <div v-if="loading" class="loading">{{ $t('common.loading') }}...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="form">
      <TextInput
        v-model="firstName"
        :label="$t('settings.profile.first_name')"
        :placeholder="$t('settings.profile.first_name_placeholder')"
      />

      <TextInput
        v-model="nickname"
        :label="$t('settings.profile.nickname')"
        :placeholder="$t('settings.profile.nickname_placeholder')"
        :hint="$t('settings.profile.nickname_hint')"
      />
    </div>
  </div>
</template>

<style scoped>
.profile-settings {
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
</style>
