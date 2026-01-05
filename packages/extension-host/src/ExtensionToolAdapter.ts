/**
 * Extension Tool Adapter
 *
 * Bridges extension-host tools to the chat system's ToolRegistry.
 * Listens for tool registration events and creates adapters that can
 * execute tools via the extension host worker communication.
 */

import type { ToolResult } from '@stina/extension-api'
import type { ExtensionHost, ToolInfo } from './ExtensionHost.js'

/**
 * Adapted tool for use with ToolRegistry
 */
export interface AdaptedTool {
  /** Tool ID */
  id: string
  /** Display name */
  name: string
  /** Description for AI */
  description: string
  /** Extension that provides this tool */
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
 * Callback types for tool bridge events
 */
export type ToolAddedCallback = (tool: AdaptedTool) => void
export type ToolRemovedCallback = (toolId: string) => void

/**
 * Watches an ExtensionHost and automatically bridges tools to the chat system.
 * Creates adapters that can execute tools via the extension host.
 */
export class ExtensionToolBridge {
  private readonly extensionHost: ExtensionHost
  private readonly onToolAdded: ToolAddedCallback
  private readonly onToolRemoved: ToolRemovedCallback
  private readonly adapters = new Map<string, AdaptedTool>()
  private readonly boundHandleToolRegistered: (tool: ToolInfo) => void
  private readonly boundHandleToolUnregistered: (toolId: string) => void

  constructor(
    extensionHost: ExtensionHost,
    onToolAdded: ToolAddedCallback,
    onToolRemoved: ToolRemovedCallback
  ) {
    this.extensionHost = extensionHost
    this.onToolAdded = onToolAdded
    this.onToolRemoved = onToolRemoved

    // Bind handlers to preserve 'this' context
    this.boundHandleToolRegistered = this.handleToolRegistered.bind(this)
    this.boundHandleToolUnregistered = this.handleToolUnregistered.bind(this)

    // Listen for tool registration events
    this.extensionHost.on('tool-registered', this.boundHandleToolRegistered)
    this.extensionHost.on('tool-unregistered', this.boundHandleToolUnregistered)

    // Register any already-loaded tools
    for (const tool of this.extensionHost.getTools()) {
      this.handleToolRegistered(tool)
    }
  }

  private handleToolRegistered(toolInfo: ToolInfo): void {
    const adapter = this.createToolAdapter(toolInfo)
    this.adapters.set(toolInfo.id, adapter)
    this.onToolAdded(adapter)
  }

  private handleToolUnregistered(toolId: string): void {
    this.adapters.delete(toolId)
    this.onToolRemoved(toolId)
  }

  /**
   * Create an adapted tool that can execute via the extension host
   */
  private createToolAdapter(toolInfo: ToolInfo): AdaptedTool {
    return {
      id: toolInfo.id,
      name: toolInfo.name,
      description: toolInfo.description,
      extensionId: toolInfo.extensionId,
      parameters: toolInfo.parameters,
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        return this.executeToolInExtension(toolInfo.extensionId, toolInfo.id, params)
      },
    }
  }

  /**
   * Execute a tool in the extension worker
   */
  private async executeToolInExtension(
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    return this.extensionHost.executeTool(extensionId, toolId, params)
  }

  /**
   * Get all adapted tools
   */
  getTools(): AdaptedTool[] {
    return Array.from(this.adapters.values())
  }

  /**
   * Get a specific tool
   */
  getTool(toolId: string): AdaptedTool | undefined {
    return this.adapters.get(toolId)
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.extensionHost.off('tool-registered', this.boundHandleToolRegistered)
    this.extensionHost.off('tool-unregistered', this.boundHandleToolUnregistered)
    this.adapters.clear()
  }
}
