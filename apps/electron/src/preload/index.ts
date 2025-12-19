import { contextBridge, ipcRenderer } from 'electron'
import type { Greeting, ThemeSummary, ExtensionSummary } from '@stina/shared'
import type { ThemeTokens } from '@stina/core'

/**
 * API exposed to renderer process via context bridge
 */
const electronAPI = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('get-version'),

  getGreeting: (name?: string): Promise<Greeting> => ipcRenderer.invoke('get-greeting', name),

  getThemes: (): Promise<ThemeSummary[]> => ipcRenderer.invoke('get-themes'),

  getThemeTokens: (id: string): Promise<ThemeTokens> => ipcRenderer.invoke('get-theme-tokens', id),

  getExtensions: (): Promise<ExtensionSummary[]> => ipcRenderer.invoke('get-extensions'),

  health: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('health'),
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for the exposed API
export type ElectronAPI = typeof electronAPI

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
