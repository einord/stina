<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { useDebounceFn } from '@vueuse/core';
  import { onMounted, ref, watch } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';

  const locationQuery = ref('');
  const savedLocation = ref<string | null>(null);
  const loading = ref(true);
  const saving = ref(false);
  const success = ref(false);
  const error = ref<string | null>(null);
  const loaded = ref(false);

  /**
   * Formats the saved location to a single display string.
   */
  function formatLocation(
    settings: Awaited<ReturnType<typeof window.stina.settings.getWeatherSettings>>,
  ) {
    const loc = settings.location;
    if (!loc) return null;
    if (loc.formattedName) return loc.formattedName;
    const parts = [loc.name, loc.admin1, loc.country].filter(Boolean);
    return parts.join(', ') || loc.name;
  }

  /**
   * Loads the current weather settings from the backend.
   */
  async function loadSettings() {
    loading.value = true;
    try {
      const settings = await window.stina.settings.getWeatherSettings();
      locationQuery.value = settings.locationQuery ?? '';
      savedLocation.value = formatLocation(settings);
      error.value = null;
    } catch (err) {
      error.value = t('settings.profile.weather_error');
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  onMounted(() => {
    void loadSettings();
  });

  /**
   * Persists the selected location and refreshes the displayed value.
   */
  async function saveLocation() {
    saving.value = true;
    success.value = false;
    error.value = null;
    try {
      const settings = await window.stina.settings.setWeatherLocation(locationQuery.value || '');
      locationQuery.value = settings.locationQuery ?? '';
      savedLocation.value = formatLocation(settings);
      success.value = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      error.value = message.startsWith('No location found')
        ? t('settings.profile.weather_not_found')
        : t('settings.profile.weather_error');
      success.value = false;
    } finally {
      saving.value = false;
      loading.value = false;
    }
  }

  const debouncedSave = useDebounceFn(() => saveLocation(), 400);

  /**
   * Clears the configured location.
   */
  async function clearLocation() {
    locationQuery.value = '';
    await saveLocation();
  }

  watch(
    () => locationQuery.value,
    () => {
      if (!loaded.value) return;
      success.value = false;
      error.value = null;
      debouncedSave();
    },
  );
</script>

<template>
  <SettingsPanel>
    <div class="header">
      <SubFormHeader
        :title="t('settings.profile.weather_title')"
        :description="t('settings.profile.weather_description')"
      />
      <SimpleButton
        type="danger"
        :disabled="saving || (!locationQuery && !savedLocation)"
        :title="t('settings.profile.weather_clear')"
        @click="clearLocation"
      >
        {{ t('settings.profile.weather_clear') }}
      </SimpleButton>
    </div>

    <div class="form-grid">
      <FormInputText
        v-model="locationQuery"
        type="search"
        :label="t('settings.profile.weather_label')"
        :placeholder="t('settings.profile.weather_placeholder')"
        @keyup.enter="saveLocation"
      />
    </div>

    <div class="status-row">
      <span v-if="loading" class="status muted">{{ t('settings.loading') }}</span>
      <span v-else-if="error" class="status error">{{ error }}</span>
      <span v-else-if="saving" class="status muted">{{ t('settings.saving') }}</span>
      <span v-else-if="success" class="status success">{{
        t('settings.profile.weather_saved')
      }}</span>
      <span v-else-if="savedLocation" class="status muted">
        {{ t('settings.profile.weather_current', { location: savedLocation }) }}
      </span>
      <span v-else class="status muted">{{ t('settings.profile.weather_not_set') }}</span>
    </div>
  </SettingsPanel>
</template>

<style scoped>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;

    > .actions {
      display: flex;
      gap: 0.5rem;
    }
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.75rem;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;

    > .status {
      font-size: 0.9rem;

      &.muted {
        color: var(--muted);
      }
      &.error {
        color: #c44c4c;
      }
      &.success {
        color: #3cb371;
      }
    }
  }
</style>
