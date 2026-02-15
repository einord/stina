/**
 * Message protocol between Extension Host and Extension Workers
 */

import type {
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,
  ToolResult,
  ActionResult,
  ModelInfo,
  SchedulerFirePayload,
} from './types.js'

// ============================================================================
// Host → Worker Messages
// ============================================================================

export type HostToWorkerMessage =
  | ActivateMessage
  | DeactivateMessage
  | SettingsChangedMessage
  | SchedulerFireMessage
  | ProviderChatRequestMessage
  | ProviderModelsRequestMessage
  | ToolExecuteRequestMessage
  | ActionExecuteRequestMessage
  | ResponseMessage
  | StreamingFetchChunkMessage
  | BackgroundTaskStartMessage
  | BackgroundTaskStopMessage

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

export interface SchedulerFireMessage {
  type: 'scheduler-fire'
  id: string
  payload: SchedulerFirePayload
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
    options?: GetModelsOptions
  }
}

export interface ToolExecuteRequestMessage {
  type: 'tool-execute-request'
  id: string
  payload: {
    toolId: string
    params: Record<string, unknown>
    /** User ID if the tool is executed in a user context */
    userId?: string
  }
}

export interface ActionExecuteRequestMessage {
  type: 'action-execute-request'
  id: string
  payload: {
    actionId: string
    params: Record<string, unknown>
    /** User ID if the action is executed in a user context */
    userId?: string
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

/**
 * Message sent from host to worker with streaming fetch data chunks.
 * Used for streaming network responses (e.g., NDJSON streams from Ollama).
 */
export interface StreamingFetchChunkMessage {
  type: 'streaming-fetch-chunk'
  id: string
  payload: {
    requestId: string
    chunk: string
    done: boolean
    error?: string
  }
}

/**
 * Message sent from host to worker to start a registered background task.
 */
export interface BackgroundTaskStartMessage {
  type: 'background-task-start'
  id: string
  payload: {
    taskId: string
  }
}

/**
 * Message sent from host to worker to stop a running background task.
 */
export interface BackgroundTaskStopMessage {
  type: 'background-task-stop'
  id: string
  payload: {
    taskId: string
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
  | ActionRegisteredMessage
  | StreamEventMessage
  | LogMessage
  | ProviderModelsResponseMessage
  | ToolExecuteResponseMessage
  | ActionExecuteResponseMessage
  | StreamingFetchAckMessage
  | BackgroundTaskRegisteredMessage
  | BackgroundTaskStatusMessage
  | BackgroundTaskHealthMessage

export interface ReadyMessage {
  type: 'ready'
}

/**
 * Message sent from worker to host to acknowledge receipt of a streaming fetch chunk.
 * This enables backpressure control to prevent unbounded memory growth.
 */
export interface StreamingFetchAckMessage {
  type: 'streaming-fetch-ack'
  payload: {
    requestId: string
  }
}

export interface RequestMessage {
  type: 'request'
  id: string
  method: RequestMethod
  payload: unknown
}

export type RequestMethod =
  | 'network.fetch'
  | 'network.fetch-stream'
  | 'settings.getAll'
  | 'settings.get'
  | 'settings.set'
  | 'user.getProfile'
  | 'events.emit'
  | 'scheduler.schedule'
  | 'scheduler.cancel'
  | 'scheduler.reportFireResult'
  | 'chat.appendInstruction'
  | 'database.execute'
  // Simple key-value storage methods
  | 'storage.set'
  | 'storage.keys'
  | 'storage.setForUser'
  | 'storage.keysForUser'
  // Collection-based storage methods
  | 'storage.put'
  | 'storage.get'
  | 'storage.delete'
  | 'storage.find'
  | 'storage.findOne'
  | 'storage.count'
  | 'storage.putMany'
  | 'storage.deleteMany'
  | 'storage.dropCollection'
  | 'storage.listCollections'
  | 'storage.putForUser'
  | 'storage.getForUser'
  | 'storage.deleteForUser'
  | 'storage.findForUser'
  | 'storage.findOneForUser'
  | 'storage.countForUser'
  | 'storage.putManyForUser'
  | 'storage.deleteManyForUser'
  | 'storage.dropCollectionForUser'
  | 'storage.listCollectionsForUser'
  // Secrets methods
  | 'secrets.set'
  | 'secrets.get'
  | 'secrets.delete'
  | 'secrets.list'
  | 'secrets.setForUser'
  | 'secrets.getForUser'
  | 'secrets.deleteForUser'
  | 'secrets.listForUser'
  // Tools cross-extension methods
  | 'tools.list'
  | 'tools.execute'

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

export interface ActionRegisteredMessage {
  type: 'action-registered'
  payload: {
    id: string
  }
}

export interface StreamEventMessage {
  type: 'stream-event'
  payload: {
    requestId: string
    event: StreamEvent
  }
}

export interface ProviderModelsResponseMessage {
  type: 'provider-models-response'
  payload: {
    requestId: string
    models: ModelInfo[]
    error?: string
  }
}

export interface ToolExecuteResponseMessage {
  type: 'tool-execute-response'
  payload: {
    requestId: string
    result: ToolResult
    error?: string
  }
}

export interface ActionExecuteResponseMessage {
  type: 'action-execute-response'
  payload: {
    requestId: string
    result: ActionResult
    error?: string
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

/**
 * Message sent from worker to host when a background task is registered.
 */
export interface BackgroundTaskRegisteredMessage {
  type: 'background-task-registered'
  payload: {
    taskId: string
    name: string
    userId: string
    restartPolicy: {
      type: 'always' | 'on-failure' | 'never'
      maxRestarts?: number
      initialDelayMs?: number
      maxDelayMs?: number
      backoffMultiplier?: number
    }
    payload?: Record<string, unknown>
  }
}

/**
 * Message sent from worker to host with background task status updates.
 */
export interface BackgroundTaskStatusMessage {
  type: 'background-task-status'
  payload: {
    taskId: string
    status: 'running' | 'stopped' | 'failed'
    error?: string
  }
}

/**
 * Message sent from worker to host with background task health reports.
 */
export interface BackgroundTaskHealthMessage {
  type: 'background-task-health'
  payload: {
    taskId: string
    status: string
    timestamp: string
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
