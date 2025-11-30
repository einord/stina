<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { PersonalityPreset, PersonalitySettings } from '@stina/settings';
  import { computed, onMounted, ref } from 'vue';

  import FormHeader from '../common/FormHeader.vue';

  const presets: { value: PersonalityPreset; label: string }[] = [
    { value: 'friendly', label: t('settings.personality.presets.friendly.label') },
    { value: 'concise', label: t('settings.personality.presets.concise.label') },
    { value: 'sarcastic', label: t('settings.personality.presets.sarcastic.label') },
    { value: 'professional', label: t('settings.personality.presets.professional.label') },
    { value: 'informative', label: t('settings.personality.presets.informative.label') },
    { value: 'custom', label: t('settings.personality.presets.custom.label') },
  ];

  const personality = ref<PersonalitySettings>({ preset: 'professional', customText: '' });
  const loading = ref(true);

  const selectedPreset = computed(() => personality.value.preset ?? 'friendly');
  const customText = computed({
    get: () => personality.value.customText ?? '',
    set: (value: string) => {
      personality.value.customText = value;
    },
  });

  async function load() {
    loading.value = true;
    const settings = await window.stina.settings.get();
    personality.value = settings.personality ?? { preset: 'professional', customText: '' };
    loading.value = false;
  }

  async function save(partial: Partial<PersonalitySettings>) {
    const next = { ...personality.value, ...partial };
    personality.value = next;
    await window.stina.settings.updatePersonality(next);
  }

  function onPresetChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as PersonalityPreset;
    if (value === 'custom') {
      void save({ preset: value });
    } else {
      void save({ preset: value, customText: '' });
    }
  }

  function onCustomChange(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    void save({ preset: 'custom', customText: value });
  }

  onMounted(load);
</script>

<template>
  <div class="personality-settings">
    <FormHeader
      :title="t('settings.personality.title')"
      :description="t('settings.personality.description')"
    />

    <div class="controls">
      <label class="field">
        <span>{{ t('settings.personality.preset_label') }}</span>
        <select :value="selectedPreset" :disabled="loading" @change="onPresetChange">
          <option v-for="preset in presets" :key="preset.value" :value="preset.value">
            {{ preset.label }}
          </option>
        </select>
      </label>

      <label class="field" v-if="selectedPreset === 'custom'">
        <span>{{ t('settings.personality.custom_label') }}</span>
        <textarea
          :value="customText"
          :placeholder="t('settings.personality.custom_placeholder')"
          rows="4"
          @input="onCustomChange"
        ></textarea>
      </label>
    </div>
  </div>
</template>

<style scoped>
  .personality-settings {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 0;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.95rem;
  }

  select,
  textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--window-bg-second);
    color: var(--text);
    font: inherit;
  }

  textarea {
    min-height: 96px;
    resize: vertical;
  }
</style>
