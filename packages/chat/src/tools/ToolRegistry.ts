/**
 * Tool Registry
 *
 * Central registry for tools available to the chat system.
 * Tools are registered by extensions and made available to AI providers.
 */

import type { ToolDefinition, ToolResult, LocalizedString } from '@stina/extension-api'
import { resolveLocalizedString } from '@stina/extension-api'

/**
 * Registered tool with execution capability
 */
export interface RegisteredTool {
  /** Tool ID (unique identifier) */
  id: string
  /**
   * Display name - can be a simple string or localized strings.
   * @example "Get Weather"
   * @example { en: "Get Weather", sv: "Hämta väder" }
   */
  name: LocalizedString
  /**
   * Description for the AI - can be a simple string or localized strings.
   * Note: The AI always receives the English description (or fallback) for consistency.
   * @example "Fetches current weather for a location"
   * @example { en: "Fetches current weather", sv: "Hämtar aktuellt väder" }
   */
  description: LocalizedString
  /** Extension that registered this tool */
  extensionId: string
  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>
  /**
   * Execute the tool with the given parameters
   * @param params Parameters for the tool
   * @returns Tool execution result
   */
  execute(params: Record<string, unknown>): Promise<ToolResult>
}

/**
 * Callback for tool registry events
 */
export type ToolRegistryCallback = (tool: RegisteredTool) => void

/**
 * Central registry for managing tools from extensions.
 * Provides methods to register, unregister, and query available tools.
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()
  private onRegisterCallbacks: ToolRegistryCallback[] = []
  private onUnregisterCallbacks: ToolRegistryCallback[] = []

  /**
   * Register a tool
   * @param tool The tool to register
   * @throws Error if a tool with the same ID is already registered
   */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool with ID "${tool.id}" is already registered`)
    }
    this.tools.set(tool.id, tool)
    this.notifyRegister(tool)
  }

  /**
   * Unregister a tool by ID
   * @param id The tool ID to unregister
   * @returns true if the tool was unregistered, false if not found
   */
  unregister(id: string): boolean {
    const tool = this.tools.get(id)
    if (!tool) {
      return false
    }
    this.tools.delete(id)
    this.notifyUnregister(tool)
    return true
  }

  /**
   * Unregister all tools from a specific extension
   * @param extensionId The extension ID
   * @returns Number of tools unregistered
   */
  unregisterByExtension(extensionId: string): number {
    let count = 0
    for (const [id, tool] of this.tools) {
      if (tool.extensionId === extensionId) {
        this.tools.delete(id)
        this.notifyUnregister(tool)
        count++
      }
    }
    return count
  }

  /**
   * Get a tool by ID
   * @param id The tool ID
   * @returns The tool or undefined if not found
   */
  get(id: string): RegisteredTool | undefined {
    return this.tools.get(id)
  }

  /**
   * List all registered tools
   * @returns Array of all registered tools
   */
  list(): RegisteredTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Check if a tool is registered
   * @param id The tool ID
   * @returns true if the tool is registered
   */
  has(id: string): boolean {
    return this.tools.has(id)
  }

  /**
   * Get tool definitions for sending to AI providers.
   * Returns a simplified format without the execute function.
   * Names and descriptions are resolved to English (or fallback) for AI consistency.
   * @returns Array of tool definitions with resolved strings
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.list().map((tool) => ({
      id: tool.id,
      // AI always gets English (or fallback) for consistency
      name: resolveLocalizedString(tool.name, 'en'),
      description: resolveLocalizedString(tool.description, 'en'),
      parameters: tool.parameters,
    }))
  }

  /**
   * Register a callback for when a tool is registered
   * @param callback The callback function
   * @returns Unsubscribe function
   */
  onRegister(callback: ToolRegistryCallback): () => void {
    this.onRegisterCallbacks.push(callback)
    return () => {
      const index = this.onRegisterCallbacks.indexOf(callback)
      if (index >= 0) {
        this.onRegisterCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Register a callback for when a tool is unregistered
   * @param callback The callback function
   * @returns Unsubscribe function
   */
  onUnregister(callback: ToolRegistryCallback): () => void {
    this.onUnregisterCallbacks.push(callback)
    return () => {
      const index = this.onUnregisterCallbacks.indexOf(callback)
      if (index >= 0) {
        this.onUnregisterCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    for (const tool of this.tools.values()) {
      this.notifyUnregister(tool)
    }
    this.tools.clear()
  }

  private notifyRegister(tool: RegisteredTool): void {
    for (const callback of this.onRegisterCallbacks) {
      try {
        callback(tool)
      } catch {
        // Ignore callback errors
      }
    }
  }

  private notifyUnregister(tool: RegisteredTool): void {
    for (const callback of this.onUnregisterCallbacks) {
      try {
        callback(tool)
      } catch {
        // Ignore callback errors
      }
    }
  }
}

/**
 * Singleton tool registry instance
 */
export const toolRegistry = new ToolRegistry()
