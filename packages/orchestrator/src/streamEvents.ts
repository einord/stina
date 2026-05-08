import type { StinaMessage } from '@stina/core'
import type { ToolSeverity } from '@stina/extension-api'

/**
 * Events emitted during a decision turn so callers can observe progress
 * incrementally instead of waiting for the final reply.
 *
 * The shape mirrors the chat-style SSE pattern: small content deltas as the
 * model produces them, a single `message_appended` after the orchestrator
 * persists Stina's reply, then `done`. `error` is terminal.
 *
 * Producers that don't support streaming (e.g. the canned stub) still fire
 * a single `content_delta` carrying the whole reply followed by `done`, so
 * downstream consumers don't need to special-case the producer.
 */
export type TurnStreamEvent =
  | { type: 'content_delta'; text: string }
  | {
      type: 'tool_start'
      tool_call_id: string
      name: string
      input: unknown
      /**
       * Severity classification driving §05 visual weight in the inbox
       * streaming card. Producer falls back to 'medium' for tools that
       * advertise no severity and 'high' for tool names not in the
       * advertised tools[] (likely a hallucinated call). UI matches the
       * subsequent tool_end by `tool_call_id`, so tool_end does NOT
       * carry severity.
       */
      severity: ToolSeverity
    }
  | {
      type: 'tool_end'
      tool_call_id: string
      name: string
      output: unknown
      /** True when the tool itself or the executor threw — see ToolResult.success. */
      error?: boolean
    }
  | {
      type: 'tool_blocked'
      tool_call_id: string
      name: string
      /** Canonical tool id — same as `name` in v1 but explicit for forward-compat. */
      tool_id: string
      severity: ToolSeverity
      reason: 'no_matching_policy' | 'critical_severity' | 'hallucinated_tool'
      /** The action Stina took after blocking — drives the verb badge in the UI. */
      chosen_alternative: 'skip'
    }
  | { type: 'message_appended'; message: StinaMessage }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type TurnStreamListener = (event: TurnStreamEvent) => void
