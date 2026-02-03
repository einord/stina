<script setup lang="ts">
/**
 * Delete confirmation modal for scheduled jobs.
 */
import Modal from '../../common/Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import type { ScheduledJobSummaryDTO } from '@stina/shared'

defineProps<{
  /** The job to delete */
  job: ScheduledJobSummaryDTO | null
  /** Whether deletion is in progress */
  isDeleting?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>({ required: true })

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  open.value = false
}
</script>

<template>
  <Modal v-model="open" title="Ta bort schemalagt jobb" close-label="Avbryt">
    <p class="message">
      Är du säker på att du vill ta bort jobbet
      <strong>{{ job?.jobId }}</strong>
      från <strong>{{ job?.extensionId }}</strong>?
    </p>
    <p class="warning">
      Denna åtgärd kan inte ångras. Jobbet kommer permanent tas bort och kommer inte längre att köras.
    </p>

    <template #footer>
      <SimpleButton type="normal" :disabled="isDeleting" @click="handleCancel">
        Avbryt
      </SimpleButton>
      <SimpleButton type="danger" :disabled="isDeleting" @click="handleConfirm">
        {{ isDeleting ? 'Tar bort...' : 'Ta bort' }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.message {
  margin: 0 0 1rem 0;
  color: var(--theme-general-color);
  line-height: 1.5;

  strong {
    font-weight: 600;
  }
}

.warning {
  margin: 0;
  padding: 0.75rem;
  background: var(--theme-general-color-danger-background, rgba(220, 38, 38, 0.1));
  border-radius: 0.375rem;
  color: var(--theme-general-color-danger, #dc2626);
  font-size: 0.875rem;
  line-height: 1.4;
}
</style>
