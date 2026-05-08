/**
 * ManifestValidator Tests — thread_hints validation via Zod schema
 *
 * Validates that contributes.thread_hints fields (accent, card_style) produce
 * the expected Zod-schema errors when invalid values are supplied, and that
 * valid manifests pass without errors.
 */

import { describe, it, expect } from 'vitest'
import { validateManifest } from './ManifestValidator.js'

/** Minimal valid manifest shape — all required fields per ExtensionManifestSchema */
const baseManifest = {
  id: 'test-ext',
  name: 'Test Extension',
  version: '1.0.0',
  description: 'Test',
  main: 'dist/index.js',
  author: { name: 'Test Author' },
  permissions: [],
}

describe('validateManifest — contributes.thread_hints', () => {
  it('accepts a manifest with valid thread_hints accent and card_style', () => {
    const result = validateManifest({
      ...baseManifest,
      contributes: {
        thread_hints: {
          accent: 'sky',
          card_style: 'left-line',
        },
      },
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects an invalid accent value with an error pointing to contributes.thread_hints.accent', () => {
    const result = validateManifest({
      ...baseManifest,
      contributes: {
        thread_hints: {
          accent: 'neon',
        },
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('contributes.thread_hints.accent'))).toBe(true)
  })

  it('rejects an invalid card_style value with an error pointing to contributes.thread_hints.card_style', () => {
    const result = validateManifest({
      ...baseManifest,
      contributes: {
        thread_hints: {
          card_style: 'full',
        },
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('contributes.thread_hints.card_style'))).toBe(true)
  })

  it('accepts all optional thread_hints fields together', () => {
    const result = validateManifest({
      ...baseManifest,
      contributes: {
        thread_hints: {
          icon: 'envelope',
          accent: 'olive',
          card_style: 'bordered',
          snippet_field: 'subject',
          badge: '3 new',
        },
      },
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts a manifest without thread_hints', () => {
    const result = validateManifest({
      ...baseManifest,
      contributes: {},
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
