<script setup lang="ts">
  import Add01Icon from '~icons/hugeicons/add-01';
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import { t } from '@stina/i18n';
  import type { QuickCommand } from '@stina/settings';
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

  import {
    DEFAULT_QUICK_COMMAND_ICON,
    QUICK_COMMAND_ICONS,
    resolveQuickCommandIcon,
    searchHugeicons,
  } from '../../lib/quickCommandIcons';
  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import FormTextArea from '../form/FormTextArea.vue';
  import FormInputText from '../form/FormInputText.vue';
  import IconButton from '../ui/IconButton.vue';

  import EntityList from './EntityList.vue';

  const quickCommands = ref<QuickCommand[]>([]);
  const loading = ref(true);
  const editingId = ref<string | null>(null);
  const editIcon = ref<string>(DEFAULT_QUICK_COMMAND_ICON);
  const editText = ref('');
  const showModal = ref(false);
  const iconSearch = ref('');
  const iconSearchResults = ref<string[]>([]);
  const iconSearchLoading = ref(false);
  const iconSearchError = ref<string | null>(null);
  let searchTimeout: number | null = null;
  let unsubscribe: (() => void) | null = null;

  onMounted(async () => {
    quickCommands.value = await window.stina.settings.getQuickCommands();
    loading.value = false;
    unsubscribe =
      window.stina.settings.onQuickCommandsChanged?.((updated: QuickCommand[]) => {
        quickCommands.value = updated ?? [];
      }) ?? null;
  });

  onUnmounted(() => {
    unsubscribe?.();
    if (searchTimeout) window.clearTimeout(searchTimeout);
  });

  function startEdit(command: QuickCommand | null) {
    editingId.value = command?.id ?? 'new';
    editIcon.value = command?.icon || DEFAULT_QUICK_COMMAND_ICON;
    editText.value = command?.text ?? '';
    iconSearch.value = '';
    iconSearchResults.value = [];
    iconSearchError.value = null;
    showModal.value = true;
  }

  function cancelEdit() {
    editingId.value = null;
    editIcon.value = DEFAULT_QUICK_COMMAND_ICON;
    editText.value = '';
    iconSearch.value = '';
    iconSearchResults.value = [];
    iconSearchError.value = null;
    showModal.value = false;
  }

  async function saveEdit() {
    const text = editText.value.trim();
    if (!text) return;
    const id = editingId.value && editingId.value !== 'new' ? editingId.value : undefined;
    const list = await window.stina.settings.upsertQuickCommand({
      id,
      icon: editIcon.value,
      text,
    });
    quickCommands.value = list ?? [];
    cancelEdit();
  }

  async function handleDelete(id: string) {
    if (confirm(t('settings.quick_commands.confirm_delete'))) {
      const list = await window.stina.settings.deleteQuickCommand(id);
      quickCommands.value = list ?? [];
    }
  }

  const showingSearchResults = computed(() => iconSearch.value.trim().length > 0);
  const displayedIcons = computed(() => {
    if (showingSearchResults.value) {
      return iconSearchResults.value.map((value) => ({
        value,
        component: resolveQuickCommandIcon(value),
      }));
    }
    return QUICK_COMMAND_ICONS;
  });

  async function performIconSearch(term: string) {
    const query = term.trim();
    if (!query) {
      iconSearchResults.value = [];
      iconSearchError.value = null;
      iconSearchLoading.value = false;
      return;
    }

    iconSearchLoading.value = true;
    iconSearchError.value = null;
    try {
      iconSearchResults.value = await searchHugeicons(query, 200);
    } catch (error) {
      console.error(error);
      iconSearchError.value = t('settings.quick_commands.icon_search_error');
      iconSearchResults.value = [];
    } finally {
      iconSearchLoading.value = false;
    }
  }

  watch(
    iconSearch,
    (term) => {
      if (searchTimeout) window.clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => performIconSearch(term), 200);
    },
    { immediate: false },
  );
</script>

<template>
  <SettingsPanel>
    <EntityList
      :title="t('settings.quick_commands.title')"
      :description="t('settings.quick_commands.description')"
      :loading="loading"
      :error="null"
      :empty-text="t('settings.quick_commands.empty')"
    >
      <template #actions>
        <SimpleButton
          type="primary"
          @click="startEdit(null)"
          :title="t('settings.quick_commands.add_button')"
          :aria-label="t('settings.quick_commands.add_button')"
        >
          <Add01Icon class="add-icon" />
        </SimpleButton>
      </template>
      <template v-for="command in quickCommands" :key="command.id">
        <li class="command-card">
          <div class="command">
            <div class="command-meta">
              <div class="icon">
                <component :is="resolveQuickCommandIcon(command.icon)" aria-hidden="true" />
              </div>
              <div class="text">
                <p class="content" :title="command.text">
                  {{ command.text }}
                </p>
              </div>
            </div>
            <div class="actions">
              <IconButton
                @click="startEdit(command)"
                :title="t('settings.quick_commands.edit_command')"
              >
                <EditIcon />
              </IconButton>
              <IconButton
                type="danger"
                @click="handleDelete(command.id)"
                :title="t('settings.quick_commands.delete')"
              >
                <DeleteIcon />
              </IconButton>
            </div>
          </div>
        </li>
      </template>
    </EntityList>
  </SettingsPanel>

  <BaseModal
    :open="showModal"
    :title="
      editingId === 'new' || !editingId
        ? t('settings.quick_commands.add_button')
        : t('settings.quick_commands.edit_command')
    "
    :close-label="t('settings.profile.cancel_edit')"
    @close="cancelEdit"
  >
    <div class="modal-form">
      <FormTextArea
        v-model="editText"
        :label="t('settings.quick_commands.text_label')"
        :placeholder="t('settings.quick_commands.text_placeholder')"
        :rows="4"
      />
      <div class="icon-picker">
        <p class="picker-label">{{ t('settings.quick_commands.icon_label') }}</p>
        <FormInputText
          v-model="iconSearch"
          type="search"
          :placeholder="t('settings.quick_commands.icon_search_placeholder')"
        />
        <div class="icon-grid" role="listbox" :aria-label="t('settings.quick_commands.icon_label')">
          <p v-if="showingSearchResults && iconSearchLoading" class="status">
            {{ t('settings.quick_commands.icon_search_loading') }}
          </p>
          <p v-else-if="showingSearchResults && iconSearchError" class="status error">
            {{ iconSearchError }}
          </p>
          <p
            v-else-if="showingSearchResults && !iconSearchResults.length && !iconSearchLoading"
            class="status"
          >
            {{ t('settings.quick_commands.icon_search_empty') }}
          </p>
          <button
            v-for="option in displayedIcons"
            :key="option.value"
            type="button"
            class="icon-option"
            :class="{ active: option.value === editIcon }"
            :aria-pressed="option.value === editIcon"
            :aria-label="option.value"
            :title="option.value"
            @click="editIcon = option.value"
          >
            <component :is="option.component" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
    <template #footer>
      <SimpleButton @click="cancelEdit">
        {{ t('settings.profile.cancel_edit') }}
      </SimpleButton>
      <SimpleButton type="primary" @click="saveEdit">
        {{ t('settings.profile.save') }}
      </SimpleButton>
    </template>
  </BaseModal>
</template>

<style scoped>
  .command-card {
    border: 2px solid var(--border);
    background: var(--bg-bg);
    padding: 0.85rem 1rem;
    transition: border-color 0.15s ease;

    &:first-of-type {
      border-radius: var(--border-radius-normal) var(--border-radius-normal) 0 0;
    }
    &:last-of-type {
      border-radius: 0 0 var(--border-radius-normal) var(--border-radius-normal);
    }
  }

  .command {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .command-meta {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .icon {
    width: 2.6rem;
    height: 2.6rem;
    min-width: 2.6rem;
    min-height: 2.6rem;
    max-width: 2.6rem;
    max-height: 2.6rem;
    border-radius: 0.75rem;
    background: var(--selected-bg);
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text);

    :deep(svg) {
      width: 1.5rem;
      height: 1.5rem;
    }
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    > .content {
      margin: 0;
      color: var(--muted);
      white-space: pre-line;
    }
  }

  .actions {
    display: inline-flex;
    gap: 0.35rem;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0.5rem 0 1rem;
  }

  .icon-picker {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    height: 19rem;
  }

  .picker-label {
    margin: 0;
    font-weight: 600;
    color: var(--text);
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
    gap: 0.65rem;
    overflow-y: auto;
  }

  .icon-option {
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    height: 3rem;
    background: var(--bg-bg);
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.12s ease,
      box-shadow 0.12s ease,
      background-color 0.12s ease;

    &:hover {
      border-color: var(--accent);
    }

    &.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
      background: color-mix(in srgb, var(--accent) 10%, var(--bg-bg));
    }

    :deep(svg) {
      width: 1.4rem;
      height: 1.4rem;
      color: inherit;
    }

    > .icon-name {
      display: block;
      margin-top: 0.35rem;
      font-size: 0.72rem;
      color: var(--muted);
      text-align: center;
      line-height: 1.1;
      word-break: break-all;
    }
  }

  .add-icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  .status {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0.25rem 0;

    &.error {
      color: var(--error);
    }
  }
</style>
