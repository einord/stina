import type { NotificationSoundId } from '@stina/shared'
import type { PlatformSounds, SoundOption } from './types.js'
import { darwinSounds } from './darwin.js'
import { win32Sounds } from './win32.js'
import { linuxSounds } from './linux.js'

export type { PlatformSounds, SoundOption }

const platformSounds: Record<string, PlatformSounds> = {
  darwin: darwinSounds,
  win32: win32Sounds,
  linux: linuxSounds,
}

/**
 * Get the OS-native sound name for a semantic sound ID.
 * @param soundId - The semantic sound identifier
 * @returns The platform-specific sound name, or undefined for default
 */
export function getPlatformSound(soundId: NotificationSoundId): string | undefined {
  const platform = process.platform
  const sounds = platformSounds[platform] ?? linuxSounds
  return sounds[soundId]
}

/**
 * Get all available sound options for the UI.
 * @returns Array of sound options with IDs and i18n label keys
 */
export function getAvailableSounds(): SoundOption[] {
  return [
    { id: 'default' as NotificationSoundId, labelKey: 'settings.notifications.sounds.default' },
    { id: 'subtle' as NotificationSoundId, labelKey: 'settings.notifications.sounds.subtle' },
    { id: 'standard' as NotificationSoundId, labelKey: 'settings.notifications.sounds.standard' },
    { id: 'attention' as NotificationSoundId, labelKey: 'settings.notifications.sounds.attention' },
    { id: 'success' as NotificationSoundId, labelKey: 'settings.notifications.sounds.success' },
    { id: 'error' as NotificationSoundId, labelKey: 'settings.notifications.sounds.error' },
    { id: 'none' as NotificationSoundId, labelKey: 'settings.notifications.sounds.none' },
  ]
}
