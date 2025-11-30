<script setup lang="ts">
  import { computed, ref, watch } from 'vue';

  import type { SettingsNavigationTarget } from '../lib/settingsNavigation';
  import AISettings from '../components/settings/AISettings.vue';
  import AdvancedSettings from '../components/settings/AdvancedSettings.vue';
  import InterfaceSettings from '../components/settings/InterfaceSettings.vue';
  import ProfileSettings from '../components/settings/ProfileSettings.vue';
  import SettingsSidebar from '../components/settings/SettingsSidebar.vue';
  import WorkSettings from '../components/settings/WorkSettings.vue';

  const props = defineProps<{
    target?: SettingsNavigationTarget | null;
  }>();
  const emit = defineEmits<{ 'consume-target': [] }>();

  const activeGroup = ref<'ai' | 'interface' | 'profile' | 'work' | 'advanced'>('ai');
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
      <InterfaceSettings v-else-if="activeGroup === 'interface'" />
      <ProfileSettings v-else-if="activeGroup === 'profile'" />
      <WorkSettings
        v-else-if="activeGroup === 'work'"
        :recurring-target-id="recurringTargetId"
        @consume-target="emit('consume-target')"
      />
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
