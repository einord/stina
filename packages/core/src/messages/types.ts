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
import type { ToolSeverity } from '../autonomy/types.js'

/**
 * A tool call that has been persisted as part of a completed decision turn.
 * Stored in `StinaMessage.content.tool_calls` so users can see what Stina
 * did when revisiting a thread.
 *
 * Note on redaction: arguments are stored unredacted in v1 (user-owned local
 * DB). Activity log uses `[redacted: no redactor declared]` (or the redactor's
 * output) for the same data — that asymmetry is a tracked §06 gap. Full
 * symmetric redaction on `StinaMessage.tool_calls` lands with v2.
 */
export interface PersistedToolCall {
  /** tool_call_id from the stream event */
  id: string
  /** Tool name as registered */
  name: string
  /** Severity resolved at gate time (same resolution path for all calls) */
  severity: ToolSeverity
  /** Final outcome of this call */
  status: 'done' | 'error' | 'blocked'
  /**
   * Tool input arguments. Stored unredacted in v1 (user-owned local DB).
   * Activity log uses `[redacted: no redactor declared]` (or the redactor's
   * output) for the same data — that asymmetry is a tracked §06 gap. Full
   * symmetric redaction on `StinaMessage.tool_calls` lands with v2.
   */
  arguments?: Record<string, unknown>
  /** Error message when status === 'error'. Not used for blocked. */
  error?: string
  /**
   * Structured block reason when status === 'blocked'. Carries the §05
   * three-piece audit info. Full verb-badge rendering ("Skipped / Escalated /
   * Solved differently") is a tracked v2 follow-up; v1 renders a minimal
   * 🚫 + name.
   */
  block_reason?: 'no_matching_policy' | 'critical_severity' | 'hallucinated_tool'
  /**
   * Chosen alternative when blocked. v1 always 'skip'. Stored for v2
   * rendering.
   */
  chosen_alternative?: 'skip' | 'escalate' | 'solve_differently'
}

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
    tool_calls?: PersistedToolCall[]
    /** v2 adds result persistence */
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
      /**
       * Status values for extension_status AppContent.
       * The first five are extension-facing (emitted by extension host code).
       * The last two ('degraded_mode_entered' | 'degraded_mode_exited') are
       * runtime-emitted only (extension_id === RUNTIME_EXTENSION_ID) — they are
       * audit signals from the host's cascade-defense state machine (§04 line 154–155).
       */
      status:
        | 'needs_reauth'
        | 'error'
        | 'disabled'
        | 'updated'
        | 'severity_changed'
        | 'degraded_mode_entered'
        | 'degraded_mode_exited'
      detail: string
    }
  | { kind: 'system'; message: string }

/** Reserved extension_id for messages emitted directly by the host runtime. */
export const RUNTIME_EXTENSION_ID = 'stina-runtime'
