import { inject, provide, type InjectionKey } from 'vue'
import type { ExtensionActionRef, ActionResult } from '@stina/extension-api'
import { useExtensionScope, resolveValue } from './useExtensionScope.js'
import { useExtensionActions } from './useExtensionActions.js'

/**
 * Extension context containing extensionId and action execution capabilities.
 */
export interface ExtensionContext {
  extensionId: string
  executeAction: (action: ExtensionActionRef, currentScope?: Record<string, unknown>) => Promise<ActionResult>
}

const EXTENSION_CONTEXT_KEY: InjectionKey<ExtensionContext> = Symbol('extension-context')

/**
 * Provide extension context for child components.
 * This enables actions to be executed with the correct extensionId.
 *
 * @param extensionId The extension ID to use for action execution
 */
export function provideExtensionContext(extensionId: string): void {
  const { executeAction: execute } = useExtensionActions()

  // Store scope getter - will be replaced by child scope providers
  const scopeRef = useExtensionScope()

  const executeAction = async (actionRef: ExtensionActionRef, currentScope?: Record<string, unknown>): Promise<ActionResult> => {
    // Use provided scope or fall back to injected scope
    const scope = currentScope ?? scopeRef.value

    // Resolve action reference
    let actionId: string
    const params: Record<string, unknown> = {}

    if (typeof actionRef === 'string') {
      actionId = actionRef
    } else {
      actionId = actionRef.action
      // Resolve $-prefixed values in params
      if (actionRef.params) {
        for (const [key, value] of Object.entries(actionRef.params)) {
          params[key] = resolveValue(value, scope)
        }
      }
    }

    return execute(extensionId, actionId, params)
  }

  provide(EXTENSION_CONTEXT_KEY, { extensionId, executeAction })
}

/**
 * Inject extension context.
 * Throws if used outside an extension context provider.
 */
export function useExtensionContext(): ExtensionContext {
  const context = inject(EXTENSION_CONTEXT_KEY)
  if (!context) {
    throw new Error('useExtensionContext must be used within a provideExtensionContext')
  }
  return context
}

/**
 * Try to inject extension context.
 * Returns null if used outside an extension context provider.
 */
export function tryUseExtensionContext(): ExtensionContext | null {
  return inject(EXTENSION_CONTEXT_KEY, null)
}
