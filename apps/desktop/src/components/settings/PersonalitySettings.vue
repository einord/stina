<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { PersonalityPreset, PersonalitySettings } from '@stina/settings';
  import { computed, onMounted, ref } from 'vue';

  import FormHeader from '../common/FormHeader.vue';
  import FormSelect from '../form/FormSelect.vue';
  import FormTextArea from '../form/FormTextArea.vue';

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

  function onPresetChange(value: PersonalityPreset | null) {
    const preset = (value ?? 'friendly') as PersonalityPreset;
    if (preset === 'custom') {
      void save({ preset });
    } else {
      void save({ preset, customText: '' });
    }
  }

  function onCustomChange(value: string | null) {
    void save({ preset: 'custom', customText: value ?? '' });
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
      <FormSelect
        :label="t('settings.personality.preset_label')"
        :options="presets"
        :model-value="selectedPreset"
        :disabled="loading"
        @update:model-value="onPresetChange($event as PersonalityPreset)"
      />

      <FormTextArea
        v-if="selectedPreset === 'custom'"
        :label="t('settings.personality.custom_label')"
        :placeholder="t('settings.personality.custom_placeholder')"
        :rows="4"
        :model-value="customText"
        @update:model-value="onCustomChange"
      />
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
</style>
