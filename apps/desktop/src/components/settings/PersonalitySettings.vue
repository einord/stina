<script setup lang="ts">
  import type { PersonalitySettings, PersonalityPreset } from '@stina/settings';
  import { t } from '@stina/i18n';
  import { computed, onMounted, ref } from 'vue';

  const presets: { value: PersonalityPreset; label: string }[] = [
    { value: 'friendly', label: t('settings.personality.presets.friendly.label') },
    { value: 'concise', label: t('settings.personality.presets.concise.label') },
    { value: 'sarcastic', label: t('settings.personality.presets.sarcastic.label') },
    { value: 'dry', label: t('settings.personality.presets.dry.label') },
    { value: 'informative', label: t('settings.personality.presets.informative.label') },
    { value: 'custom', label: t('settings.personality.presets.custom.label') },
  ];

  const personality = ref<PersonalitySettings>({ preset: 'friendly', customText: '' });
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
    personality.value = settings.personality ?? { preset: 'friendly', customText: '' };
    loading.value = false;
  }

  async function save(partial: Partial<PersonalitySettings>) {
    const next = { ...personality.value, ...partial };
    personality.value = next;
    await window.stina.settings.updatePersonality(next);
  }

  function onPresetChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as PersonalityPreset;
    void save({ preset: value });
  }

  function onCustomChange(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    void save({ preset: 'custom', customText: value });
  }

  onMounted(load);
</script>

<template>
  <div class="personality-settings">
    <div class="header">
      <h3>{{ t('settings.personality.title') }}</h3>
      <p class="description">{{ t('settings.personality.description') }}</p>
    </div>

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

  .header > h3 {
    margin: 0;
    font-size: 1rem;
  }

  .header > .description {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.9rem;
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
