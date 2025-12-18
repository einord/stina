<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

  import ArrowDownIcon from '~icons/hugeicons/arrow-down-01';

  export type SearchSelectValue = string | number | null;
  export type SearchSelectOption = { value: SearchSelectValue; label: string; disabled?: boolean };

  /**
   * Searchable select control intended for long option lists (e.g. timezones).
   * Provides shared label/hint styling consistent with other form inputs.
   */
  const props = withDefaults(
    defineProps<{
      label?: string;
      hint?: string;
      error?: string;
      placeholder?: string;
      options: SearchSelectOption[];
      disabled?: boolean;
      required?: boolean;
      id?: string;
    }>(),
    {
      options: () => [],
      disabled: false,
      required: false,
    },
  );

  const model = defineModel<SearchSelectValue>({ default: null });

  const inputId = computed(() => props.id ?? `search-select-${Math.random().toString(36).slice(2, 8)}`);
  const ArrowIcon = ArrowDownIcon;

  const rootEl = ref<HTMLElement | null>(null);
  const inputEl = ref<HTMLInputElement | null>(null);
  const optionsEl = ref<HTMLElement | null>(null);

  const isOpen = ref(false);
  const query = ref('');
  const activeIndex = ref<number>(-1);

  const selectedLabel = computed(() => {
    const current = props.options.find((o) => o.value === model.value);
    return current?.label ?? '';
  });

  const filteredOptions = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return props.options;
    return props.options.filter((o) => o.label.toLowerCase().includes(q));
  });

  watch(
    () => model.value,
    () => {
      query.value = '';
      activeIndex.value = -1;
    },
  );

  // Scroll active option into view when activeIndex changes
  watch(activeIndex, () => {
    if (!isOpen.value || activeIndex.value < 0 || !optionsEl.value) return;
    void nextTick(() => {
      const optionButtons = optionsEl.value?.querySelectorAll('.option');
      if (!optionButtons) return;
      const activeButton = optionButtons[activeIndex.value] as HTMLElement | undefined;
      if (activeButton) {
        activeButton.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  });

  function open() {
    if (props.disabled) return;
    isOpen.value = true;
    query.value = '';
    activeIndex.value = -1;
    void nextTick(() => inputEl.value?.focus());
  }

  function close() {
    isOpen.value = false;
    query.value = '';
    activeIndex.value = -1;
  }

  function toggle() {
    if (isOpen.value) close();
    else open();
  }

  function selectOption(option: SearchSelectOption) {
    if (props.disabled || option.disabled) return;
    model.value = option.value;
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (props.disabled) return;

    if (event.key === 'Escape') {
      if (isOpen.value) event.preventDefault();
      close();
      return;
    }

    if (!isOpen.value && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      open();
      return;
    }

    if (!isOpen.value) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (activeIndex.value < 0) {
        activeIndex.value = 0;
      } else {
        activeIndex.value = Math.min(activeIndex.value + 1, filteredOptions.value.length - 1);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex.value = Math.max(activeIndex.value - 1, 0);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions.value[activeIndex.value];
      if (option) selectOption(option);
      return;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (!isOpen.value) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (rootEl.value && !rootEl.value.contains(target)) close();
  }

  onMounted(() => window.addEventListener('mousedown', handleClickOutside));
  onBeforeUnmount(() => window.removeEventListener('mousedown', handleClickOutside));
</script>

<template>
  <label ref="rootEl" class="field" :for="inputId">
    <FormLabel v-if="label" :required="required">{{ label }}</FormLabel>

    <button
      class="trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-controls="`${inputId}-list`"
      @click="toggle"
      @keydown="onKeyDown"
    >
      <span class="trigger-label">{{ selectedLabel || placeholder || '' }}</span>
      <ArrowIcon class="dropdown-icon" aria-hidden="true" />
    </button>

    <div v-if="isOpen" class="dropdown" role="listbox" :id="`${inputId}-list`">
      <input
        ref="inputEl"
        class="search"
        type="text"
        :placeholder="placeholder"
        :value="query"
        autocomplete="off"
        @input="query = ($event.target as HTMLInputElement).value"
        @keydown="onKeyDown"
      />

      <div ref="optionsEl" class="options">
        <button
          v-for="(option, idx) in filteredOptions"
          :key="String(option.value)"
          class="option"
          type="button"
          role="option"
          :aria-selected="model === option.value ? 'true' : 'false'"
          :disabled="option.disabled"
          :class="{ active: idx === activeIndex }"
          @click="selectOption(option)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <small v-if="hint" class="hint">{{ hint }}</small>
    <small v-if="error" class="error">{{ error }}</small>
  </label>
</template>

<style scoped>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.95rem;
    color: var(--text);
    position: relative;

    > .trigger {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      padding: 0.65rem 0.75rem;
      background: var(--window-bg-lower);
      color: var(--text);
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;

      &:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
      }

      &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      > .trigger-label {
        text-align: left;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      > .dropdown-icon {
        font-size: 1rem;
        color: var(--muted);
        pointer-events: none;
      }
    }

    > .dropdown {
      position: absolute;
      top: calc(100% + 0.35rem);
      left: 0;
      right: 0;
      z-index: 20;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--window-bg);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
      padding: 0.5rem;

      > .search {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: var(--border-radius-normal);
        padding: 0.55rem 0.75rem;
        background: var(--window-bg-lower);
        color: var(--text);

        &:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
        }
      }

      > .options {
        margin-top: 0.5rem;
        max-height: 260px;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        > .option {
          width: 100%;
          text-align: left;
          border: 1px solid transparent;
          border-radius: var(--border-radius-normal);
          padding: 0.5rem 0.65rem;
          background: transparent;
          color: var(--text);
          cursor: pointer;

          &:hover {
            background: color-mix(in srgb, var(--primary) 8%, transparent);
          }

          &.active {
            background: color-mix(in srgb, var(--primary) 12%, transparent);
            border-color: color-mix(in srgb, var(--primary) 30%, transparent);
          }

          &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        }
      }
    }

    > .hint {
      color: var(--muted);
      font-size: 0.85rem;
    }

    > .error {
      color: var(--error);
      font-size: 0.85rem;
    }
  }
</style>

