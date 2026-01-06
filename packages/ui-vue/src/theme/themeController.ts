import type { ThemeSummary } from '@stina/shared'
import type { ThemeTokens } from '@stina/core'
import { applyTheme } from './applyTheme.js'
import { withDefaultTokens } from '@stina/core'

export interface ThemeControllerApi {
  listThemes: () => Promise<ThemeSummary[]>
  getThemeTokens: (id: string) => Promise<ThemeTokens>
}

export interface ThemeControllerOptions {
  defaultThemeId?: string
  storageKey?: string
  storage?: Storage | undefined
  log?: (message: string, error?: unknown) => void
}

const DEFAULT_THEME_ID = 'dark'
const DEFAULT_STORAGE_KEY = 'stina-theme'

/**
  * Create a theme controller that works the same for web and Electron renderers.
  */
export function createThemeController(
  api: ThemeControllerApi,
  options: ThemeControllerOptions = {}
) {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  const defaultThemeId = options.defaultThemeId ?? DEFAULT_THEME_ID
  const log = options.log ?? (() => {})

  let activeThemeId: string | null = null

  const readSavedThemeId = (): string | null => {
    if (!storage) return null
    return storage.getItem(storageKey)
  }

  const saveThemeId = (id: string) => {
    if (!storage) return
    storage.setItem(storageKey, id)
  }

  const applyThemeById = async (id: string) => {
    const tokens = await api.getThemeTokens(id)
    applyTheme(tokens)
    activeThemeId = id
    saveThemeId(id)
  }

  const applyFallback = () => {
    applyTheme(withDefaultTokens({}))
    activeThemeId = defaultThemeId
  }

  const resolveThemeId = async (): Promise<string> => {
    const saved = readSavedThemeId()
    const preferred = saved || defaultThemeId

    try {
      const themes = await api.listThemes()
      if (themes.find((t) => t.id === preferred)) {
        return preferred
      }
      const firstTheme = themes[0]
      if (firstTheme) {
        return firstTheme.id
      }
    } catch (error) {
      log('Failed to list themes', error)
    }

    return defaultThemeId
  }

  const initTheme = async () => {
    try {
      const themeId = await resolveThemeId()
      await applyThemeById(themeId)
    } catch (error) {
      log('Failed to apply theme, using fallback', error)
      applyFallback()
    }
  }

  const setTheme = async (id: string) => {
    try {
      await applyThemeById(id)
    } catch (error) {
      log(`Failed to change theme to ${id}`, error)
      throw error
    }
  }

  const getActiveThemeId = () => activeThemeId

  return {
    initTheme,
    setTheme,
    getActiveThemeId,
  }
}
