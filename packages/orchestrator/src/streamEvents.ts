import type { StinaMessage } from '@stina/core'

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
    }
  | {
      type: 'tool_end'
      tool_call_id: string
      name: string
      output: unknown
      /** True when the tool itself or the executor threw — see ToolResult.success. */
      error?: boolean
    }
  | { type: 'message_appended'; message: StinaMessage }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type TurnStreamListener = (event: TurnStreamEvent) => void
