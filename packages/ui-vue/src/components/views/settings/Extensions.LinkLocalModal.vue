<script setup lang="ts">
/**
 * Modal for linking a local extension by providing an absolute path.
 * Displays a warning that local extensions are not verified.
 */
import { ref, watch } from 'vue'
import Modal from '../../common/Modal.vue'
import TextInput from '../../inputs/TextInput.vue'
import Icon from '../../common/Icon.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import { useI18n } from '../../../composables/useI18n.js'

const emit = defineEmits<{
  confirm: [path: string]
  cancel: []
}>()

const { t } = useI18n()

const isOpen = ref(true)
const path = ref('')

// Emit cancel when modal is closed via the Modal component
watch(isOpen, (value) => {
  if (!value) {
    emit('cancel')
  }
})

/**
 * Handles the confirm action. Emits the path if valid.
 */
function handleConfirm() {
  if (path.value.trim()) {
    isOpen.value = false
    emit('confirm', path.value.trim())
  }
}

/**
 * Handles the cancel action. Closes the modal.
 */
function handleCancel() {
  isOpen.value = false
}
</script>

<template>
  <Modal
    v-model="isOpen"
    :title="t('extensions.link_local_title')"
    :close-label="t('common.close')"
    max-width="480px"
  >
    <div class="link-local-content">
      <p class="intro">
        {{ t('extensions.link_local_description') }}
      </p>

      <TextInput
        v-model="path"
        :placeholder="t('extensions.link_local_path_placeholder')"
      />

      <div class="warning">
        <Icon name="alert-02" />
        <span>{{ t('extensions.link_local_warning') }}</span>
      </div>
    </div>

    <template #footer>
      <SimpleButton @click="handleCancel">
        {{ t('extensions.cancel') }}
      </SimpleButton>
      <SimpleButton type="primary" :disabled="!path.trim()" @click="handleConfirm">
        {{ t('extensions.link_local') }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.link-local-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.intro {
  margin: 0;
  font-size: 0.875rem;
  color: var(--theme-general-color);
  line-height: 1.5;
}

.warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-small, 0.375rem);
  font-size: 0.75rem;
  line-height: 1.4;
  background: rgba(245, 158, 11, 0.1);
  color: var(--theme-general-color-warning, #f59e0b);

  :deep(.stina-icon) {
    flex-shrink: 0;
    color: var(--theme-general-color-warning, #f59e0b);
  }
}
</style>
