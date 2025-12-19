import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { createConsoleLogger, getLogLevelFromEnv, builtinExtensions } from '@stina/adapters-node'
import { getGreeting, themeRegistry, ExtensionRegistry } from '@stina/core'
import { registerIpcHandlers } from './ipc.js'

const logger = createConsoleLogger(getLogLevelFromEnv())

// Setup extensions
const extensionRegistry = new ExtensionRegistry()
for (const ext of builtinExtensions) {
  extensionRegistry.register(ext)
}
for (const theme of extensionRegistry.getThemes()) {
  themeRegistry.registerTheme(theme.id, theme.label, theme.tokens)
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
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

// Register IPC handlers before app is ready
registerIpcHandlers(ipcMain, { getGreeting, themeRegistry, extensionRegistry, logger })

app.whenReady().then(() => {
  createWindow()

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
