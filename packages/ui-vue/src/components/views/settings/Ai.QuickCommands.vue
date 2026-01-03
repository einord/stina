<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { QuickCommandDTO } from '@stina/shared'
import { useApi } from '../../../composables/useApi.js'
import EntityList from '../../common/EntityList.vue'
import IconToggleButton from '../../buttons/IconToggleButton.vue'
import AiQuickCommandModal from './Ai.QuickCommands.Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'

const api = useApi()

// Quick Commands state
const quickCommands = ref<QuickCommandDTO[]>([])
const loadingQuickCommands = ref(false)
const quickCommandsError = ref<string | null>(null)
const currentEditQuickCommand = ref<QuickCommandDTO>()
const showQuickCommandModal = ref(false)

/**
 * Load quick commands from API
 */
async function loadQuickCommands() {
  loadingQuickCommands.value = true
  quickCommandsError.value = null
  try {
    quickCommands.value = await api.settings.quickCommands.list()
  } catch (err) {
    quickCommandsError.value = err instanceof Error ? err.message : 'Failed to load quick commands'
    console.error('Failed to load quick commands:', err)
  } finally {
    loadingQuickCommands.value = false
  }
}

/**
 * Open add quick command modal
 */
function addQuickCommand() {
  currentEditQuickCommand.value = undefined
  showQuickCommandModal.value = true
}

/**
 * Open edit quick command modal
 */
function editQuickCommand(cmd: QuickCommandDTO) {
  currentEditQuickCommand.value = cmd
  showQuickCommandModal.value = true
}

/**
 * Handle quick command saved
 */
async function handleQuickCommandSaved() {
  showQuickCommandModal.value = false
  await loadQuickCommands()
}

/**
 * Handle quick command deleted
 */
async function handleQuickCommandDeleted() {
  showQuickCommandModal.value = false
  await loadQuickCommands()
}

onMounted(() => {
  loadQuickCommands()
})
</script>

<template>
  <div class="ai-quick-commands-settings">
    <!-- Quick Commands Section -->
    <EntityList
      :title="$t('settings.ai.quick_commands_title')"
      :description="$t('settings.ai.quick_commands_description')"
      :empty-text="$t('settings.ai.no_quick_commands')"
      :child-items="quickCommands"
      :loading="loadingQuickCommands"
      :error="quickCommandsError ?? undefined"
    >
      <template #actions>
        <SimpleButton :title="$t('settings.ai.add_quick_command')" @click="addQuickCommand">
          <Icon name="add-01" />
          {{ $t('settings.ai.add_quick_command') }}
        </SimpleButton>
      </template>
      <template #default="{ item }">
        <div class="quick-command-item" @click="editQuickCommand(item)">
          <div class="command-icon">
            <Icon :name="item.icon" />
          </div>
          <div class="command-content">
            <p class="command-text">{{ item.command }}</p>
          </div>
          <div class="actions">
            <IconToggleButton
              icon="edit-01"
              :tooltip="$t('settings.ai.edit_quick_command')"
              @click.stop="editQuickCommand(item)"
            />
          </div>
        </div>
      </template>
    </EntityList>

    <AiQuickCommandModal
      v-model="showQuickCommandModal"
      :command="currentEditQuickCommand"
      @saved="handleQuickCommandSaved"
      @deleted="handleQuickCommandDeleted"
    />
  </div>
</template>

<style scoped>
.ai-quick-commands-settings {
  display: flex;
  flex-direction: column;
  gap: 2rem;

  :deep(.item) {
    cursor: pointer;

    &:has(> .active) {
      border-color: var(--theme-general-border-color-active);
      z-index: 1;
    }

    .quick-command-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas: 'icon content actions';
      gap: 0.75rem;
      align-items: center;

      > .command-icon {
        grid-area: icon;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        background: var(
          --theme-general-color-primary-subtle,
          rgba(var(--theme-general-color-primary-rgb), 0.1)
        );
        border-radius: var(--border-radius-small, 0.375rem);
        color: var(--theme-general-color-primary);
      }

      > .command-content {
        grid-area: content;
        min-width: 0;

        > .command-text {
          margin: 0;
          font-size: 0.875rem;
          color: var(--theme-general-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      > .actions {
        grid-area: actions;
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
    }
  }
}
</style>
