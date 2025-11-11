<template>
  <div class="profile-settings">
    <h2>{{ t('settings.profile.title') }}</h2>
    <p class="description">{{ t('settings.profile.description') }}</p>

    <div class="form-group">
      <label for="first-name">{{ t('settings.profile.first_name') }}</label>
      <input
        id="first-name"
        v-model="firstName"
        type="text"
        :placeholder="t('settings.profile.first_name_placeholder')"
      />
    </div>

    <div class="form-group">
      <label for="nickname">{{ t('settings.profile.nickname') }}</label>
      <input
        id="nickname"
        v-model="nickname"
        type="text"
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
  }

  h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .description {
    margin: 0 0 24px 0;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  input[type='text'] {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition: border-color 0.2s;
  }

  input[type='text']:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .save-button {
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    color: white;
    background: var(--accent-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .save-button:hover {
    background: var(--accent-hover);
  }

  .save-button:active {
    background: var(--accent-active);
  }
</style>
