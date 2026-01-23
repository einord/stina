/**
 * Contributions Validation
 *
 * Validates panels, prompts, and tools contributions in manifests.
 */

import type { PromptContribution, ToolDefinition } from '@stina/extension-api'

const VALID_PROMPT_SECTIONS = ['system', 'behavior', 'tools']

/**
 * Validate panel definitions
 * @param panels Array of panels to validate
 * @param errors Array to collect errors
 */
export function validatePanels(panels: unknown[], errors: string[]): void {
  for (const panel of panels) {
    if (typeof panel !== 'object' || !panel) {
      errors.push('Each panel entry must be an object')
      continue
    }

    const p = panel as Partial<{ id: unknown; title: unknown; view: unknown }>
    const panelId = typeof p.id === 'string' ? p.id : 'unknown'

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Panel missing "id" field')
    }

    if (!p.title || typeof p.title !== 'string') {
      errors.push(`Panel "${panelId}" missing "title" field`)
    }

    if (!p.view || typeof p.view !== 'object') {
      errors.push(`Panel "${panelId}" missing "view" field`)
      continue
    }

    const view = p.view as { kind?: unknown }
    if (!view.kind || typeof view.kind !== 'string') {
      errors.push(`Panel "${panelId}" has invalid "view.kind"`)
    }
  }
}

/**
 * Validate prompt contributions
 * @param prompts Array of prompts to validate
 * @param errors Array to collect errors
 */
export function validatePrompts(prompts: unknown[], errors: string[]): void {
  for (const prompt of prompts) {
    if (typeof prompt !== 'object' || !prompt) {
      errors.push('Each prompt contribution must be an object')
      continue
    }

    const p = prompt as Partial<PromptContribution>
    const promptId = typeof p.id === 'string' ? p.id : 'unknown'

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Prompt contribution missing "id" field')
    }

    if (p.section !== undefined && !VALID_PROMPT_SECTIONS.includes(p.section as string)) {
      errors.push(
        `Prompt contribution "${promptId}": invalid "section" (valid: ${VALID_PROMPT_SECTIONS.join(', ')})`
      )
    }

    if (p.text !== undefined && typeof p.text !== 'string') {
      errors.push(`Prompt contribution "${promptId}": "text" must be a string`)
    }

    if (p.i18n !== undefined && typeof p.i18n !== 'object') {
      errors.push(`Prompt contribution "${promptId}": "i18n" must be an object`)
    }

    if (p.text === undefined && p.i18n === undefined) {
      errors.push(`Prompt contribution "${promptId}": must provide "text" or "i18n"`)
    }
  }
}

/**
 * Validate tool definitions
 * @param tools Array of tools to validate
 * @param errors Array to collect errors
 */
export function validateTools(tools: unknown[], errors: string[]): void {
  for (const tool of tools) {
    if (typeof tool !== 'object' || !tool) {
      errors.push('Each tool must be an object')
      continue
    }

    const t = tool as Partial<ToolDefinition>
    const toolId = typeof t.id === 'string' ? t.id : 'unknown'

    if (!t.id || typeof t.id !== 'string') {
      errors.push('Tool missing "id" field')
    }

    if (!t.name || typeof t.name !== 'string') {
      errors.push(`Tool "${toolId}" missing "name" field`)
    }

    if (!t.description || typeof t.description !== 'string') {
      errors.push(`Tool "${toolId}" missing "description" field`)
    }
  }
}
