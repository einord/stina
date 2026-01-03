<script setup lang="ts">
  import { t } from '@stina/i18n';

  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormTextArea from '../form/FormTextArea.vue';

  const props = defineProps<{
    /**
     * Optional header title rendered above the form.
     */
    headerTitle?: string;
    /**
     * Optional header description rendered under the title.
     */
    headerDescription?: string;
    /**
     * Current project name value.
     */
    name: string;
    /**
     * Current project description value.
     */
    description: string;
  }>();

  const emit = defineEmits<{
    (e: 'update:name', value: string): void;
    (e: 'update:description', value: string): void;
    (e: 'submit'): void;
  }>();
</script>

<template>
  <div class="project-form">
    <SubFormHeader v-if="headerTitle" :title="headerTitle" :description="headerDescription" />

    <form @submit.prevent="emit('submit')">
      <FormInputText
        :label="t('settings.work.name_label')"
        :placeholder="t('settings.work.name_placeholder')"
        :model-value="name"
        @update:model-value="emit('update:name', $event ?? '')"
      />
      <FormTextArea
        :label="t('settings.work.description_label')"
        :placeholder="t('settings.work.description_placeholder')"
        :rows="2"
        :model-value="description"
        @update:model-value="emit('update:description', $event ?? '')"
      />

      <div class="footer" v-if="$slots.footer">
        <slot name="footer" />
      </div>
    </form>
  </div>
</template>

<style scoped>
  .project-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      > .footer {
        grid-column: 1 / -1;
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 0.25rem;
      }
    }
  }
</style>
