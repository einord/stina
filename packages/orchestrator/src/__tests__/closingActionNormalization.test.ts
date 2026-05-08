/**
 * Unit tests for closingActionNormalization.ts (§04 phase 8g).
 *
 * Covers the v1 validation predicate for `normalizeClosingAction`:
 *   - Valid outputs are returned unchanged.
 *   - Malformed normal-visibility outputs throw ClosingActionMalformedError.
 *   - Silent-visibility with empty content is intentionally NOT flagged.
 *   - Error class assertions (name, instanceof).
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeClosingAction,
  ClosingActionMalformedError,
} from '../closingActionNormalization.js'
import type { DecisionTurnOutput } from '../producers/canned.js'

describe('normalizeClosingAction', () => {
  it('returns a normal-visibility output with non-empty text unchanged', () => {
    const output: DecisionTurnOutput = { visibility: 'normal', content: { text: 'hi' } }
    expect(normalizeClosingAction(output)).toBe(output)
  })

  it('returns a normal-visibility output with empty text but tool_calls unchanged (tool calls are the closing action)', () => {
    const output: DecisionTurnOutput = {
      visibility: 'normal',
      content: {
        text: '',
        tool_calls: [
          {
            id: 'tc-1',
            name: 'some_tool',
            severity: 'medium',
            status: 'done',
          },
        ],
      },
    }
    expect(normalizeClosingAction(output)).toBe(output)
  })

  it('returns a silent-visibility output with empty text unchanged (silent + empty is not flagged in v1)', () => {
    const output: DecisionTurnOutput = { visibility: 'silent', content: { text: '' } }
    expect(normalizeClosingAction(output)).toBe(output)
  })

  it('throws ClosingActionMalformedError for normal-visibility with empty string text and no tool_calls', () => {
    const output: DecisionTurnOutput = { visibility: 'normal', content: { text: '' } }
    expect(() => normalizeClosingAction(output)).toThrow(ClosingActionMalformedError)
  })

  it('throws ClosingActionMalformedError for normal-visibility with whitespace-only text', () => {
    const output: DecisionTurnOutput = { visibility: 'normal', content: { text: '   ' } }
    expect(() => normalizeClosingAction(output)).toThrow(ClosingActionMalformedError)
  })

  it('throws ClosingActionMalformedError for normal-visibility with no text field at all', () => {
    const output: DecisionTurnOutput = { visibility: 'normal', content: {} }
    expect(() => normalizeClosingAction(output)).toThrow(ClosingActionMalformedError)
  })

  it('throws ClosingActionMalformedError for normal-visibility with empty tool_calls array (length 0 = no tool calls)', () => {
    const output: DecisionTurnOutput = {
      visibility: 'normal',
      content: { text: '', tool_calls: [] },
    }
    expect(() => normalizeClosingAction(output)).toThrow(ClosingActionMalformedError)
  })

  describe('ClosingActionMalformedError class assertions', () => {
    it('has the correct name, is instanceof Error and ClosingActionMalformedError, and embeds the reason in the message', () => {
      const output: DecisionTurnOutput = { visibility: 'normal', content: { text: '' } }
      let err: unknown
      try {
        normalizeClosingAction(output)
      } catch (e) {
        err = e
      }

      expect(err).toBeDefined()
      expect(err instanceof Error).toBe(true)
      expect(err instanceof ClosingActionMalformedError).toBe(true)
      const malformed = err as ClosingActionMalformedError
      expect(malformed.name).toBe('ClosingActionMalformedError')
      expect(malformed.reason).toBe('normal_message_empty_content')
      // error.message format: "${reason}: ${detail}"
      expect(malformed.message).toMatch(/^normal_message_empty_content:/)
    })
  })
})
