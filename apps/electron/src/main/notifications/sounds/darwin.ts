import type { PlatformSounds } from './types.js'

/**
 * macOS system sound mappings.
 * These sounds are available in /System/Library/Sounds/
 */
export const darwinSounds: PlatformSounds = {
  default: undefined,  // Let Electron use OS default
  subtle: 'Pop',       // Gentle pop sound
  standard: 'Glass',   // Classic notification sound
  attention: 'Ping',   // More prominent ping
  success: 'Hero',     // Positive achievement sound
  error: 'Basso',      // Deep error sound
  none: '',            // Silent (empty string = no sound)
}
