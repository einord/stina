import os from 'node:os'
import path from 'node:path'

/**
 * Get the application data directory based on OS
 */
export function getAppDataDir(): string {
  const platform = os.platform()

  switch (platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Stina')
    case 'win32':
      return path.join(process.env['APPDATA'] || os.homedir(), 'Stina')
    default:
      // Linux and others
      return path.join(os.homedir(), '.local', 'share', 'Stina')
  }
}

/**
 * Get database path (can be overridden by DB_PATH env)
 */
export function getDbPath(): string {
  return process.env['DB_PATH'] || path.join(getAppDataDir(), 'data.db')
}

/**
 * Get extensions directory (can be overridden by EXTENSIONS_PATH env)
 */
export function getExtensionsPath(): string {
  return process.env['EXTENSIONS_PATH'] || path.join(getAppDataDir(), 'extensions')
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return path.join(getAppDataDir(), 'config.enc')
}

/**
 * Get logs directory
 */
export function getLogsPath(): string {
  return path.join(getAppDataDir(), 'logs')
}
