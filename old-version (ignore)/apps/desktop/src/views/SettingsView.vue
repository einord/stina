<script setup lang="ts">
  import { computed, ref, watch } from 'vue';

  import type { SettingsNavigationTarget } from '../lib/settingsNavigation';
  import AISettings from '../components/settings/AISettings.vue';
  import AdvancedSettings from '../components/settings/AdvancedSettings.vue';
  import InterfaceSettings from '../components/settings/InterfaceSettings.vue';
  import LocalizationSettings from '../components/settings/LocalizationSettings.vue';
  import NotificationSettings from '../components/settings/NotificationSettings.vue';
  import ProfileSettings from '../components/settings/ProfileSettings.vue';
  import SettingsSidebar from '../components/settings/SettingsSidebar.vue';

  const props = defineProps<{
    target?: SettingsNavigationTarget | null;
  }>();
  const emit = defineEmits<{ 'consume-target': [] }>();

  const activeGroup = ref<
    'ai' | 'localization' | 'interface' | 'notifications' | 'profile' | 'advanced'
  >('ai');
  const recurringTargetId = computed(() => props.target?.recurringTemplateId ?? null);

  watch(
    () => props.target?.group,
    (next) => {
      if (next) activeGroup.value = next;
    },
    { immediate: true },
  );
</script>

<template>
  <div class="settings-view">
    <SettingsSidebar v-model="activeGroup" />

    <div class="settings-content">
      <AISettings v-if="activeGroup === 'ai'" />
      <LocalizationSettings v-else-if="activeGroup === 'localization'" />
      <InterfaceSettings v-else-if="activeGroup === 'interface'" />
      <NotificationSettings v-else-if="activeGroup === 'notifications'" />
      <ProfileSettings v-else-if="activeGroup === 'profile'" />
      <AdvancedSettings v-else-if="activeGroup === 'advanced'" />
    </div>
  </div>
</template>

<style scoped>
  .settings-view {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 4em;
  }
</style>
