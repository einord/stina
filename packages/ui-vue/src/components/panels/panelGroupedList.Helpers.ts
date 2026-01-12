import type { PanelValue, SettingDefinition } from '@stina/extension-api'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'

type UnknownRecord = PanelGroupedListRecord

export const getValue = (target: unknown, path: string): unknown => {
  if (!target || typeof target !== 'object') return undefined
  if (!path.includes('.')) {
    return (target as UnknownRecord)[path]
  }
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as UnknownRecord)[key]
  }, target)
}

export const resolveValue = (value: PanelValue, context: UnknownRecord): unknown => {
  if (value && typeof value === 'object' && 'ref' in value) {
    return getValue(context, value.ref)
  }
  return value
}

export const resolveParams = (
  params: Record<string, PanelValue> | undefined,
  context: UnknownRecord
): Record<string, unknown> => {
  if (!params) return {}
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, resolveValue(value, context)])
  )
}

export const buildDefaultValues = (
  fields: SettingDefinition[] | undefined
): Record<string, unknown> => {
  const values: Record<string, unknown> = {}
  if (!fields) return values

  for (const field of fields) {
    if (field.default !== undefined) {
      values[field.id] = field.default
    }
  }

  return values
}

export const buildFormValues = (
  fields: SettingDefinition[] | undefined,
  data: Record<string, unknown>
): Record<string, unknown> => {
  const base = buildDefaultValues(fields)
  const nextValues: Record<string, unknown> = { ...base }

  if (fields) {
    for (const field of fields) {
      if (field.id in data) {
        const value = data[field.id]
        nextValues[field.id] = field.type === 'select' && value === null ? '' : value
      }
    }
  }

  return nextValues
}

export const applyCreateDefaults = (
  defaults: Record<string, PanelValue> | undefined,
  context: UnknownRecord,
  currentValues: Record<string, unknown>
): Record<string, unknown> => {
  if (!defaults) return currentValues
  const resolved = resolveParams(defaults, context)
  return { ...currentValues, ...resolved }
}
