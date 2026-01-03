<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { QuickCommandDTO } from '@stina/shared'
import { useI18n } from '../../../composables/useI18n.js'
import Modal from '../../common/Modal.vue'
import TextArea from '../../inputs/TextArea.vue'
import IconPicker from '../../inputs/IconPicker.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'

const { t } = useI18n()

const props = defineProps<{
  /** Quick command to edit, or undefined for new */
  command?: QuickCommandDTO
}>()

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const model = defineModel<boolean>({ default: false })

const icon = ref('command')
const commandText = ref('')
const saving = ref(false)
const deleting = ref(false)
const showDeleteConfirm = ref(false)

const isEditing = computed(() => !!props.command)

const modalTitle = computed(() =>
  isEditing.value
    ? t('settings.ai.edit_quick_command_title')
    : t('settings.ai.add_quick_command_title')
)

const canSave = computed(() => {
  return commandText.value.trim() !== ''
})

watch(
  () => props.command,
  (cmd) => {
    if (cmd) {
      icon.value = cmd.icon
      commandText.value = cmd.command
    } else {
      icon.value = 'command'
      commandText.value = ''
    }
    showDeleteConfirm.value = false
  },
  { immediate: true }
)

watch(model, (open) => {
  if (!open) {
    showDeleteConfirm.value = false
  }
})

async function save() {
  if (!canSave.value) return

  saving.value = true

  try {
    const { useApi } = await import('../../../composables/useApi.js')
    const api = useApi()

    if (isEditing.value && props.command) {
      await api.settings.quickCommands.update(props.command.id, {
        icon: icon.value,
        command: commandText.value,
      })
    } else {
      await api.settings.quickCommands.create({
        icon: icon.value,
        command: commandText.value,
        sortOrder: 0,
      })
    }

    emit('saved')
    model.value = false
  } catch (err) {
    console.error('Failed to save quick command:', err)
  } finally {
    saving.value = false
  }
}

async function deleteCommand() {
  if (!props.command) return

  deleting.value = true

  try {
    const { useApi } = await import('../../../composables/useApi.js')
    const api = useApi()

    await api.settings.quickCommands.delete(props.command.id)
    emit('deleted')
    model.value = false
  } catch (err) {
    console.error('Failed to delete quick command:', err)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <Modal
    v-model="model"
    :title="modalTitle"
    :close-label="$t('common.close')"
    max-width="500px"
  >
    <div class="form">
      <IconPicker
        v-model="icon"
        :label="$t('settings.ai.quick_command_icon')"
      />

      <TextArea
        v-model="commandText"
        :label="$t('settings.ai.quick_command_text')"
        :placeholder="$t('settings.ai.quick_command_text_placeholder')"
        :rows="4"
      />

      <div v-if="isEditing" class="danger-zone">
        <h4 class="title">{{ $t('settings.ai.danger_zone') }}</h4>
        <p class="description">{{ $t('settings.ai.delete_quick_command_description') }}</p>

        <div v-if="!showDeleteConfirm" class="action">
          <SimpleButton type="danger" @click="showDeleteConfirm = true">
            {{ $t('settings.ai.delete_quick_command') }}
          </SimpleButton>
        </div>
        <div v-else class="confirm">
          <p class="warning">{{ $t('settings.ai.delete_quick_command_confirm') }}</p>
          <div class="buttons">
            <SimpleButton type="danger" :disabled="deleting" @click="deleteCommand">
              {{ deleting ? $t('common.loading') : $t('settings.ai.confirm_delete') }}
            </SimpleButton>
            <SimpleButton type="normal" @click="showDeleteConfirm = false">
              {{ $t('common.cancel') }}
            </SimpleButton>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <SimpleButton type="normal" @click="model = false">
        {{ $t('common.cancel') }}
      </SimpleButton>
      <SimpleButton type="primary" :disabled="!canSave || saving" @click="save">
        {{ saving ? $t('common.saving') : $t('common.save') }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  > .danger-zone {
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid var(--theme-general-color-danger, #dc2626);
    border-radius: var(--border-radius-small, 0.375rem);

    > .title {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-general-color-danger, #dc2626);
    }

    > .description {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      color: var(--theme-general-color-muted);
    }

    > .confirm {
      > .warning {
        margin: 0 0 0.75rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--theme-general-color-danger, #dc2626);
      }

      > .buttons {
        display: flex;
        gap: 0.5rem;
      }
    }
  }
}
</style>
