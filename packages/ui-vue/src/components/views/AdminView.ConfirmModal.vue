<script setup lang="ts">
/**
 * Confirmation modal for dangerous or important actions.
 * Uses the base Modal component with confirm/cancel buttons.
 */
import Modal from '../common/Modal.vue'
import SimpleButton from '../buttons/SimpleButton.vue'

withDefaults(
  defineProps<{
    /** Title text displayed in the modal header */
    title: string
    /** Message/description shown in the modal body */
    message: string
    /** Label for the confirm button */
    confirmLabel?: string
    /** Visual style variant for the confirm button */
    confirmVariant?: 'danger' | 'primary'
    /** Label for the cancel button */
    cancelLabel?: string
  }>(),
  {
    confirmLabel: 'Confirm',
    confirmVariant: 'danger',
    cancelLabel: 'Cancel',
  }
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>({ required: true })

function handleConfirm() {
  emit('confirm')
  open.value = false
}

function handleCancel() {
  emit('cancel')
  open.value = false
}
</script>

<template>
  <Modal v-model="open" :title="title" close-label="Close">
    <p class="message">{{ message }}</p>
    <template #footer>
      <SimpleButton type="normal" @click="handleCancel">
        {{ cancelLabel }}
      </SimpleButton>
      <SimpleButton :type="confirmVariant" @click="handleConfirm">
        {{ confirmLabel }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.message {
  margin: 0;
  color: var(--theme-general-color);
  line-height: 1.5;
}
</style>
