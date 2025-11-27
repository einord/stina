<script setup lang="ts">
  import { t } from '@stina/i18n';

  import SubFormHeader from '../common/SubFormHeader.vue';

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

    <form class="form-grid" @submit.prevent="emit('submit')">
      <label class="field">
        <span>{{ t('settings.work.name_label') }}</span>
        <input
          :value="name"
          type="text"
          :placeholder="t('settings.work.name_placeholder')"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="field">
        <span>{{ t('settings.work.description_label') }}</span>
        <textarea
          :value="description"
          rows="2"
          :placeholder="t('settings.work.description_placeholder')"
          @input="emit('update:description', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>

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

    > .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.75rem;

      > .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 0.95rem;
        color: var(--text);

        > input,
        > textarea {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: var(--border-radius-normal);
          padding: 0.65rem 0.75rem;
          background: var(--window-bg-lower);
          color: var(--text);
        }

        > textarea {
          resize: vertical;
          min-height: 64px;
        }
      }

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
