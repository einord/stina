type appTypes = 'electron' | 'web'

/**
 * App interface that helps to determine the environment and app specific features
 */
export interface App {
  /** Determines if the app is running in a windowed environment (Electron) */
  isWindowed: Readonly<boolean>
  /** Type of the app environment: 'electron' or 'web' */
  appType: Readonly<appTypes>
}

function getAppType(): appTypes {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return 'electron'
  }
  return 'web'
}

/**
 * Composable to access the App instance
 *
 * @returns App instance
 */
export function useApp(): App {
  return {
    isWindowed: typeof window !== 'undefined' && 'electronAPI' in window,
    appType: getAppType(),
  }
}
