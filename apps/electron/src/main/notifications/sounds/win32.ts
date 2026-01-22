import type { PlatformSounds } from './types.js'

/**
 * Windows notification sound mappings.
 * These use the Windows notification sound system.
 */
export const win32Sounds: PlatformSounds = {
  default: undefined,            // Let Electron use OS default
  subtle: 'Notification.Default', // Standard Windows notification
  standard: 'Notification.Default',
  attention: 'Notification.IM',   // Instant message sound
  success: 'Notification.Default',
  error: 'Notification.Mail',     // Mail notification sound
  none: '',                       // Silent
}
