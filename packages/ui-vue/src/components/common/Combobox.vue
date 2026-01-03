<script setup lang="ts">
/**
 * Combobox component that allows both selection from a list and free text input.
 * Useful for cases where the user might want to enter a value not in the list.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
}

const props = withDefaults(
  defineProps<{
    /** Available options to choose from */
    options: ComboboxOption[]
    /** Label displayed above the input */
    label?: string
    /** Placeholder text for the input */
    placeholder?: string
    /** Error message displayed below the input */
    error?: string
    /** Whether the input is disabled */
    disabled?: boolean
    /** Whether to show descriptions in dropdown */
    showDescriptions?: boolean
  }>(),
  {
    label: undefined,
    placeholder: undefined,
    error: undefined,
    disabled: false,
    showDescriptions: true,
  }
)

const model = defineModel<string>({ default: '' })

const isOpen = ref(false)
const focusedIndex = ref(-1)
const comboboxElement = ref<HTMLElement | null>(null)

// Filter options based on input
const filteredOptions = computed(() => {
  if (!model.value) return props.options
  const query = model.value.toLowerCase()
  return props.options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query) ||
      opt.value.toLowerCase().includes(query) ||
      opt.description?.toLowerCase().includes(query)
  )
})

// Handle input changes
function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  model.value = target.value
  isOpen.value = true
  focusedIndex.value = -1
}

// Handle option selection
function selectOption(option: ComboboxOption) {
  model.value = option.value
  isOpen.value = false
  focusedIndex.value = -1
}

// Handle input focus
function onFocus() {
  isOpen.value = true
}

// Handle click outside
function handleClickOutside(event: MouseEvent) {
  if (comboboxElement.value && !comboboxElement.value.contains(event.target as Node)) {
    isOpen.value = false
    focusedIndex.value = -1
  }
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

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="comboboxElement"
    class="combobox-input"
    :class="{ disabled, 'has-error': error, open: isOpen && filteredOptions.length > 0 }"
  >
    <label v-if="label" class="label">{{ label }}</label>
    <input
      type="text"
      class="combobox-trigger"
      :value="model"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @focus="onFocus"
      @keydown="onKeydown"
    />
    <div v-if="isOpen && filteredOptions.length > 0" class="dropdown">
      <ul class="options-list">
        <li
          v-for="(option, index) in filteredOptions"
          :key="option.value"
          class="option"
          :class="{ selected: option.value === model, focused: index === focusedIndex }"
          @mousedown.prevent="selectOption(option)"
          @mouseenter="focusedIndex = index"
        >
          <span class="option-label">{{ option.label }}</span>
          <span v-if="showDescriptions && option.description" class="option-description">
            {{ option.description }}
          </span>
        </li>
      </ul>
    </div>
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>

<style scoped>
.combobox-input {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  position: relative;

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &.open {
    > .combobox-trigger {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
  }

  > .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-components-dropdown-color, var(--theme-general-color));
  }

  > .combobox-trigger {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-dropdown-background, transparent);
    color: var(--theme-components-dropdown-color, var(--theme-general-color));
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &::placeholder {
      color: var(--theme-general-color-muted);
    }
  }

  &.open > .combobox-trigger {
    border-color: var(--theme-general-color-primary);
  }

  > .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: var(--theme-components-dropdown-background);
    border: 1px solid var(--theme-general-border-color);
    border-radius: 0 0 var(--border-radius-small) var(--border-radius-small);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    z-index: var(--z-index-dropdown);
    overflow: hidden;

    > .options-list {
      list-style: none;
      margin: 0;
      padding: 0.25rem 0;
      max-height: 12rem;
      overflow-y: auto;

      > .option {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--theme-components-dropdown-color, var(--theme-general-color));
        cursor: pointer;
        transition: background-color 0.1s;

        &:hover,
        &.focused {
          background: var(--theme-components-dropdown-background-hover);
        }

        &.selected {
          background: var(--theme-general-color-primary);
          color: var(--theme-general-color-primary-contrast);

          > .option-description {
            color: var(--theme-general-color-primary-contrast);
            opacity: 0.8;
          }
        }

        > .option-label {
          font-size: 0.875rem;
        }

        > .option-description {
          font-size: 0.75rem;
          color: var(--theme-general-color-muted);
        }
      }
    }
  }

  &.has-error > .combobox-trigger {
    border-color: var(--theme-general-color-danger);
  }

  > .error {
    font-size: 0.75rem;
    color: var(--theme-general-color-danger);
  }
}
</style>
