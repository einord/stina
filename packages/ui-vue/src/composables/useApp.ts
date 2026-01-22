import { inject, type App as VueApp, type InjectionKey } from 'vue'

export type AppType = 'electron' | 'web'

/**
 * App interface that helps to determine the environment and app specific features
 */
export interface AppInfo {
  /** Type of the app environment: 'electron' or 'web' */
  appType: Readonly<AppType>
  /** Determines if the app is running in a windowed environment (Electron) */
  isWindowed: Readonly<boolean>
}

/**
 * Injection key for the App info
 */
export const appInfoKey: InjectionKey<AppInfo> = Symbol('appInfo')

/**
 * Provide app info to the Vue application
 */
export function provideAppInfo(app: VueApp, appInfo: AppInfo): void {
  app.provide(appInfoKey, appInfo)
}

/**
 * Composable to access the App instance
 *
 * @throws Error if AppInfo is not provided
 * @returns App instance
 */
export function useApp(): AppInfo {
  const appInfo = inject(appInfoKey)
  if (!appInfo) {
    throw new Error('AppInfo not provided. Make sure to call provideAppInfo() in the app root.')
  }
  return appInfo
}

/**
 * Try to get the AppInfo, returning null if not available.
 * Use this when app info is optional.
 */
export function tryUseApp(): AppInfo | null {
  return inject(appInfoKey, null)
}
