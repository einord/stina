import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createConsoleLogger, getLogLevelFromEnv, builtinExtensions } from '@stina/adapters-node'
import {
  getGreeting,
  themeRegistry,
  ExtensionRegistry,
  themeTokenSpec as bundledThemeTokenSpec,
  type ThemeTokens,
  type ThemeTokenName,
  type ThemeTokenMeta,
} from '@stina/core'
import { registerIpcHandlers } from './ipc.js'

const logger = createConsoleLogger(getLogLevelFromEnv())
const repoRoot = path.resolve(__dirname, '../../..')
const distIndexPath = path.join(repoRoot, 'packages/core/dist/index.js')

async function waitForFile(filePath: string, timeoutMs = 5000, intervalMs = 200): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(filePath)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return fs.existsSync(filePath)
}

// Setup extensions
const extensionRegistry = new ExtensionRegistry()
for (const ext of builtinExtensions) {
  extensionRegistry.register(ext)
}

async function loadThemeTokenSpec(): Promise<Record<ThemeTokenName, ThemeTokenMeta>> {
  if (process.env['NODE_ENV'] === 'development') {
    // Use built JS from core/dist (index.js export) to avoid TS loader issues in Electron main
    const exists = await waitForFile(distIndexPath, 5000, 200)
    if (!exists) {
      logger.warn('tokenSpec not built yet, falling back to bundled spec', { distIndexPath })
      return bundledThemeTokenSpec
    }
    const url = `${pathToFileURL(distIndexPath).href}?t=${Date.now()}`
    try {
      const module = await import(url)
      return module.themeTokenSpec as Record<ThemeTokenName, ThemeTokenMeta>
    } catch (error) {
      logger.warn('Failed to import tokenSpec from dist, falling back to bundled spec', {
        distIndexPath,
        error: String(error),
      })
      return bundledThemeTokenSpec
    }
  }
  return bundledThemeTokenSpec
}

async function registerThemesFromExtensions() {
  const spec = await loadThemeTokenSpec()
  const mergeWithDefaults = (tokens: Partial<ThemeTokens>): ThemeTokens => {
    const merged = {} as ThemeTokens
    for (const key of Object.keys(spec) as ThemeTokenName[]) {
      merged[key] = tokens[key] ?? spec[key].default
    }
    return merged
  }

  themeRegistry.clear()
  for (const theme of extensionRegistry.getThemes()) {
    themeRegistry.registerTheme(theme.id, theme.label, mergeWithDefaults(theme.tokens))
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    titleBarOverlay: isMac ? { color: '#00000000', height: 40 } : undefined,
    webPreferences: {
      // In dev we run main from dist/main.js; preload is sibling in dist/
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In development, load from Vite dev server for the renderer
  const isDev = process.env['NODE_ENV'] === 'development'
  const RENDERER_DEV_PORT = process.env['RENDERER_PORT'] || '3003'

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${RENDERER_DEV_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load the built renderer
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  logger.info('Main window created')
}

async function initializeApp() {
  try {
    await registerThemesFromExtensions()
  } catch (error) {
    logger.warn('Failed to register themes during init', { error: String(error) })
  }

  registerIpcHandlers(ipcMain, {
    getGreeting,
    themeRegistry,
    extensionRegistry,
    logger,
    reloadThemes: registerThemesFromExtensions,
  })
}

app.whenReady().then(() => {
  initializeApp()
    .catch((error) => logger.warn('Initialization error', { error: String(error) }))
    .finally(() => createWindow())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

logger.info('Electron app starting', { version: app.getVersion() })
