<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import Select from '../../inputs/Select.vue'
import TextArea from '../../inputs/TextArea.vue'
import AiModels from './Ai.Models.vue'
import AiQuickCommands from './Ai.QuickCommands.vue'

const api = useApi()

// Personality state
const personalityPreset = ref<string>('friendly')
const customPersonalityPrompt = ref<string>('')
const savingPersonality = ref(false)

const personalityPresets = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
  { value: 'professional', label: 'Professional' },
  { value: 'creative', label: 'Creative' },
  { value: 'custom', label: 'Custom' },
]

const isCustomPersonality = computed(() => personalityPreset.value === 'custom')

/**
 * Load app settings for personality
 */
async function loadAppSettings() {
  try {
    const settings = await api.settings.get()
    personalityPreset.value = settings.personalityPreset || 'friendly'
    customPersonalityPrompt.value = settings.customPersonalityPrompt || ''
  } catch (err) {
    console.error('Failed to load app settings:', err)
  }
}

/**
 * Save personality settings
 */
async function savePersonality() {
  savingPersonality.value = true
  try {
    await api.settings.update({
      personalityPreset: personalityPreset.value,
      customPersonalityPrompt: isCustomPersonality.value
        ? customPersonalityPrompt.value
        : undefined,
    })
  } catch (err) {
    console.error('Failed to save personality settings:', err)
  } finally {
    savingPersonality.value = false
  }
}

// Auto-save personality when preset changes
watch(personalityPreset, () => {
  savePersonality()
})

// Debounced save for custom prompt
let customPromptTimeout: ReturnType<typeof setTimeout> | null = null
watch(customPersonalityPrompt, () => {
  if (!isCustomPersonality.value) return
  if (customPromptTimeout) clearTimeout(customPromptTimeout)
  customPromptTimeout = setTimeout(() => {
    savePersonality()
  }, 500)
})

onMounted(() => {
  loadAppSettings()
})
</script>

<template>
  <div class="ai-settings">
    <AiModels />

    <!-- Personality Section -->
    <div class="personality-section">
      <h2 class="section-title">{{ $t('settings.ai.personality_title') }}</h2>
      <p class="section-description">{{ $t('settings.ai.personality_description') }}</p>

      <div class="personality-form">
        <Select
          v-model="personalityPreset"
          :label="$t('settings.ai.personality_preset')"
          :options="personalityPresets"
        />

        <TextArea
          v-if="isCustomPersonality"
          v-model="customPersonalityPrompt"
          :label="$t('settings.ai.custom_personality_prompt')"
          :placeholder="$t('settings.ai.custom_personality_prompt_placeholder')"
          :rows="4"
        />
      </div>
    </div>

    <AiQuickCommands />
  </div>
</template>

<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
  gap: 2rem;

  > .personality-section {
    > .section-title {
      margin: 0 0 0.25rem;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--theme-general-color);
    }

    > .section-description {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      color: var(--theme-general-color-muted);
    }

    > .personality-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 400px;
    }
  }
}
</style>
