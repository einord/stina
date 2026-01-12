<script setup lang="ts">
import { computed } from 'vue'
import Modal from '../common/Modal.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import ExtensionSettingsForm from '../common/ExtensionSettingsForm.vue'
import { usePanelGroupedListContext } from './panelGroupedList.Context.js'

const state = usePanelGroupedListContext()
const editor = computed(() => state.view.value.editor)
const editorOpen = state.editorOpen
const editorTitle = state.editorTitle
const editorError = state.editorError
const editorValues = state.editorValues
const editorLoading = state.editorLoading
const panel = state.panel
const saveEditor = state.saveEditor
const deleteEditorItem = state.deleteEditorItem
const canDelete = computed(() => Boolean(editor.value?.deleteToolId && state.editorItemId.value))
</script>

<template>
  <Modal v-if="editor" v-model="editorOpen" :title="editorTitle" close-label="Close">
    <div v-if="editorError" class="editor-state error">{{ editorError }}</div>
    <ExtensionSettingsForm
      :definitions="editor.fields"
      :values="editorValues"
      :loading="editorLoading"
      :extension-id="panel.extensionId"
      @update="(key, value) => (editorValues[key] = value)"
    />
    <template #footer>
      <SimpleButton type="normal" @click="editorOpen = false">Cancel</SimpleButton>
      <SimpleButton
        v-if="canDelete"
        type="danger"
        :disabled="editorLoading"
        @click="deleteEditorItem"
      >
        Delete
      </SimpleButton>
      <SimpleButton type="primary" :disabled="editorLoading" @click="saveEditor">
        Save
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.editor-state {
  color: var(--theme-general-muted, #6b7280);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;

  &.error {
    color: var(--color-danger, #ef4444);
  }
}
</style>
