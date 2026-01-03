import type { Logger } from '@stina/core'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/**
 * Create a console logger for Node.js
 */
export function createConsoleLogger(minLevel: LogLevel = 'info'): Logger {
  const minLevelNum = LOG_LEVELS[minLevel]

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= minLevelNum
  }

  const formatMessage = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
  }

  return {
    debug(message: string, context?: Record<string, unknown>) {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', message, context))
      }
    },
    info(message: string, context?: Record<string, unknown>) {
      if (shouldLog('info')) {
        console.info(formatMessage('info', message, context))
      }
    },
    warn(message: string, context?: Record<string, unknown>) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message, context))
      }
    },
    error(message: string, context?: Record<string, unknown>) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', message, context))
      }
    },
  }
}

/**
 * Get log level from environment
 */
export function getLogLevelFromEnv(): LogLevel {
  const level = process.env['LOG_LEVEL']?.toLowerCase()
  if (level && level in LOG_LEVELS) {
    return level as LogLevel
  }
  return 'info'
}
