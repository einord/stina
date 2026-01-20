import { BrowserWindow, session } from 'electron'

export interface AuthWindowOptions {
  /** The web URL for authentication */
  webUrl: string
  /** The session ID for the auth flow */
  sessionId: string
  /** Called when authentication succeeds */
  onSuccess: (code: string, state: string) => void
  /** Called when authentication fails */
  onError: (error: string) => void
  /** Called when the user closes the window */
  onCancel: () => void
  /** Parent window for modal behavior */
  parent?: BrowserWindow
}

/**
 * Create a dedicated authentication window with security settings.
 * Uses a separate session to isolate auth cookies from the main app.
 *
 * @param options - Configuration for the auth window
 * @returns The created BrowserWindow instance
 */
export function createAuthWindow(options: AuthWindowOptions): BrowserWindow {
  const { webUrl, sessionId, onSuccess, onError, onCancel, parent } = options

  // Create a separate session for auth to isolate cookies
  const authSession = session.fromPartition('auth-session', { cache: false })

  const authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    parent,
    modal: !!parent,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      session: authSession,
    },
  })

  let handled = false

  /**
   * Handle successful authentication callback.
   */
  const handleSuccess = (code: string, state: string) => {
    if (handled) return
    handled = true
    authWindow.close()
    onSuccess(code, state)
  }

  /**
   * Handle authentication error.
   */
  const handleError = (error: string) => {
    if (handled) return
    handled = true
    authWindow.close()
    onError(error)
  }

  /**
   * Handle window close (user cancelled).
   */
  const handleCancel = () => {
    if (handled) return
    handled = true
    onCancel()
  }

  // Intercept navigation to catch stina:// callback
  authWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('stina://callback')) {
      event.preventDefault()
      handleCallbackUrl(url, handleSuccess, handleError)
    }
  })

  // Also intercept new window requests (for links that open in new window)
  authWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('stina://callback')) {
      handleCallbackUrl(url, handleSuccess, handleError)
      return { action: 'deny' }
    }
    // Allow other URLs to open in the same window
    return { action: 'deny' }
  })

  // Handle redirects
  authWindow.webContents.on('will-redirect', (event, url) => {
    if (url.startsWith('stina://callback')) {
      event.preventDefault()
      handleCallbackUrl(url, handleSuccess, handleError)
    }
  })

  // Handle window close
  authWindow.on('closed', handleCancel)

  // Build the login URL - use web URL since electron-login is a web route
  const loginUrl = new URL(`${webUrl}/auth/electron-login`)
  loginUrl.searchParams.set('session_id', sessionId)

  // Load the login page and show window when ready
  authWindow.loadURL(loginUrl.toString())
  authWindow.once('ready-to-show', () => {
    authWindow.show()
  })

  return authWindow
}

/**
 * Parse and handle a stina://callback URL.
 *
 * @param url - The callback URL
 * @param onSuccess - Success callback
 * @param onError - Error callback
 */
function handleCallbackUrl(
  url: string,
  onSuccess: (code: string, state: string) => void,
  onError: (error: string) => void
): void {
  try {
    const parsed = new URL(url)

    const error = parsed.searchParams.get('error')
    if (error) {
      onError(error)
      return
    }

    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')

    if (code && state) {
      onSuccess(code, state)
    } else {
      onError('Invalid callback: missing code or state')
    }
  } catch {
    onError('Failed to parse callback URL')
  }
}

/**
 * Close any open auth windows.
 * Useful for cleanup when starting a new auth flow.
 *
 * @param authWindow - The auth window to close
 */
export function closeAuthWindow(authWindow: BrowserWindow | null): void {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close()
  }
}
