<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import FormHeader from '../../common/FormHeader.vue'
import Toggle from '../../inputs/Toggle.vue'

const api = useApi()

const loading = ref(true)
const error = ref<string | null>(null)

const debugMode = ref(false)

// Track if initial load is complete to avoid saving on mount
let initialized = false

onMounted(async () => {
  try {
    const settings = await api.settings.get()
    debugMode.value = settings.debugMode
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
</script>

<template>
  <div class="advanced-settings">
    <FormHeader
      :title="$t('settings.advanced.title')"
      :description="$t('settings.advanced.description')"
    />

    <div v-if="loading" class="loading">{{ $t('common.loading') }}...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="form">
      <Toggle
        v-model="debugMode"
        :label="$t('settings.advanced.debug_mode')"
        :description="$t('settings.advanced.debug_mode_description')"
      />
    </div>
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
</style>
