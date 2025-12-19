<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed, onMounted, ref, watch } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormSelect from '../form/FormSelect.vue';

  const soundSelect = ref<string>('system:default');
  const customPath = ref<string>('');
  const loading = ref(true);
  const saving = ref(false);
  const testing = ref(false);
  const status = ref<string | null>(null);
  const error = ref<string | null>(null);

  const systemSounds = [
    'default',
    'Glass',
    'Ping',
    'Pop',
    'Basso',
    'Submarine',
    'Hero',
    'Funk',
    'Purr',
    'Sosumi',
  ];

  const options = computed(() => [
    ...systemSounds.map((name) => ({
      value: `system:${name}`,
      label:
        name === 'default'
          ? t('settings.notifications.sound_default')
          : t('settings.notifications.sound_system', { name }),
    })),
    { value: 'custom', label: t('settings.notifications.sound_custom') },
  ]);

  const selectedValue = computed(() =>
    soundSelect.value === 'custom' ? customPath.value || '' : soundSelect.value,
  );

  async function loadSettings() {
    loading.value = true;
    try {
      const settings = await window.stina.settings.getNotificationSettings();
      const incoming = settings.sound ?? 'system:default';
      if (incoming.startsWith('system:')) {
        soundSelect.value = incoming;
        customPath.value = '';
      } else {
        soundSelect.value = 'custom';
        customPath.value = incoming;
      }
      error.value = null;
    } catch {
      error.value = t('settings.notifications.load_error');
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void loadSettings();
  });

  async function saveSettings() {
    saving.value = true;
    status.value = null;
    try {
      await window.stina.settings.updateNotificationSettings({
        sound: selectedValue.value || null,
      });
      status.value = t('settings.saved');
      error.value = null;
    } catch {
      error.value = t('settings.notifications.save_error');
      status.value = null;
    } finally {
      saving.value = false;
    }
  }

  async function testNotification() {
    testing.value = true;
    status.value = null;
    try {
      await window.stina.settings.testNotification(selectedValue.value || null);
      status.value = t('settings.notifications.test_sent');
      error.value = null;
    } catch {
      error.value = t('settings.notifications.test_error');
      status.value = null;
    } finally {
      testing.value = false;
    }
  }
  watch(
    () => soundSelect.value,
    (next) => {
      if (next !== 'custom') {
        void saveSettings();
      }
    },
  );
</script>

<template>
  <div class="notification-settings">
    <SettingsPanel>
      <SubFormHeader
        :title="t('settings.notifications.title')"
        :description="t('settings.notifications.description')"
      />

      <div class="form-grid">
        <FormSelect
          :label="t('settings.notifications.sound_label')"
          :model-value="soundSelect"
          :options="options"
          @update:model-value="
            (value: string) => {
              soundSelect = value;
            }
          "
        />
        <div v-if="soundSelect === 'custom'" class="custom">
          <label class="custom-label">{{ t('settings.notifications.custom_label') }}</label>
          <input
            v-model="customPath"
            type="text"
            class="custom-input"
            :placeholder="t('settings.notifications.custom_placeholder')"
            @blur="saveSettings"
            @keyup.enter="saveSettings"
          />
        </div>
        <div class="actions">
          <SimpleButton @click="testNotification" :disabled="testing || loading">
            {{
              testing
                ? t('settings.notifications.testing')
                : t('settings.notifications.test_button')
            }}
          </SimpleButton>
        </div>
      </div>

      <div class="status-row">
        <span v-if="loading" class="status muted">{{ t('settings.loading') }}</span>
        <span v-else-if="saving" class="status muted">{{ t('settings.saving') }}</span>
        <span v-else-if="status" class="status success">{{ status }}</span>
        <span v-else-if="error" class="status error">{{ error }}</span>
      </div>
    </SettingsPanel>
  </div>
</template>

<style scoped>
  .notification-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;

    > .custom {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;

      > .custom-label {
        font-weight: var(--font-weight-medium);
        font-size: 0.95rem;
      }

      > .custom-input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border);
        border-radius: var(--border-radius-normal);
        background: var(--panel);
        color: var(--text);
      }

      > .hint {
        margin: 0;
        color: var(--muted);
        font-size: 0.9rem;
      }
    }

    > .actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      > .hint {
        margin: 0;
        color: var(--muted);
        font-size: 0.9rem;
      }
    }
  }

  .status-row {
    margin-top: 0.5rem;
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
