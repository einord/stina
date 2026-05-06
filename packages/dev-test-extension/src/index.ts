import {
  initializeExtension,
  type ExtensionContext,
  type Disposable,
} from '@stina/extension-api/runtime'

function activate(ctx: ExtensionContext): Disposable {
  const toolDisposable = ctx.tools.register({
    id: 'dev_test_high_severity_action',
    name: 'Dev Test: High-Severity Action',
    description: 'Fake high-severity tool for testing the §06 policy gate. Always succeeds.',
    async execute(_params) {
      return {
        success: true,
        data: { message: 'DEV tool executed — policy gate passed ✓' },
      }
    },
  })

  return {
    dispose: () => {
      toolDisposable.dispose()
    },
  }
}

initializeExtension({ activate })
