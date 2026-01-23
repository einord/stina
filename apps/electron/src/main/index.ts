import { app, BrowserWindow, ipcMain, dialog, session, Menu, nativeImage } from 'electron'

// Set app name early for macOS menu bar and dock (especially in dev mode)
app.setName('Stina')
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createConsoleLogger,
  getLogLevelFromEnv,
  builtinExtensions,
  createNodeExtensionRuntime,
  mapExtensionManifestToCore,
  createExtensionDatabaseExecutor,
} from '@stina/adapters-node'
import type { DB } from '@stina/adapters-node'
import {
  getGreeting,
  themeRegistry,
  ExtensionRegistry,
  themeTokenSpec as bundledThemeTokenSpec,
  APP_NAMESPACE,
  type ThemeTokens,
  type ThemeTokenName,
  type ThemeTokenMeta,
} from '@stina/core'
import type { NodeExtensionHost } from '@stina/extension-host'
import { initI18n } from '@stina/i18n'
import { registerIpcHandlers, registerConnectionIpcHandlers, registerAuthIpcHandlers, registerNotificationIpcHandlers } from './ipc.js'
import { setMainWindow } from './notifications.js'
import { registerAuthProtocol, setupProtocolHandlers } from './authProtocol.js'
import { initDatabase } from '@stina/adapters-node'
import { getConnectionMode, getWebUrl } from './connectionStore.js'
import {
  initAppSettingsStore,
  getAppSettingsStore,
  ConversationRepository,
  ModelConfigRepository,
  UserSettingsRepository,
} from '@stina/chat/db'
import type { ChatDb } from '@stina/chat/db'
import type { UserProfile } from '@stina/extension-api'
import { SchedulerService } from '@stina/scheduler'
import { providerRegistry, toolRegistry, runInstructionMessage } from '@stina/chat'
import { registerBuiltinTools } from '@stina/builtin-tools'
import { DefaultUserService } from '@stina/auth'
import { UserRepository } from '@stina/auth/db'

const logger = createConsoleLogger(getLogLevelFromEnv())
const repoRoot = path.resolve(__dirname, '../../..')
const distIndexPath = path.join(repoRoot, 'packages/core/dist/index.js')
const isDev = process.env['NODE_ENV'] === 'development'

/**
 * Get the root Stina version from the monorepo package.json.
 * Falls back to app.getVersion() if not found.
 */
function getStinaVersion(): string {
  const candidates = [
    path.join(repoRoot, 'package.json'),
    path.resolve(__dirname, '../../../package.json'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
        if (pkg.name === 'stina' && pkg.version) {
          return pkg.version
        }
      } catch {
        // Continue to next candidate
      }
    }
  }

  return app.getVersion()
}

/**
 * Get migrations path that works both in dev and production (asar).
 * In production, migrations are in node_modules inside the asar.
 */
function getElectronMigrationsPath(pkg: string, subPath: string): string {
  if (isDev) {
    // In dev, use the workspace package paths
    return path.join(repoRoot, 'packages', pkg, 'dist', subPath)
  }
  // In production, use app.getAppPath() which points to the asar
  return path.join(app.getAppPath(), 'node_modules', `@stina/${pkg}`, 'dist', subPath)
}

async function waitForFile(filePath: string, timeoutMs = 5000, intervalMs = 200): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(filePath)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return fs.existsSync(filePath)
}

// Extension runtime state
const extensionRegistry = new ExtensionRegistry()
let extensionHost: NodeExtensionHost | null = null
let extensionInstaller: Awaited<ReturnType<typeof createNodeExtensionRuntime>>['extensionInstaller'] | null =
  null
let database: DB | null = null

// Initialize i18n for this process (language detection per session)
initI18n()

// Register custom protocol handler for external browser auth
// Must be called before app.ready
registerAuthProtocol()

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

/**
 * Create application menu with standard macOS About dialog and Edit/View/Window menus.
 */
function createApplicationMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Configure Content Security Policy dynamically based on connection config.
 * This allows remote mode to connect to the configured server URL.
 */
function setupContentSecurityPolicy() {
  const webUrl = getWebUrl()

  // Build the connect-src directive
  const connectSources = [
    "'self'",
    'https://api.iconify.design',
    'https://api.simplesvg.com',
    'https://api.unisvg.com',
  ]

  // Add the web URL if configured (API is at /api)
  if (webUrl) {
    connectSources.push(webUrl)
    // Also add ws:// and wss:// variants for potential WebSocket connections
    try {
      const url = new URL(webUrl)
      if (url.protocol === 'https:') {
        connectSources.push(`wss://${url.host}`)
      } else {
        connectSources.push(`ws://${url.host}`)
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources.join(' ')}`,
    "img-src 'self' data:",
  ].join('; ')

  // Override CSP headers for all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  logger.info('Content Security Policy configured', { webUrl: webUrl || 'none' })
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const iconPath = path.join(__dirname, '../resources/icons/icon.png')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    titleBarOverlay: isMac ? { color: '#00000000', height: 40 } : undefined,
    webPreferences: {
      // In dev we run main from dist/main.js; preload is sibling in dist/
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Set dock icon on macOS (needed in dev mode)
  if (isMac && app.dock) {
    app.dock.setIcon(iconPath)
  }

  // Set main window reference for notifications
  setMainWindow(mainWindow)

  // In development, load from Vite dev server for the renderer
  const isDev = process.env['NODE_ENV'] === 'development'
  const RENDERER_DEV_PORT = process.env['RENDERER_PORT'] || '3003'

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${RENDERER_DEV_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load the built renderer
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
  })

  logger.info('Main window created')
}

async function initializeApp() {
  try {
    // Always register connection IPC handlers first (needed even in unconfigured/remote mode)
    registerConnectionIpcHandlers(ipcMain, app, logger)

    // Register auth IPC handlers (needed for external browser auth in remote mode)
    registerAuthIpcHandlers(ipcMain, logger)

    // Register notification IPC handlers (needed in both local and remote modes)
    registerNotificationIpcHandlers(ipcMain, logger)

    // Setup protocol handlers for stina:// callback
    setupProtocolHandlers()

    // Check connection mode
    const connectionMode = getConnectionMode()
    logger.info('Connection mode', { mode: connectionMode })

    // In unconfigured or remote mode, skip local database initialization
    if (connectionMode !== 'local') {
      logger.info('Skipping local database initialization', { mode: connectionMode })
      return
    }

    // Local mode: initialize database and all services
    database = initDatabase({
      logger,
      migrations: [
        getElectronMigrationsPath('chat', 'db/migrations'),
        getElectronMigrationsPath('scheduler', 'migrations'),
        getElectronMigrationsPath('auth', 'db/migrations'),
      ],
    })

    // Initialize default user for local mode
    const userRepository = new UserRepository(database)
    const defaultUserService = new DefaultUserService(userRepository)
    const defaultUser = await defaultUserService.ensureDefaultUser()
    logger.info(`Using default user: ${defaultUser.username} (${defaultUser.id})`)

    // Cast db for chat repositories (compatible but different schema type)
    const chatDb = database as unknown as ChatDb

    // Initialize settings store with the default user
    await initAppSettingsStore(chatDb, defaultUser.id)

    const _conversationRepo = new ConversationRepository(chatDb, defaultUser.id)
    // Model configs are now global (no userId required)
    const modelConfigRepository = new ModelConfigRepository(chatDb)
    const userSettingsRepo = new UserSettingsRepository(chatDb, defaultUser.id)
    const settingsStore = getAppSettingsStore()
    const _modelConfigProvider = {
      async getDefault() {
        const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
        if (!defaultModelId) return null
        const config = await modelConfigRepository.get(defaultModelId)
        if (!config) return null
        return {
          providerId: config.providerId,
          modelId: config.modelId,
          settingsOverride: config.settingsOverride,
        }
      },
    }
    const scheduler = new SchedulerService({
      db: database,
      logger,
      onFire: (event) => {
        if (!extensionHost) return false

        const extension = extensionHost.getExtension(event.extensionId)
        if (!extension) return false

        extensionHost.notifySchedulerFire(event.extensionId, event.payload)
        return true
      },
    })

    extensionRegistry.clear()
    for (const ext of builtinExtensions) {
      extensionRegistry.register(ext)
    }

    // Register built-in tools before extension runtime (so they're always available)
    const builtinToolCount = registerBuiltinTools(toolRegistry, {
      getTimezone: async () => {
        const store = getAppSettingsStore()
        return store?.get<string>(APP_NAMESPACE, 'timezone')
      },
    })
    logger.info('Registered built-in tools', { count: builtinToolCount })

    const runtime = await createNodeExtensionRuntime({
      logger,
      stinaVersion: app.getVersion() ?? '0.5.0',
      platform: 'electron',
      databaseExecutor: createExtensionDatabaseExecutor(),
      scheduler: {
        schedule: async (extensionId, job) => scheduler.schedule(extensionId, job),
        cancel: async (extensionId, jobId) => scheduler.cancel(extensionId, jobId),
      },
      chat: {
        appendInstruction: async (_extensionId, message) => {
          // Use message.userId if provided, otherwise fall back to defaultUser
          const userId = message.userId ?? defaultUser.id
          const userConversationRepo = new ConversationRepository(chatDb, userId)
          const userSettingsRepo = new UserSettingsRepository(chatDb, userId)
          const userModelConfigProvider = {
            async getDefault() {
              const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
              if (!defaultModelId) return null
              const config = await modelConfigRepository.get(defaultModelId)
              if (!config) return null
              return {
                providerId: config.providerId,
                modelId: config.modelId,
                settingsOverride: config.settingsOverride,
              }
            },
          }

          await runInstructionMessage(
            {
              repository: userConversationRepo,
              providerRegistry,
              toolRegistry,
              modelConfigProvider: userModelConfigProvider,
              settingsStore,
            },
            {
              text: message.text,
              conversationId: message.conversationId,
            }
          )
        },
      },
      user: {
        getProfile: async (_extensionId: string): Promise<UserProfile> => {
          const settingsStore = getAppSettingsStore()
          if (!settingsStore) return {}
          return {
            firstName: settingsStore.get<string>(APP_NAMESPACE, 'firstName'),
            nickname: settingsStore.get<string>(APP_NAMESPACE, 'nickname'),
            language: settingsStore.get<string>(APP_NAMESPACE, 'language'),
            timezone: settingsStore.get<string>(APP_NAMESPACE, 'timezone'),
          }
        },
      },
      callbacks: {
        onProviderRegistered: (provider) => {
          try {
            providerRegistry.register(provider)
            logger.info('Extension provider registered', { id: provider.id, name: provider.name })
          } catch (error) {
            logger.warn('Failed to register extension provider', {
              id: provider.id,
              error: String(error),
            })
          }
        },
        onProviderUnregistered: (providerId) => {
          providerRegistry.unregister(providerId)
          logger.info('Extension provider unregistered', { id: providerId })
        },
        onToolRegistered: (tool) => {
          try {
            toolRegistry.register(tool)
            logger.info('Extension tool registered', { id: tool.id, name: tool.name })
          } catch (error) {
            logger.warn('Failed to register extension tool', {
              id: tool.id,
              error: String(error),
            })
          }
        },
        onToolUnregistered: (toolId) => {
          toolRegistry.unregister(toolId)
          logger.info('Extension tool unregistered', { id: toolId })
        },
      },
    })

    extensionHost = runtime.extensionHost
    extensionInstaller = runtime.extensionInstaller
    for (const ext of runtime.enabledExtensions) {
      try {
        extensionRegistry.register(mapExtensionManifestToCore(ext.manifest))
      } catch (error) {
        logger.warn('Failed to register enabled extension manifest', {
          id: ext.manifest.id,
          error: String(error),
        })
      }
    }

    await registerThemesFromExtensions()

    scheduler.start()

    registerIpcHandlers(ipcMain, {
      getGreeting,
      themeRegistry,
      extensionRegistry,
      logger,
      reloadThemes: registerThemesFromExtensions,
      extensionHost,
      extensionInstaller,
      db: database ?? undefined,
      defaultUserId: defaultUser.id,
      appVersion: getStinaVersion(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.stack || error.message : String(error)
    logger.error('Failed to initialize app', { error: errorMsg })
    dialog.showErrorBox('Initialization Error', errorMsg)
  }
}

app.whenReady().then(() => {
  // Set up CSP before creating window (must be done after app is ready)
  setupContentSecurityPolicy()
  createApplicationMenu()

  // Configure About panel for macOS
  if (process.platform === 'darwin') {
    const stinaVersion = getStinaVersion()
    const iconPath = path.join(__dirname, '../resources/icons/512x512.png')
    const icon = nativeImage.createFromPath(iconPath)

    app.setAboutPanelOptions({
      applicationName: 'Stina',
      applicationVersion: stinaVersion,
      version: '', // Hide build number
      iconPath: icon.isEmpty() ? undefined : iconPath,
      copyright: '© 2024-2025 Plik',
    })
  }

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
