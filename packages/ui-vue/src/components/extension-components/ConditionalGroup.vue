<script lang="ts" setup>
import { computed } from 'vue'
import type { ConditionalGroupProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import ExtensionChildren from './ExtensionChildren.vue'
import { useExtensionScope, resolveValue } from '../../composables/useExtensionScope.js'

const props = defineProps<ConditionalGroupProps>()

const scope = useExtensionScope()

/**
 * Evaluates a simple condition expression against the current scope.
 * Supports:
 * - Comparison: ==, !=
 * - Logical: && (and), || (or)
 * - Values: $references, 'strings', numbers, true, false, null
 *
 * Examples:
 * - "$form.provider == 'imap'"
 * - "$form.provider != 'gmail'"
 * - "$form.provider == 'gmail' || $form.provider == 'outlook'"
 * - "$form.secure == true && $form.port == 993"
 */
function evaluateCondition(condition: string, scopeData: Record<string, unknown>): boolean {
  // Handle OR (||) - split and check if any is true
  if (condition.includes('||')) {
    const parts = condition.split('||').map((p) => p.trim())
    return parts.some((part) => evaluateCondition(part, scopeData))
  }

  // Handle AND (&&) - split and check if all are true
  if (condition.includes('&&')) {
    const parts = condition.split('&&').map((p) => p.trim())
    return parts.every((part) => evaluateCondition(part, scopeData))
  }

  // Handle comparison operators
  const eqMatch = condition.match(/^(.+?)\s*==\s*(.+)$/)
  if (eqMatch) {
    const left = parseValue(eqMatch[1]!.trim(), scopeData)
    const right = parseValue(eqMatch[2]!.trim(), scopeData)
    return left === right
  }

  const neqMatch = condition.match(/^(.+?)\s*!=\s*(.+)$/)
  if (neqMatch) {
    const left = parseValue(neqMatch[1]!.trim(), scopeData)
    const right = parseValue(neqMatch[2]!.trim(), scopeData)
    return left !== right
  }

  // Simple truthy check for single values
  const value = parseValue(condition.trim(), scopeData)
  return Boolean(value)
}

/**
 * Parses a value from the condition expression.
 * - $reference -> resolved from scope
 * - 'string' or "string" -> string literal
 * - number -> number
 * - true/false -> boolean
 * - null -> null
 */
function parseValue(valueStr: string, scopeData: Record<string, unknown>): unknown {
  // String literal (single or double quotes)
  if (
    (valueStr.startsWith("'") && valueStr.endsWith("'")) ||
    (valueStr.startsWith('"') && valueStr.endsWith('"'))
  ) {
    return valueStr.slice(1, -1)
  }

  // Boolean literals
  if (valueStr === 'true') return true
  if (valueStr === 'false') return false

  // Null literal
  if (valueStr === 'null') return null

  // Number
  if (!isNaN(Number(valueStr)) && valueStr !== '') {
    return Number(valueStr)
  }

  // $reference - resolve from scope
  if (valueStr.startsWith('$')) {
    return resolveValue(valueStr, scopeData)
  }

  // Unknown - return as string
  return valueStr
}

const shouldRender = computed(() => {
  if (!props.condition) return true
  return evaluateCondition(props.condition, scope.value)
})

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <div v-if="shouldRender" class="conditional-group" :style="rootStyle">
    <ExtensionChildren :children="props.children" />
  </div>
</template>

<style scoped>
.conditional-group {
  display: contents;
}
</style>
