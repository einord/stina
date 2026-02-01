<script setup lang="ts">
import { ref, watch } from 'vue'
import Modal from '../../common/Modal.vue'
import Toggle from '../../inputs/Toggle.vue'
import Icon from '../../common/Icon.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import { useI18n } from '../../../composables/useI18n.js'

const props = defineProps<{
  extensionName: string
  extensionId: string
  /** Whether this is an uploaded local extension */
  isUploadedLocal?: boolean
}>()

const emit = defineEmits<{
  confirm: [deleteData: boolean]
  cancel: []
}>()

const { t } = useI18n()

const isOpen = ref(true)
const deleteData = ref(false)

// Emit cancel when modal is closed via the Modal component
watch(isOpen, (value) => {
  if (!value) {
    emit('cancel')
  }
})

function handleConfirm() {
  isOpen.value = false
  emit('confirm', deleteData.value)
}

function handleCancel() {
  isOpen.value = false
}
</script>

<template>
  <Modal
    v-model="isOpen"
    :title="props.isUploadedLocal ? t('extensions.unlink_confirm_title') : t('extensions.uninstall_confirm_title')"
    :close-label="t('common.close')"
    max-width="480px"
  >
    <div class="uninstall-content">
      <div class="alert-header">
        <Icon name="alert-02" class="alert-icon" />
        <p class="intro">
          {{ props.isUploadedLocal
            ? t('extensions.unlink_confirm_message', { name: props.extensionName })
            : t('extensions.uninstall_confirm_message', { name: props.extensionName })
          }}
        </p>
      </div>

      <div v-if="!props.isUploadedLocal" class="toggle-container" :class="{ danger: deleteData }">
        <Toggle
          v-model="deleteData"
          :label="t('extensions.delete_data_label')"
          :description="t('extensions.delete_data_description')"
        />
      </div>

      <div v-if="deleteData && !props.isUploadedLocal" class="warning danger-warning">
        <Icon name="alert-02" />
        <span>{{ t('extensions.delete_data_warning') }}</span>
      </div>
    </div>

    <template #footer>
      <SimpleButton @click="handleCancel">
        {{ t('extensions.cancel') }}
      </SimpleButton>
      <SimpleButton type="danger" @click="handleConfirm">
        {{ props.isUploadedLocal ? t('extensions.unlink') : t('extensions.uninstall') }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.uninstall-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.alert-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.alert-icon {
  font-size: 1.5rem;
  color: var(--theme-general-color-danger, #ef4444);
  flex-shrink: 0;
}

.intro {
  margin: 0;
  font-size: 0.875rem;
  color: var(--theme-general-color);
  line-height: 1.5;
}

.toggle-container {
  padding: 1rem;
  background: var(--theme-general-background-secondary);
  border-radius: var(--border-radius-small, 0.375rem);
  border: 1px solid var(--theme-general-border-color);
  transition: all 0.2s;

  &.danger {
    background: rgba(239, 68, 68, 0.1);
    border-color: var(--theme-general-color-danger, #ef4444);
  }

  /* Override toggle color when in danger state */
  &.danger :deep(.toggle.active) {
    background: var(--theme-general-color-danger, #ef4444);
  }
}

.warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-small, 0.375rem);
  font-size: 0.75rem;
  line-height: 1.4;

  :deep(.stina-icon) {
    flex-shrink: 0;
  }

  &.danger-warning {
    background: rgba(239, 68, 68, 0.1);
    color: var(--theme-general-color-danger, #ef4444);

    :deep(.stina-icon) {
      color: var(--theme-general-color-danger, #ef4444);
    }
  }
}
</style>
