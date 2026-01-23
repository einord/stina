/**
 * Settings Validation
 *
 * Validates settings and tool settings view definitions in manifests.
 */

import type {
  SettingDefinition,
  ToolSettingsViewDefinition,
  ToolSettingsListView,
  ToolSettingsComponentView,
  ToolSettingsListMapping,
} from '@stina/extension-api'

/**
 * Validate settings definitions
 * @param settings Array of settings to validate
 * @param errors Array to collect errors
 */
export function validateSettings(settings: unknown[], errors: string[]): void {
  for (const setting of settings) {
    if (typeof setting !== 'object' || !setting) {
      errors.push('Each setting must be an object')
      continue
    }

    const s = setting as Partial<SettingDefinition>
    const settingId = typeof s.id === 'string' ? s.id : 'unknown'

    if (!s.id || typeof s.id !== 'string') {
      errors.push('Setting missing "id" field')
    }

    if (!s.title || typeof s.title !== 'string') {
      errors.push(`Setting "${settingId}" missing "title" field`)
    }

    if (!s.type || !['string', 'number', 'boolean', 'select'].includes(s.type)) {
      errors.push(
        `Setting "${settingId}" has invalid "type". Valid: string, number, boolean, select`
      )
    }

    if (s.type === 'select') {
      validateSelectSetting(s, settingId, errors)
    } else if (
      s.createToolId !== undefined ||
      s.createFields !== undefined ||
      s.createMapping !== undefined
    ) {
      errors.push(`Setting "${settingId}" create* fields are only valid for "select"`)
    }
  }
}

/**
 * Validate a select-type setting
 */
function validateSelectSetting(
  s: Partial<SettingDefinition>,
  settingId: string,
  errors: string[]
): void {
  const hasOptionsArray = Array.isArray(s.options)
  const hasOptionsTool = typeof s.optionsToolId === 'string'

  if (s.options !== undefined && !hasOptionsArray) {
    errors.push(`Setting "${settingId}" of type "select" has invalid "options"`)
  }

  if (s.optionsToolId !== undefined && !hasOptionsTool) {
    errors.push(`Setting "${settingId}" of type "select" has invalid "optionsToolId"`)
  }

  if (!hasOptionsArray && !hasOptionsTool) {
    errors.push(
      `Setting "${settingId}" of type "select" must have "options" or "optionsToolId"`
    )
  }

  if (s.optionsMapping !== undefined) {
    if (typeof s.optionsMapping !== 'object' || !s.optionsMapping) {
      errors.push(`Setting "${settingId}" has invalid "optionsMapping"`)
    } else {
      const mapping = s.optionsMapping as Partial<{
        itemsKey: unknown
        valueKey: unknown
        labelKey: unknown
      }>
      if (typeof mapping.itemsKey !== 'string') {
        errors.push(`Setting "${settingId}" optionsMapping missing "itemsKey"`)
      }
      if (typeof mapping.valueKey !== 'string') {
        errors.push(`Setting "${settingId}" optionsMapping missing "valueKey"`)
      }
      if (typeof mapping.labelKey !== 'string') {
        errors.push(`Setting "${settingId}" optionsMapping missing "labelKey"`)
      }
    }
  }

  if (s.createToolId !== undefined && typeof s.createToolId !== 'string') {
    errors.push(`Setting "${settingId}" has invalid "createToolId"`)
  }

  if (s.createFields !== undefined) {
    if (!Array.isArray(s.createFields)) {
      errors.push(`Setting "${settingId}" has invalid "createFields"`)
    } else {
      validateSettings(s.createFields, errors)
    }
  }

  if (s.createMapping !== undefined) {
    if (typeof s.createMapping !== 'object' || !s.createMapping) {
      errors.push(`Setting "${settingId}" has invalid "createMapping"`)
    } else {
      const mapping = s.createMapping as Partial<{ resultKey: unknown; valueKey: unknown }>
      if (mapping.resultKey !== undefined && typeof mapping.resultKey !== 'string') {
        errors.push(`Setting "${settingId}" createMapping has invalid "resultKey"`)
      }
      if (typeof mapping.valueKey !== 'string') {
        errors.push(`Setting "${settingId}" createMapping missing "valueKey"`)
      }
    }
  }
}

/**
 * Validate tool settings view definitions
 * @param views Array of tool settings views to validate
 * @param errors Array to collect errors
 */
export function validateToolSettings(views: unknown[], errors: string[]): void {
  for (const view of views) {
    if (typeof view !== 'object' || !view) {
      errors.push('Each toolSettings entry must be an object')
      continue
    }

    const v = view as Partial<ToolSettingsViewDefinition>
    const viewId = typeof v.id === 'string' ? v.id : 'unknown'

    if (!v.id || typeof v.id !== 'string') {
      errors.push('Tool settings view missing "id" field')
    }

    if (!v.title || typeof v.title !== 'string') {
      errors.push(`Tool settings view "${viewId}" missing "title" field`)
    }

    if (!v.view || typeof v.view !== 'object') {
      errors.push(`Tool settings view "${viewId}" missing "view" field`)
      continue
    }

    const viewConfig = v.view as unknown as Record<string, unknown>
    const viewKind = viewConfig['kind']

    if (viewKind !== 'list' && viewKind !== 'component') {
      errors.push(`Tool settings view "${viewId}" has invalid "view.kind" (must be "list" or "component")`)
      continue
    }

    if (viewKind === 'list') {
      validateListView(v, viewId, viewConfig as Partial<ToolSettingsListView>, errors)
    } else if (viewKind === 'component') {
      validateComponentView(viewId, viewConfig as Partial<ToolSettingsComponentView>, errors)
    }
  }
}

/**
 * Validate a list-type tool settings view
 */
function validateListView(
  v: Partial<ToolSettingsViewDefinition>,
  viewId: string,
  listView: Partial<ToolSettingsListView>,
  errors: string[]
): void {
  if (!listView.listToolId || typeof listView.listToolId !== 'string') {
    errors.push(`Tool settings view "${viewId}" missing "view.listToolId" field`)
  }

  if (listView.searchParam && typeof listView.searchParam !== 'string') {
    errors.push(`Tool settings view "${viewId}" has invalid "view.searchParam"`)
  }

  if (listView.limitParam && typeof listView.limitParam !== 'string') {
    errors.push(`Tool settings view "${viewId}" has invalid "view.limitParam"`)
  }

  if (listView.idParam && typeof listView.idParam !== 'string') {
    errors.push(`Tool settings view "${viewId}" has invalid "view.idParam"`)
  }

  if (listView.listParams && (typeof listView.listParams !== 'object' || Array.isArray(listView.listParams))) {
    errors.push(`Tool settings view "${viewId}" has invalid "view.listParams"`)
  }

  const mapping = listView.mapping as Partial<ToolSettingsListMapping> | undefined
  if (!mapping || typeof mapping !== 'object') {
    errors.push(`Tool settings view "${viewId}" missing "view.mapping" field`)
  } else {
    if (!mapping.itemsKey || typeof mapping.itemsKey !== 'string') {
      errors.push(`Tool settings view "${viewId}" missing "mapping.itemsKey" field`)
    }
    if (!mapping.idKey || typeof mapping.idKey !== 'string') {
      errors.push(`Tool settings view "${viewId}" missing "mapping.idKey" field`)
    }
    if (!mapping.labelKey || typeof mapping.labelKey !== 'string') {
      errors.push(`Tool settings view "${viewId}" missing "mapping.labelKey" field`)
    }
  }

  if (v.fields) {
    if (!Array.isArray(v.fields)) {
      errors.push(`Tool settings view "${viewId}" has invalid "fields"`)
    } else {
      validateSettings(v.fields, errors)
    }
  }
}

/**
 * Validate a component-type tool settings view
 */
function validateComponentView(
  viewId: string,
  componentView: Partial<ToolSettingsComponentView>,
  errors: string[]
): void {
  if (!componentView.content || typeof componentView.content !== 'object') {
    errors.push(`Tool settings view "${viewId}" missing "view.content" field`)
  }

  if (componentView.data !== undefined && (typeof componentView.data !== 'object' || Array.isArray(componentView.data))) {
    errors.push(`Tool settings view "${viewId}" has invalid "view.data" field`)
  }
}
