<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed } from 'vue';

  import FormHeader from '../common/FormHeader.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';

  const props = defineProps<{
    title: string;
    description?: string;
    enabled?: boolean;
    loading?: boolean;
    commands?: string[];
  }>();

  const emit = defineEmits<{
    toggle: [value: boolean];
  }>();

  const sortedCommands = computed(() => (props.commands ?? []).slice().sort());
</script>

<template>
  <FormHeader :title="title" :description="description">
    <FormCheckbox
      v-if="enabled != null"
      :model-value="enabled"
      :disabled="loading"
      :label="t('tools.modules.enabled_label')"
      @update:model-value="emit('toggle', $event)"
    />
  </FormHeader>
  <div class="body">
    <slot />
  </div>
  <div v-if="sortedCommands.length" class="commands">
    <p class="commands-title">{{ t('tools.modules.commands_title') }}</p>
    <ul class="command-list">
      <li v-for="cmd in sortedCommands" :key="cmd">
        <code>{{ cmd }}</code>
      </li>
    </ul>
  </div>
</template>

<style scoped>
  .body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .commands {
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    > .commands-title {
      margin: 0;
      font-weight: var(--font-weight-medium);
      font-size: 0.95rem;
    }

    > .command-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;

      > li {
        background: var(--panel-hover);
        border: 1px solid var(--border);
        border-radius: var(--border-radius-normal);
        padding: 0.35rem 0.5rem;

        > code {
          font-family: var(--font-mono);
          font-size: 0.85rem;
        }
      }
    }
  }
</style>
