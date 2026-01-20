import { app, BrowserWindow } from 'electron'
import * as path from 'node:path'

// Callback type for auth completion
type AuthCallback = (code: string, state: string) => void
type AuthErrorCallback = (error: string) => void

let authCallback: AuthCallback | null = null
let authErrorCallback: AuthErrorCallback | null = null

/**
 * Register the stina:// custom protocol handler.
 * This allows the browser to redirect back to the Electron app after authentication.
 *
 * Must be called before app.ready.
 */
export function registerAuthProtocol(): void {
  // Register as default protocol client
  // In dev mode with process.defaultApp, we need to pass the script path
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('stina', process.execPath, [path.resolve(process.argv[1]!)])
    }
  } else {
    app.setAsDefaultProtocolClient('stina')
  }
}

/**
 * Set the callback to be called when auth completes via protocol handler.
 */
export function setAuthCallback(callback: AuthCallback | null): void {
  authCallback = callback
}

/**
 * Set the callback to be called when auth fails.
 */
export function setAuthErrorCallback(callback: AuthErrorCallback | null): void {
  authErrorCallback = callback
}

/**
 * Handle an incoming protocol URL.
 * Called by the main process when a stina:// URL is opened.
 *
 * @param url - The full URL, e.g., "stina://callback?code=xxx&state=yyy"
 * @returns true if the URL was handled, false otherwise
 */
export function handleProtocolUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Only handle stina:// protocol
    if (parsed.protocol !== 'stina:') {
      return false
    }

    // Handle callback path
    if (parsed.hostname === 'callback' || parsed.pathname === '//callback') {
      const code = parsed.searchParams.get('code')
      const state = parsed.searchParams.get('state')
      const error = parsed.searchParams.get('error')

      if (error) {
        if (authErrorCallback) {
          authErrorCallback(error)
        }
        return true
      }

      if (code && state && authCallback) {
        authCallback(code, state)
        return true
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Setup protocol handlers for the app.
 * Should be called when the app is ready.
 */
export function setupProtocolHandlers(): void {
  // Handle protocol URL when app is already running (macOS)
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)

    // Focus the main window
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const mainWindow = windows[0]
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.focus()
      }
    }
  })

  // Handle protocol URL when app starts from protocol (Windows/Linux)
  // The URL is passed as command line argument
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    // Another instance is already running
    app.quit()
  } else {
    app.on('second-instance', (_event, commandLine) => {
      // Someone tried to run a second instance
      // Look for stina:// URL in command line args
      const protocolUrl = commandLine.find((arg) => arg.startsWith('stina://'))
      if (protocolUrl) {
        handleProtocolUrl(protocolUrl)
      }

      // Focus the main window
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        const mainWindow = windows[0]
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          }
          mainWindow.focus()
        }
      }
    })
  }

  // Check if app was started with protocol URL (Windows/Linux)
  const protocolUrl = process.argv.find((arg) => arg.startsWith('stina://'))
  if (protocolUrl) {
    // Delay handling to allow app to fully initialize
    setImmediate(() => handleProtocolUrl(protocolUrl))
  }
}
