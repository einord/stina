<template>
  <div class="profile-settings">
    <FormHeader
      :title="t('settings.profile.title')"
      :description="t('settings.profile.description')"
    />

    <SettingsPanel>
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
    </SettingsPanel>

    <MemoryList />
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import FormHeader from '../common/FormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
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

    > .settings-panel {
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
  }
</style>
