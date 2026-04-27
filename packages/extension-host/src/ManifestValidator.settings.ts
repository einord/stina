/**
 * Tool Settings View Validation
 *
 * Validates `contributes.toolSettings` view definitions in manifests.
 * Detailed component-tree validation (for `editView.content` or
 * `kind: "component"` views) is intentionally shallow here — the
 * extension component renderer handles unknown components and props at
 * runtime.
 */

import type {
  ToolSettingsViewDefinition,
  ToolSettingsListView,
  ToolSettingsComponentView,
  ToolSettingsListMapping,
} from '@stina/extension-api'

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
      validateListView(viewId, viewConfig as Partial<ToolSettingsListView>, errors)
    } else if (viewKind === 'component') {
      validateComponentView(viewId, viewConfig as Partial<ToolSettingsComponentView>, errors)
    }
  }
}

function validateListView(
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

  if (listView.editView !== undefined) {
    if (typeof listView.editView !== 'object' || !listView.editView) {
      errors.push(`Tool settings view "${viewId}" has invalid "view.editView"`)
    } else if (
      typeof listView.editView.content !== 'object' ||
      !listView.editView.content
    ) {
      errors.push(`Tool settings view "${viewId}" missing "view.editView.content"`)
    }
  }
}

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
