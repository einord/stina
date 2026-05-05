import {
  initializeExtension,
  type ExtensionContext,
  type Disposable,
} from '@stina/extension-api/runtime'

function activate(_ctx: ExtensionContext): Disposable {
  // Intentionally no-op. This extension exists solely so its manifest's
  // contributes.thread_hints is loadable at runtime. See README.md.
  return { dispose: () => {} }
}

initializeExtension({ activate })
