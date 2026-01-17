import { app, BrowserWindow, ipcMain } from 'electron'

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
import { registerIpcHandlers } from './ipc.js'
import { initDatabase } from '@stina/adapters-node'
import {
  initAppSettingsStore,
  getAppSettingsStore,
  getChatMigrationsPath,
  ConversationRepository,
  ModelConfigRepository,
} from '@stina/chat/db'
import type { UserProfile } from '@stina/extension-api'
import { SchedulerService, getSchedulerMigrationsPath } from '@stina/scheduler'
import { providerRegistry, toolRegistry, runInstructionMessage } from '@stina/chat'
import { DefaultUserService, getAuthMigrationsPath } from '@stina/auth'
import { UserRepository } from '@stina/auth/db'

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

// Extension runtime state
const extensionRegistry = new ExtensionRegistry()
let extensionHost: NodeExtensionHost | null = null
let extensionInstaller: Awaited<ReturnType<typeof createNodeExtensionRuntime>>['extensionInstaller'] | null =
  null
let database: DB | null = null

// Initialize i18n for this process (language detection per session)
initI18n()

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
    database = initDatabase({
      logger,
      migrations: [getChatMigrationsPath(), getSchedulerMigrationsPath(), getAuthMigrationsPath()],
    })
    await initAppSettingsStore(database)

    // Initialize default user for local mode
    const userRepository = new UserRepository(database)
    const defaultUserService = new DefaultUserService(userRepository)
    const defaultUser = await defaultUserService.ensureDefaultUser()
    logger.info(`Using default user: ${defaultUser.username} (${defaultUser.id})`)

    const conversationRepo = new ConversationRepository(database, defaultUser.id)
    const modelConfigRepository = new ModelConfigRepository(database, defaultUser.id)
    const settingsStore = getAppSettingsStore()
    const modelConfigProvider = {
      async getDefault() {
        const config = await modelConfigRepository.getDefault()
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
          await runInstructionMessage(
            {
              repository: conversationRepo,
              providerRegistry,
              toolRegistry,
              modelConfigProvider,
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
    })
  } catch (error) {
    logger.warn('Failed to initialize app', { error: String(error) })
  }
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
