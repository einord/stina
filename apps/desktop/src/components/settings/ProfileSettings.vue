<template>
  <div class="profile-settings">
    <h2>{{ t('settings.profile.title') }}</h2>
    <p class="description">{{ t('settings.profile.description') }}</p>

    <div class="form-grid">
      <FormInputText
        v-model="firstName"
        :label="t('settings.profile.first_name')"
        :placeholder="t('settings.profile.first_name_placeholder')"
      />
      <FormInputText
        v-model="nickname"
        :label="t('settings.profile.nickname')"
        :placeholder="t('settings.profile.nickname_placeholder')"
      />
    </div>

    <button class="save-button" @click="handleSave">
      {{ t('settings.profile.save') }}
    </button>

    <MemoryList />
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import FormInputText from '../form/FormInputText.vue';
  import MemoryList from './MemoryList.vue';

  const firstName = ref('');
  const nickname = ref('');

  onMounted(async () => {
    const profile = await window.stina.settings.getUserProfile();
    firstName.value = profile.firstName ?? '';
    nickname.value = profile.nickname ?? '';
  });

  async function handleSave() {
    await window.stina.settings.updateUserProfile({
      firstName: firstName.value || undefined,
      nickname: nickname.value || undefined,
    });
  }
</script>

<style scoped>
  .profile-settings {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    > .description {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: var(--text-secondary);
    }

    > .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.75rem;
    }

    > .save-button {
      align-self: flex-start;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      background: var(--accent-primary);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.2s;

      &:hover {
        background: var(--accent-hover);
      }
      &:active {
        background: var(--accent-active);
      }
    }
  }
</style>
