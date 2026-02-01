<script setup lang="ts">
/**
 * Modal for uploading a local extension via ZIP file.
 * Displays a drag-and-drop area and a warning that local extensions are not verified.
 */
import { ref, watch, computed } from 'vue'
import Modal from '../../common/Modal.vue'
import Icon from '../../common/Icon.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import { useI18n } from '../../../composables/useI18n.js'

const emit = defineEmits<{
  confirm: [file: File]
  cancel: []
}>()

const { t } = useI18n()

const isOpen = ref(true)
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Emit cancel when modal is closed via the Modal component
watch(isOpen, (value) => {
  if (!value) {
    emit('cancel')
  }
})

const fileInfo = computed(() => {
  if (!selectedFile.value) return null
  const size = selectedFile.value.size
  const sizeStr = size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${(size / 1024).toFixed(1)} KB`
  return {
    name: selectedFile.value.name,
    size: sizeStr,
  }
})

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      selectedFile.value = file
    }
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0] ?? null
  }
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function clearFile() {
  selectedFile.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function handleConfirm() {
  if (selectedFile.value) {
    isOpen.value = false
    emit('confirm', selectedFile.value)
  }
}

function handleCancel() {
  isOpen.value = false
}
</script>

<template>
  <Modal
    v-model="isOpen"
    :title="t('extensions.upload_local_title')"
    :close-label="t('common.close')"
    max-width="480px"
  >
    <div class="upload-local-content">
      <p class="intro">
        {{ t('extensions.upload_local_description') }}
      </p>

      <div
        class="dropzone"
        :class="{ dragging: isDragging, 'has-file': selectedFile }"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="openFilePicker"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".zip"
          class="file-input"
          @change="handleFileSelect"
        />

        <template v-if="selectedFile && fileInfo">
          <Icon name="file-zip" class="file-icon" />
          <div class="file-details">
            <span class="file-name">{{ fileInfo.name }}</span>
            <span class="file-size">{{ fileInfo.size }}</span>
          </div>
          <button class="clear-btn" type="button" @click.stop="clearFile">
            <Icon name="x" />
          </button>
        </template>
        <template v-else>
          <Icon name="upload-cloud-02" class="upload-icon" />
          <span class="dropzone-text">{{ t('extensions.upload_drop_or_click') }}</span>
          <span class="dropzone-hint">{{ t('extensions.upload_zip_only') }}</span>
        </template>
      </div>

      <div class="warning">
        <Icon name="alert-02" />
        <span>{{ t('extensions.link_local_warning') }}</span>
      </div>
    </div>

    <template #footer>
      <SimpleButton @click="handleCancel">
        {{ t('extensions.cancel') }}
      </SimpleButton>
      <SimpleButton type="primary" :disabled="!selectedFile" @click="handleConfirm">
        {{ t('extensions.upload') }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.upload-local-content {
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

.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  border: 2px dashed var(--theme-general-border-color);
  border-radius: var(--border-radius-small, 0.375rem);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.dropzone:hover,
.dropzone.dragging {
  border-color: var(--theme-general-color-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.05);
}

.dropzone.has-file {
  flex-direction: row;
  justify-content: flex-start;
  padding: 1rem;
  border-style: solid;
  cursor: default;
}

.file-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.upload-icon {
  color: var(--theme-general-color-secondary);
  width: 2rem;
  height: 2rem;
}

.dropzone-text {
  font-size: 0.875rem;
  color: var(--theme-general-color);
}

.dropzone-hint {
  font-size: 0.75rem;
  color: var(--theme-general-color-secondary);
}

.file-icon {
  flex-shrink: 0;
  color: var(--theme-general-color-primary, #3b82f6);
  width: 1.5rem;
  height: 1.5rem;
}

.file-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.file-name {
  font-size: 0.875rem;
  color: var(--theme-general-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 0.75rem;
  color: var(--theme-general-color-secondary);
}

.clear-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  background: none;
  color: var(--theme-general-color-secondary);
  cursor: pointer;
  border-radius: var(--border-radius-small, 0.25rem);
}

.clear-btn:hover {
  color: var(--theme-general-color);
  background: var(--theme-general-background-hover);
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
