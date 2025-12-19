<script setup lang="ts">
  import SettingsPanel from '../common/SettingsPanel.vue';

  import ProjectList from './WorkSettings.ProjectList.vue';
  import RecurringSettings from './WorkSettings.Recurring.vue';
  import TodoSettings from './WorkSettings.TodoSettings.vue';

  defineProps<{
    recurringTargetId?: string | null;
  }>();

  defineEmits<{
    'consume-target': [];
  }>();
</script>

<template>
  <div class="work-settings">
    <SettingsPanel>
      <ProjectList />
    </SettingsPanel>

    <TodoSettings />

    <SettingsPanel>
      <RecurringSettings
        :target-template-id="recurringTargetId"
        @target-consumed="$emit('consume-target')"
      />
    </SettingsPanel>
  </div>
</template>

<style scoped>
  .work-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .work-settings :deep(.settings-panel) > .header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions {
      width: 100%;
    }
  }
</style>
