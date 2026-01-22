/**
 * App interface that helps to determine the environment and app specific features
 */
export interface App {
  /** Determines if the app is running in a windowed environment (Electron) */
  isWindowed: Readonly<boolean>
}

/**
 * Composable to access the App instance
 *
 * @returns App instance
 */
export function useApp(): App {
  return {
    isWindowed: typeof window !== 'undefined' && 'electronAPI' in window,
  }
}
