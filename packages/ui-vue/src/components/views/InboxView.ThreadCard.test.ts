/**
 * InboxView.ThreadCard — logic unit tests
 *
 * Tests the accent/icon/cardStyle resolution logic that ThreadCard uses.
 * Full mount tests require @vue/test-utils + @vitejs/plugin-vue which are not
 * yet in the workspace; this file covers the derived-state logic directly.
 */

import { describe, it, expect } from 'vitest'
import type { ExtensionThreadHints } from '@stina/extension-api'

// ---------------------------------------------------------------------------
// Mirrors the computed logic from InboxView.ThreadCard.vue
// ---------------------------------------------------------------------------

const accentByTriggerKind: Record<string, string> = {
  user: 'graphite',
  mail: 'sky',
  calendar: 'olive',
  scheduled: 'sand',
  stina: 'amber',
}

function resolveAccent(triggerKind: string, hints?: ExtensionThreadHints): string {
  return hints?.accent ?? accentByTriggerKind[triggerKind] ?? 'graphite'
}

function resolveCardStyle(hints?: ExtensionThreadHints): string {
  return hints?.card_style ?? 'left-line'
}

const iconByTriggerKind: Record<string, string> = {
  user: '✎',
  mail: '✉',
  calendar: '📅',
  scheduled: '⏰',
  stina: '✦',
}

function resolveIcon(triggerKind: string, hints?: ExtensionThreadHints): string {
  return hints?.icon ?? iconByTriggerKind[triggerKind] ?? '•'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreadCard computed logic', () => {
  describe('resolveAccent', () => {
    it('uses extensionHints.accent when provided', () => {
      const hints: ExtensionThreadHints = { accent: 'sky', card_style: 'bordered' }
      expect(resolveAccent('mail', hints)).toBe('sky')
      // accent class would be thread-card--accent-sky
    })

    it('falls back to trigger-kind default when extensionHints has no accent', () => {
      const hints: ExtensionThreadHints = { card_style: 'bordered' }
      expect(resolveAccent('calendar', hints)).toBe('olive')
    })

    it('falls back to trigger-kind default when no extensionHints', () => {
      expect(resolveAccent('mail')).toBe('sky')
      expect(resolveAccent('calendar')).toBe('olive')
      expect(resolveAccent('user')).toBe('graphite')
      expect(resolveAccent('scheduled')).toBe('sand')
      expect(resolveAccent('stina')).toBe('amber')
    })

    it('falls back to graphite for unknown trigger kinds', () => {
      expect(resolveAccent('unknown')).toBe('graphite')
    })
  })

  describe('resolveCardStyle', () => {
    it('uses extensionHints.card_style when provided', () => {
      const hints: ExtensionThreadHints = { accent: 'sky', card_style: 'bordered' }
      // class would be thread-card--style-bordered
      expect(resolveCardStyle(hints)).toBe('bordered')
    })

    it('defaults to left-line when no hints', () => {
      expect(resolveCardStyle()).toBe('left-line')
      // class would be thread-card--style-left-line
    })

    it('defaults to left-line when hints has no card_style', () => {
      const hints: ExtensionThreadHints = { accent: 'sky' }
      expect(resolveCardStyle(hints)).toBe('left-line')
    })

    it('supports all valid card_style values', () => {
      expect(resolveCardStyle({ card_style: 'minimal' })).toBe('minimal')
      expect(resolveCardStyle({ card_style: 'bordered' })).toBe('bordered')
      expect(resolveCardStyle({ card_style: 'left-line' })).toBe('left-line')
    })
  })

  describe('resolveIcon', () => {
    it('uses extensionHints.icon when provided', () => {
      const hints: ExtensionThreadHints = { icon: '📬' }
      expect(resolveIcon('mail', hints)).toBe('📬')
    })

    it('falls back to trigger-kind icon when no hint', () => {
      expect(resolveIcon('mail')).toBe('✉')
      expect(resolveIcon('calendar')).toBe('📅')
    })
  })

  describe('no regression — trigger-kind defaults still apply without extensionHints', () => {
    it('mail thread gets sky accent and ✉ icon by default', () => {
      expect(resolveAccent('mail')).toBe('sky')
      expect(resolveIcon('mail')).toBe('✉')
      expect(resolveCardStyle()).toBe('left-line')
    })

    it('calendar thread gets olive accent and 📅 icon by default', () => {
      expect(resolveAccent('calendar')).toBe('olive')
      expect(resolveIcon('calendar')).toBe('📅')
    })
  })
})
