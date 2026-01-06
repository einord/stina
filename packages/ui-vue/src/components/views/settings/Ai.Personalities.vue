<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import { useI18n } from '../../../composables/useI18n.js'
import Select from '../../inputs/Select.vue'
import TextArea from '../../inputs/TextArea.vue'
import FormHeader from '../../common/FormHeader.vue'

const api = useApi()
const { t } = useI18n()

// Personality state
const personalityPreset = ref<string>('professional')
const customPersonalityPrompt = ref<string>('')
const savingPersonality = ref(false)

const personalityPresets = computed(() => [
  { value: 'professional', label: t('settings.ai.personality_professional') },
  { value: 'friendly', label: t('settings.ai.personality_friendly') },
  { value: 'concise', label: t('settings.ai.personality_concise') },
  { value: 'sarcastic', label: t('settings.ai.personality_sarcastic') },
  { value: 'informative', label: t('settings.ai.personality_informative') },
  { value: 'creative', label: t('settings.ai.personality_creative') },
  { value: 'custom', label: t('settings.ai.personality_custom') },
])

const isCustomPersonality = computed(() => personalityPreset.value === 'custom')

/**
 * Load app settings for personality
 */
async function loadPersonalitySettings() {
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
  loadPersonalitySettings()
})
</script>

<template>
  <div class="ai-personalities-settings">
    <FormHeader
      :title="$t('settings.ai.personality_title')"
      :description="$t('settings.ai.personality_description')"
    />

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
</template>

<style scoped>
.ai-personalities-settings {
  > .personality-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 400px;
  }
}
</style>
