<script lang="ts" setup>
import { computed } from 'vue'
import type { ConditionalGroupProps } from '@stina/extension-api'
import ExtensionChildren from './ExtensionChildren.vue'
import { useExtensionScope, resolveValue } from '../../composables/useExtensionScope.js'

const props = defineProps<ConditionalGroupProps>()

const scope = useExtensionScope()

/**
 * Split condition string by logical operator while respecting quoted strings.
 * Ensures operators inside quotes (e.g., "a||b") are not treated as separators.
 */
function splitByLogicalOperator(condition: string, operator: '||' | '&&'): string[] {
  const parts: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < condition.length; i++) {
    const char = condition[i]!
    const nextTwo = condition.slice(i, i + 2)

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && nextTwo === operator) {
      parts.push(current.trim())
      current = ''
      i++ // Skip the second character of the operator
      continue
    }

    current += char
  }

  if (current !== '') {
    parts.push(current.trim())
  }

  return parts
}

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
  // Handle OR (||) - split and check if any is true, ignoring operators inside quotes
  const orParts = splitByLogicalOperator(condition, '||')
  if (orParts.length > 1) {
    return orParts.some((part) => evaluateCondition(part, scopeData))
  }

  // Handle AND (&&) - split and check if all are true, ignoring operators inside quotes
  const andParts = splitByLogicalOperator(condition, '&&')
  if (andParts.length > 1) {
    return andParts.every((part) => evaluateCondition(part, scopeData))
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
  const condition = props.condition

  // Explicit boolean conditions are used as-is
  if (typeof condition === 'boolean') {
    return condition
  }

  // Only non-empty strings are considered valid expressions
  if (typeof condition === 'string' && condition.trim() !== '') {
    return evaluateCondition(condition, scope.value)
  }

  // Invalid, missing, or empty conditions are treated as "do not render"
  console.warn(
    '[ConditionalGroup] Ignoring invalid or empty condition; group will not be rendered.',
    condition
  )
  return false
})
</script>

<template>
  <div v-if="shouldRender" class="conditional-group">
    <ExtensionChildren :children="props.children" />
  </div>
</template>

<style scoped>
.conditional-group {
  display: contents;
}
</style>
