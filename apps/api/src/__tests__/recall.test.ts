/**
 * Integration test: recall provider extension API round-trip
 *
 * Proves the full worker→host→worker→host round trip:
 * 1. Loads the dev-test extension into a real NodeExtensionHost worker
 * 2. Waits for the worker to activate and register its recall provider
 * 3. Calls host.recallProviderRegistry.query(...) directly (no mocks)
 * 4. Asserts that the result contains the canned RecallResult from the worker
 *
 * This is the only test that exercises the actual IPC path:
 *   registry.query → proxy handler → sendRecallQueryRequest → worker message →
 *   handleRecallQueryRequest → postMessage recall-query-response → recallPending.resolve
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { NodeExtensionHost } from '@stina/extension-host'
import { RecallProviderRegistry } from '@stina/memory'
import type { ExtensionManifest } from '@stina/extension-api'

// ── helpers ──────────────────────────────────────────────────────────────────

const DEV_TEST_MANIFEST_PATH = path.resolve(
  __dirname,
  '../../../../packages/dev-test-extension/manifest.json'
)
// Point to dist/ so NodeExtensionHost resolves `manifest.main` ("index.js") to
// `packages/dev-test-extension/dist/index.js` — the compiled entry point.
const DEV_TEST_EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../packages/dev-test-extension/dist'
)

/**
 * Wait for the condition to become true, polling every `intervalMs`.
 * Rejects after `timeoutMs` with the given message.
 */
function waitFor(
  condition: () => boolean,
  { timeoutMs = 5000, intervalMs = 50, message = 'Condition not met in time' } = {}
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (condition()) {
        resolve()
        return
      }
      if (Date.now() >= deadline) {
        reject(new Error(message))
        return
      }
      setTimeout(check, intervalMs)
    }
    check()
  })
}

// ── test ─────────────────────────────────────────────────────────────────────

describe('recall provider extension round-trip', () => {
  let host: NodeExtensionHost
  let registry: RecallProviderRegistry

  beforeEach(async () => {
    registry = new RecallProviderRegistry()

    host = new NodeExtensionHost({
      storagePath: path.join(os.tmpdir(), `stina-recall-test-${Date.now()}`),
      recallProviderRegistry: registry,
    })
  })

  afterEach(async () => {
    // Unload all extensions so worker threads are terminated cleanly
    for (const ext of host.getExtensions()) {
      try {
        await host.unloadExtension(ext.id)
      } catch {
        // ignore
      }
    }
  })

  it('worker registers a recall provider and registry.query reaches the worker handler', async () => {
    // Load the manifest
    const { default: manifestJson } = await import(DEV_TEST_MANIFEST_PATH, { assert: { type: 'json' } })
    const manifest = manifestJson as ExtensionManifest

    // Load the dev-test extension (starts a real Worker Thread)
    const info = await host.loadExtension(manifest, DEV_TEST_EXTENSION_DIR)
    expect(info.status).toBe('active')

    // Wait for the worker to activate and register its recall provider.
    // The recall provider is registered during activate(), which runs
    // asynchronously after the worker thread sends the 'ready' signal.
    await waitFor(
      () => registry.has('dev-test'),
      { timeoutMs: 5000, message: 'dev-test recall provider was not registered within 5 s' }
    )

    // Now query the registry — this exercises the full reverse-RPC path:
    //   registry.query → proxy → NodeExtensionHost.sendRecallQueryRequest →
    //   recall-query-request message → worker handleRecallQueryRequest →
    //   recall-query-response → recallPending.resolve → result
    const results = await registry.query({ query: 'hello' })

    expect(results.length).toBeGreaterThan(0)
    const devTestResult = results.find((r) => r.source_detail === 'dev-test')
    expect(devTestResult).toBeDefined()
    expect(devTestResult!.content).toBe('echoed: hello')
    expect(devTestResult!.source).toBe('extension')
    expect(devTestResult!.ref_id).toBe('dev-test:echo')
    expect(devTestResult!.score).toBe(1)
  })

  it('auto-unregisters the recall provider when extension is unloaded', async () => {
    const { default: manifestJson } = await import(DEV_TEST_MANIFEST_PATH, { assert: { type: 'json' } })
    const manifest = manifestJson as ExtensionManifest

    await host.loadExtension(manifest, DEV_TEST_EXTENSION_DIR)

    await waitFor(
      () => registry.has('dev-test'),
      { timeoutMs: 5000, message: 'dev-test recall provider was not registered within 5 s' }
    )

    expect(registry.has('dev-test')).toBe(true)
    await host.unloadExtension('dev-test')
    expect(registry.has('dev-test')).toBe(false)
  })
})
