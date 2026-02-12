import type { ConnectionConfig } from '@stina/core'

/**
 * Subset of the Electron preload API used by ui-vue components.
 * The full type lives in apps/electron/src/preload/index.ts.
 */
export interface ElectronAPI {
  connectionTest(url: string): Promise<{ success: boolean; error?: string }>
  connectionSetConfig(
    config: ConnectionConfig
  ): Promise<{ success: boolean; requiresRestart: boolean }>
  connectionGetConfig(): Promise<ConnectionConfig>
  appRestart(): Promise<void>
  authExternalLogin(
    webUrl: string
  ): Promise<{ accessToken: string; refreshToken: string }>
  authSetTokens(
    tokens: { accessToken: string; refreshToken: string } | null
  ): Promise<{ success: boolean }>
  authHasTokens(): Promise<boolean>
  authCancel(): Promise<void>
  autoUpdateGetChannel(): Promise<'stable' | 'beta'>
  autoUpdateCheck(): void
  autoUpdateQuitAndInstall(): void
  autoUpdateSetChannel(channel: 'stable' | 'beta'): Promise<void>
  onAutoUpdateState(callback: (state: { status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'; info: { version: string; releaseDate: string; releaseName?: string } | null; error: string | null; progress: number | null }) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
