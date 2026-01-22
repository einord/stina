<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { NotificationSoundId } from '@stina/shared'
import { useApi } from '../../../composables/useApi.js'
import { tryUseNotifications } from '../../../composables/useNotifications.js'
import { useI18n } from '../../../composables/useI18n.js'
import FormHeader from '../../common/FormHeader.vue'
import Select from '../../inputs/Select.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'

const api = useApi()
const notifications = tryUseNotifications()
const { t } = useI18n()

const loading = ref(true)
const error = ref<string | null>(null)

const notificationSound = ref<NotificationSoundId>('default')

// Sound support state
const soundSupported = ref(false)
const availableSounds = ref<Array<{ id: NotificationSoundId; labelKey: string }>>([])

// Track if initial load is complete to avoid saving on mount
let initialized = false

// Computed options for the dropdown using i18n keys
const soundOptions = computed(() => {
  return availableSounds.value.map((sound) => ({
    value: sound.id,
    label: t(sound.labelKey),
  }))
})

onMounted(async () => {
  try {
    // Load settings and sound support in parallel
    const [settings, soundSupportResult] = await Promise.all([
      api.settings.get(),
      notifications?.getSoundSupport() ?? Promise.resolve({ supported: false }),
    ])

    notificationSound.value = settings.notificationSound
    soundSupported.value = soundSupportResult.supported
    if ('sounds' in soundSupportResult && soundSupportResult.sounds) {
      availableSounds.value = soundSupportResult.sounds as Array<{ id: NotificationSoundId; labelKey: string }>
    }

    initialized = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
})

// Auto-save when sound changes
watch(notificationSound, async (value) => {
  if (!initialized) return
  try {
    await api.settings.update({ notificationSound: value })
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
})

async function testNotification() {
  if (!notifications) return

  await notifications.showTestNotification({
    title: 'Stina',
    body: t('settings.notifications.testMessage'),
    sound: notificationSound.value,
    clickAction: 'focus-chat',
  })
}
</script>

<template>
  <div class="notifications-settings">
    <FormHeader
      :title="$t('settings.notifications.title')"
      :description="soundSupported ? $t('settings.notifications.description') : $t('settings.notifications.webSoundInfo')"
    />

    <div v-if="loading" class="loading">{{ $t('common.loading') }}...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="form">
      <!-- Sound selection (only shown if supported) -->
      <div v-if="soundSupported" class="sound-row">
        <Select
          v-model="notificationSound"
          :label="$t('settings.notifications.sound')"
          :options="soundOptions"
        />
        <SimpleButton
          v-if="notifications"
          type="normal"
          class="test-button"
          @click="testNotification"
        >
          {{ $t('settings.notifications.test') }}
        </SimpleButton>
      </div>

      <!-- Just the test button for web (when sounds not supported) -->
      <SimpleButton
        v-else-if="notifications"
        type="normal"
        @click="testNotification"
      >
        {{ $t('settings.notifications.test') }}
      </SimpleButton>
    </div>
  </div>
</template>

<style scoped>
.notifications-settings {
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

    > .sound-row {
      display: flex;
      align-items: flex-end;
      gap: 1rem;

      > :first-child {
        flex: 1;
      }

      > .test-button {
        flex-shrink: 0;
      }
    }
  }
}
</style>
