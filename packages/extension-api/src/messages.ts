/**
 * Message protocol between Extension Host and Extension Workers
 */

import type { AIProvider, ChatMessage, ChatOptions, StreamEvent, Tool, ToolResult, ModelInfo } from './types.js'

// ============================================================================
// Host → Worker Messages
// ============================================================================

export type HostToWorkerMessage =
  | ActivateMessage
  | DeactivateMessage
  | SettingsChangedMessage
  | ProviderChatRequestMessage
  | ProviderModelsRequestMessage
  | ToolExecuteRequestMessage
  | ResponseMessage

export interface ActivateMessage {
  type: 'activate'
  id: string
  payload: {
    extensionId: string
    extensionVersion: string
    storagePath: string
    permissions: string[]
    settings: Record<string, unknown>
  }
}

export interface DeactivateMessage {
  type: 'deactivate'
  id: string
}

export interface SettingsChangedMessage {
  type: 'settings-changed'
  id: string
  payload: {
    key: string
    value: unknown
  }
}

export interface ProviderChatRequestMessage {
  type: 'provider-chat-request'
  id: string
  payload: {
    providerId: string
    messages: ChatMessage[]
    options: ChatOptions
  }
}

export interface ProviderModelsRequestMessage {
  type: 'provider-models-request'
  id: string
  payload: {
    providerId: string
  }
}

export interface ToolExecuteRequestMessage {
  type: 'tool-execute-request'
  id: string
  payload: {
    toolId: string
    params: Record<string, unknown>
  }
}

export interface ResponseMessage {
  type: 'response'
  id: string
  payload: {
    requestId: string
    success: boolean
    data?: unknown
    error?: string
  }
}

// ============================================================================
// Worker → Host Messages
// ============================================================================

export type WorkerToHostMessage =
  | ReadyMessage
  | RequestMessage
  | ProviderRegisteredMessage
  | ToolRegisteredMessage
  | StreamEventMessage
  | LogMessage

export interface ReadyMessage {
  type: 'ready'
}

export interface RequestMessage {
  type: 'request'
  id: string
  method: RequestMethod
  payload: unknown
}

export type RequestMethod =
  | 'network.fetch'
  | 'settings.getAll'
  | 'settings.get'
  | 'settings.set'
  | 'database.execute'
  | 'storage.get'
  | 'storage.set'
  | 'storage.delete'
  | 'storage.keys'

export interface ProviderRegisteredMessage {
  type: 'provider-registered'
  payload: {
    id: string
    name: string
  }
}

export interface ToolRegisteredMessage {
  type: 'tool-registered'
  payload: {
    id: string
    name: string
    description: string
    parameters?: Record<string, unknown>
  }
}

export interface StreamEventMessage {
  type: 'stream-event'
  payload: {
    requestId: string
    event: StreamEvent
  }
}

export interface LogMessage {
  type: 'log'
  payload: {
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    data?: Record<string, unknown>
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export interface PendingRequest<T = unknown> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
