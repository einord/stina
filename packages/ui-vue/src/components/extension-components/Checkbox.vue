<script lang="ts" setup>
import type { CheckboxProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import Icon from '../common/Icon.vue'
import { tryUseExtensionContext } from '../../composables/useExtensionContext.js'
import { useExtensionScope } from '../../composables/useExtensionScope.js'

const props = defineProps<CheckboxProps>()
const context = tryUseExtensionContext()
const scope = useExtensionScope()

const strikethrough = computed(() => props.strikethrough ?? true)
const rootStyle = computed(() => props.style as StyleValue)

async function handleChange() {
  if (!props.disabled && context && props.onChangeAction) {
    try {
      await context.executeAction(props.onChangeAction, scope.value)
    } catch (error) {
      console.error('Failed to execute checkbox action:', error)
    }
  }
}
</script>

<template>
  <label class="extension-checkbox" :class="{ checked: props.checked, strikethrough: strikethrough && props.checked, disabled: props.disabled }" :style="rootStyle">
    <input
      type="checkbox"
      class="visually-hidden"
      :checked="props.checked"
      :disabled="props.disabled"
      @change="handleChange"
    />
    <span class="checkbox-box">
      <Icon v-if="props.checked" class="checkmark" name="checkmark-square-02" />
      <span v-else class="empty-box" />
    </span>
    <span class="checkbox-label">{{ props.label }}</span>
  </label>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.extension-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;

  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  > .checkbox-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;

    > .checkmark {
      font-size: 1.25rem;
      color: var(--theme-components-checkbox-checkmark-color);
    }

    > .empty-box {
      width: 1rem;
      height: 1rem;
      border: 1.5px solid var(--theme-components-checkbox-border-color);
      border-radius: 0.25rem;
      background: var(--theme-components-checkbox-background);
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease;
    }
  }

  &:hover:not(.disabled) > .checkbox-box > .empty-box {
    border-color: var(--theme-components-checkbox-border-color-hover);
  }

  > .checkbox-label {
    font-size: 0.9375rem;
    line-height: 1.4;
    color: var(--theme-components-checkbox-label-color);
    transition:
      color 0.15s ease,
      text-decoration 0.15s ease;
  }

  &.checked > .checkbox-label {
    color: var(--theme-components-checkbox-label-color-checked);
  }

  &.strikethrough > .checkbox-label {
    text-decoration: line-through;
  }
}
</style>
