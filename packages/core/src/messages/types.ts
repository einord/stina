/**
 * Message types — see docs/redesign-2026/02-data-model.md §Message.
 *
 * The Message union is a discriminated union by `author`. Content shape
 * depends on the author. App content is structured (typed payloads), never
 * free text — this is the trust-boundary contract that prevents
 * prompt-injection via mail subjects, calendar titles, etc.
 *
 * Attachment, ToolCall, and ToolResult are reused from packages/chat's
 * existing message types and are imported here as type-only references when
 * needed by consumers.
 */

import type { Attachment, ToolCall, ToolResult } from './externalTypes.js'

export type MessageVisibility = 'normal' | 'silent'

export interface MessageBase {
  id: string
  thread_id: string
  visibility: MessageVisibility
  created_at: number
}

export interface UserMessage extends MessageBase {
  author: 'user'
  content: { text: string; attachments?: Attachment[] }
}

export interface StinaMessage extends MessageBase {
  author: 'stina'
  content: {
    text?: string
    tool_calls?: ToolCall[]
    tool_results?: ToolResult[]
  }
}

export interface AppMessage extends MessageBase {
  author: 'app'
  /** The extension or runtime component that emitted this message. */
  source: { extension_id: string; component?: string }
  content: AppContent
}

export type Message = UserMessage | StinaMessage | AppMessage

/**
 * Typed payloads for app-authored messages.
 *
 * The runtime renders AppContent into model context inside an explicit
 * untrusted-data wrapper so Stina cannot be tricked by content embedded in
 * mail subjects, calendar titles, etc. New event kinds require a schema
 * addition here — a deliberate friction so we know all event shapes the
 * runtime ever sees.
 */
export type AppContent =
  | { kind: 'mail'; from: string; subject: string; snippet: string; mail_id: string }
  | {
      kind: 'calendar'
      title: string
      starts_at: number
      ends_at: number
      location?: string
      event_id: string
    }
  | {
      kind: 'scheduled'
      job_id: string
      description: string
      payload?: Record<string, unknown>
    }
  | {
      kind: 'extension_status'
      extension_id: string
      status: 'needs_reauth' | 'error' | 'disabled' | 'updated' | 'severity_changed'
      detail: string
    }
  | { kind: 'system'; message: string }
