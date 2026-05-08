/**
 * Unit tests for deriveTitleFromAppContent (§04 Phase 8f additions).
 *
 * Covers the new system and extension_status cases added for the internal
 * emitEventInternal path. Existing mail/calendar/scheduled cases are covered
 * by integration tests; this file focuses on the new kinds.
 */

import { describe, it, expect } from 'vitest'
import { deriveTitleFromAppContent } from '../ExtensionHost.handlers.events.js'
import type { AppContent } from '@stina/core'

describe('deriveTitleFromAppContent — system', () => {
  it('returns the message string as the title', () => {
    const content: AppContent = { kind: 'system', message: 'Ny insikt från dream pass' }
    expect(deriveTitleFromAppContent(content)).toBe('Ny insikt från dream pass')
  })

  it('truncates message to 200 codepoints when too long', () => {
    const longMessage = 'A'.repeat(250)
    const content: AppContent = { kind: 'system', message: longMessage }
    const title = deriveTitleFromAppContent(content)
    const codepoints = [...title]
    expect(codepoints.length).toBeLessThanOrEqual(200)
    expect(title.endsWith('…')).toBe(true)
  })

  it('does not truncate messages at exactly 200 codepoints', () => {
    const message = 'B'.repeat(200)
    const content: AppContent = { kind: 'system', message }
    const title = deriveTitleFromAppContent(content)
    expect(title).toBe(message)
    expect(title.endsWith('…')).toBe(false)
  })
})

describe('deriveTitleFromAppContent — extension_status', () => {
  it('returns "extension_id: status" as the title', () => {
    const content: AppContent = {
      kind: 'extension_status',
      extension_id: 'stina-ext-mail',
      status: 'needs_reauth',
      detail: 'Token expired',
    }
    expect(deriveTitleFromAppContent(content)).toBe('stina-ext-mail: needs_reauth')
  })

  it('truncates to 200 codepoints when extension_id + status exceeds limit', () => {
    const content: AppContent = {
      kind: 'extension_status',
      extension_id: 'x'.repeat(200),
      status: 'error',
      detail: 'Something went wrong',
    }
    const title = deriveTitleFromAppContent(content)
    const codepoints = [...title]
    expect(codepoints.length).toBeLessThanOrEqual(200)
    expect(title.endsWith('…')).toBe(true)
  })
})
