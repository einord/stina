<script setup lang="ts">
/**
 * Combobox component that allows both selection from a list and free text input.
 * Useful for cases where the user might want to enter a value not in the list.
 */
import { ref, computed, watch } from 'vue'

interface Option {
  value: string
  label: string
  description?: string
}

const props = withDefaults(
  defineProps<{
    /** Currently selected or entered value */
    modelValue: string
    /** Available options to choose from */
    options: Option[]
    /** Placeholder text for the input */
    placeholder?: string
    /** Whether the input is disabled */
    disabled?: boolean
    /** Whether to show descriptions in dropdown */
    showDescriptions?: boolean
  }>(),
  {
    placeholder: '',
    disabled: false,
    showDescriptions: true,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Internal state
const inputValue = ref(props.modelValue)
const isOpen = ref(false)
const focusedIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLUListElement | null>(null)

// Filter options based on input
const filteredOptions = computed(() => {
  if (!inputValue.value) return props.options
  const query = inputValue.value.toLowerCase()
  return props.options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query) ||
      opt.value.toLowerCase().includes(query) ||
      opt.description?.toLowerCase().includes(query)
  )
})

// Sync internal value with prop
watch(
  () => props.modelValue,
  (newVal) => {
    inputValue.value = newVal
  }
)

// Emit value changes
function emitChange(value: string) {
  emit('update:modelValue', value)
}

// Handle input changes
function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  inputValue.value = target.value
  emitChange(target.value)
  isOpen.value = true
  focusedIndex.value = -1
}

// Handle option selection
function selectOption(option: Option) {
  inputValue.value = option.value
  emitChange(option.value)
  isOpen.value = false
  focusedIndex.value = -1
  inputRef.value?.blur()
}

// Handle input focus
function onFocus() {
  isOpen.value = true
}

// Handle input blur
function onBlur(event: FocusEvent) {
  // Delay close to allow click on option
  const relatedTarget = event.relatedTarget as HTMLElement
  if (listRef.value?.contains(relatedTarget)) {
    return
  }
  setTimeout(() => {
    isOpen.value = false
    focusedIndex.value = -1
  }, 150)
}

// Handle keyboard navigation
function onKeydown(event: KeyboardEvent) {
  const options = filteredOptions.value

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (!isOpen.value) {
        isOpen.value = true
      } else {
        focusedIndex.value = Math.min(focusedIndex.value + 1, options.length - 1)
      }
      break

    case 'ArrowUp':
      event.preventDefault()
      if (isOpen.value) {
        focusedIndex.value = Math.max(focusedIndex.value - 1, -1)
      }
      break

    case 'Enter':
      event.preventDefault()
      if (isOpen.value && focusedIndex.value >= 0 && focusedIndex.value < options.length) {
        const option = options[focusedIndex.value]
        if (option) {
          selectOption(option)
        }
      }
      break

    case 'Escape':
      event.preventDefault()
      isOpen.value = false
      focusedIndex.value = -1
      break

    case 'Tab':
      isOpen.value = false
      focusedIndex.value = -1
      break
  }
}
</script>

<template>
  <div class="combobox" :class="{ disabled }">
    <input
      ref="inputRef"
      type="text"
      :value="inputValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />

    <ul
      v-if="isOpen && filteredOptions.length > 0"
      ref="listRef"
      class="options"
      tabindex="-1"
    >
      <li
        v-for="(option, index) in filteredOptions"
        :key="option.value"
        class="option"
        :class="{ focused: index === focusedIndex }"
        @mousedown.prevent="selectOption(option)"
        @mouseenter="focusedIndex = index"
      >
        <span class="label">{{ option.label }}</span>
        <span v-if="showDescriptions && option.description" class="description">
          {{ option.description }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.combobox {
  position: relative;
  width: 100%;

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  > input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  > .options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    margin: 0.25rem 0 0;
    padding: 0.25rem;
    list-style: none;
    background: var(--theme-general-background);
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 200px;
    overflow-y: auto;

    > .option {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      padding: 0.5rem 0.625rem;
      border-radius: var(--border-radius-small, 0.375rem);
      cursor: pointer;

      &:hover,
      &.focused {
        background: var(--theme-general-background-hover);
      }

      > .label {
        font-size: 0.875rem;
        color: var(--theme-general-color);
      }

      > .description {
        font-size: 0.75rem;
        color: var(--theme-general-color-muted);
      }
    }
  }
}
</style>
