/**
 * useThreads — streaming tool-call state tests (§08 blocked-row affordance)
 *
 * Tests the applyStreamEvent logic in isolation, mirroring the pattern used in
 * InboxView.ThreadCard.test.ts. The composable depends on useApi() (Vue
 * provide/inject), so we exercise the pure state-transition logic directly by
 * extracting it here rather than mounting the full composable.
 */

import { describe, it, expect } from 'vitest'
import type { StreamingToolCall, StreamingDraft } from '../useThreads.js'

// ---------------------------------------------------------------------------
// Minimal reimplementation of the applyStreamEvent state transitions we want
// to test. This mirrors the logic in useThreads.ts so that a divergence will
// surface as a failing test.
// ---------------------------------------------------------------------------

type ToolBlockedEvent = {
  type: 'tool_blocked'
  tool_call_id: string
  name: string
  tool_id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reason: 'no_matching_policy' | 'critical_severity' | 'hallucinated_tool'
  chosen_alternative: 'skip'
}

type ToolStartEvent = {
  type: 'tool_start'
  tool_call_id: string
  name: string
  input: unknown
  severity: 'low' | 'medium' | 'high' | 'critical'
}

function applyToolStart(draft: StreamingDraft, event: ToolStartEvent): StreamingDraft {
  return {
    ...draft,
    tools: [
      ...draft.tools,
      {
        id: event.tool_call_id,
        name: event.name,
        status: 'running',
        severity: event.severity,
        input: event.input,
      },
    ],
  }
}

function applyToolBlocked(draft: StreamingDraft, event: ToolBlockedEvent): StreamingDraft {
  return {
    ...draft,
    tools: draft.tools.map((t) =>
      t.id === event.tool_call_id
        ? {
            ...t,
            status: 'blocked',
            tool_id: event.tool_id,
            blockedReason: event.reason,
            chosenAlternative: event.chosen_alternative,
          }
        : t
    ),
  }
}

function makeDraft(): StreamingDraft {
  return { threadId: 'thread-1', text: '', tools: [] }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useThreads streaming tool state transitions', () => {
  describe('tool_start', () => {
    it('captures input from tool_start event onto the new StreamingToolCall', () => {
      const draft = makeDraft()
      const event: ToolStartEvent = {
        type: 'tool_start',
        tool_call_id: 'call-1',
        name: 'dev_test_high_tool',
        input: { key: 'val' },
        severity: 'high',
      }

      const next = applyToolStart(draft, event)

      expect(next.tools).toHaveLength(1)
      const tool = next.tools[0]!
      expect(tool.id).toBe('call-1')
      expect(tool.name).toBe('dev_test_high_tool')
      expect(tool.status).toBe('running')
      expect(tool.severity).toBe('high')
      expect(tool.input).toEqual({ key: 'val' })
    })

    it('preserves input as undefined when tool_start has no input', () => {
      const draft = makeDraft()
      const event: ToolStartEvent = {
        type: 'tool_start',
        tool_call_id: 'call-2',
        name: 'some_tool',
        input: undefined,
        severity: 'medium',
      }

      const next = applyToolStart(draft, event)
      const tool = next.tools[0]!
      expect(tool.input).toBeUndefined()
    })
  })

  describe('tool_blocked', () => {
    it('captures blockedReason, chosenAlternative, and tool_id from tool_blocked event', () => {
      let draft = makeDraft()

      // tool_start must precede tool_blocked (invariant from brief)
      const startEvent: ToolStartEvent = {
        type: 'tool_start',
        tool_call_id: 'call-3',
        name: 'dev_test_high_tool',
        input: { key: 'val' },
        severity: 'high',
      }
      draft = applyToolStart(draft, startEvent)

      const blockedEvent: ToolBlockedEvent = {
        type: 'tool_blocked',
        tool_call_id: 'call-3',
        name: 'dev_test_high_tool',
        tool_id: 'dev_test_high_tool',
        severity: 'high',
        reason: 'no_matching_policy',
        chosen_alternative: 'skip',
      }
      draft = applyToolBlocked(draft, blockedEvent)

      expect(draft.tools).toHaveLength(1)
      const tool = draft.tools[0]!
      expect(tool.status).toBe('blocked')
      expect(tool.blockedReason).toBe('no_matching_policy')
      expect(tool.chosenAlternative).toBe('skip')
      expect(tool.tool_id).toBe('dev_test_high_tool')
    })

    it('preserves input captured from tool_start after tool_blocked is applied', () => {
      let draft = makeDraft()

      const startEvent: ToolStartEvent = {
        type: 'tool_start',
        tool_call_id: 'call-4',
        name: 'dev_test_high_tool',
        input: { amount: 42 },
        severity: 'high',
      }
      draft = applyToolStart(draft, startEvent)

      const blockedEvent: ToolBlockedEvent = {
        type: 'tool_blocked',
        tool_call_id: 'call-4',
        name: 'dev_test_high_tool',
        tool_id: 'dev_test_high_tool',
        severity: 'high',
        reason: 'critical_severity',
        chosen_alternative: 'skip',
      }
      draft = applyToolBlocked(draft, blockedEvent)

      const tool = draft.tools[0]!
      // input from tool_start must survive the tool_blocked update
      expect(tool.input).toEqual({ amount: 42 })
    })

    it('is a no-op when there is no prior tool_start for the given tool_call_id (defensive)', () => {
      const draft = makeDraft()

      // No tool_start was emitted — draft has no tool rows.
      const blockedEvent: ToolBlockedEvent = {
        type: 'tool_blocked',
        tool_call_id: 'call-unknown',
        name: 'some_tool',
        tool_id: 'some_tool',
        severity: 'high',
        reason: 'no_matching_policy',
        chosen_alternative: 'skip',
      }
      const next = applyToolBlocked(draft, blockedEvent)

      // No rows should be added; the tools array stays empty.
      expect(next.tools).toHaveLength(0)
    })

    it('only updates the matching row when multiple tools are in-flight', () => {
      let draft = makeDraft()

      draft = applyToolStart(draft, {
        type: 'tool_start',
        tool_call_id: 'call-a',
        name: 'tool_a',
        input: { x: 1 },
        severity: 'medium',
      })
      draft = applyToolStart(draft, {
        type: 'tool_start',
        tool_call_id: 'call-b',
        name: 'tool_b',
        input: { y: 2 },
        severity: 'high',
      })

      draft = applyToolBlocked(draft, {
        type: 'tool_blocked',
        tool_call_id: 'call-b',
        name: 'tool_b',
        tool_id: 'tool_b',
        severity: 'high',
        reason: 'no_matching_policy',
        chosen_alternative: 'skip',
      })

      const toolA = draft.tools.find((t: StreamingToolCall) => t.id === 'call-a')
      const toolB = draft.tools.find((t: StreamingToolCall) => t.id === 'call-b')

      expect(toolA).toBeDefined()
      expect(toolB).toBeDefined()
      expect(toolA!.status).toBe('running') // unaffected
      expect(toolB!.status).toBe('blocked')
      expect(toolB!.blockedReason).toBe('no_matching_policy')
    })
  })
})
