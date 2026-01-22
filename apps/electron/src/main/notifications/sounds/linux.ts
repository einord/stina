import type { PlatformSounds } from './types.js'

/**
 * Linux freedesktop notification sound mappings.
 * These sounds follow the freedesktop sound theme specification.
 */
export const linuxSounds: PlatformSounds = {
  default: undefined,            // Let system use default
  subtle: 'message-new-instant', // Subtle message sound
  standard: 'message-new-email', // Standard notification
  attention: 'bell',             // Bell/attention sound
  success: 'complete',           // Task completion sound
  error: 'dialog-warning',       // Warning/error sound
  none: '',                      // Silent
}
